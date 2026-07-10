import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/database.mjs';
import { createMessageService } from '../src/service.mjs';

test('scene prose is excluded while factual memory reaches the server prompt', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'snsgod-memory-filter-'));
  const db = openDatabase(dir);
  const calls = [];
  const service = createMessageService({
    db,
    config: {
      bootstrapSecret: 'pairing-secret',
      llmProvider: 'mock',
      pushProvider: 'none',
      grokApiUrl: 'http://127.0.0.1:5000/api/xai-proxy/v1/chat/completions'
    },
    now: () => 1_750_000_000_000,
    random: () => 0,
    fetchImpl: async (_url, options) => {
      calls.push(JSON.parse(options.body));
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ messages: [{ content: 'filtered reply', delaySeconds: 0 }] }) } }]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
    log: { info() {}, warn() {} }
  });
  try {
    const registration = service.register({ deviceId: 'phone-memory-filter', bootstrapSecret: 'pairing-secret' });
    const headers = { 'x-device-id': 'phone-memory-filter', 'x-device-token': registration.deviceToken };
    service.bootstrap({
      textGeneration: { provider: 'grok', apiModel: 'grok-4.3' },
      characters: [{
        id: 'jihyun',
        name: '지현',
        memories: [
          '사용자와 연인 관계이다.',
          '[meeting_event_summary] eventType: first_meeting, keyMoment: 오프라인 첫 만남 후 포옹과 실물 인상을 확인했다, relationshipShift: 친밀감과 호감도가 상승했다, futureHook: 어른스러운 느낌에 관해 더 이야기하기',
          '지현이 숨을 들이켜며 사용자의 품에 완전히 갇힙니다. 심장 박동이 서로에게 느껴질 만큼 가까워집니다.'
        ],
        structuredMemories: [
          { kind: 'scene_archive', importance: 3, content: '그녀가 입술을 가까이하며 작은 목소리로 속삭입니다.' },
          { kind: 'promise', importance: 9, content: '이번 일요일에 팝업스토어와 루프탑 카페에 가기로 했다.' }
        ]
      }],
      rooms: [{ id: 'room-memory', type: 'direct', name: '지현', characterId: 'jihyun', automation: { responseDelayMin: 0, responseDelayMax: 0 } }]
    }, headers);
    service.receiveMessage({ id: 'user-memory', roomId: 'room-memory', content: '오늘 뭐해?' }, headers);
    await service.runScheduler();
    const prompt = calls[0].messages.map(item => item.content).join('\n');
    assert.match(prompt, /사용자와 연인 관계이다/);
    assert.match(prompt, /팝업스토어와 루프탑 카페/);
    assert.match(prompt, /친밀감과 호감도가 상승했다/);
    assert.doesNotMatch(prompt, /숨을 들이켜며/);
    assert.doesNotMatch(prompt, /입술을 가까이하며/);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
