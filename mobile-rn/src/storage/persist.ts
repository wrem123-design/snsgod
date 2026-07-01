import AsyncStorage from '@react-native-async-storage/async-storage';
import { SNSGodState } from '../types';
import { createDefaultState } from '../data/defaultState';
import { ensureCharacterRooms, normalizeRandomChats } from '../logic/stateHelpers';
import { MAX_GROUP_ROOM_MESSAGES, MAX_ROOM_MESSAGES, STATE_SCHEMA_VERSION } from '../logic/limits';
import { normalizeLoreEntries } from '../logic/loreEngine';
import { normalizeNotifications } from '../logic/notifications';
import { externalizeStateMedia } from '../logic/media';
import { normalizeSumGodState } from '../logic/sumgod';

const STATE_KEY = 'snsgod.state.v1';
const LEGACY_BACKUP_KEY = 'snsgod.legacyBackup.v1';
const REFERENCE_FACE_BACKUP_KEY = 'snsgod.referenceFaceSlots.v1';
const MEETING_EVENT_BACKUP_KEY = 'snsgod.meetingEventSessions.v1';
const SAVE_DEBOUNCE_MS = 1200;

let saveInFlight = Promise.resolve();
let pendingState: SNSGodState | undefined;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

export async function loadState(): Promise<SNSGodState> {
  const raw = await AsyncStorage.getItem(STATE_KEY);
  const backups = await readCriticalBackups();
  if (!raw) return normalizeState(mergeCriticalBackups(createDefaultState(), backups));
  try {
    return normalizeState(mergeCriticalBackups(JSON.parse(raw) as SNSGodState, backups));
  } catch {
    return normalizeState(mergeCriticalBackups(createDefaultState(), backups));
  }
}

async function writeStateNow(state: SNSGodState): Promise<void> {
  const snapshot = prepareStateForSave(await externalizeStateMedia(state));
  const payload = JSON.stringify(snapshot);
  saveInFlight = saveInFlight
    .catch(() => undefined)
    .then(async () => {
      await AsyncStorage.multiSet([
        [STATE_KEY, payload],
        [REFERENCE_FACE_BACKUP_KEY, JSON.stringify(snapshot.referenceFaceSlots || [])],
        [MEETING_EVENT_BACKUP_KEY, JSON.stringify(snapshot.meetingEventSessions || [])]
      ]);
      const saved = await AsyncStorage.getItem(STATE_KEY);
      if (saved !== payload) {
        throw new Error('저장 검증 실패: 저장 직후 읽은 데이터가 일치하지 않습니다.');
      }
    });
  await saveInFlight;
}

export async function saveState(state: SNSGodState): Promise<void> {
  await writeStateNow(state);
}

export function saveStateDebounced(state: SNSGodState): void {
  pendingState = state;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const snapshot = pendingState;
    pendingState = undefined;
    saveTimer = undefined;
    if (snapshot) void writeStateNow(snapshot);
  }, SAVE_DEBOUNCE_MS);
}

export async function flushSaveState(state?: SNSGodState): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
  }
  const snapshot = state || pendingState;
  pendingState = undefined;
  if (snapshot) await writeStateNow(snapshot);
  await saveInFlight;
}

export async function importState(state: SNSGodState, originalJson: string): Promise<SNSGodState> {
  const imported: SNSGodState = { ...prepareStateForSave(state), __importedAt: Date.now() };
  await AsyncStorage.multiSet([
    [STATE_KEY, JSON.stringify(imported)],
    [REFERENCE_FACE_BACKUP_KEY, JSON.stringify(imported.referenceFaceSlots || [])],
    [MEETING_EVENT_BACKUP_KEY, JSON.stringify(imported.meetingEventSessions || [])],
    [LEGACY_BACKUP_KEY, originalJson]
  ]);
  return imported;
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
      userStickers: Array.isArray(next.userStickers) ? next.userStickers : []
    };
  }
  if (version < 2) next = normalizeMessageCaps(next);
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
  return normalizeMessageCaps(normalizeSumGodState(normalizeNotifications(normalizeLoreEntries(normalizeRandomChats(ensureCharacterRooms(normalizeSnsOptions(normalizeApiProfiles(normalizeProfileImages(migrated)))))))));
}

function prepareStateForSave(state: SNSGodState): SNSGodState {
  return { ...normalizeState(state), schemaVersion: STATE_SCHEMA_VERSION, __savedAt: Date.now() };
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
