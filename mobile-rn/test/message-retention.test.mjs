import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
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

const {
  appendMessageToHistory,
  messageHistoryRecordsMatch,
  normalizeMessageHistoryRecord,
  planMessageHistoryWrite,
  selectPromptContext,
} = await importPureTypeScript('src/logic/messageHistoryPolicy.ts');
const { collectStateMediaReferences } = await importPureTypeScript('src/logic/stateMediaPolicy.ts');

const persistSource = readFileSync(new URL('../src/storage/persist.ts', import.meta.url), 'utf8');
const stateHelpersSource = readFileSync(new URL('../src/logic/stateHelpers.ts', import.meta.url), 'utf8');
const groupSource = readFileSync(new URL('../src/screens/GroupChatRoomScreen.tsx', import.meta.url), 'utf8');
const automationSource = readFileSync(new URL('../src/logic/automation.ts', import.meta.url), 'utf8');
const meetingSource = readFileSync(new URL('../src/logic/meetingEvent.ts', import.meta.url), 'utf8');
const promptSource = readFileSync(new URL('../src/logic/prompts.ts', import.meta.url), 'utf8');
const listSource = readFileSync(new URL('../src/logic/useStickToBottomList.ts', import.meta.url), 'utf8');

function message(index, extra = {}) {
  return { id: `message-${index}`, role: index % 2 ? 'character' : 'user', content: `message ${index}`, createdAt: index, ...extra };
}

test('direct and group append preserve messages across the old 120 boundary', () => {
  const original = Array.from({ length: 120 }, (_, index) => message(index));
  const direct = appendMessageToHistory(original, message(120));
  const group = appendMessageToHistory(direct, message(121, { characterId: 'character-2' }));
  assert.equal(direct.length, 121);
  assert.equal(group.length, 122);
  assert.equal(group[0].id, 'message-0');
  assert.equal(group.at(-1).id, 'message-121');
});

test('storage normalization preserves full room arrays through a JSON restart round trip', () => {
  const histories = {
    direct: Array.from({ length: 121 }, (_, index) => message(index)),
    group: Array.from({ length: 301 }, (_, index) => message(index)),
  };
  const restarted = normalizeMessageHistoryRecord(JSON.parse(JSON.stringify(histories)));
  assert.equal(restarted.direct.length, 121);
  assert.equal(restarted.group.length, 301);
  assert.equal(restarted.direct[0].id, 'message-0');
  assert.equal(restarted.group[0].id, 'message-0');
});

test('SQLite write planning appends only a preserved prefix and replaces edits or deletions', () => {
  const original = Array.from({ length: 121 }, (_, index) => message(index));
  const appended = appendMessageToHistory(original, message(121));
  assert.deepEqual(planMessageHistoryWrite(original, original), { mode: 'unchanged', appendFrom: 121 });
  assert.deepEqual(planMessageHistoryWrite(original, appended), { mode: 'append', appendFrom: 121 });
  assert.deepEqual(planMessageHistoryWrite(original, [message(0, { content: 'edited' }), ...original.slice(1)]), { mode: 'replace', appendFrom: 0 });
  assert.deepEqual(planMessageHistoryWrite(original, original.slice(1)), { mode: 'replace', appendFrom: 0 });
});

test('storage verification treats an omitted empty SQLite room as an empty state history', () => {
  assert.equal(messageHistoryRecordsMatch({ empty: [], room: [message(0)] }, { room: [message(0)] }), true);
  assert.equal(messageHistoryRecordsMatch({ room: [message(0)] }, { room: [message(0, { content: 'changed' })] }), false);
});

test('prompt context remains bounded without mutating stored history', () => {
  const stored = Array.from({ length: 121 }, (_, index) => message(index));
  const context = selectPromptContext(stored, 24);
  assert.equal(context.length, 24);
  assert.equal(context[0].id, 'message-97');
  assert.equal(context.at(-1).id, 'message-120');
  assert.equal(stored.length, 121);
  assert.equal(stored[0].id, 'message-0');
  assert.equal(selectPromptContext(stored, 500).length, 80);
  assert.equal(selectPromptContext(stored, Number.NaN).length, 24);
});

test('old message media remains reachable after restart normalization', () => {
  const mediaUri = 'file:///data/user/0/com.snsgod.rn/files/snsgod-media/assets/old.jpg';
  const histories = normalizeMessageHistoryRecord({
    room: [message(0, { mediaData: mediaUri }), ...Array.from({ length: 120 }, (_, index) => message(index + 1))],
  });
  const state = {
    config: { apiType: 'openai', apiProfiles: {} },
    characters: [], chatRooms: {}, messages: histories, unreadCounts: {}, snsPosts: [], snsDmThreads: [],
  };
  const references = collectStateMediaReferences(state);
  assert.ok(references.some(reference => reference.uri === mediaUri));
  assert.equal(histories.room.length, 121);
});

test('one append and one prompt window stay fast with a large local history', () => {
  const stored = Array.from({ length: 50_000 }, (_, index) => message(index));
  const startedAt = performance.now();
  const appended = appendMessageToHistory(stored, message(50_000));
  const writePlan = planMessageHistoryWrite(stored, appended);
  const context = selectPromptContext(appended, 24);
  const restarted = normalizeMessageHistoryRecord(JSON.parse(JSON.stringify({ room: appended })));
  const elapsedMs = performance.now() - startedAt;
  assert.equal(appended.length, 50_001);
  assert.equal(context.length, 24);
  assert.deepEqual(writePlan, { mode: 'append', appendFrom: 50_000 });
  assert.equal(restarted.room.length, 50_001);
  assert.ok(elapsedMs < 1000, `history boundary operations took ${elapsedMs.toFixed(1)}ms`);
});

test('production paths separate durable history, prompt context, and virtualized rendering', () => {
  assert.match(persistSource, /normalizeMessageHistoryRecord/);
  assert.match(persistSource, /planMessageHistoryWrite/);
  assert.match(persistSource, /writePlan\.mode === 'append'/);
  assert.match(persistSource, /writeSqliteBundle\(prepared\.payload, prepared\.snapshot, prepared\.normalizedState\.messages/);
  assert.match(persistSource, /async function writeSqliteStateRows/);
  assert.match(persistSource, /async function writeMessagesStateRows/);
  assert.match(persistSource, /messageHistoryRecordsMatch\(snapshot\.messages \|\| \{\}, sqliteMessages\)/);
  assert.doesNotMatch(persistSource, /normalizeMessageCaps/);
  assert.doesNotMatch(stateHelpersSource, /MAX_ROOM_MESSAGES/);
  assert.doesNotMatch(groupSource, /MAX_GROUP_ROOM_MESSAGES/);
  assert.doesNotMatch(automationSource, /MAX_GROUP_ROOM_MESSAGES/);
  assert.doesNotMatch(meetingSource, /\]\s*\.slice\(-300\)/);
  assert.match(promptSource, /selectPromptContext/);
  assert.match(groupSource, /selectPromptContext/);
  assert.match(listSource, /initialNumToRender:\s*24/);
  assert.match(listSource, /maxToRenderPerBatch:\s*16/);
  assert.match(listSource, /windowSize:\s*10/);
});
