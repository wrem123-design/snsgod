import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import ts from 'typescript';

async function importPureTypeScript(relativePath) {
  const source = readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
  const transpiled = ts.transpileModule(source, {
    fileName: relativePath,
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  assert.equal(transpiled.diagnostics?.length ?? 0, 0);
  return import(`data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`);
}

const { planMessageHistoryWrite } = await importPureTypeScript('src/logic/messageHistoryPolicy.ts');
const persistSource = readFileSync(new URL('../src/storage/persist.ts', import.meta.url), 'utf8');

function message(index, extra = {}) {
  return { id: `message-${index}`, role: index % 2 ? 'character' : 'user', content: `message ${index}`, createdAt: index, ...extra };
}

function openDatabase(path) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS messages (
      room_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      message_index INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (room_id, message_id)
    );
    CREATE INDEX IF NOT EXISTS idx_messages_room_index ON messages(room_id, message_index);
    CREATE TABLE IF NOT EXISTS message_rooms (
      room_id TEXT PRIMARY KEY NOT NULL,
      message_count INTEGER NOT NULL,
      last_message_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  return db;
}

function writeRoom(db, roomId, previous, next) {
  const writePlan = planMessageHistoryWrite(previous, next);
  db.exec('BEGIN IMMEDIATE TRANSACTION');
  try {
    if (writePlan.mode === 'replace') db.prepare('DELETE FROM messages WHERE room_id = ?').run(roomId);
    const writeFrom = writePlan.mode === 'append' ? writePlan.appendFrom : 0;
    const insert = db.prepare('INSERT OR REPLACE INTO messages (room_id, message_id, message_index, created_at, value) VALUES (?, ?, ?, ?, ?)');
    for (let index = writeFrom; index < next.length; index += 1) {
      const item = next[index];
      insert.run(roomId, item.id, index, item.createdAt, JSON.stringify(item));
    }
    db.prepare('INSERT OR REPLACE INTO message_rooms (room_id, message_count, last_message_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(roomId, next.length, next.at(-1)?.createdAt || 0, Date.now());
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

test('real SQLite preserves 121+ messages and incrementally appends across restart', () => {
  const root = mkdtempSync(join(tmpdir(), 'snsgod-message-retention-'));
  const dbPath = join(root, 'messages.sqlite');
  const mediaUri = 'file:///snsgod-media/assets/old.jpg';
  const original = [message(0, { mediaData: mediaUri }), ...Array.from({ length: 120 }, (_, index) => message(index + 1))];
  let db = openDatabase(dbPath);
  try {
    writeRoom(db, 'room', undefined, original);
    const appended = [...original, message(121)];
    writeRoom(db, 'room', original, appended);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM messages WHERE room_id = ?').get('room').count, 122);
    assert.equal(db.prepare('SELECT message_count FROM message_rooms WHERE room_id = ?').get('room').message_count, 122);
    db.close();

    db = openDatabase(dbPath);
    const rows = db.prepare('SELECT value FROM messages WHERE room_id = ? ORDER BY message_index ASC').all('room');
    assert.equal(rows.length, 122);
    assert.equal(JSON.parse(rows[0].value).mediaData, mediaUri);
    assert.equal(JSON.parse(rows.at(-1).value).id, 'message-121');

    const edited = [message(0, { content: 'edited', mediaData: mediaUri }), ...appended.slice(1)];
    writeRoom(db, 'room', appended, edited);
    assert.equal(JSON.parse(db.prepare('SELECT value FROM messages WHERE room_id = ? AND message_index = 0').get('room').value).content, 'edited');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM messages WHERE room_id = ?').get('room').count, 122);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('integration SQL stays aligned with the production Expo SQLite repository', () => {
  assert.match(persistSource, /CREATE TABLE IF NOT EXISTS messages/);
  assert.match(persistSource, /BEGIN IMMEDIATE TRANSACTION/);
  assert.match(persistSource, /INSERT OR REPLACE INTO messages/);
  assert.match(persistSource, /ORDER BY room_id ASC, message_index ASC/);
});

test('real SQLite rolls state and message rows back as one transaction', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`
      CREATE TABLE app_state (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE messages (room_id TEXT NOT NULL, message_id TEXT NOT NULL, message_index INTEGER NOT NULL, created_at INTEGER NOT NULL, value TEXT NOT NULL, PRIMARY KEY (room_id, message_id));
      INSERT INTO app_state VALUES ('state.v1', 'old-state', 1);
      INSERT INTO messages VALUES ('room', 'old-message', 0, 1, 'old-message');
    `);
    assert.throws(() => {
      db.exec('BEGIN IMMEDIATE TRANSACTION');
      try {
        db.prepare('INSERT OR REPLACE INTO app_state VALUES (?, ?, ?)').run('state.v1', 'new-state', 2);
        db.prepare('INSERT INTO messages VALUES (?, ?, ?, ?, ?)').run('room', null, 1, 2, 'broken');
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    });
    assert.equal(db.prepare('SELECT value FROM app_state WHERE key = ?').get('state.v1').value, 'old-state');
    assert.equal(db.prepare('SELECT value FROM messages WHERE room_id = ?').get('room').value, 'old-message');
  } finally {
    db.close();
  }
});
