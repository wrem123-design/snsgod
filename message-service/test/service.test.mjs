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