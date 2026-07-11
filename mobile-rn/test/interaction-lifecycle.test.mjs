import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

async function importLifecycle() {
  const source = readFileSync(new URL('../src/logic/interactionLifecycle.ts', import.meta.url), 'utf8');
  const transpiled = ts.transpileModule(source, {
    fileName: 'src/logic/interactionLifecycle.ts',
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  assert.equal(transpiled.diagnostics?.length ?? 0, 0);
  return import(`data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`);
}

const {
  applyLifecycleResultOnce,
  canResumeLifecycle,
  findResumableCallSession,
  normalizeInteractionLifecycleStatus,
  normalizePersistedInteractionLifecycles,
  pauseActiveInteractions,
  resumePointedInteractions,
  transitionInteractionLifecycle,
} = await importLifecycle();

function session(status = 'pending', overrides = {}) {
  return { id: 'session-1', status, lifecycleRevision: 0, updatedAt: 1, ...overrides };
}

test('only the explicit pending-active-paused-cancelled-finished transition table is allowed', () => {
  const pending = session('pending');
  assert.equal(transitionInteractionLifecycle(session('pending'), 'active', 10).status, 'active');
  assert.equal(transitionInteractionLifecycle(pending, 'paused', 10), pending);
  assert.equal(transitionInteractionLifecycle(session('active'), 'paused', 20).status, 'paused');
  assert.equal(transitionInteractionLifecycle(session('paused'), 'active', 30).status, 'active');
  assert.equal(transitionInteractionLifecycle(session('active'), 'finished', 40).status, 'finished');
  assert.equal(transitionInteractionLifecycle(session('active'), 'cancelled', 40).status, 'cancelled');
});

test('terminal transitions and repeated transitions are idempotent', () => {
  const paused = transitionInteractionLifecycle(session('active'), 'paused', 20);
  const duplicatePause = transitionInteractionLifecycle(paused, 'paused', 30);
  const cancelled = transitionInteractionLifecycle(paused, 'cancelled', 40);

  assert.equal(duplicatePause, paused);
  assert.equal(transitionInteractionLifecycle(cancelled, 'active', 50), cancelled);
  assert.equal(transitionInteractionLifecycle(cancelled, 'finished', 50), cancelled);
});

test('pause preserves payload and is resumable while cancel and finish never resume', () => {
  const active = session('active', { turnCount: 3, lines: [{ id: 'line-1', text: 'hello' }], choices: ['next'] });
  const paused = transitionInteractionLifecycle(active, 'paused', 20);

  assert.equal(paused.turnCount, 3);
  assert.deepEqual(paused.lines, active.lines);
  assert.deepEqual(paused.choices, active.choices);
  assert.equal(canResumeLifecycle(paused), true);
  assert.equal(canResumeLifecycle(transitionInteractionLifecycle(active, 'cancelled', 20)), false);
  assert.equal(canResumeLifecycle(transitionInteractionLifecycle(active, 'finished', 20)), false);
});

test('finished results are applied exactly once', () => {
  const finished = transitionInteractionLifecycle(session('active'), 'finished', 20);
  const first = applyLifecycleResultOnce(finished, 30);
  const second = applyLifecycleResultOnce(first.session, 40);

  assert.equal(first.applied, true);
  assert.equal(first.session.resultAppliedAt, 30);
  assert.equal(second.applied, false);
  assert.equal(second.session, first.session);
});

test('legacy meeting statuses normalize to terminal lifecycle states', () => {
  assert.equal(normalizeInteractionLifecycleStatus('dismissed'), 'cancelled');
  assert.equal(normalizeInteractionLifecycleStatus('ended'), 'finished');
  assert.equal(normalizeInteractionLifecycleStatus('active'), 'active');
  assert.equal(normalizeInteractionLifecycleStatus('unexpected'), 'pending');
});

test('saved legacy sessions migrate and terminal active pointers are removed', () => {
  const migrated = normalizePersistedInteractionLifecycles({
    activeMeetingEventId: 'meeting-ended',
    activeCallSessionId: 'call-paused',
    meetingEventSessions: [{ id: 'meeting-ended', status: 'ended' }],
    callSessions: [{ id: 'call-paused', status: 'paused' }],
  });

  assert.equal(migrated.meetingEventSessions[0].status, 'finished');
  assert.equal(migrated.activeMeetingEventId, undefined);
  assert.equal(migrated.activeCallSessionId, 'call-paused');
});

test('app background pauses active meeting and call without losing active pointers', () => {
  const state = {
    activeMeetingEventId: 'meeting-1',
    activeCallSessionId: 'call-1',
    meetingEventSessions: [{ ...session('active'), id: 'meeting-1', lines: [{ id: 'm1' }], resumeChoices: ['계속'] }],
    callSessions: [{ ...session('active'), id: 'call-1', lines: [{ id: 'c1' }], choices: ['응'] }],
  };

  const paused = pauseActiveInteractions(state, 100);
  assert.equal(paused.activeMeetingEventId, 'meeting-1');
  assert.equal(paused.activeCallSessionId, 'call-1');
  assert.equal(paused.meetingEventSessions[0].status, 'paused');
  assert.equal(paused.callSessions[0].status, 'paused');
  assert.deepEqual(paused.meetingEventSessions[0].resumeChoices, ['계속']);
  assert.deepEqual(paused.callSessions[0].choices, ['응']);

  const resumed = resumePointedInteractions(paused, 200);
  assert.equal(resumed.meetingEventSessions[0].status, 'active');
  assert.equal(resumed.callSessions[0].status, 'active');
});

test('paused call survives JSON round trip and source message wins resume lookup', () => {
  const snapshot = JSON.parse(JSON.stringify({
    callSessions: [
      { ...session('paused'), id: 'old', characterId: 'character-1', roomId: 'room-1', updatedAt: 10, lines: [] },
      { ...session('paused'), id: 'source', characterId: 'character-1', roomId: 'room-1', sourceMessageId: 'message-1', updatedAt: 20, lines: [{ id: 'line-1' }] },
      { ...session('cancelled'), id: 'cancelled', characterId: 'character-1', roomId: 'room-1', sourceMessageId: 'message-1', updatedAt: 30, lines: [] },
    ],
  }));

  assert.equal(findResumableCallSession(snapshot, {
    characterId: 'character-1',
    roomId: 'room-1',
    sourceMessageId: 'message-1',
  })?.id, 'source');
  assert.equal(findResumableCallSession(snapshot, {
    characterId: 'character-1',
    roomId: 'room-1',
  })?.id, 'source');
});
