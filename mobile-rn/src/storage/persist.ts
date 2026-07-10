import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { InteractionManager } from 'react-native';
import { SNSGodState } from '../types';
import { createDefaultState } from '../data/defaultState';
import { ensureCharacterRooms, normalizeRandomChats } from '../logic/stateHelpers';
import { MAX_GROUP_ROOM_MESSAGES, MAX_ROOM_MESSAGES, STATE_SCHEMA_VERSION } from '../logic/limits';
import { normalizeLoreEntries } from '../logic/loreEngine';
import { normalizeNotifications } from '../logic/notifications';
import { externalizeStateMedia, inspectMediaFiles, MEDIA_MANIFEST_FILE, MEDIA_ROOT_DIR } from '../logic/media';
import { normalizeSumGodState } from '../logic/sumgod';
import { migrateMemoryState } from '../logic/memoryPolicy';

const STATE_KEY = 'snsgod.state.v1';
const LEGACY_BACKUP_KEY = 'snsgod.legacyBackup.v1';
const REFERENCE_FACE_BACKUP_KEY = 'snsgod.referenceFaceSlots.v1';
const MEETING_EVENT_BACKUP_KEY = 'snsgod.meetingEventSessions.v1';
const SAVE_DEBOUNCE_MS = 1200;
const SAVE_MAX_WAIT_MS = 5000;
const BACKUP_REVISION_INTERVAL = 20;
const BACKUP_MAX_AGE_MS = 4 * 60 * 1000;
const ASYNC_STORAGE_FULL_STATE_LIMIT = 900_000;
const SQLITE_DB_NAME = 'snsgod.sqlite';
const SQLITE_STATE_KEY = 'state.v1';
const BACKUP_DIR = `${FileSystem.documentDirectory || ''}snsgod-backups/`;
const BACKUP_FILE = `${BACKUP_DIR}state-latest.json`;
const PREVIOUS_BACKUP_FILE = `${BACKUP_DIR}state-previous.json`;
const TMP_BACKUP_FILE = `${BACKUP_DIR}state-latest.tmp.json`;

type StorageSource = 'asyncStorage' | 'sqlite' | 'sqliteUnverified' | 'backupLatest' | 'backupPrevious' | 'default';
type StateCandidate = { source: StorageSource; raw?: string; state?: SNSGodState; stats?: StorageStats; parseError?: string; pointer?: AsyncStoragePointer };
type MessageMap = SNSGodState['messages'];
type StorageStats = {
  revision: number;
  writeSeq: number;
  savedAt: number;
  importedAt: number;
  hash: string;
  messageCount: number;
  characterCount: number;
  referenceImageCount: number;
  mediaCount: number;
  lastMessageAt: number;
};
type StorageCounts = Pick<StorageStats, 'messageCount' | 'characterCount' | 'referenceImageCount' | 'mediaCount' | 'lastMessageAt'>;
type AsyncStoragePointer = {
  __storagePointer: 'sqlite-and-file-backup';
  __revision: number;
  __writeSeq?: number;
  __savedAt: number;
  __contentHash: string;
  __messageCount: number;
  __characterCount: number;
  __referenceImageCount: number;
  __mediaCount: number;
  __lastMessageAt: number;
  payloadLength: number;
};
type PersistedPayload = {
  snapshot: SNSGodState;
  payload: string;
  asyncPayload: string;
  stats: StorageStats;
  backupStats?: StorageStats;
  fullSnapshot?: SNSGodState;
  fullPayload?: string;
};
export type PersistPerfEntry = {
  id: string;
  createdAt: number;
  reason: string;
  backup: BackupMode;
  verify: VerifyMode;
  revision: number;
  writeSeq: number;
  payloadBytes: number;
  fullPayloadBytes: number;
  backupWritten: boolean;
  slow: boolean;
  totalMs: number;
  stages: Record<string, number>;
};
type BackupMode = 'auto' | 'force' | 'skip';
type VerifyMode = 'none' | 'sqlite' | 'full';

export type SaveStateOptions = {
  backup?: BackupMode;
  verify?: VerifyMode;
  important?: boolean;
  reason?: string;
  defer?: boolean;
};

let lastHydrationSource: StorageSource = 'default';
let lastHydrationReason = 'not loaded yet';
let lastSuccessfulSaveTime = 0;
let lastSaveError = '';
let lastAsyncStorageWarning = '';
let lastSkippedOldRevisionSave = '';
let lastAtomicBackupWriteResult = 'not written yet';
let lastBackupSnapshotTime = 0;
let lastBackupSnapshotRevision = 0;
let lastBackupSnapshotReason = 'not written yet';
let lastSQLiteSaveTime = 0;
let skippedSaveBeforeHydrationCount = 0;
let persistedRevision = 0;
let persistedWriteSeq = 0;
let nextWriteSeq = 0;

let saveInFlight = Promise.resolve();
let pendingState: SNSGodState | undefined;
let pendingOptions: SaveStateOptions | undefined;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let saveMaxTimer: ReturnType<typeof setTimeout> | undefined;
let dbPromise: Promise<SQLite.SQLiteDatabase | undefined> | undefined;
let messageRoomSignatures = new Map<string, string>();
let messageRoomSignaturesReady = false;
let persistPerfEntries: PersistPerfEntry[] = [];

export async function loadState(): Promise<SNSGodState> {
  const [raw, sqliteRaw, sqliteUnverifiedRaw, fileRaw, previousRaw, sqliteMessages] = await Promise.all([
    AsyncStorage.getItem(STATE_KEY),
    readSqliteState(),
    readSqliteStateWithoutMetaValidation(),
    readBackupFile(BACKUP_FILE),
    readBackupFile(PREVIOUS_BACKUP_FILE),
    readMessagesByRoom()
  ]);
  const backups = await readCriticalBackups();
  const candidates = hydrateSqliteCandidatesWithMessages(buildCandidates([
    { source: 'asyncStorage', raw },
    { source: 'sqlite', raw: sqliteRaw },
    { source: 'sqliteUnverified', raw: sqliteRaw ? undefined : sqliteUnverifiedRaw },
    { source: 'backupLatest', raw: fileRaw },
    { source: 'backupPrevious', raw: previousRaw }
  ]), sqliteMessages);
  const selected = selectBestState(candidates);
  lastHydrationSource = selected.source;
  lastHydrationReason = selected.reason;
  const normalized = normalizeState(mergeCriticalBackups(selected.state, backups));
  if (selected.source === 'sqlite' || selected.source === 'sqliteUnverified') {
    messageRoomSignatures = createMessageRoomSignatures(normalized.messages || {});
    messageRoomSignaturesReady = true;
  } else {
    messageRoomSignatures = new Map();
    messageRoomSignaturesReady = false;
  }
  const stats = getStorageStats(normalized);
  persistedRevision = stats.revision;
  persistedWriteSeq = stats.writeSeq;
  const backupStats = fileRaw ? statsFromRaw(fileRaw) : undefined;
  if (backupStats) {
    lastBackupSnapshotTime = backupStats.savedAt || Date.now();
    lastBackupSnapshotRevision = backupStats.revision;
    lastBackupSnapshotReason = 'loaded existing backup snapshot';
  }
  const asyncCandidate = candidates.find(candidate => candidate.source === 'asyncStorage');
  if (selected.source !== 'default' && asyncCandidate?.state) {
    void cleanupLegacyAsyncStorageState(selected.state).catch(error => {
      lastAsyncStorageWarning = `legacy AsyncStorage cleanup failed: ${error instanceof Error ? error.message : String(error)}`;
    });
  }
  return normalized;
}

function mergeSaveOptions(current: SaveStateOptions | undefined, next: SaveStateOptions | undefined): SaveStateOptions {
  const backupRank: Record<BackupMode, number> = { skip: 0, auto: 1, force: 2 };
  const verifyRank: Record<VerifyMode, number> = { none: 0, sqlite: 1, full: 2 };
  const currentBackup = current?.backup || 'auto';
  const nextBackup = next?.backup || 'auto';
  const currentVerify = current?.verify || 'none';
  const nextVerify = next?.verify || 'none';
  return {
    backup: backupRank[nextBackup] > backupRank[currentBackup] ? nextBackup : currentBackup,
    verify: verifyRank[nextVerify] > verifyRank[currentVerify] ? nextVerify : currentVerify,
    important: Boolean(current?.important || next?.important),
    defer: current?.defer !== false && next?.defer !== false,
    reason: next?.reason || current?.reason
  };
}

function shouldWriteBackup(stats: StorageStats, options: SaveStateOptions): boolean {
  if (options.backup === 'skip') return false;
  if (options.backup === 'force' || options.important) return true;
  if (stats.revision - lastBackupSnapshotRevision >= BACKUP_REVISION_INTERVAL) return true;
  if (!lastBackupSnapshotTime) return true;
  return Date.now() - lastBackupSnapshotTime >= BACKUP_MAX_AGE_MS;
}

function runAfterInteractions(task: () => void): void {
  InteractionManager.runAfterInteractions(task);
}

function perfNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}

function createPersistPerfCollector() {
  const stages: Record<string, number> = {};
  return {
    stages,
    async measure<T>(name: string, task: () => Promise<T>): Promise<T> {
      const start = perfNow();
      try {
        return await task();
      } finally {
        stages[name] = Math.round((stages[name] || 0) + perfNow() - start);
      }
    },
    measureSync<T>(name: string, task: () => T): T {
      const start = perfNow();
      try {
        return task();
      } finally {
        stages[name] = Math.round((stages[name] || 0) + perfNow() - start);
      }
    }
  };
}

function recordPersistPerf(entry: PersistPerfEntry): void {
  persistPerfEntries = [entry, ...persistPerfEntries].slice(0, 20);
}

export function getRecentPersistPerfEntries(): PersistPerfEntry[] {
  return persistPerfEntries.slice();
}

async function writeStateNow(state: SNSGodState, options: SaveStateOptions = {}): Promise<void> {
  saveInFlight = saveInFlight
    .catch(() => undefined)
    .then(async () => {
      const perf = createPersistPerfCollector();
      const totalStart = perfNow();
      const backupHintStats = perf.measureSync('lightweightStats', () => lightweightStorageStats(state));
      const writeBackup = shouldWriteBackup(backupHintStats, options);
      let prepared: PersistedPayload | undefined;
      try {
        prepared = await preparePersistedPayload(state, { includeFullBackupPayload: writeBackup || options.verify === 'full', perf });
      } catch (error) {
        recordPersistPerf({
          id: `${Date.now()}-${nextWriteSeq}`,
          createdAt: Date.now(),
          reason: options.reason || 'save',
          backup: options.backup || 'auto',
          verify: options.verify || 'none',
          revision: backupHintStats.revision,
          writeSeq: backupHintStats.writeSeq,
          payloadBytes: 0,
          fullPayloadBytes: 0,
          backupWritten: false,
          slow: true,
          totalMs: Math.round(perfNow() - totalStart),
          stages: perf.stages
        });
        throw error;
      }
      if (prepared.stats.revision < persistedRevision || (prepared.stats.revision === persistedRevision && prepared.stats.writeSeq < persistedWriteSeq)) {
        lastSkippedOldRevisionSave = `skip old payload rev=${prepared.stats.revision}, writeSeq=${prepared.stats.writeSeq}; persisted rev=${persistedRevision}, writeSeq=${persistedWriteSeq}`;
        return;
      }
      await perf.measure('SQLite write', () => writeSqliteState(prepared.payload, prepared.snapshot, prepared.stats));
      await perf.measure('messages write', () => writeMessagesState(prepared.fullSnapshot?.messages || state.messages || {}));
      lastSQLiteSaveTime = Date.now();
      if (writeBackup) {
        await perf.measure('backup write', () => writeBackupFile(prepared.fullPayload || prepared.payload, prepared.fullSnapshot || prepared.snapshot, options.reason || (options.important ? 'important save' : 'scheduled snapshot'), prepared.backupStats || prepared.stats));
      }
      await perf.measure('AsyncStorage pointer', () => writeAsyncStoragePointer(prepared)).catch(error => {
        lastAsyncStorageWarning = `AsyncStorage pointer warning: ${error instanceof Error ? error.message : String(error)}`;
      });
      if (options.verify === 'full') {
        await perf.measure('verify read', () => verifyStateWrite(prepared.payload, prepared.fullPayload || prepared.payload, prepared.fullSnapshot || prepared.snapshot, writeBackup));
      } else if (options.verify === 'sqlite') {
        await perf.measure('verify read', () => verifySQLiteWrite(prepared.payload));
      }
      persistedRevision = prepared.stats.revision;
      persistedWriteSeq = prepared.stats.writeSeq;
      lastSuccessfulSaveTime = Date.now();
      lastSaveError = '';
      const totalMs = Math.round(perfNow() - totalStart);
      recordPersistPerf({
        id: `${lastSuccessfulSaveTime}-${prepared.stats.writeSeq}`,
        createdAt: lastSuccessfulSaveTime,
        reason: options.reason || 'save',
        backup: options.backup || 'auto',
        verify: options.verify || 'none',
        revision: prepared.stats.revision,
        writeSeq: prepared.stats.writeSeq,
        payloadBytes: prepared.payload.length,
        fullPayloadBytes: prepared.fullPayload?.length || 0,
        backupWritten: writeBackup,
        slow: totalMs > 200,
        totalMs,
        stages: perf.stages
      });
    }).catch(error => {
      lastSaveError = error instanceof Error ? error.message : String(error);
      throw error;
    });
  await saveInFlight;
}

export async function saveState(state: SNSGodState, options: SaveStateOptions = {}): Promise<void> {
  await writeStateNow(state, { backup: 'force', verify: 'full', reason: 'manual save', ...options });
}

export function saveStateDebounced(state: SNSGodState, options: SaveStateOptions = {}): void {
  pendingState = state;
  pendingOptions = mergeSaveOptions(pendingOptions, { backup: 'auto', verify: 'none', defer: true, ...options });
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    runAfterInteractions(() => void flushPendingStateNow());
  }, SAVE_DEBOUNCE_MS);
  if (!saveMaxTimer) {
    saveMaxTimer = setTimeout(() => {
      runAfterInteractions(() => void flushPendingStateNow());
    }, SAVE_MAX_WAIT_MS);
  }
}

export function recordSkippedSaveBeforeHydration(): void {
  skippedSaveBeforeHydrationCount += 1;
}

export async function flushSaveState(state?: SNSGodState, options: SaveStateOptions = {}): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
  }
  if (saveMaxTimer) {
    clearTimeout(saveMaxTimer);
    saveMaxTimer = undefined;
  }
  const snapshot = state || pendingState;
  const snapshotOptions = mergeSaveOptions(pendingOptions, { backup: 'force', verify: 'full', reason: 'flush save', defer: false, ...options });
  pendingState = undefined;
  pendingOptions = undefined;
  if (snapshot) await writeStateNow(snapshot, snapshotOptions);
  await saveInFlight;
}

async function flushPendingStateNow(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
  }
  if (saveMaxTimer) {
    clearTimeout(saveMaxTimer);
    saveMaxTimer = undefined;
  }
  const snapshot = pendingState;
  const snapshotOptions = pendingOptions || { backup: 'auto', verify: 'none', defer: true };
  pendingState = undefined;
  pendingOptions = undefined;
  if (snapshot) await writeStateNow(snapshot, snapshotOptions);
}

export async function importState(state: SNSGodState, originalJson: string): Promise<SNSGodState> {
  const prepared = await preparePersistedPayload({ ...state, __importedAt: Date.now(), __revision: Math.max(Number(state.__revision || 0), persistedRevision) + 1 }, { includeFullBackupPayload: true });
  await writeSqliteState(prepared.payload, prepared.snapshot);
  await writeMessagesState(prepared.fullSnapshot?.messages || state.messages || {});
  await writeBackupFile(prepared.fullPayload || prepared.payload, prepared.fullSnapshot || prepared.snapshot, 'import state');
  await writeAsyncStoragePointer(prepared, originalJson).catch(error => {
    lastAsyncStorageWarning = `AsyncStorage import pointer warning: ${error instanceof Error ? error.message : String(error)}`;
  });
  await verifyStateWrite(prepared.payload, prepared.fullPayload || prepared.payload, prepared.fullSnapshot || prepared.snapshot, true);
  persistedRevision = prepared.stats.revision;
  persistedWriteSeq = prepared.stats.writeSeq;
  return prepared.snapshot;
}

async function readCriticalBackups(): Promise<Pick<SNSGodState, 'referenceFaceSlots' | 'meetingEventSessions'>> {
  const [referenceRaw, meetingRaw] = await Promise.all([
    AsyncStorage.getItem(REFERENCE_FACE_BACKUP_KEY),
    AsyncStorage.getItem(MEETING_EVENT_BACKUP_KEY)
  ]);
  return {
    referenceFaceSlots: parseArrayBackup(referenceRaw),
    meetingEventSessions: parseArrayBackup(meetingRaw)
  };
}

function parseArrayBackup<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mergeCriticalBackups(state: SNSGodState, backups: Pick<SNSGodState, 'referenceFaceSlots' | 'meetingEventSessions'>): SNSGodState {
  const currentReferenceSlots = Array.isArray(state.referenceFaceSlots) ? state.referenceFaceSlots : [];
  const currentMeetingSessions = Array.isArray(state.meetingEventSessions) ? state.meetingEventSessions : [];
  return {
    ...state,
    referenceFaceSlots: currentReferenceSlots.length > 0 ? currentReferenceSlots : backups.referenceFaceSlots || [],
    meetingEventSessions: currentMeetingSessions.length > 0 ? currentMeetingSessions : backups.meetingEventSessions || []
  };
}

async function protectCriticalBackups(state: SNSGodState): Promise<SNSGodState> {
  const backups = await readCriticalBackups();
  const referenceFaceSlots = Array.isArray(state.referenceFaceSlots) ? state.referenceFaceSlots : [];
  const meetingEventSessions = Array.isArray(state.meetingEventSessions) ? state.meetingEventSessions : [];
  return {
    ...state,
    referenceFaceSlots: referenceFaceSlots.length > 0 ? referenceFaceSlots : backups.referenceFaceSlots || [],
    meetingEventSessions: meetingEventSessions.length > 0 ? meetingEventSessions : backups.meetingEventSessions || []
  };
}

async function preparePersistedPayload(state: SNSGodState, options: { includeFullBackupPayload?: boolean; perf?: ReturnType<typeof createPersistPerfCollector> } = {}): Promise<PersistedPayload> {
  const perf = options.perf;
  const externalized = perf
    ? await perf.measure('externalizeStateMedia', () => externalizeStateMedia(state))
    : await externalizeStateMedia(state);
  const protectedState = perf
    ? await perf.measure('protectCriticalBackups', () => protectCriticalBackups(externalized))
    : await protectCriticalBackups(externalized);
  const normalized = perf
    ? perf.measureSync('normalizeState', () => normalizeState(protectedState))
    : normalizeState(protectedState);
  const counts = perf
    ? perf.measureSync('storage counts', () => getStorageCounts(normalized))
    : getStorageCounts(normalized);
  const snapshot = perf
    ? perf.measureSync('prepareStateForSave slim', () => createStorageSnapshot(normalized, counts, false))
    : createStorageSnapshot(normalized, counts, false);
  const payload = perf ? perf.measureSync('JSON.stringify slim', () => JSON.stringify(snapshot)) : JSON.stringify(snapshot);
  const fullSnapshot = options.includeFullBackupPayload
    ? (perf ? perf.measureSync('prepareStateForSave full', () => createStorageSnapshot(normalized, counts, true, snapshot)) : createStorageSnapshot(normalized, counts, true, snapshot))
    : undefined;
  const asyncPayload = perf ? perf.measureSync('AsyncStorage payload', () => asyncStoragePayloadFor(snapshot, payload)) : asyncStoragePayloadFor(snapshot, payload);
  const fullPayload = fullSnapshot
    ? (perf ? perf.measureSync('JSON.stringify full', () => JSON.stringify(fullSnapshot)) : JSON.stringify(fullSnapshot))
    : undefined;
  const stats = statsFromSnapshot(snapshot);
  const backupStats = fullSnapshot ? statsFromSnapshot(fullSnapshot) : undefined;
  return { snapshot, payload, asyncPayload, stats, backupStats, fullSnapshot, fullPayload };
}

async function cleanupLegacyAsyncStorageState(authoritativeState: SNSGodState): Promise<void> {
  const prepared = await preparePersistedPayload(authoritativeState, { includeFullBackupPayload: true });
  await verifyStateWrite(prepared.payload, prepared.fullPayload || prepared.payload, prepared.fullSnapshot || prepared.snapshot, false);
  await writeAsyncStoragePointer(prepared);
}

async function writeAsyncStoragePointer(prepared: PersistedPayload, legacyBackupJson?: string): Promise<void> {
  await AsyncStorage.multiRemove([STATE_KEY, REFERENCE_FACE_BACKUP_KEY, MEETING_EVENT_BACKUP_KEY, LEGACY_BACKUP_KEY]);
  const values: [string, string][] = [[STATE_KEY, prepared.asyncPayload]];
  if (legacyBackupJson) {
    values.push([LEGACY_BACKUP_KEY, JSON.stringify({
      pointer: 'omitted-large-import',
      length: legacyBackupJson.length,
      importedAt: Date.now(),
      revision: prepared.stats.revision,
      hash: prepared.stats.hash
    })]);
  }
  await AsyncStorage.multiSet(values);
}

async function verifyStateWrite(sqlitePayload: string, backupPayload: string, snapshot: SNSGodState, requireBackup = true): Promise<void> {
  const payload = sqlitePayload;
  const [sqliteSaved, fileSaved] = await Promise.all([
    readSqliteState(),
    readBackupFile(BACKUP_FILE)
  ]);
  if (sqliteSaved !== payload) {
    throw new Error('저장 검증 실패: SQLite 저장 직후 읽은 데이터가 일치하지 않습니다.');
  }
  if (requireBackup && fileSaved !== backupPayload) {
    throw new Error('저장 검증 실패: 백업 파일 저장 직후 읽은 데이터가 일치하지 않습니다.');
  }
  const stats = getStorageStats(snapshot);
  if (stats.hash !== snapshot.__contentHash) {
    throw new Error('저장 검증 실패: snapshot hash 메타데이터가 일치하지 않습니다.');
  }
}

async function verifySQLiteWrite(payload: string): Promise<void> {
  const sqlitePayload = payload;
  const sqliteSaved = await readSqliteState();
  if (sqliteSaved !== sqlitePayload) {
    throw new Error('저장 검증 실패: SQLite 저장 직후 읽은 데이터가 일치하지 않습니다.');
  }
}

function asyncStoragePayloadFor(snapshot: SNSGodState, payload: string): string {
  return JSON.stringify({
    __storagePointer: 'sqlite-and-file-backup',
    __revision: snapshot.__revision || 0,
    __writeSeq: snapshot.__writeSeq || 0,
    __savedAt: snapshot.__savedAt || Date.now(),
    __contentHash: snapshot.__contentHash || '',
    __messageCount: snapshot.__messageCount || 0,
    __characterCount: snapshot.__characterCount || 0,
    __referenceImageCount: snapshot.__referenceImageCount || 0,
    __mediaCount: snapshot.__mediaCount || 0,
    __lastMessageAt: snapshot.__lastMessageAt || 0,
    payloadLength: payload.length
  });
}

function buildCandidates(items: { source: StorageSource; raw?: string | null }[]): StateCandidate[] {
  return items.map(item => {
    if (!item.raw) return { source: item.source };
    try {
      const parsed = JSON.parse(item.raw);
      if (!parsed || typeof parsed !== 'object') return { source: item.source, raw: item.raw, parseError: 'not an object' };
      if ((parsed as Record<string, unknown>).__storagePointer) {
        return { source: item.source, raw: item.raw, pointer: parsed as AsyncStoragePointer, parseError: `pointer only: ${(parsed as Record<string, unknown>).__storagePointer}` };
      }
      const state = parsed as SNSGodState;
      return { source: item.source, raw: item.raw, state, stats: getStorageStats(state) };
    } catch (error) {
      return { source: item.source, raw: item.raw, parseError: error instanceof Error ? error.message : String(error) };
    }
  });
}

function hydrateSqliteCandidatesWithMessages(candidates: StateCandidate[], messages: MessageMap): StateCandidate[] {
  if (!Object.keys(messages || {}).length) return candidates;
  return candidates.map(candidate => {
    if ((candidate.source !== 'sqlite' && candidate.source !== 'sqliteUnverified') || !candidate.state) return candidate;
    const state = { ...candidate.state, messages };
    return { ...candidate, state, stats: getStorageStats(state) };
  });
}

function selectBestState(candidates: StateCandidate[]): { source: StorageSource; state: SNSGodState; reason: string } {
  const valid = candidates.filter((candidate): candidate is StateCandidate & { state: SNSGodState; stats: StorageStats } => Boolean(candidate.state && candidate.stats));
  if (!valid.length) {
    return { source: 'default', state: withStorageMetadata(createDefaultState(), 0), reason: 'no persisted state found' };
  }
  const sorted = valid.slice().sort(compareCandidates);
  const best = sorted[0];
  const richer = sorted.find(candidate => isMeaningfullyRicher(candidate.stats, best.stats));
  if (richer) {
    return {
      source: richer.source,
      state: richer.state,
      reason: `selected richer rollback guard candidate over ${best.source}: ${describeStats(richer.stats)} vs ${describeStats(best.stats)}`
    };
  }
  return {
    source: best.source,
    state: best.state,
    reason: `selected highest revision/savedAt: ${describeStats(best.stats)}`
  };
}

function compareCandidates(a: StateCandidate & { stats: StorageStats }, b: StateCandidate & { stats: StorageStats }): number {
  if (b.stats.revision !== a.stats.revision) return b.stats.revision - a.stats.revision;
  if (b.stats.savedAt !== a.stats.savedAt) return b.stats.savedAt - a.stats.savedAt;
  return richnessScore(b.stats) - richnessScore(a.stats);
}

function isMeaningfullyRicher(candidate: StorageStats, selected: StorageStats): boolean {
  if (selected.revision > candidate.revision + 1) return false;
  if (candidate.messageCount > selected.messageCount + 8) return true;
  if (candidate.characterCount > selected.characterCount) return true;
  if (candidate.referenceImageCount > selected.referenceImageCount) return true;
  if (candidate.mediaCount > selected.mediaCount) return true;
  if (candidate.lastMessageAt > selected.lastMessageAt) return true;
  return richnessScore(candidate) > richnessScore(selected) + 20 && candidate.revision >= selected.revision;
}

function richnessScore(stats: StorageStats): number {
  return stats.messageCount + stats.characterCount * 10 + stats.referenceImageCount * 20 + stats.mediaCount * 5 + Math.floor(stats.lastMessageAt / 1000000000000);
}

function describeStats(stats: StorageStats): string {
  return `rev=${stats.revision}, writeSeq=${stats.writeSeq}, savedAt=${stats.savedAt}, messages=${stats.messageCount}, chars=${stats.characterCount}, refs=${stats.referenceImageCount}, media=${stats.mediaCount}, lastMessageAt=${stats.lastMessageAt}`;
}

function summarizeState(state: SNSGodState, source: string) {
  const stats = getStorageStats(state);
  return {
    source,
    revision: stats.revision,
    writeSeq: stats.writeSeq,
    savedAt: stats.savedAt,
    importedAt: stats.importedAt,
    hash: stats.hash,
    messageCount: stats.messageCount,
    characterCount: stats.characterCount,
    referenceImageCount: stats.referenceImageCount,
    mediaCount: stats.mediaCount,
    lastMessageAt: stats.lastMessageAt
  };
}

function getStorageStats(state: SNSGodState): StorageStats {
  const counts = getStorageCounts(state);
  const hash = contentHash(state);
  return {
    revision: Number(state.__revision || 0),
    writeSeq: Number(state.__writeSeq || 0),
    savedAt: Number(state.__savedAt || 0),
    importedAt: Number(state.__importedAt || 0),
    hash,
    ...counts
  };
}

function getStorageCounts(state: SNSGodState): StorageCounts {
  const messageLists = Object.values(state.messages || {}).filter(Array.isArray) as { createdAt?: number; mediaData?: string }[][];
  const messages = messageLists.flat();
  const actualReferenceImageCount = (state.referenceFaceSlots || []).filter(slot => String(slot.image || '').trim()).length;
  const mediaValues = collectMediaValues(state);
  const actualLastMessageAt = messages.reduce((max, message) => Math.max(max, Number(message.createdAt || 0)), 0);
  return {
    messageCount: messages.length || Number(state.__messageCount || 0),
    characterCount: (state.characters || []).length,
    referenceImageCount: actualReferenceImageCount || Number(state.__referenceImageCount || 0),
    mediaCount: mediaValues.length || Number(state.__mediaCount || 0),
    lastMessageAt: actualLastMessageAt || Number(state.__lastMessageAt || 0)
  };
}

function statsFromSnapshot(snapshot: SNSGodState): StorageStats {
  const counts = getStorageCounts(snapshot);
  return {
    revision: Number(snapshot.__revision || 0),
    writeSeq: Number(snapshot.__writeSeq || 0),
    savedAt: Number(snapshot.__savedAt || 0),
    importedAt: Number(snapshot.__importedAt || 0),
    hash: String(snapshot.__contentHash || ''),
    ...counts
  };
}

function statsFromRaw(raw: string): StorageStats | undefined {
  try {
    const parsed = JSON.parse(raw) as SNSGodState;
    if (!parsed || typeof parsed !== 'object') return undefined;
    return getStorageStats(parsed);
  } catch {
    return undefined;
  }
}

function metadataStatsFromRaw(raw: string): StorageStats | undefined {
  try {
    const parsed = JSON.parse(raw) as SNSGodState;
    if (!parsed || typeof parsed !== 'object') return undefined;
    return statsFromSnapshot(parsed);
  } catch {
    return undefined;
  }
}

function collectMediaValues(state: SNSGodState): string[] {
  const values: string[] = [];
  for (const character of state.characters || []) {
    [character.avatar, character.profileImage, character.coverImage, character.profileReferenceImage, ...(character.profileReferenceImages || [])].forEach(value => {
      if (isFileMedia(value)) values.push(value);
    });
    for (const item of character.profileImageHistory || []) {
      if (isFileMedia(item.image)) values.push(item.image);
    }
  }
  for (const list of Object.values(state.messages || {})) {
    for (const message of Array.isArray(list) ? list : []) {
      if (isFileMedia(message.mediaData)) values.push(message.mediaData);
    }
  }
  for (const post of state.snsPosts || []) {
    if (isFileMedia(post.image)) values.push(post.image);
  }
  for (const session of state.meetingEventSessions || []) {
    if (isFileMedia(session.stillImage)) values.push(session.stillImage);
  }
  for (const session of state.blindDate?.sessions || []) {
    for (const candidate of session.candidates || []) {
      if (isFileMedia(candidate.profileImageUri)) values.push(candidate.profileImageUri);
      if (isFileMedia(candidate.faceReferenceImage)) values.push(candidate.faceReferenceImage);
    }
  }
  for (const archive of state.blindDate?.archives || []) {
    if (isFileMedia(archive.candidate?.profileImageUri)) values.push(archive.candidate.profileImageUri);
    if (isFileMedia(archive.candidate?.faceReferenceImage)) values.push(archive.candidate.faceReferenceImage);
  }
  for (const slot of state.referenceFaceSlots || []) {
    if (isFileMedia(slot.image)) values.push(slot.image);
  }
  for (const sticker of state.userStickers || []) {
    if (isFileMedia(sticker.data)) values.push(sticker.data);
    if (isFileMedia(sticker.mediaData)) values.push(sticker.mediaData);
  }
  return [...new Set(values)];
}

function isFileMedia(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('file:');
}

function lightweightStorageStats(state: SNSGodState): StorageStats {
  return {
    revision: Number(state.__revision || 0),
    writeSeq: Number(state.__writeSeq || 0),
    savedAt: Number(state.__savedAt || 0),
    importedAt: Number(state.__importedAt || 0),
    hash: '',
    messageCount: Object.values(state.messages || {}).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0),
    characterCount: (state.characters || []).length,
    referenceImageCount: (state.referenceFaceSlots || []).filter(slot => String(slot.image || '').trim()).length,
    mediaCount: Number(state.__mediaCount || 0),
    lastMessageAt: Object.values(state.messages || {}).reduce((max, list) => {
      if (!Array.isArray(list)) return max;
      return list.reduce((innerMax, message) => Math.max(innerMax, Number(message.createdAt || 0)), max);
    }, 0)
  };
}

function withStorageMetadata(state: SNSGodState, revision: number, statsSource: SNSGodState = state): SNSGodState {
  const savedAt = Date.now();
  const writeSeq = Math.max(nextWriteSeq + 1, Number(state.__writeSeq || 0) + 1);
  nextWriteSeq = writeSeq;
  const base = {
    ...state,
    schemaVersion: STATE_SCHEMA_VERSION,
    __revision: Math.max(0, Math.floor(revision)),
    __writeSeq: writeSeq,
    __savedAt: savedAt
  };
  const stats = getStorageStats({ ...statsSource, __revision: base.__revision, __writeSeq: base.__writeSeq, __savedAt: base.__savedAt });
  const withCounts = {
    ...base,
    __messageCount: stats.messageCount,
    __characterCount: stats.characterCount,
    __referenceImageCount: stats.referenceImageCount,
    __mediaCount: stats.mediaCount,
    __lastMessageAt: stats.lastMessageAt
  };
  return {
    ...withCounts,
    __contentHash: contentHash(withCounts)
  };
}

function contentHash(state: SNSGodState): string {
  const raw = JSON.stringify(stripStorageMetadata(state));
  let hash = 2166136261;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16)}`;
}

function stripStorageMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripStorageMetadata);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !key.startsWith('__'))
    .map(([key, item]) => [key, stripStorageMetadata(item)]));
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(',')}}`;
}

async function getDb(): Promise<SQLite.SQLiteDatabase | undefined> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(SQLITE_DB_NAME)
      .then(async db => {
        await db.execAsync(`
          PRAGMA journal_mode = WAL;
          CREATE TABLE IF NOT EXISTS app_state (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          );
          CREATE TABLE IF NOT EXISTS app_state_meta (
            key TEXT PRIMARY KEY NOT NULL,
            revision INTEGER NOT NULL,
            write_seq INTEGER NOT NULL,
            content_hash TEXT NOT NULL,
            message_count INTEGER NOT NULL,
            character_count INTEGER NOT NULL,
            reference_image_count INTEGER NOT NULL,
            media_count INTEGER NOT NULL,
            last_message_at INTEGER NOT NULL,
            payload_size INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
          CREATE TABLE IF NOT EXISTS messages (
            room_id TEXT NOT NULL,
            message_id TEXT NOT NULL,
            message_index INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            value TEXT NOT NULL,
            PRIMARY KEY (room_id, message_id)
          );
          CREATE INDEX IF NOT EXISTS idx_messages_room_index ON messages(room_id, message_index);
          CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
          CREATE TABLE IF NOT EXISTS message_rooms (
            room_id TEXT PRIMARY KEY NOT NULL,
            message_count INTEGER NOT NULL,
            last_message_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
        `);
        return db;
      })
      .catch(() => undefined);
  }
  return dbPromise;
}

async function readSqliteState(): Promise<string | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  try {
    const row = await db.getFirstAsync<{ value: string; revision: number; write_seq: number; content_hash: string; payload_size: number }>(
      `SELECT s.value, m.revision, m.write_seq, m.content_hash, m.payload_size
       FROM app_state s
       LEFT JOIN app_state_meta m ON m.key = s.key
       WHERE s.key = ?
       LIMIT 1`,
      SQLITE_STATE_KEY
    );
    if (!row?.value) return undefined;
    const stats = statsFromRaw(row.value);
    if (!stats) return undefined;
    if (!row.content_hash || row.content_hash !== stats.hash || Number(row.revision || 0) !== stats.revision || Number(row.payload_size || 0) !== row.value.length) {
      lastSaveError = 'SQLite meta/blob mismatch detected; sqlite candidate ignored.';
      return undefined;
    }
    return row.value;
  } catch {
    return undefined;
  }
}

async function readSqliteStateWithoutMetaValidation(): Promise<string | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  try {
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM app_state WHERE key = ? LIMIT 1',
      SQLITE_STATE_KEY
    );
    return row?.value;
  } catch {
    return undefined;
  }
}

async function writeSqliteState(payload: string, snapshot: SNSGodState, preparedStats?: StorageStats): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const stats = preparedStats || getStorageStats(snapshot);
  const savedAt = snapshot.__savedAt || Date.now();
  await db.execAsync('BEGIN IMMEDIATE TRANSACTION');
  try {
    await db.runAsync(
      'INSERT OR REPLACE INTO app_state (key, value, updated_at) VALUES (?, ?, ?)',
      SQLITE_STATE_KEY,
      payload,
      savedAt
    );
    await db.runAsync(
      `INSERT OR REPLACE INTO app_state_meta
       (key, revision, write_seq, content_hash, message_count, character_count, reference_image_count, media_count, last_message_at, payload_size, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      SQLITE_STATE_KEY,
      stats.revision,
      stats.writeSeq,
      stats.hash,
      stats.messageCount,
      stats.characterCount,
      stats.referenceImageCount,
      stats.mediaCount,
      stats.lastMessageAt,
      payload.length,
      savedAt
    );
    await db.execAsync('COMMIT');
  } catch (error) {
    await db.execAsync('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

async function readMessagesByRoom(): Promise<MessageMap> {
  const db = await getDb();
  if (!db) return {};
  try {
    const rows = await db.getAllAsync<{ room_id: string; value: string }>(
      'SELECT room_id, value FROM messages ORDER BY room_id ASC, message_index ASC'
    );
    const messages: MessageMap = {};
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.value);
        if (!messages[row.room_id]) messages[row.room_id] = [];
        messages[row.room_id].push(parsed);
      } catch {
        // Ignore malformed message rows; backup snapshots can still recover.
      }
    }
    return messages;
  } catch {
    return {};
  }
}

async function writeMessagesState(messages: MessageMap): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const now = Date.now();
  const nextSignatures = createMessageRoomSignatures(messages || {});
  if (messageRoomSignaturesReady && areMapsEqual(messageRoomSignatures, nextSignatures)) return;
  const changedRoomIds = messageRoomSignaturesReady
    ? [...nextSignatures.keys()].filter(roomId => messageRoomSignatures.get(roomId) !== nextSignatures.get(roomId))
    : [...nextSignatures.keys()];
  const removedRoomIds = messageRoomSignaturesReady
    ? [...messageRoomSignatures.keys()].filter(roomId => !nextSignatures.has(roomId))
    : [];
  await db.execAsync('BEGIN IMMEDIATE TRANSACTION');
  try {
    if (!messageRoomSignaturesReady) {
      await db.runAsync('DELETE FROM messages');
      await db.runAsync('DELETE FROM message_rooms');
    } else {
      for (const roomId of removedRoomIds) {
        await db.runAsync('DELETE FROM messages WHERE room_id = ?', roomId);
        await db.runAsync('DELETE FROM message_rooms WHERE room_id = ?', roomId);
      }
    }
    for (const roomId of changedRoomIds) {
      const list = messages?.[roomId];
      const safeList = Array.isArray(list) ? list : [];
      await db.runAsync('DELETE FROM messages WHERE room_id = ?', roomId);
      if (!safeList.length) {
        await db.runAsync('DELETE FROM message_rooms WHERE room_id = ?', roomId);
        continue;
      }
      for (let index = 0; index < safeList.length; index += 1) {
        const message = safeList[index];
        const messageId = String(message.id || `${roomId}_${index}`);
        await db.runAsync(
          'INSERT OR REPLACE INTO messages (room_id, message_id, message_index, created_at, value) VALUES (?, ?, ?, ?, ?)',
          roomId,
          messageId,
          index,
          Number(message.createdAt || 0),
          JSON.stringify(message)
        );
      }
      const lastMessageAt = safeList.reduce((max, message) => Math.max(max, Number(message.createdAt || 0)), 0);
      await db.runAsync(
        'INSERT OR REPLACE INTO message_rooms (room_id, message_count, last_message_at, updated_at) VALUES (?, ?, ?, ?)',
        roomId,
        safeList.length,
        lastMessageAt,
        now
      );
    }
    await db.execAsync('COMMIT');
    messageRoomSignatures = nextSignatures;
    messageRoomSignaturesReady = true;
  } catch (error) {
    await db.execAsync('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

function createMessageRoomSignatures(messages: MessageMap): Map<string, string> {
  return new Map(Object.entries(messages || {}).map(([roomId, list]) => {
    const safeList = Array.isArray(list) ? list : [];
    return [roomId, stableStringify(safeList)];
  }));
}

function areMapsEqual(left: Map<string, string>, right: Map<string, string>): boolean {
  if (left.size !== right.size) return false;
  for (const [key, value] of left) {
    if (right.get(key) !== value) return false;
  }
  return true;
}

async function ensureBackupDir(): Promise<boolean> {
  if (!FileSystem.documentDirectory) return false;
  const info = await FileSystem.getInfoAsync(BACKUP_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(BACKUP_DIR, { intermediates: true });
  return true;
}

async function readBackupFile(fileUri: string = BACKUP_FILE): Promise<string | undefined> {
  if (!FileSystem.documentDirectory) return undefined;
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) return undefined;
    return await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.UTF8 });
  } catch {
    return undefined;
  }
}

async function writeBackupFile(payload: string, snapshot: SNSGodState, reason = 'backup snapshot', preparedStats?: StorageStats): Promise<void> {
  const canWrite = await ensureBackupDir();
  if (!canWrite) return;
  const expectedStats = preparedStats || getStorageStats(snapshot);
  try {
    await FileSystem.writeAsStringAsync(TMP_BACKUP_FILE, payload, { encoding: FileSystem.EncodingType.UTF8 });
    const tmpInfo = await FileSystem.getInfoAsync(TMP_BACKUP_FILE);
    const tmpRaw = await FileSystem.readAsStringAsync(TMP_BACKUP_FILE, { encoding: FileSystem.EncodingType.UTF8 });
    const tmpStats = metadataStatsFromRaw(tmpRaw);
    if (!tmpInfo.exists || tmpRaw.length !== payload.length || !tmpStats || tmpStats.hash !== expectedStats.hash || tmpStats.revision !== expectedStats.revision) {
      throw new Error('atomic backup tmp verification failed');
    }
    const current = await FileSystem.getInfoAsync(BACKUP_FILE);
    const previous = await FileSystem.getInfoAsync(PREVIOUS_BACKUP_FILE);
    if (previous.exists) {
      await FileSystem.deleteAsync(PREVIOUS_BACKUP_FILE, { idempotent: true });
    }
    if (current.exists) {
      await FileSystem.moveAsync({ from: BACKUP_FILE, to: PREVIOUS_BACKUP_FILE });
    }
    await FileSystem.moveAsync({ from: TMP_BACKUP_FILE, to: BACKUP_FILE });
    const latestRaw = await readBackupFile(BACKUP_FILE);
    const latestStats = latestRaw ? metadataStatsFromRaw(latestRaw) : undefined;
    if (!latestRaw || !latestStats || latestStats.hash !== expectedStats.hash || latestStats.revision !== expectedStats.revision) {
      throw new Error('atomic backup latest verification failed');
    }
    lastBackupSnapshotTime = Date.now();
    lastBackupSnapshotRevision = expectedStats.revision;
    lastBackupSnapshotReason = reason;
    lastAtomicBackupWriteResult = `ok rev=${expectedStats.revision}, writeSeq=${expectedStats.writeSeq}, size=${payload.length}, reason=${reason}`;
  } catch (error) {
    await FileSystem.deleteAsync(TMP_BACKUP_FILE, { idempotent: true }).catch(() => undefined);
    lastAtomicBackupWriteResult = `failed: ${error instanceof Error ? error.message : String(error)}`;
    throw error;
  }
}

export async function getStorageDiagnostics(currentState?: SNSGodState | null) {
  const [asyncRaw, sqliteRaw, sqliteUnverifiedRaw, latestRaw, previousRaw, sqliteMessages, media] = await Promise.all([
    AsyncStorage.getItem(STATE_KEY),
    readSqliteState(),
    readSqliteStateWithoutMetaValidation(),
    readBackupFile(BACKUP_FILE),
    readBackupFile(PREVIOUS_BACKUP_FILE),
    readMessagesByRoom(),
    inspectMediaFiles()
  ]);
  const candidates = hydrateSqliteCandidatesWithMessages(buildCandidates([
    { source: 'asyncStorage', raw: asyncRaw },
    { source: 'sqlite', raw: sqliteRaw },
    { source: 'sqliteUnverified', raw: sqliteRaw ? undefined : sqliteUnverifiedRaw },
    { source: 'backupLatest', raw: latestRaw },
    { source: 'backupPrevious', raw: previousRaw }
  ]), sqliteMessages);
  const asyncCandidate = candidates.find(candidate => candidate.source === 'asyncStorage');
  return {
    paths: getStoragePaths(),
    current: currentState ? summarizeState(currentState, 'current') : undefined,
    stores: candidates.map(candidate => ({
      source: candidate.source,
      exists: Boolean(candidate.raw),
      isLegacyFullState: candidate.source === 'asyncStorage' && Boolean(candidate.state),
      pointer: candidate.pointer ? summarizePointer(candidate.pointer) : undefined,
      parseError: candidate.parseError || '',
      summary: candidate.state ? summarizeState(candidate.state, candidate.source) : undefined
    })),
    legacyAsyncStorageFullStateExists: Boolean(asyncCandidate?.state),
    selected: {
      source: lastHydrationSource,
      reason: lastHydrationReason
    },
    save: {
      lastSQLiteSaveTime,
      lastBackupSnapshotTime,
      lastBackupSnapshotRevision,
      lastBackupSnapshotReason,
      lastSuccessfulSaveTime,
      lastSaveError,
      lastAsyncStorageWarning,
      lastSkippedOldRevisionSave,
      lastAtomicBackupWriteResult,
      skippedSaveBeforeHydrationCount,
      pending: Boolean(pendingState)
    },
    media,
    perf: getRecentPersistPerfEntries()
  };
}

function createStorageSnapshot(normalized: SNSGodState, counts: StorageCounts, includeMessages: boolean, metadataSource?: SNSGodState): SNSGodState {
  const savedAt = metadataSource?.__savedAt || Date.now();
  const writeSeq = metadataSource?.__writeSeq || Math.max(nextWriteSeq + 1, Number(normalized.__writeSeq || 0) + 1);
  if (!metadataSource) nextWriteSeq = writeSeq;
  const storageState = includeMessages ? normalized : { ...normalized, messages: {} };
  const withCounts = {
    ...storageState,
    schemaVersion: STATE_SCHEMA_VERSION,
    __revision: Math.max(0, Math.floor(Number(normalized.__revision || 0))),
    __writeSeq: writeSeq,
    __savedAt: savedAt,
    __messageCount: counts.messageCount,
    __characterCount: counts.characterCount,
    __referenceImageCount: counts.referenceImageCount,
    __mediaCount: counts.mediaCount,
    __lastMessageAt: counts.lastMessageAt
  };
  return {
    ...withCounts,
    __contentHash: metadataSource && !includeMessages ? metadataSource.__contentHash || contentHash(withCounts) : contentHash(withCounts)
  };
}

function summarizePointer(pointer: AsyncStoragePointer) {
  return {
    revision: Number(pointer.__revision || 0),
    writeSeq: Number(pointer.__writeSeq || 0),
    savedAt: Number(pointer.__savedAt || 0),
    hash: String(pointer.__contentHash || ''),
    messageCount: Number(pointer.__messageCount || 0),
    characterCount: Number(pointer.__characterCount || 0),
    referenceImageCount: Number(pointer.__referenceImageCount || 0),
    mediaCount: Number(pointer.__mediaCount || 0),
    lastMessageAt: Number(pointer.__lastMessageAt || 0),
    payloadLength: Number(pointer.payloadLength || 0)
  };
}

export function getStoragePaths() {
  return {
    sqliteDatabaseName: SQLITE_DB_NAME,
    sqliteStateKey: SQLITE_STATE_KEY,
    asyncStorageKey: STATE_KEY,
    mediaDirectory: MEDIA_ROOT_DIR,
    mediaManifestFile: MEDIA_MANIFEST_FILE,
    backupDirectory: BACKUP_DIR,
    backupLatestFile: BACKUP_FILE,
    backupTmpFile: TMP_BACKUP_FILE,
    backupPreviousFile: PREVIOUS_BACKUP_FILE
  };
}

export async function clearState(): Promise<SNSGodState> {
  const fresh = normalizeState(createDefaultState());
  await saveState(fresh);
  return fresh;
}

function migrateState(state: SNSGodState): SNSGodState {
  const version = Number(state.schemaVersion || 0);
  let next = { ...state };
  if (version < 1) {
    next = {
      ...next,
      groupRooms: Array.isArray(next.groupRooms) ? next.groupRooms : [],
      randomChats: Array.isArray(next.randomChats) ? next.randomChats : [],
      notifications: Array.isArray(next.notifications) ? next.notifications : [],
      loreEntries: Array.isArray(next.loreEntries) ? next.loreEntries : [],
      loreFolders: Array.isArray(next.loreFolders) ? next.loreFolders : [],
      roomSummaries: Array.isArray(next.roomSummaries) ? next.roomSummaries : [],
      groupRoomSummaries: Array.isArray(next.groupRoomSummaries) ? next.groupRoomSummaries : [],
      characterMemories: Array.isArray(next.characterMemories) ? next.characterMemories : [],
      userStickers: Array.isArray(next.userStickers) ? next.userStickers : []
    };
  }
  if (version < 2) next = normalizeMessageCaps(next);
  if (version < 3) {
    next = {
      ...next,
      roomSummaries: Array.isArray(next.roomSummaries) ? next.roomSummaries : [],
      groupRoomSummaries: Array.isArray(next.groupRoomSummaries) ? next.groupRoomSummaries : [],
      characterMemories: Array.isArray(next.characterMemories) ? next.characterMemories : []
    };
  }
  if (version < 4) {
    next = {
      ...next,
      characterEvents: Array.isArray(next.characterEvents) ? next.characterEvents : [],
      referenceFaceSlots: (next.referenceFaceSlots || []).map(slot => ({
        ...slot,
        role: slot.role || 'identity',
        weight: Number.isFinite(Number(slot.weight)) ? Math.max(0, Math.min(100, Number(slot.weight))) : 100
      })),
      characterMemories: (next.characterMemories || []).map(memory => ({
        ...memory,
        kind: memory.kind || 'summary',
        status: memory.status || 'active'
      }))
    };
  }
  if (version < 5) next = migrateMemoryState(next);
  return { ...next, schemaVersion: STATE_SCHEMA_VERSION };
}

function normalizeState(state: SNSGodState): SNSGodState {
  const defaults = createDefaultState();
  const merged: SNSGodState = {
    ...defaults,
    ...state,
    config: {
      ...defaults.config,
      ...(state.config || {}),
      apiProfiles: {
        ...defaults.config.apiProfiles,
        ...(state.config?.apiProfiles || {})
      }
    }
  };
  const migrated = migrateState(merged);
  const normalized = normalizeMessageCaps(normalizeSumGodState(normalizeNotifications(normalizeLoreEntries(normalizeRandomChats(ensureCharacterRooms(normalizeSnsOptions(normalizeApiProfiles(normalizeProfileImages(migrated)))))))));
  return migrateMemoryState(normalized);
}

function prepareStateForSave(state: SNSGodState, options: { includeMessages?: boolean } = {}): SNSGodState {
  const normalized = normalizeState(state);
  const storageState = options.includeMessages === false ? { ...normalized, messages: {} } : normalized;
  return withStorageMetadata(storageState, Number(normalized.__revision || 0), normalized);
}

function normalizeMessageCaps(state: SNSGodState): SNSGodState {
  const groupIds = new Set((state.groupRooms || []).map(room => room.id));
  const messages = Object.fromEntries(Object.entries(state.messages || {}).map(([roomId, list]) => [
    roomId,
    (Array.isArray(list) ? list : []).slice(-(groupIds.has(roomId) ? MAX_GROUP_ROOM_MESSAGES : MAX_ROOM_MESSAGES))
  ]));
  return { ...state, messages };
}

function normalizeApiProfiles(state: SNSGodState): SNSGodState {
  const defaultVertex = createDefaultState().config.apiProfiles.vertex || {};
  const apiProfiles = state.config.apiProfiles || {};
  const currentVertex = apiProfiles.vertex || {};
  const legacyGemini = apiProfiles.gemini || {};
  const vertexProfile = {
    ...defaultVertex,
    maxTokens: legacyGemini.maxTokens ?? defaultVertex.maxTokens,
    temperature: legacyGemini.temperature ?? defaultVertex.temperature,
    contextMessageLimit: legacyGemini.contextMessageLimit,
    snsContextMessageLimit: legacyGemini.snsContextMessageLimit,
    phoneContextMessageLimit: legacyGemini.phoneContextMessageLimit,
    ...currentVertex,
    apiModel: currentVertex.apiModel || 'gemini-3-flash-preview',
    location: currentVertex.location || 'global'
  };
  const shouldUseVertex = !state.config.apiType || state.config.apiType === 'gemini' || state.config.apiType === 'vertex';
  return {
    ...state,
    config: {
      ...state.config,
      apiType: shouldUseVertex ? 'vertex' : state.config.apiType,
      apiProfiles: {
        ...apiProfiles,
        vertex: vertexProfile
      }
    }
  };
}

function normalizeProfileImages(state: SNSGodState): SNSGodState {
  return {
    ...state,
    characters: (state.characters || []).map(character => {
      const profileImage = character.avatar || character.profileImage || '';
      return {
        ...character,
        avatar: profileImage,
        profileImage
      };
    })
  };
}

function normalizeSnsOptions(state: SNSGodState): SNSGodState {
  const base = state.config.sns || {};
  const fallback = {
    anonymous: base.anonymous === true,
    nsfw: base.nsfw === true,
    textOnly: base.textOnly === true,
    noDM: base.noDM === true,
    thirdPartyDM: base.thirdPartyDM === true,
    autoComments: base.autoComments !== false,
    commentQty: base.commentQty || '2-4',
    subject: base.subject || '',
    mood: base.mood || '',
    autoImage: base.autoImage !== false
  };
  return {
    ...state,
    config: {
      ...state.config,
      sns: {
        ...base,
        platform: base.platform === 'twitter' ? 'twitter' : 'instagram',
        platformOptions: {
          instagram: { ...fallback, ...(base.platformOptions?.instagram || {}) },
          twitter: { ...fallback, ...(base.platformOptions?.twitter || {}) }
        }
      }
    }
  };
}
