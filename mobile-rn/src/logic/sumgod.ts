import AsyncStorage from '@react-native-async-storage/async-storage';
import { SNSGodCharacter, SNSGodState, SumGodEntry, SumGodProgress } from '../types';
import { makeId } from './ids';
import { pushNotification } from './notifications';
import { SUMGOD_QUESTIONS } from './sumgodQuestions';

const SUMGOD_BACKUP_KEY = 'snsgod.sumgod.backup.v1';
let sumGodBackupGeneration = 0;
let sumGodBackupWriteQueue: Promise<void> = Promise.resolve();

function enqueueSumGodBackupWrite(task: () => Promise<void>): Promise<void> {
  const operation = sumGodBackupWriteQueue.catch(() => undefined).then(task);
  sumGodBackupWriteQueue = operation.catch(() => undefined);
  return operation;
}
const DAY_MS = 24 * 60 * 60 * 1000;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function sumGodDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function sumGodCycleStartMs(now = new Date()): number {
  const start = new Date(now);
  if (start.getHours() < 22) start.setDate(start.getDate() - 1);
  start.setHours(22, 0, 0, 0);
  return start.getTime();
}

export function sumGodEntryTimeMs(entry: SumGodEntry): number {
  const direct = Number((entry.completedAt && entry.characterAnswer ? entry.completedAt : entry.createdAt) || entry.completedAt || entry.createdAt || 0);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const key = entry.completedOn || entry.unlockedOn || '';
  const parsed = key ? new Date(`${key}T22:00:00`).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isEntryInCurrentCycle(entry: SumGodEntry, now = new Date()): boolean {
  const start = sumGodCycleStartMs(now);
  const time = sumGodEntryTimeMs(entry);
  return time >= start && time < start + DAY_MS;
}

export function activeSumGodEntry(sum: SumGodProgress): SumGodEntry | undefined {
  return [...sum.entries].reverse().find(entry => Boolean(entry.userAnswer) && !entry.characterAnswer);
}

export function todaySumGodEntry(sum: SumGodProgress, now = new Date()): SumGodEntry | undefined {
  return [...sum.entries].reverse().find(entry => isEntryInCurrentCycle(entry, now));
}

export function isTodaySumGodDone(sum: SumGodProgress, now = new Date()): boolean {
  const entry = todaySumGodEntry(sum, now);
  return Boolean(entry?.userAnswer && entry?.characterAnswer);
}

export function nextSumGodQuestionNumber(sum: SumGodProgress): number {
  return Math.max(1, sum.entries.reduce((max, entry, index) => Math.max(max, Number(entry.number) || index + 1), 0) + 1);
}

export function canCreateNextSumGodEntry(sum: SumGodProgress, now = new Date()): boolean {
  if (activeSumGodEntry(sum)) return false;
  if (nextSumGodQuestionNumber(sum) > SUMGOD_QUESTIONS.length) return false;
  if (sum.entries.length === 0) return true;
  if (isTodaySumGodDone(sum, now)) return false;
  if (todaySumGodEntry(sum, now)) return false;
  return now.getHours() >= 22;
}

export function sumGodBadgeCount(state: SNSGodState, now = new Date()): number {
  const sum = getSumGodProgress(state);
  const active = activeSumGodEntry(sum);
  if (active && !active.characterAnswer) return 1;
  return canCreateNextSumGodEntry(sum, now) ? 1 : 0;
}

export function normalizeSumGodProgress(raw: unknown, fallbackCharacterId = ''): SumGodProgress {
  const record = isObject(raw) ? raw : {};
  const rawEntries = Array.isArray(record.entries) ? record.entries : [];
  const entries: SumGodEntry[] = rawEntries.filter(isObject).map((item, index) => {
    const createdAt = Number(item.createdAt || item.updatedAt || Date.now());
    const number = Number(item.number || index + 1);
    const rawConversation = Array.isArray(item.conversation) ? item.conversation : [];
    return {
      id: String(item.id || makeId('sum')),
      number,
      question: String(item.question || SUMGOD_QUESTIONS[(number - 1) % SUMGOD_QUESTIONS.length]),
      unlockedOn: String(item.unlockedOn || item.dateKey || sumGodDateKey(new Date(createdAt))),
      createdAt,
      userAnswer: String(item.userAnswer || item.answer || ''),
      characterAnswer: String(item.characterAnswer || ''),
      completedOn: item.completedOn ? String(item.completedOn) : item.characterAnswer ? String(item.dateKey || sumGodDateKey(new Date(Number(item.completedAt || createdAt)))) : undefined,
      completedAt: item.completedAt ? Number(item.completedAt) : item.characterAnswer ? Number(item.updatedAt || createdAt) : undefined,
      conversation: rawConversation.filter(isObject).map(line => ({
        role: (line.role === 'user' || line.from === 'user' ? 'user' : 'character') as 'user' | 'character',
        text: String(line.text || line.body || ''),
        createdAt: Number(line.createdAt || Date.now()),
        kind: (line.kind === 'reveal-comment' ? 'reveal-comment' : line.kind === 'talk' ? 'talk' : undefined) as 'reveal-comment' | 'talk' | undefined
      })).filter(line => line.text),
      generatingAnswer: item.generatingAnswer === true,
      generatingTalk: item.generatingTalk === true,
      generatingTalkIndex: Number.isFinite(Number(item.generatingTalkIndex)) ? Number(item.generatingTalkIndex) : undefined,
      userAnswerEditedAt: item.userAnswerEditedAt ? Number(item.userAnswerEditedAt) : undefined,
      editingUserAnswer: item.editingUserAnswer === true,
      archiveEditing: item.archiveEditing === true,
      textEditedAt: item.textEditedAt ? Number(item.textEditedAt) : undefined,
      debugUnlocked: item.debugUnlocked === true,
      cheatUnlocked: item.cheatUnlocked === true
    };
  });
  const archives = Array.isArray(record.characterArchives)
    ? record.characterArchives.filter(isObject).map((archive, index) => ({
      id: String(archive.id || makeId('sumarch')),
      characterId: String(archive.characterId || `archive_${index}`),
      characterName: archive.characterName ? String(archive.characterName) : undefined,
      archivedAt: Number(archive.archivedAt || Date.now()),
      entries: normalizeSumGodProgress({ entries: archive.entries }, fallbackCharacterId).entries
    }))
    : [];
  return {
    characterId: String(record.characterId || fallbackCharacterId || ''),
    view: record.view === 'archive' ? 'archive' : 'today',
    questionOpen: record.questionOpen === true,
    entries,
    characterArchives: archives,
    backedUpAt: record.backedUpAt ? Number(record.backedUpAt) : undefined,
    stateImportedAt: Number.isFinite(Number(record.stateImportedAt)) ? Number(record.stateImportedAt) : undefined,
  };
}

export function getSumGodProgress(state: SNSGodState): SumGodProgress {
  const fallbackCharacterId = state.characters[0]?.id || '';
  const fromConfig = normalizeSumGodProgress(state.config?.sumGod, fallbackCharacterId);
  const fromRoot = normalizeSumGodProgress(state.sumGod, fallbackCharacterId);
  return progressScore(fromRoot) > progressScore(fromConfig) ? fromRoot : fromConfig;
}

export function normalizeSumGodState(state: SNSGodState): SNSGodState {
  const sumGod = getSumGodProgress(state);
  return {
    ...state,
    config: {
      ...state.config,
      sumGod
    },
    sumGod
  };
}

export function patchSumGod(state: SNSGodState, patch: (sum: SumGodProgress, state: SNSGodState) => SumGodProgress): SNSGodState {
  const current = getSumGodProgress(state);
  const nextSum = patch({ ...current, entries: [...current.entries], characterArchives: [...(current.characterArchives || [])] }, state);
  return normalizeSumGodState({
    ...state,
    config: {
      ...state.config,
      sumGod: nextSum
    },
    sumGod: nextSum
  });
}

export function createNextSumGodEntry(sum: SumGodProgress, now = new Date(), options: { cheatUnlocked?: boolean } = {}): SumGodEntry | undefined {
  const number = nextSumGodQuestionNumber(sum);
  if (number > SUMGOD_QUESTIONS.length) return undefined;
  const entry: SumGodEntry = {
    id: makeId('sum'),
    number,
    question: SUMGOD_QUESTIONS[number - 1],
    unlockedOn: sumGodDateKey(now),
    createdAt: Date.now(),
    userAnswer: '',
    characterAnswer: '',
    conversation: [],
    cheatUnlocked: options.cheatUnlocked
  };
  sum.entries = [entry, ...sum.entries];
  return entry;
}

export function openSumGodQuestion(state: SNSGodState, now = new Date(), options: { cheat?: boolean } = {}): SNSGodState {
  return patchSumGod(state, sum => {
    if (!sum.characterId) sum.characterId = state.characters[0]?.id || '';
    sum.view = 'today';
    sum.questionOpen = true;
    if (options.cheat || canCreateNextSumGodEntry(sum, now)) createNextSumGodEntry(sum, now, { cheatUnlocked: options.cheat });
    return sum;
  });
}

export function selectSumGodCharacter(state: SNSGodState, character: SNSGodCharacter): SNSGodState {
  return patchSumGod(state, sum => {
    if (sum.characterId === character.id) return sum;
    if (sum.characterId && sum.entries.length) {
      const old = state.characters.find(item => item.id === sum.characterId);
      sum.characterArchives = [
        {
          id: makeId('sumarch'),
          characterId: sum.characterId,
          characterName: old?.name,
          archivedAt: Date.now(),
          entries: sum.entries
        },
        ...(sum.characterArchives || [])
      ];
    }
    sum.characterId = character.id;
    sum.entries = [];
    sum.view = 'today';
    sum.questionOpen = false;
    return sum;
  });
}

export function updateSumGodEntry(state: SNSGodState, entryId: string, patch: (entry: SumGodEntry, sum: SumGodProgress) => SumGodEntry): SNSGodState {
  return patchSumGod(state, sum => {
    sum.entries = sum.entries.map(entry => entry.id === entryId ? patch(entry, sum) : entry);
    return sum;
  });
}

export function progressScore(sum: SumGodProgress): number {
  const completed = sum.entries.filter(entry => entry.userAnswer || entry.characterAnswer).length;
  const maxNumber = sum.entries.reduce((max, entry, index) => Math.max(max, Number(entry.number) || index + 1), 0);
  return sum.entries.length * 10000 + completed * 100 + maxNumber;
}

export async function loadSumGodBackup(): Promise<SumGodProgress | undefined> {
  try {
    const raw = await AsyncStorage.getItem(SUMGOD_BACKUP_KEY);
    return raw ? normalizeSumGodProgress(JSON.parse(raw)) : undefined;
  } catch {
    return undefined;
  }
}

export async function saveSumGodBackup(sum: SumGodProgress, stateImportedAt?: number): Promise<void> {
  const generation = sumGodBackupGeneration;
  try {
    const snapshot = normalizeSumGodProgress({ ...sum, backedUpAt: Date.now(), stateImportedAt });
    if (!snapshot.entries.length && !snapshot.characterId) return;
    await enqueueSumGodBackupWrite(async () => {
      if (generation !== sumGodBackupGeneration) return;
      const existing = await loadSumGodBackup();
      if (generation !== sumGodBackupGeneration) return;
      if (
        existing
        && Object.is(existing.stateImportedAt, snapshot.stateImportedAt)
        && progressScore(existing) > progressScore(snapshot)
      ) return;
      await AsyncStorage.setItem(SUMGOD_BACKUP_KEY, JSON.stringify(snapshot));
    });
  } catch {
    // SumGod backup must not block normal app usage.
  }
}

/** Invalidates writes captured by the runtime generation that is being replaced. */
export function invalidateSumGodBackupWrites(): number {
  sumGodBackupGeneration += 1;
  return sumGodBackupGeneration;
}

/** Replaces the recovery copy exactly after the authoritative import succeeds. */
export async function replaceSumGodBackup(
  sum: SumGodProgress,
  stateImportedAt: number | undefined,
  generation = invalidateSumGodBackupWrites(),
): Promise<void> {
  const snapshot = normalizeSumGodProgress({ ...sum, backedUpAt: Date.now(), stateImportedAt });
  await enqueueSumGodBackupWrite(async () => {
    if (generation !== sumGodBackupGeneration) return;
    if (!snapshot.entries.length && !snapshot.characterId) {
      await AsyncStorage.removeItem(SUMGOD_BACKUP_KEY);
      return;
    }
    await AsyncStorage.setItem(SUMGOD_BACKUP_KEY, JSON.stringify(snapshot));
  });
}

export function restoreSumGodBackupIfBetter(state: SNSGodState, backup?: SumGodProgress): SNSGodState {
  if (!backup) return state;
  if (!Object.is(backup.stateImportedAt, state.__importedAt)) return state;
  const current = getSumGodProgress(state);
  return progressScore(backup) > progressScore(current)
    ? normalizeSumGodState({ ...state, config: { ...state.config, sumGod: backup }, sumGod: backup })
    : state;
}

export function pushSumGodNotification(state: SNSGodState, entry: SumGodEntry, character: SNSGodCharacter, text: string): SNSGodState {
  return pushNotification(state, {
    type: 'sumgod',
    app: 'sumgod',
    title: `${character.name || 'SumGod'} 코멘트`,
    body: text.slice(0, 120),
    characterId: character.id,
    target: { app: 'sumgod', characterId: character.id },
    collapseKey: `sumgod:${entry.id}`
  });
}
