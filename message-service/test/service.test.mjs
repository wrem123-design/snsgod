import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { constants, createCipheriv, createHmac, generateKeyPairSync, publicEncrypt, randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/database.mjs';
import { createMessageService } from '../src/service.mjs';

function harness(options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'snsgod-message-service-'));
  let clock = 1_750_000_000_000;
  const db = openDatabase(dir);
  const service = createMessageService({
    db,
    config: { bootstrapSecret: 'pairing-secret', llmProvider: 'mock', pushProvider: 'none', ...options.config },
    now: () => clock,
    random: () => 0,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {})
  });
  return {
    dir,
    db,
    service,
    advance(ms) { clock += ms; },
    close() { db.close(); rmSync(dir, { recursive: true, force: true }); }
  };
}

function fcmHarness() {
  const dir = mkdtempSync(join(tmpdir(), 'snsgod-message-fcm-'));
  let clock = 1_750_000_000_000;
  const db = openDatabase(dir);
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' }
  });
  const accountPath = join(dir, 'firebase-service-account.json');
  writeFileSync(accountPath, JSON.stringify({
    project_id: 'snsgod-test',
    client_email: 'fcm-test@snsgod-test.iam.gserviceaccount.com',
    private_key: privateKey,
    token_uri: 'https://oauth.example.test/token'
  }));
  const fcmRequests = [];
  const service = createMessageService({
    db,
    config: {
      bootstrapSecret: 'pairing-secret',
      llmProvider: 'mock',
      pushProvider: 'fcm',
      firebaseServiceAccountPath: accountPath
    },
    now: () => clock,
    random: () => 0,
    fetchImpl: async (url, options) => {
      if (String(url).includes('oauth.example.test')) {
        return new Response(JSON.stringify({ access_token: 'test-access-token', expires_in: 3600 }), { status: 200 });
      }
      fcmRequests.push(JSON.parse(options.body));
      return new Response(JSON.stringify({ name: 'projects/snsgod-test/messages/test-message' }), { status: 200 });
    }
  });
  return {
    dir,
    db,
    service,
    fcmRequests,
    now() { return clock; },
    advance(ms) { clock += ms; },
    close() { db.close(); rmSync(dir, { recursive: true, force: true }); }
  };
}

test('a scheduled server reply is persisted and emitted through sync once', async () => {
  const app = harness();
  try {
    const registration = app.service.register({ deviceId: 'phone-1', deviceName: 'Test phone', bootstrapSecret: 'pairing-secret' });
    const headers = { 'x-device-id': 'phone-1', 'x-device-token': registration.deviceToken };
    app.service.bootstrap({
      characters: [{ id: 'mika', name: '미카', prompt: '친근한 친구', responseDelayMin: 0, responseDelayMax: 0 }],
      rooms: [{ id: 'room-1', type: 'direct', name: '미카', characterId: 'mika', automation: { responseDelayMin: 0, responseDelayMax: 0 } }],
      messages: []
    }, headers);
    const accepted = app.service.receiveMessage({ id: 'client-1', clientMessageId: 'client-1', roomId: 'room-1', content: '안녕', createdAt: 1_750_000_000_000 }, headers);
    assert.equal(accepted.accepted, true);
    await app.service.runScheduler();
    const first = app.service.sync({ cursor: 0 }, headers);
    assert.equal(first.messages.length, 1);
    assert.equal(first.messages[0].role, 'character');
    const second = app.service.sync({ cursor: first.cursor }, headers);
    assert.deepEqual(second.messages, []);
  } finally {
    app.close();
  }
});

test('repeated client message id does not create a second reply job', () => {
  const app = harness();
  try {
    const registration = app.service.register({ deviceId: 'phone-1', bootstrapSecret: 'pairing-secret' });
    const headers = { 'x-device-id': 'phone-1', 'x-device-token': registration.deviceToken };
    app.service.bootstrap({
      characters: [{ id: 'mika', name: '미카' }],
      rooms: [{ id: 'room-1', type: 'direct', name: '미카', characterId: 'mika' }]
    }, headers);
    app.service.receiveMessage({ id: 'client-1', roomId: 'room-1', content: '안녕' }, headers);
    const duplicate = app.service.receiveMessage({ id: 'client-1', roomId: 'room-1', content: '안녕' }, headers);
    assert.equal(duplicate.duplicate, true);
    assert.equal(app.service.health().jobs.pending, 1);
  } finally {
    app.close();
  }
});
test('bootstrap accepts existing conversation messages inside one transaction', () => {
  const app = harness();
  try {
    const registration = app.service.register({ deviceId: 'phone-with-history', bootstrapSecret: 'pairing-secret' });
    const headers = { 'x-device-id': 'phone-with-history', 'x-device-token': registration.deviceToken };
    const result = app.service.bootstrap({
      characters: [{ id: 'mika', name: '미카' }],
      rooms: [{ id: 'room-history', type: 'direct', name: '미카', characterId: 'mika' }],
      messages: [
        { id: 'history-user-1', roomId: 'room-history', role: 'user', content: '이전 대화', createdAt: 1_749_999_000_000 },
        { id: 'history-character-1', roomId: 'room-history', role: 'character', characterId: 'mika', content: '기억하고 있어', createdAt: 1_749_999_001_000 }
      ]
    }, headers);
    assert.equal(result.accepted, true);
    assert.equal(app.service.health().messages, 2);
  } finally {
    app.close();
  }
});

test('a newer room reset epoch removes server transcript and stale reply work', () => {
  const app = harness();
  try {
    const registration = app.service.register({ deviceId: 'phone-room-reset', bootstrapSecret: 'pairing-secret' });
    const headers = { 'x-device-id': 'phone-room-reset', 'x-device-token': registration.deviceToken };
    const baseRoom = { id: 'room-reset', type: 'direct', name: '미카', characterId: 'mika', automation: { responseDelayMin: 30, responseDelayMax: 30 } };
    app.service.bootstrap({
      characters: [{ id: 'mika', name: '미카' }],
      rooms: [baseRoom],
      messages: [{ id: 'old-user', roomId: 'room-reset', role: 'user', content: '과거 대화', createdAt: 1_749_999_990_000 }]
    }, headers);
    app.service.receiveMessage({ id: 'pending-user', roomId: 'room-reset', content: '지워질 대기 메시지' }, headers);

    app.service.bootstrap({
      characters: [{ id: 'mika', name: '미카', structuredMemories: [] }],
      rooms: [{ ...baseRoom, conversationResetAt: 1_750_000_000_000 }],
      messages: []
    }, headers);

    assert.equal(app.db.prepare('SELECT COUNT(*) AS value FROM messages WHERE room_id = ?').get('room-reset').value, 0);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS value FROM message_jobs WHERE room_id = ? AND status IN ('pending', 'running', 'failed')").get('room-reset').value, 0);
    const stored = JSON.parse(app.db.prepare('SELECT automation FROM rooms WHERE id = ?').get('room-reset').automation);
    assert.equal(stored.conversationResetAt, 1_750_000_000_000);

    app.service.receiveMessage({ id: 'fresh-user', roomId: 'room-reset', content: '새 대화' }, headers);
    app.service.bootstrap({
      characters: [{ id: 'mika', name: '미카', structuredMemories: [] }],
      rooms: [{ ...baseRoom, conversationResetAt: 1_750_000_000_000 }],
      messages: []
    }, headers);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS value FROM messages WHERE room_id = ?').get('room-reset').value, 1);
  } finally {
    app.close();
  }
});

test('an invalid room reset epoch cannot erase an existing server transcript', () => {
  const app = harness();
  try {
    const registration = app.service.register({ deviceId: 'phone-invalid-reset', bootstrapSecret: 'pairing-secret' });
    const headers = { 'x-device-id': 'phone-invalid-reset', 'x-device-token': registration.deviceToken };
    const baseRoom = { id: 'room-invalid-reset', type: 'direct', name: '미카', characterId: 'mika' };
    app.service.bootstrap({
      characters: [{ id: 'mika', name: '미카' }],
      rooms: [baseRoom],
      messages: [{ id: 'kept-user', roomId: 'room-invalid-reset', role: 'user', content: '보존할 대화', createdAt: 1_749_999_990_000 }]
    }, headers);

    app.service.bootstrap({
      characters: [{ id: 'mika', name: '미카' }],
      rooms: [{ ...baseRoom, conversationResetAt: 'Infinity' }],
      messages: []
    }, headers);

    assert.equal(app.db.prepare('SELECT COUNT(*) AS value FROM messages WHERE room_id = ?').get('room-invalid-reset').value, 1);
  } finally {
    app.close();
  }
});

test('bootstrap recovers only the latest recent unanswered user message once', async () => {
  const app = harness();
  try {
    const registration = app.service.register({ deviceId: 'phone-recovery', bootstrapSecret: 'pairing-secret' });
    const headers = { 'x-device-id': 'phone-recovery', 'x-device-token': registration.deviceToken };
    const payload = {
      characters: [{ id: 'mika', name: '미카', responseDelayMin: 0, responseDelayMax: 0 }],
      rooms: [{ id: 'room-recovery', type: 'direct', name: '미카', characterId: 'mika', automation: { responseDelayMin: 0, responseDelayMax: 0 } }],
      messages: [
        { id: 'missed-user-1', roomId: 'room-recovery', role: 'user', content: '첫 메시지', createdAt: 1_749_999_990_000 },
        { id: 'missed-user-2', roomId: 'room-recovery', role: 'user', content: '아직 있어?', createdAt: 1_749_999_995_000 }
      ]
    };
    app.service.bootstrap(payload, headers);
    app.service.bootstrap(payload, headers);
    assert.equal(app.service.health().jobs.pending, 1);
    app.advance(1_000);
    await app.service.runScheduler();
    const replies = app.service.sync({ cursor: 0 }, headers).messages.filter(message => message.role === 'character');
    assert.equal(replies.length, 1);
    assert.equal(replies[0].sourceMessageId, 'missed-user-2');
  } finally {
    app.close();
  }
});

test('bootstrap does not revive answered or expired conversation history', () => {
  const app = harness({ config: { replyJobRetentionMs: 60_000 } });
  try {
    const registration = app.service.register({ deviceId: 'phone-old-history', bootstrapSecret: 'pairing-secret' });
    const headers = { 'x-device-id': 'phone-old-history', 'x-device-token': registration.deviceToken };
    app.service.bootstrap({
      characters: [{ id: 'mika', name: '미카' }],
      rooms: [
        { id: 'room-answered', type: 'direct', name: '미카', characterId: 'mika' },
        { id: 'room-expired', type: 'direct', name: '미카', characterId: 'mika' }
      ],
      messages: [
        { id: 'answered-user', roomId: 'room-answered', role: 'user', content: '안녕', createdAt: 1_749_999_990_000 },
        { id: 'answered-character', roomId: 'room-answered', role: 'character', characterId: 'mika', content: '응', createdAt: 1_749_999_995_000 },
        { id: 'expired-user', roomId: 'room-expired', role: 'user', content: '오래된 메시지', createdAt: 1_749_999_000_000 }
      ]
    }, headers);
    assert.equal(app.service.health().jobs.pending, 0);
  } finally {
    app.close();
  }
});

test('scheduler repairs an existing recent user message that never received a reply job', async () => {
  const app = harness();
  try {
    const registration = app.service.register({ deviceId: 'phone-scheduler-repair', bootstrapSecret: 'pairing-secret' });
    const headers = { 'x-device-id': 'phone-scheduler-repair', 'x-device-token': registration.deviceToken };
    app.service.bootstrap({
      characters: [{ id: 'mika', name: '미카', responseDelayMin: 0, responseDelayMax: 0 }],
      rooms: [{ id: 'room-scheduler-repair', type: 'direct', name: '미카', characterId: 'mika', automation: { responseDelayMin: 0, responseDelayMax: 0 } }]
    }, headers);
    app.db.prepare(`INSERT INTO messages
      (id, room_id, role, content, created_at, server_created_at, origin, metadata)
      VALUES (?, ?, 'user', ?, ?, ?, 'client', '{}')`)
      .run('orphan-user', 'room-scheduler-repair', '답장이 누락됐어', 1_749_999_995_000, 1_750_000_000_000);

    const repair = await app.service.runScheduler();
    assert.equal(repair.recoveredMissingReplies, 1);
    app.advance(1_000);
    await app.service.runScheduler();
    const replies = app.service.sync({ cursor: 0 }, headers).messages.filter(message => message.role === 'character');
    assert.equal(replies.length, 1);
    assert.equal(replies[0].sourceMessageId, 'orphan-user');
  } finally {
    app.close();
  }
});

test('FCM sends character data for native Android conversation alerts', async () => {
  const app = fcmHarness();
  try {
    const registration = app.service.register({ deviceId: 'phone-fcm-display', bootstrapSecret: 'pairing-secret', pushToken: 'fcm-device-token' });
    const headers = { 'x-device-id': 'phone-fcm-display', 'x-device-token': registration.deviceToken };
    app.service.bootstrap({
      pushPreferences: { replies: true, proactive: true },
      characters: [{ id: 'mika-id', name: '미카', notificationImage: 'https://images.example.test/mika.png' }],
      rooms: [{ id: 'room-fcm-display', type: 'direct', name: '미카 방', characterId: 'mika-id', automation: { responseDelayMin: 0, responseDelayMax: 0 } }]
    }, headers);
    app.service.receiveMessage({ id: 'fcm-user-message', roomId: 'room-fcm-display', content: '안녕' }, headers);
    await app.service.runScheduler();

    assert.equal(app.fcmRequests.length, 1);
    assert.equal(app.fcmRequests[0].message.notification, undefined);
    assert.equal(app.fcmRequests[0].message.data.characterName, '미카');
    assert.equal(app.fcmRequests[0].message.data.messageBody, 'I saw your message. Let us talk in a moment.');
    assert.equal(app.fcmRequests[0].message.data.avatarUrl, 'https://images.example.test/mika.png');
    assert.equal(app.fcmRequests[0].message.data.nativeConversation, '1');
    assert.equal(app.fcmRequests[0].message.data.notificationKind, 'reply');
  } finally {
    app.close();
  }
});

test('disabled reply alerts skip FCM but preserve generated messages for sync', async () => {
  const app = fcmHarness();
  try {
    const registration = app.service.register({ deviceId: 'phone-fcm-disabled', bootstrapSecret: 'pairing-secret', pushToken: 'fcm-device-token' });
    const headers = { 'x-device-id': 'phone-fcm-disabled', 'x-device-token': registration.deviceToken };
    app.service.bootstrap({
      pushPreferences: { replies: false, proactive: true },
      characters: [{ id: 'mika-id', name: '미카' }],
      rooms: [{ id: 'room-fcm-disabled', type: 'direct', name: '미카 방', characterId: 'mika-id', automation: { responseDelayMin: 0, responseDelayMax: 0 } }]
    }, headers);
    app.service.receiveMessage({ id: 'fcm-disabled-user', roomId: 'room-fcm-disabled', content: '앱에는 남겨줘' }, headers);
    await app.service.runScheduler();

    assert.equal(app.fcmRequests.length, 0);
    assert.equal(app.service.sync({ cursor: 0 }, headers).messages.filter(message => message.role === 'character').length, 1);
    assert.equal(app.db.prepare('SELECT status FROM push_outbox ORDER BY created_at DESC LIMIT 1').get().status, 'skipped');
  } finally {
    app.close();
  }
});

test('disabled proactive alerts skip FCM while keeping proactive messages for sync', async () => {
  const app = fcmHarness();
  try {
    const registration = app.service.register({ deviceId: 'phone-proactive-disabled', bootstrapSecret: 'pairing-secret', pushToken: 'fcm-device-token' });
    const headers = { 'x-device-id': 'phone-proactive-disabled', 'x-device-token': registration.deviceToken };
    app.service.bootstrap({
      pushPreferences: { replies: true, proactive: false },
      characters: [{ id: 'mika-id', name: '미카', initiative: 100, frequencyMinutes: 1, timeZone: 'UTC' }],
      rooms: [{ id: 'room-proactive-disabled', type: 'direct', name: '미카 방', characterId: 'mika-id', automation: { proactiveEnabled: true, frequencyMinutes: 1, initiative: 100 } }]
    }, headers);
    const dueAt = Number(app.db.prepare("SELECT due_at FROM message_jobs WHERE kind = 'proactive' AND status = 'pending'").get().due_at);
    app.advance(Math.max(0, dueAt - app.now()) + 1);
    const schedulerResult = await app.service.runScheduler();

    assert.equal(app.fcmRequests.length, 0);
    const synchronized = app.service.sync({ cursor: 0 }, headers).messages;
    assert.ok(synchronized.some(message => message.sourceMode === 'server_proactive'), JSON.stringify({ schedulerResult, synchronized }));
    assert.equal(app.db.prepare('SELECT status FROM push_outbox ORDER BY created_at DESC LIMIT 1').get().status, 'skipped');
  } finally {
    app.close();
  }
});

test('app-selected Grok model is persisted and used for server replies', async () => {
  const calls = [];
  const app = harness({
    config: { grokApiUrl: 'http://127.0.0.1:5000/api/xai-proxy/v1/chat/completions' },
    fetchImpl: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ messages: [{ content: 'Grok server reply', delaySeconds: 0 }] }) } }]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });
  try {
    const registration = app.service.register({ deviceId: 'phone-grok', bootstrapSecret: 'pairing-secret' });
    const headers = { 'x-device-id': 'phone-grok', 'x-device-token': registration.deviceToken };
    app.service.bootstrap({
      textGeneration: { provider: 'grok', apiModel: 'grok-4.3', maxTokens: 900, temperature: 0.7 },
      characters: [{ id: 'mika', name: 'Mika' }],
      rooms: [{ id: 'room-grok', type: 'direct', name: 'Mika', characterId: 'mika', automation: { responseDelayMin: 0, responseDelayMax: 0 } }]
    }, headers);
    app.service.receiveMessage({ id: 'client-grok', roomId: 'room-grok', content: 'hello' }, headers);
    await app.service.runScheduler();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'http://127.0.0.1:5000/api/xai-proxy/v1/chat/completions');
    assert.equal(calls[0].body.model, 'grok-4.3');
    assert.equal(app.service.health().textGeneration.provider, 'grok');
    assert.equal(app.service.sync({ cursor: 0 }, headers).messages[0].content, 'Grok server reply');
  } finally {
    app.close();
  }
});

function encryptedProfileEnvelope(profile, publicKey) {
  const encryptionKey = randomBytes(32);
  const macKey = randomBytes(32);
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(profile), 'utf8'), cipher.final()]).toString('hex');
  const ivHex = iv.toString('hex');
  return {
    version: 1,
    keyId: 'test',
    encryptedKey: publicEncrypt({ key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(`${encryptionKey.toString('hex')}${macKey.toString('hex')}`, 'utf8')).toString('hex'),
    iv: ivHex,
    ciphertext,
    mac: createHmac('sha256', macKey).update(`${ivHex}.${ciphertext}`, 'utf8').digest('hex')
  };
}

test('encrypted API credentials can sync over the existing HTTP proxy route', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  const app = harness();
  const privateKeyPath = join(app.dir, 'profile-private.pem');
  writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });
  app.service = createMessageService({
    db: app.db,
    config: { bootstrapSecret: 'pairing-secret', llmProvider: 'mock', pushProvider: 'none', profilePrivateKeyPath: privateKeyPath },
    now: () => 1_750_000_000_000,
    random: () => 0
  });
  try {
    const registration = app.service.register({ deviceId: 'phone-encrypted', bootstrapSecret: 'pairing-secret' });
    const headers = { 'x-device-id': 'phone-encrypted', 'x-device-token': registration.deviceToken };
    const profile = { provider: 'custom', apiEndpoint: 'https://example.com/v1/chat/completions', apiModel: 'model-x', apiKey: 'secret-x' };
    app.service.bootstrap({ textGenerationEnvelope: encryptedProfileEnvelope(profile, publicKey) }, headers);
    assert.equal(app.service.health().textGeneration.provider, 'custom');
    assert.equal(app.service.health().textGeneration.model, 'model-x');
    app.service.bootstrap({
      textGenerationEnvelope: encryptedProfileEnvelope({
        provider: 'custom',
        apiEndpoint: 'https://example.com/v1/chat/completions',
        apiModel: 'model-x'
      }, publicKey)
    }, headers);
    const savedProfile = JSON.parse(app.db.prepare("SELECT payload FROM runtime_settings WHERE key = 'text_generation'").get().payload);
    assert.equal(savedProfile.apiKey, 'secret-x');
  } finally {
    app.close();
  }
});
test('API credentials are rejected when bootstrap is not forwarded through HTTPS', () => {
  const app = harness();
  try {
    const registration = app.service.register({ deviceId: 'phone-insecure', bootstrapSecret: 'pairing-secret' });
    const headers = { 'x-device-id': 'phone-insecure', 'x-device-token': registration.deviceToken };
    assert.throws(() => app.service.bootstrap({
      textGeneration: { provider: 'custom', apiEndpoint: 'https://example.com/v1/chat/completions', apiModel: 'model', apiKey: 'secret' }
    }, headers), error => error?.status === 426);
  } finally {
    app.close();
  }
});
