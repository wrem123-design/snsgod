import * as SQLite from 'expo-sqlite';
import { redactSecretText } from './secretRedaction';

export type DebugLogEntry = {
  id: string;
  createdAt: number;
  level: 'info' | 'warn' | 'error';
  scope: string;
  message: string;
};

const SQLITE_DB_NAME = 'snsgod.sqlite';
const MAX_LOGS = 160;

let cachedLogs: DebugLogEntry[] | undefined;
let dbPromise: Promise<SQLite.SQLiteDatabase | undefined> | undefined;
let writeQueue = Promise.resolve();

async function getDb(): Promise<SQLite.SQLiteDatabase | undefined> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(SQLITE_DB_NAME)
      .then(async db => {
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS debug_logs (
            id TEXT PRIMARY KEY NOT NULL,
            created_at INTEGER NOT NULL,
            level TEXT NOT NULL,
            scope TEXT NOT NULL,
            message TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_debug_logs_created_at ON debug_logs(created_at DESC);
        `);
        return db;
      })
      .catch(() => undefined);
  }
  return dbPromise;
}

function toEntry(row: { id: string; created_at: number; level: string; scope: string; message: string }): DebugLogEntry {
  const level = row.level === 'warn' || row.level === 'error' ? row.level : 'info';
  return {
    id: row.id,
    createdAt: Number(row.created_at || 0),
    level,
    scope: String(row.scope || ''),
    message: String(row.message || '')
  };
}

async function appendLogRow(entry: DebugLogEntry): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.runAsync(
    'INSERT OR REPLACE INTO debug_logs (id, created_at, level, scope, message) VALUES (?, ?, ?, ?, ?)',
    entry.id,
    entry.createdAt,
    entry.level,
    entry.scope,
    entry.message
  );
  await db.runAsync(
    `DELETE FROM debug_logs
     WHERE id NOT IN (
       SELECT id FROM debug_logs ORDER BY created_at DESC LIMIT ?
     )`,
    MAX_LOGS
  );
}

export async function appendDebugLog(scope: string, message: string, level: DebugLogEntry['level'] = 'info'): Promise<void> {
  const next: DebugLogEntry = {
    id: `debug_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
    level,
    scope,
    message: redactSecretText(message)
  };
  cachedLogs = [next, ...(cachedLogs || [])].slice(0, MAX_LOGS);
  writeQueue = writeQueue
    .catch(() => undefined)
    .then(() => appendLogRow(next))
    .catch(() => undefined);
  await Promise.resolve();
}

export async function readDebugLogs(): Promise<DebugLogEntry[]> {
  try {
    await writeQueue.catch(() => undefined);
    const db = await getDb();
    if (!db) return cachedLogs || [];
    const rows = await db.getAllAsync<{ id: string; created_at: number; level: string; scope: string; message: string }>(
      'SELECT id, created_at, level, scope, message FROM debug_logs ORDER BY created_at DESC LIMIT ?',
      MAX_LOGS
    );
    cachedLogs = rows.map(toEntry);
    return [...cachedLogs];
  } catch {
    return cachedLogs || [];
  }
}

export async function clearDebugLogs(): Promise<void> {
  cachedLogs = [];
  try {
    const db = await getDb();
    await db?.runAsync('DELETE FROM debug_logs');
  } catch {
    // Debug logging must never break app usage.
  }
}
