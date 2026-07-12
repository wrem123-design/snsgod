import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const policyUrl = new URL('../src/logic/roomMemoryReset.ts', import.meta.url);
assert.equal(existsSync(policyUrl), true, 'roomMemoryReset policy must exist');
const source = readFileSync(policyUrl, 'utf8');
const transpiled = ts.transpileModule(source, {
  fileName: 'src/logic/roomMemoryReset.ts',
  reportDiagnostics: true,
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
assert.equal(transpiled.diagnostics?.length ?? 0, 0);
const { clearDerivedRoomMemoryWhenEmpty, markRoomConversationReset } = await import(
  `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`
);

function roomState() {
  return {
    chatRooms: { character: [{ id: 'room', characterId: 'character', name: '방', relationshipNote: '연인', roomPrompt: '지난 약속' }] },
    messages: { room: [{ id: 'old', role: 'user', content: '과거 대화', createdAt: 10 }] },
    unreadCounts: { room: 1 },
    notifications: [{ id: 'notice', roomId: 'room' }],
    roomSummaries: [{ id: 'summary', roomId: 'room', summary: '과거 요약' }],
    characterMemories: [
      { id: 'room-memory', sourceRoomId: 'room', content: '과거 기억' },
      { id: 'other-memory', sourceRoomId: 'other', content: '다른 방 기억' },
    ],
  };
}

test('room cleaning marks a reset epoch while preserving explicitly retained room memory', () => {
  const next = markRoomConversationReset(roomState(), 'room', 100);

  assert.deepEqual(next.messages.room, []);
  assert.equal(next.chatRooms.character[0].conversationResetAt, 100);
  assert.equal(next.unreadCounts.room, undefined);
  assert.deepEqual(next.notifications, []);
  assert.equal(next.roomSummaries.length, 1);
  assert.equal(next.characterMemories.length, 2);
});

test('saving an empty cleaned room removes only memory derived from that room', () => {
  const cleaned = markRoomConversationReset(roomState(), 'room', 100);
  const next = clearDerivedRoomMemoryWhenEmpty(cleaned, 'room', { relationshipNote: '', roomPrompt: '' });

  assert.deepEqual(next.roomSummaries, []);
  assert.deepEqual(next.characterMemories.map(memory => memory.id), ['other-memory']);
});

test('room-derived memory remains when conversation or explicit room memory remains', () => {
  const withMessages = clearDerivedRoomMemoryWhenEmpty(roomState(), 'room', { relationshipNote: '', roomPrompt: '' });
  const cleaned = markRoomConversationReset(roomState(), 'room', 100);
  const withPrompt = clearDerivedRoomMemoryWhenEmpty(cleaned, 'room', { relationshipNote: '', roomPrompt: '기억 유지' });

  assert.equal(withMessages.roomSummaries.length, 1);
  assert.equal(withPrompt.roomSummaries.length, 1);
});
