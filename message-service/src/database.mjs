import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openDatabase(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, 'snsgod-message-service.sqlite'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      push_token TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS runtime_settings (
      key TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('direct', 'group')),
      name TEXT NOT NULL,
      character_id TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      automation TEXT NOT NULL DEFAULT '{}',
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS room_participants (
      room_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (room_id, character_id),
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'character', 'system')),
      character_id TEXT,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      server_created_at INTEGER NOT NULL,
      client_message_id TEXT UNIQUE,
      origin TEXT NOT NULL CHECK(origin IN ('client', 'server')),
      metadata TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS messages_room_created_idx ON messages(room_id, created_at, id);
    CREATE TABLE IF NOT EXISTS message_jobs (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK(kind IN ('reply', 'proactive', 'deliver')),
      room_id TEXT NOT NULL,
      due_at INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
      attempt_count INTEGER NOT NULL DEFAULT 0,
      payload TEXT NOT NULL DEFAULT '{}',
      error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS jobs_due_idx ON message_jobs(status, due_at);
    CREATE INDEX IF NOT EXISTS jobs_room_kind_status_idx ON message_jobs(room_id, kind, status, created_at);
    CREATE TABLE IF NOT EXISTS sync_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS push_outbox (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'sent', 'failed', 'skipped')),
      error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  return db;
}

export function json(value, fallback = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

export function transaction(db, callback) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = callback();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
