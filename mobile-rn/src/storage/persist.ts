import AsyncStorage from '@react-native-async-storage/async-storage';
import { SNSGodState } from '../types';
import { createDefaultState } from '../data/defaultState';

const STATE_KEY = 'snsgod.state.v1';
const LEGACY_BACKUP_KEY = 'snsgod.legacyBackup.v1';

export async function loadState(): Promise<SNSGodState> {
  const raw = await AsyncStorage.getItem(STATE_KEY);
  if (!raw) return createDefaultState();
  try {
    return JSON.parse(raw) as SNSGodState;
  } catch {
    return createDefaultState();
  }
}

export async function saveState(state: SNSGodState): Promise<void> {
  const snapshot: SNSGodState = { ...state, __savedAt: Date.now() };
  const payload = JSON.stringify(snapshot);
  await AsyncStorage.setItem(STATE_KEY, payload);
  const saved = await AsyncStorage.getItem(STATE_KEY);
  if (saved !== payload) {
    throw new Error('저장소 검증 실패: 저장 직후 읽은 데이터가 일치하지 않습니다.');
  }
}

export async function importState(state: SNSGodState, originalJson: string): Promise<SNSGodState> {
  const imported: SNSGodState = { ...state, __importedAt: Date.now(), __savedAt: Date.now() };
  await AsyncStorage.multiSet([
    [STATE_KEY, JSON.stringify(imported)],
    [LEGACY_BACKUP_KEY, originalJson]
  ]);
  return imported;
}

export async function clearState(): Promise<SNSGodState> {
  const fresh = createDefaultState();
  await saveState(fresh);
  return fresh;
}
