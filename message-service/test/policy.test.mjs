import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/database.mjs';
import { createMessageService } from '../src/service.mjs';

function harness(options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'snsgod-policy-'));
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
    db,
    service,
    advance(ms) { clock += ms; },
    close() { db.close(); rmSync(dir, { recursive: true, force: true }); }
  };
}

function registered(app, deviceId) {
  const registration = app.service.register({ deviceId, bootstrapSecret: 'pairing-secret' });
  return { 'x-device-id': deviceId, 'x-device-token': registration.deviceToken };
}

test('a user reply cancels a pending proactive job before reply scheduling', () => {
  const app = harness();
  try {
    const headers = registered(app, 'phone-cancel');
    app.service.bootstrap({
      characters: [{ id: 'mika', name: 'Mika', timeZone: 'UTC' }],
      rooms: [{
        id: 'room-cancel', type: 'direct', name: 'Mika', characterId: 'mika',
        automation: { proactiveEnabled: true, frequencyMinutes: 10, initiative: 100, maxProactiveWithoutReply: 3, responseDelayMin: 0, responseDelayMax: 0 }
      }]
    }, headers);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS value FROM message_jobs WHERE kind = 'proactive' AND status = 'pending'").get().value, 1);
    app.service.receiveMessage({ id: 'user-cancel', roomId: 'room-cancel', content: 'I am here now' }, headers);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS value FROM message_jobs WHERE kind = 'proactive' AND status = 'cancelled'").get().value, 1);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS value FROM message_jobs WHERE kind = 'reply' AND status = 'pending'").get().value, 1);
  } finally {
    app.close();
  }
});

test('proactive policy stops and waits after the configured unanswered stage', async () => {
  const app = harness();
  try {
    const headers = registered(app, 'phone-stage');
    app.service.bootstrap({
      characters: [{ id: 'mika', name: 'Mika', timeZone: 'UTC', runtimeState: { dayKey: '2025-06-15', currentActivity: 'relaxing', location: 'home', mood: 'calm', energy: 70, phoneAvailability: 'available', lastUpdatedAt: 1_750_000_000_000 } }],
      rooms: [{
        id: 'room-stage', type: 'direct', name: 'Mika', characterId: 'mika',
        automation: { proactiveEnabled: true, frequencyMinutes: 1, initiative: 100, maxProactiveWithoutReply: 1, dailyProactiveBudget: 4 }
      }]
    }, headers);
    app.advance(61_000);
    await app.service.runScheduler();
    const proactive = app.db.prepare("SELECT metadata FROM messages WHERE room_id = ? AND origin = 'server'").all('room-stage');
    assert.equal(proactive.length, 1);
    assert.equal(JSON.parse(proactive[0].metadata).sourceMode, 'server_proactive');
    assert.equal(JSON.parse(proactive[0].metadata).generationInfo.proactiveStage, 1);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS value FROM message_jobs WHERE room_id = ? AND kind = 'proactive' AND status = 'pending'").get('room-stage').value, 0);
  } finally {
    app.close();
  }
});

test('server prompt receives runtime state, relationship context, and factual memory', async () => {
  const calls = [];
  const app = harness({
    config: { grokApiUrl: 'http://127.0.0.1:5000/api/xai-proxy/v1/chat/completions' },
    fetchImpl: async (_url, options) => {
      calls.push(JSON.parse(options.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ messages: [{ content: 'new topic', delaySeconds: 0 }] }) } }] }), { status: 200 });
    }
  });
  try {
    const headers = registered(app, 'phone-context');
    app.service.bootstrap({
      textGeneration: { provider: 'grok', apiModel: 'grok-4.3' },
      characters: [{
        id: 'mika', name: 'Mika', prompt: 'playful but thoughtful', timeZone: 'UTC',
        runtimeState: { dayKey: '2025-06-15', currentActivity: 'reading at home', location: 'home', mood: 'calm', energy: 70, phoneAvailability: 'available', lastUpdatedAt: 1_750_000_000_000 },
        structuredMemories: [{ kind: 'promise', importance: 9, content: 'They promised to watch a movie Friday.' }]
      }],
      rooms: [{
        id: 'room-context', type: 'direct', name: 'Mika', characterId: 'mika', relationshipContext: 'Close friends who use nicknames.',
        automation: { proactiveEnabled: true, frequencyMinutes: 1, initiative: 100, maxProactiveWithoutReply: 2 }
      }]
    }, headers);
    app.advance(61_000);
    await app.service.runScheduler();
    const prompt = calls[0].messages.map(item => item.content).join('\n');
    assert.match(prompt, /reading at home/);
    assert.match(prompt, /Close friends who use nicknames/);
    assert.match(prompt, /promised to watch a movie Friday/);
    assert.match(prompt, /Proactive stage 1/);
  } finally {
    app.close();
  }
});
