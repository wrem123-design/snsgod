import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

async function importPolicy() {
  const source = readFileSync(new URL('../src/logic/contactBudget.ts', import.meta.url), 'utf8')
    .replace("import { resolveCharacterRuntimeState } from './characterWorld';", "const resolveCharacterRuntimeState = (state, character) => character.testRuntime || { phoneAvailability: 'available', energy: 60 };");
  const transpiled = ts.transpileModule(source, {
    fileName: 'src/logic/contactBudget.ts',
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  assert.equal(transpiled.diagnostics?.length ?? 0, 0);
  return import(`data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`);
}

async function importStaleMerge() {
  const source = readFileSync(new URL('../src/logic/staleStateMergePolicy.ts', import.meta.url), 'utf8')
    .replace("import { reconcileNotificationEvents } from './notifications';", 'const reconcileNotificationEvents = state => state;');
  const transpiled = ts.transpileModule(source, {
    fileName: 'src/logic/staleStateMergePolicy.ts',
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  assert.equal(transpiled.diagnostics?.length ?? 0, 0);
  return import(`data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`);
}

const {
  contactBudgetDecision,
  contactDayKey,
  consumeContactBudget,
  recordContactUserReply,
} = await importPolicy();
const { mergeStaleState } = await importStaleMerge();
const automationSource = readFileSync(new URL('../src/logic/automation.ts', import.meta.url), 'utf8');
const snsSource = readFileSync(new URL('../src/logic/sns.ts', import.meta.url), 'utf8');
const stateHelpersSource = readFileSync(new URL('../src/logic/stateHelpers.ts', import.meta.url), 'utf8');
const groupSource = readFileSync(new URL('../src/screens/GroupChatRoomScreen.tsx', import.meta.url), 'utf8');
const snsScreenSource = readFileSync(new URL('../src/screens/SNSScreen.tsx', import.meta.url), 'utf8');

function state(overrides = {}) {
  return {
    config: { timeZone: 'Asia/Seoul' },
    contactLedger: {},
    ...overrides,
  };
}

function character(id = 'character-1', overrides = {}) {
  return { id, name: id, initiative: 25, proactivePatience: 2, timeZone: 'Asia/Seoul', ...overrides };
}

test('day keys follow each character timezone across the same UTC instant', () => {
  const instant = Date.parse('2026-07-10T15:30:00.000Z');
  assert.equal(contactDayKey(instant, 'Asia/Seoul'), '2026-07-11');
  assert.equal(contactDayKey(instant, 'America/Los_Angeles'), '2026-07-10');
});

test('one character cannot bypass the daily budget by changing rooms or channels', () => {
  const actor = character();
  const now = Date.parse('2026-07-11T03:00:00.000Z');
  let current = state();
  const first = consumeContactBudget(current, actor, 'private', { eventId: 'dm:room-1:1', roomId: 'room-1' }, now);
  current = first.state;
  const second = consumeContactBudget(current, actor, 'group', { eventId: 'group:room-2:1', roomId: 'room-2' }, now);
  current = second.state;
  const blocked = consumeContactBudget(current, actor, 'phone', { eventId: 'call:1', roomId: 'room-3' }, now);

  assert.equal(first.consumed, true);
  assert.equal(second.consumed, true);
  assert.equal(blocked.consumed, false);
  assert.equal(blocked.decision.used, 2);
  assert.equal(blocked.decision.dailyBudget, 2);
});

test('event consumption is idempotent and characters have isolated ledgers', () => {
  const now = Date.parse('2026-07-11T03:00:00.000Z');
  const first = consumeContactBudget(state(), character('a'), 'sns', { eventId: 'post:1' }, now);
  const duplicate = consumeContactBudget(first.state, character('a'), 'sns', { eventId: 'post:1' }, now);
  const other = consumeContactBudget(duplicate.state, character('b'), 'sns', { eventId: 'post:1' }, now);

  assert.equal(duplicate.consumed, false);
  assert.equal(duplicate.state, first.state);
  assert.equal(other.consumed, true);
  assert.equal(contactBudgetDecision(other.state, character('a'), 'private', now).used, 1);
  assert.equal(contactBudgetDecision(other.state, character('b'), 'private', now).used, 1);
});

test('a user reply resets unanswered pressure without restoring spent daily budget', () => {
  const actor = character();
  const now = Date.parse('2026-07-11T03:00:00.000Z');
  const contacted = consumeContactBudget(state(), actor, 'private', { eventId: 'dm:1' }, now);
  const replied = recordContactUserReply(contacted.state, [actor.id], now + 1_000);
  const decision = contactBudgetDecision(replied, actor, 'private', now + 2_000);

  assert.equal(decision.used, 1);
  assert.equal(decision.unansweredCount, 0);
  assert.equal(replied.contactLedger[decision.ledgerKey].lastUserReplyAt, now + 1_000);
});

test('initiative and current state affect budget and unanswered pressure affects channel priority', () => {
  const now = Date.parse('2026-07-11T03:00:00.000Z');
  const energetic = character('energetic', { initiative: 90, testRuntime: { phoneAvailability: 'available', energy: 90 } });
  const busy = character('busy', { initiative: 90, testRuntime: { phoneAvailability: 'busy', energy: 30 } });
  const energeticDecision = contactBudgetDecision(state(), energetic, 'private', now);
  const busyDecision = contactBudgetDecision(state(), busy, 'private', now);
  const once = consumeContactBudget(state(), energetic, 'private', { eventId: 'dm:1' }, now);
  const directAfterSilence = contactBudgetDecision(once.state, energetic, 'private', now + 1);
  const snsAfterSilence = contactBudgetDecision(once.state, energetic, 'sns', now + 1);

  assert.ok(energeticDecision.dailyBudget > busyDecision.dailyBudget);
  assert.ok(snsAfterSilence.channelPriority > directAfterSilence.channelPriority);
});

test('a character local date boundary starts a new budget without affecting another character', () => {
  const actor = character('seoul', { initiative: 0, timeZone: 'Asia/Seoul' });
  const beforeMidnight = Date.parse('2026-07-10T14:59:00.000Z');
  const afterMidnight = Date.parse('2026-07-10T15:01:00.000Z');
  const spent = consumeContactBudget(state(), actor, 'private', { eventId: 'day-1' }, beforeMidnight);

  assert.equal(contactBudgetDecision(spent.state, actor, 'private', beforeMidnight).remaining, 0);
  assert.equal(contactBudgetDecision(spent.state, actor, 'private', afterMidnight).used, 0);
  assert.equal(contactBudgetDecision(spent.state, character('other'), 'private', beforeMidnight).used, 0);
});

test('concurrent channel results merge both atomic event claims without losing budget use', () => {
  const actor = character();
  const now = Date.parse('2026-07-11T03:00:00.000Z');
  const base = state({ characters: [actor], messages: {}, unreadCounts: {}, chatRooms: {}, snsPosts: [], snsDmThreads: [] });
  const privateResult = consumeContactBudget(base, actor, 'private', { eventId: 'private:1' }, now).state;
  const phoneResult = consumeContactBudget(base, actor, 'phone', { eventId: 'phone:1' }, now + 1).state;
  const merged = mergeStaleState(privateResult, base, phoneResult, { conflict: 'latest' });
  const decision = contactBudgetDecision(merged, actor, 'sns', now + 2);

  assert.equal(decision.used, 2);
  assert.equal(decision.remaining, 0);
  assert.equal(new Set(merged.contactLedger[decision.ledgerKey].events.map(event => event.eventId)).size, 2);
});

test('all proactive producers consume the central ledger and user reply paths reset only pressure', () => {
  assert.match(automationSource, /consumeContactBudget\(state, character, 'calendar'/);
  assert.match(automationSource, /consumeContactBudget\(state, character, 'phone'/);
  assert.match(automationSource, /consumeContactBudget\(state, character, 'private'/);
  assert.match(automationSource, /consumeContactBudget\(budgetState, item\.speaker, 'group'/);
  assert.match(automationSource, /contactRunners[\s\S]*?sort\(\(a, b\) => b\.priority - a\.priority\)/);
  assert.match(snsSource, /consumeContactBudget\(next, character, 'sns'/);
  assert.match(stateHelpersSource, /recordContactUserReply\(state,/);
  assert.match(groupSource, /recordContactUserReply\(state, participantIds/);
  assert.match(snsScreenSource, /recordContactUserReply\(state, \[thread\.characterId\]/);
});
