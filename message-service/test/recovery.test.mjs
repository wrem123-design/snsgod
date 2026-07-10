import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/database.mjs';
import { createMessageService } from '../src/service.mjs';

function harness(options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'snsgod-recovery-'));
  let clock = 1_750_000_000_000;
  let apiAvailable = options.apiAvailable === true;
  let apiCalls = 0;
  const db = openDatabase(dir);
  const fetchImpl = async () => {
    apiCalls += 1;
    if (!apiAvailable) return new Response('temporarily unavailable', { status: 503 });
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ messages: [{ content: 'recovered reply', delaySeconds: 0 }] }) } }]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const service = createMessageService({
    db,
    config: {
      bootstrapSecret: 'pairing-secret',
      llmProvider: 'mock',
      pushProvider: 'none',
      grokApiUrl: 'http://127.0.0.1:5000/api/xai-proxy/v1/chat/completions',
      apiHealthCheckMs: 30_000,
      replyJobRetentionMs: options.replyJobRetentionMs || 24 * 60 * 60_000,
      proactiveJobRetentionMs: 6 * 60 * 60_000
    },
    now: () => clock,
    random: () => 0,
    fetchImpl,
    log: { info() {}, warn() {} }
  });
  const registration = service.register({ deviceId: 'phone-recovery', bootstrapSecret: 'pairing-secret' });
  const headers = { 'x-device-id': 'phone-recovery', 'x-device-token': registration.deviceToken };
  service.bootstrap({
    textGeneration: { provider: 'grok', apiModel: 'grok-4.3' },
    characters: [{ id: 'mika', name: 'Mika', timeZone: 'UTC' }],
    rooms: [{
      id: 'room-1', type: 'direct', name: 'Mika', characterId: 'mika',
      automation: { responseDelayMin: 0, responseDelayMax: 0 }
    }]
  }, headers);
  return {
    db,
    service,
    headers,
    advance(ms) { clock += ms; },
    setApiAvailable(value) { apiAvailable = value; },
    apiCalls() { return apiCalls; },
    close() { db.close(); rmSync(dir, { recursive: true, force: true }); }
  };
}

test('reply retries use 1, 5, 15, and 30 minute backoff then recover automatically', async () => {
  const app = harness();
  try {
    app.service.receiveMessage({ id: 'user-recover', roomId: 'room-1', content: 'hello' }, app.headers);
    const delays = [60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000];
    for (let index = 0; index < delays.length; index += 1) {
      await app.service.runScheduler();
      const job = app.db.prepare("SELECT * FROM message_jobs WHERE kind = 'reply'").get();
      assert.equal(job.status, 'pending');
      assert.equal(job.attempt_count, index + 1);
      assert.equal(job.due_at - job.updated_at, delays[index]);
      app.advance(delays[index]);
    }
    await app.service.runScheduler();
    assert.equal(app.db.prepare("SELECT status FROM message_jobs WHERE kind = 'reply'").get().status, 'failed');
    assert.equal(app.service.health().textApiHealth.status, 'down');

    app.setApiAvailable(true);
    app.advance(30_000);
    await app.service.runScheduler();
    const recovered = app.db.prepare("SELECT * FROM message_jobs WHERE kind = 'reply'").get();
    assert.equal(recovered.status, 'pending');
    assert.equal(recovered.attempt_count, 0);

    app.advance(1000);
    await app.service.runScheduler();
    assert.equal(app.db.prepare("SELECT status FROM message_jobs WHERE kind = 'reply'").get().status, 'completed');
    const replies = app.db.prepare("SELECT * FROM messages WHERE origin = 'server'").all();
    assert.equal(replies.length, 1);
    assert.equal(JSON.parse(replies[0].metadata).sourceMessageId, 'user-recover');
    assert.equal(app.service.health().textApiHealth.status, 'up');
  } finally {
    app.close();
  }
});

test('a newer user message cancels the stale retry and receives exactly one current reply', async () => {
  const app = harness();
  try {
    app.service.receiveMessage({ id: 'user-old', roomId: 'room-1', content: 'old question' }, app.headers);
    await app.service.runScheduler();
    app.service.receiveMessage({ id: 'user-new', roomId: 'room-1', content: 'new question' }, app.headers);
    assert.equal(app.db.prepare("SELECT status FROM message_jobs WHERE json_extract(payload, '$.sourceMessageId') = 'user-old'").get().status, 'cancelled');
    assert.equal(app.db.prepare("SELECT status FROM message_jobs WHERE json_extract(payload, '$.sourceMessageId') = 'user-new'").get().status, 'pending');

    app.setApiAvailable(true);
    await app.service.runScheduler();
    const replies = app.db.prepare("SELECT metadata FROM messages WHERE origin = 'server'").all();
    assert.equal(replies.length, 1);
    assert.equal(JSON.parse(replies[0].metadata).sourceMessageId, 'user-new');
    const duplicate = app.service.receiveMessage({ id: 'user-new', roomId: 'room-1', content: 'new question' }, app.headers);
    assert.equal(duplicate.duplicate, true);
    await app.service.runScheduler();
    assert.equal(app.db.prepare("SELECT COUNT(*) AS value FROM messages WHERE origin = 'server'").get().value, 1);
  } finally {
    app.close();
  }
});

test('duplicate reply jobs for one source message generate only one answer', async () => {
  const app = harness({ apiAvailable: true });
  try {
    app.service.receiveMessage({ id: 'user-dedupe', roomId: 'room-1', content: 'one request' }, app.headers);
    const original = app.db.prepare("SELECT * FROM message_jobs WHERE kind = 'reply'").get();
    app.db.prepare(`INSERT INTO message_jobs (id, kind, room_id, due_at, status, attempt_count, payload, created_at, updated_at)
      VALUES ('duplicate-job', 'reply', ?, ?, 'pending', 0, ?, ?, ?)`).run(original.room_id, original.due_at, original.payload, original.created_at, original.updated_at);
    await app.service.runScheduler();
    assert.equal(app.db.prepare("SELECT COUNT(*) AS value FROM messages WHERE origin = 'server'").get().value, 1);
    assert.equal(app.apiCalls(), 1);
  } finally {
    app.close();
  }
});

test('a user message arriving during generation cancels the running stale reply', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'snsgod-running-recovery-'));
  let clock = 1_750_000_000_000;
  let firstResolve;
  let calls = 0;
  const successResponse = () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ messages: [{ content: 'latest reply', delaySeconds: 0 }] }) } }]
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  const db = openDatabase(dir);
  const service = createMessageService({
    db,
    config: { bootstrapSecret: 'pairing-secret', llmProvider: 'mock', pushProvider: 'none', grokApiUrl: 'http://127.0.0.1:5000/api/xai-proxy/v1/chat/completions' },
    now: () => clock,
    random: () => 0,
    fetchImpl: async () => {
      calls += 1;
      if (calls > 1) return successResponse();
      return new Promise(resolve => { firstResolve = () => resolve(successResponse()); });
    },
    log: { info() {}, warn() {} }
  });
  try {
    const registration = service.register({ deviceId: 'phone-running', bootstrapSecret: 'pairing-secret' });
    const headers = { 'x-device-id': 'phone-running', 'x-device-token': registration.deviceToken };
    service.bootstrap({
      textGeneration: { provider: 'grok', apiModel: 'grok-4.3' },
      characters: [{ id: 'mika', name: 'Mika' }],
      rooms: [{ id: 'room-running', type: 'direct', name: 'Mika', characterId: 'mika', automation: { responseDelayMin: 0, responseDelayMax: 0 } }]
    }, headers);
    service.receiveMessage({ id: 'user-running-old', roomId: 'room-running', content: 'old' }, headers);
    const running = service.runScheduler();
    while (!firstResolve) await new Promise(resolve => setImmediate(resolve));
    service.receiveMessage({ id: 'user-running-new', roomId: 'room-running', content: 'new' }, headers);
    firstResolve();
    await running;
    const replies = db.prepare("SELECT metadata FROM messages WHERE origin = 'server'").all();
    assert.equal(replies.length, 1);
    assert.equal(JSON.parse(replies[0].metadata).sourceMessageId, 'user-running-new');
    assert.equal(db.prepare("SELECT status FROM message_jobs WHERE json_extract(payload, '$.sourceMessageId') = 'user-running-old'").get().status, 'cancelled');
    assert.equal(db.prepare("SELECT status FROM message_jobs WHERE json_extract(payload, '$.sourceMessageId') = 'user-running-new'").get().status, 'completed');
    await service.runScheduler();
    assert.equal(db.prepare("SELECT COUNT(*) AS value FROM messages WHERE origin = 'server'").get().value, 1);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test('retry retention cancels an old reply instead of retrying forever', async () => {
  const app = harness({ replyJobRetentionMs: 2 * 60_000 });
  try {
    app.service.receiveMessage({ id: 'user-expire', roomId: 'room-1', content: 'do not retry forever' }, app.headers);
    await app.service.runScheduler();
    app.advance(60_000);
    await app.service.runScheduler();
    app.advance(5 * 60_000);
    await app.service.runScheduler();
    const job = app.db.prepare("SELECT * FROM message_jobs WHERE kind = 'reply'").get();
    assert.equal(job.status, 'cancelled');
    assert.match(job.error, /retention expired/i);
    const callsBeforeRecovery = app.apiCalls();
    app.setApiAvailable(true);
    app.advance(60_000);
    await app.service.runScheduler();
    assert.equal(app.apiCalls(), callsBeforeRecovery);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS value FROM messages WHERE origin = 'server'").get().value, 0);
  } finally {
    app.close();
  }
});
