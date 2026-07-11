import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

async function importPendingReplyJobs() {
  const source = readFileSync(new URL('../src/logic/pendingReplyJobs.ts', import.meta.url), 'utf8');
  const transpiled = ts.transpileModule(source, {
    fileName: 'src/logic/pendingReplyJobs.ts',
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  assert.equal(transpiled.diagnostics?.length ?? 0, 0);
  return import(`data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`);
}

async function importChatJobs() {
  const source = readFileSync(new URL('../src/logic/chatJobs.ts', import.meta.url), 'utf8')
    .replace("import { makeId } from './ids';", "let nextId = 0; const makeId = prefix => `${prefix}_${++nextId}`;");
  const transpiled = ts.transpileModule(source, {
    fileName: 'src/logic/chatJobs.ts',
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  assert.equal(transpiled.diagnostics?.length ?? 0, 0);
  return import(`data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`);
}

const {
  cancelAllPendingReplyJobs,
  cancelPendingReplyJob,
  createPendingReplyJob,
  isPendingReplyActive,
  reconcilePendingReplyJobs,
  transitionPendingReplyJob,
} = await importPendingReplyJobs();
const chatJobs = await importChatJobs();
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const replyEngineSource = readFileSync(new URL('../src/logic/replyEngine.ts', import.meta.url), 'utf8');

function state(overrides = {}) {
  return {
    __importedAt: 7,
    characters: [{ id: 'character-1', name: '하나' }],
    chatRooms: {
      'character-1': [{ id: 'room-1', characterId: 'character-1', name: '하나' }],
    },
    messages: {
      'room-1': [{ id: 'source-1', role: 'user', content: '안녕', createdAt: 1_000 }],
    },
    pendingReplies: {},
    ...overrides,
  };
}

function job(overrides = {}) {
  return createPendingReplyJob({
    jobId: 'job-1',
    roomId: 'room-1',
    characterId: 'character-1',
    sourceMessageId: 'source-1',
    sourceMessageCreatedAt: 1_000,
    latestUserInput: '안녕',
    latestUserImageData: 'data:image/png;base64,abc',
    scheduledAt: 5_000,
    stateImportedAt: 7,
    creationMode: 'direct',
    now: 2_000,
    ...overrides,
  });
}

test('a durable job stores its source, original schedule, generation, attempt, and creation mode', () => {
  assert.deepEqual(job(), {
    jobId: 'job-1',
    roomId: 'room-1',
    characterId: 'character-1',
    sourceMessageId: 'source-1',
    sourceMessageCreatedAt: 1_000,
    latestUserInput: '안녕',
    latestUserImageData: 'data:image/png;base64,abc',
    scheduledAt: 5_000,
    startedAt: 2_000,
    updatedAt: 2_000,
    stateImportedAt: 7,
    phase: 'delay',
    attempt: 1,
    creationMode: 'direct',
  });
});

test('phase transitions are idempotent and terminal jobs cannot be reopened', () => {
  const generating = transitionPendingReplyJob(job(), 'generating', 3_000);
  const duplicate = transitionPendingReplyJob(generating, 'generating', 4_000);
  const delivered = transitionPendingReplyJob(duplicate, 'delivered', 5_000);
  const reopened = transitionPendingReplyJob(delivered, 'generating', 6_000);

  assert.equal(duplicate, generating);
  assert.equal(reopened, delivered);
  assert.equal(isPendingReplyActive(delivered), false);
  assert.equal(isPendingReplyActive(generating), true);
});

test('restart resumes valid delay and generating jobs using the original schedule', () => {
  const delay = job();
  const generating = transitionPendingReplyJob(job({ jobId: 'job-2', roomId: 'room-2' }), 'generating', 2_500);
  const snapshot = state({ pendingReplies: { 'room-1': delay, 'room-2': generating } });
  snapshot.chatRooms['character-1'].push({ id: 'room-2', characterId: 'character-1', name: '둘' });
  snapshot.messages['room-2'] = [{ id: 'source-1', role: 'user', content: '안녕', createdAt: 1_000 }];

  const result = reconcilePendingReplyJobs(snapshot, 10_000);

  assert.deepEqual(result.resumable.map(item => [item.jobId, item.scheduledAt, item.attempt]), [
    ['job-1', 5_000, 2],
    ['job-2', 5_000, 2],
  ]);
});

test('an already appended reply marks a crashed generating job delivered instead of resuming it', () => {
  const generating = transitionPendingReplyJob(job(), 'generating', 2_500);
  const snapshot = state({
    pendingReplies: { 'room-1': generating },
    messages: {
      'room-1': [
        { id: 'source-1', role: 'user', content: '안녕', createdAt: 1_000 },
        { id: 'reply-1', role: 'character', content: '응', createdAt: 3_000, replyJobId: 'job-1' },
      ],
    },
  });

  const result = reconcilePendingReplyJobs(snapshot, 10_000);

  assert.equal(result.resumable.length, 0);
  assert.equal(result.state.pendingReplies['room-1'].phase, 'delivered');
});

test('restart cancels jobs after source deletion, a newer user message, room disable, or restore generation change', () => {
  const cases = [
    state({ pendingReplies: { 'room-1': job() }, messages: { 'room-1': [] } }),
    state({
      pendingReplies: { 'room-1': job() },
      messages: { 'room-1': [
        { id: 'source-1', role: 'user', content: '안녕', createdAt: 1_000 },
        { id: 'source-2', role: 'user', content: '새 질문', createdAt: 2_000 },
      ] },
    }),
    state({
      pendingReplies: { 'room-1': job() },
      chatRooms: { 'character-1': [{ id: 'room-1', characterId: 'character-1', name: '하나', disabled: true }] },
    }),
    state({ __importedAt: 8, pendingReplies: { 'room-1': job() } }),
  ];

  for (const snapshot of cases) {
    const result = reconcilePendingReplyJobs(snapshot, 10_000);
    assert.equal(result.resumable.length, 0);
    assert.equal(result.state.pendingReplies['room-1'].phase, 'cancelled');
  }
});

test('legacy runtime-only pending records are discarded instead of being guessed into durable work', () => {
  const snapshot = state({ pendingReplies: { 'room-1': { jobId: 'legacy', startedAt: 1, phase: 'delay' } } });
  const result = reconcilePendingReplyJobs(snapshot, 10_000);

  assert.equal(result.resumable.length, 0);
  assert.equal(result.state.pendingReplies['room-1'], undefined);
});

test('two resume attempts for one persisted job are single-flight', () => {
  assert.equal(chatJobs.tryResumeChatJob('room-1', 'job-1'), true);
  assert.equal(chatJobs.tryResumeChatJob('room-1', 'job-1'), false);
  assert.equal(chatJobs.tryResumeChatJob('room-1', 'job-2'), false);
  chatJobs.endChatJob('room-1', 'job-1');
  assert.equal(chatJobs.tryResumeChatJob('room-1', 'job-2'), true);
  chatJobs.endChatJob('room-1', 'job-2');
});

test('new user work and runtime resets terminally cancel active jobs', () => {
  const snapshot = state({ pendingReplies: { 'room-1': job() } });
  const replaced = cancelPendingReplyJob(snapshot, 'room-1', 'newer-user-message', 3_000);
  const reset = cancelAllPendingReplyJobs(snapshot, 'restore-runtime-reset', 4_000);

  assert.equal(replaced.pendingReplies['room-1'].phase, 'cancelled');
  assert.equal(replaced.pendingReplies['room-1'].failureReason, 'newer-user-message');
  assert.equal(reset.pendingReplies['room-1'].phase, 'cancelled');
  assert.equal(reset.pendingReplies['room-1'].failureReason, 'restore-runtime-reset');
});

test('App and reply engine persist, resume, and terminally record the same durable job', () => {
  assert.doesNotMatch(appSource, /pendingReplies:\s*\{\}/);
  assert.match(appSource, /reconcilePendingReplyJobs\(next\)/);
  assert.match(appSource, /resumeJob: job/);
  assert.match(replyEngineSource, /scheduledAt: timeline\.plannedReplyAt/);
  assert.match(replyEngineSource, /reason: 'pending reply scheduled'/);
  assert.match(replyEngineSource, /reason: 'pending reply scheduled' \},\s*flush: true/);
  assert.match(replyEngineSource, /replyJobId: jobId/);
  assert.match(replyEngineSource, /transitionPending\(current, input\.roomId, jobId, 'delivered'\)/);
  assert.match(replyEngineSource, /'failed',[\s\S]*?pending reply failed/);
});
