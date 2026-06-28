import AsyncStorage from '@react-native-async-storage/async-storage';

export type DebugLogEntry = {
  id: string;
  createdAt: number;
  level: 'info' | 'warn' | 'error';
  scope: string;
  message: string;
};

const DEBUG_LOG_KEY = 'snsgod.debugLog.v1';
const MAX_LOGS = 160;

export async function appendDebugLog(scope: string, message: string, level: DebugLogEntry['level'] = 'info'): Promise<void> {
  try {
    const entries = await readDebugLogs();
    const next: DebugLogEntry = {
      id: `debug_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: Date.now(),
      level,
      scope,
      message
    };
    await AsyncStorage.setItem(DEBUG_LOG_KEY, JSON.stringify([next, ...entries].slice(0, MAX_LOGS)));
  } catch {
    // Debug logging must never break app usage.
  }
}

export async function readDebugLogs(): Promise<DebugLogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(DEBUG_LOG_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isDebugLogEntry) : [];
  } catch {
    return [];
  }
}

export async function clearDebugLogs(): Promise<void> {
  await AsyncStorage.removeItem(DEBUG_LOG_KEY);
}

function isDebugLogEntry(value: unknown): value is DebugLogEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<DebugLogEntry>;
  return typeof entry.id === 'string'
    && typeof entry.createdAt === 'number'
    && typeof entry.scope === 'string'
    && typeof entry.message === 'string';
}
