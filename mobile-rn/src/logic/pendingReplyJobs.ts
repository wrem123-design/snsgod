import type { PendingReplyJob, PendingReplyPhase, SNSGodMessage, SNSGodState } from '../types';

type CreatePendingReplyJobInput = Omit<PendingReplyJob, 'startedAt' | 'updatedAt' | 'phase' | 'attempt'> & {
  now?: number;
};

const TERMINAL_PHASES = new Set<PendingReplyPhase>(['delivered', 'failed', 'cancelled']);

/** Creates the first durable snapshot before a reply delay begins. */
export function createPendingReplyJob(input: CreatePendingReplyJobInput): PendingReplyJob {
  const now = Number(input.now ?? Date.now());
  return {
    jobId: input.jobId,
    roomId: input.roomId,
    characterId: input.characterId,
    sourceMessageId: input.sourceMessageId,
    sourceMessageCreatedAt: input.sourceMessageCreatedAt,
    latestUserInput: input.latestUserInput,
    latestUserImageData: input.latestUserImageData,
    scheduledAt: input.scheduledAt,
    startedAt: now,
    updatedAt: now,
    stateImportedAt: input.stateImportedAt,
    phase: 'delay',
    attempt: 1,
    creationMode: input.creationMode,
    ...(input.failureReason ? { failureReason: input.failureReason } : {}),
  };
}

export function isPendingReplyActive(job: PendingReplyJob | undefined): boolean {
  return Boolean(job && !TERMINAL_PHASES.has(job.phase));
}

/** Applies one monotonic phase transition; terminal phases are immutable. */
export function transitionPendingReplyJob(
  job: PendingReplyJob,
  phase: PendingReplyPhase,
  now = Date.now(),
  failureReason?: string,
): PendingReplyJob {
  if (job.phase === phase || TERMINAL_PHASES.has(job.phase)) return job;
  return {
    ...job,
    phase,
    updatedAt: now,
    ...(failureReason ? { failureReason } : {}),
  };
}

/** Cancels one active room job while retaining a durable terminal receipt. */
export function cancelPendingReplyJob(
  state: SNSGodState,
  roomId: string,
  reason: string,
  now = Date.now(),
): SNSGodState {
  const job = state.pendingReplies?.[roomId];
  if (!job || !isPendingReplyActive(job)) return state;
  const cancelled = transitionPendingReplyJob(job, 'cancelled', now, reason);
  return {
    ...state,
    pendingReplies: { ...(state.pendingReplies || {}), [roomId]: cancelled },
  };
}

/** Cancels every active job after a runtime-wide generation reset. */
export function cancelAllPendingReplyJobs(
  state: SNSGodState,
  reason: string,
  now = Date.now(),
): SNSGodState {
  let next = state;
  for (const roomId of Object.keys(state.pendingReplies || {})) {
    next = cancelPendingReplyJob(next, roomId, reason, now);
  }
  return next;
}

function findReplyRoom(state: SNSGodState, roomId: string) {
  return Object.values(state.chatRooms || {}).flat().find(room => room.id === roomId)
    || (state.randomChats || []).find(room => room.id === roomId);
}

function findReplyCharacter(state: SNSGodState, characterId: string) {
  return state.characters.find(character => character.id === characterId)
    || (state.randomChats || []).find(room => room.characterId === characterId || room.character.id === characterId)?.character;
}

function replyAlreadyAppended(messages: SNSGodMessage[], jobId: string): boolean {
  return messages.some(message => message.replyJobId === jobId && message.role !== 'user');
}

function failedReplyAlreadyAppended(messages: SNSGodMessage[], jobId: string): boolean {
  return messages.some(message => message.replyJobId === jobId && message.role === 'system' && message.failed === true);
}

function isDurableJob(value: PendingReplyJob): boolean {
  return Boolean(
    value
    && typeof value.jobId === 'string'
    && typeof value.roomId === 'string'
    && typeof value.characterId === 'string'
    && typeof value.sourceMessageId === 'string'
    && typeof value.latestUserInput === 'string'
    && Number.isFinite(value.scheduledAt)
    && Number.isFinite(value.attempt),
  );
}

function cancellationReason(state: SNSGodState, roomId: string, job: PendingReplyJob): string | undefined {
  if (job.roomId !== roomId) return 'room-key-mismatch';
  if (!Object.is(job.stateImportedAt, state.__importedAt)) return 'state-generation-changed';
  const room = findReplyRoom(state, roomId);
  if (!room) return 'room-deleted';
  if (room.disabled === true) return 'room-disabled';
  const character = findReplyCharacter(state, job.characterId);
  if (!character) return 'character-deleted';
  if (character.enabled === false) return 'character-disabled';
  const messages = state.messages?.[roomId] || [];
  const sourceIndex = messages.findIndex(message => message.id === job.sourceMessageId && message.role === 'user');
  if (sourceIndex < 0) return 'source-message-deleted';
  if (messages.slice(sourceIndex + 1).some(message => message.role === 'user')) return 'newer-user-message';
  return undefined;
}

/** Validates persisted jobs at startup and returns only safe, unanswered work to resume. */
export function reconcilePendingReplyJobs(
  state: SNSGodState,
  now = Date.now(),
): { state: SNSGodState; resumable: PendingReplyJob[] } {
  const pendingReplies = { ...(state.pendingReplies || {}) } as Record<string, PendingReplyJob>;
  const resumable: PendingReplyJob[] = [];
  let changed = false;

  for (const [roomId, job] of Object.entries(pendingReplies)) {
    if (!isDurableJob(job)) {
      delete pendingReplies[roomId];
      changed = true;
      continue;
    }
    if (!isPendingReplyActive(job)) continue;
    const messages = state.messages?.[roomId] || [];
    if (replyAlreadyAppended(messages, job.jobId)) {
      pendingReplies[roomId] = transitionPendingReplyJob(
        job,
        failedReplyAlreadyAppended(messages, job.jobId) ? 'failed' : 'delivered',
        now,
      );
      changed = true;
      continue;
    }
    const reason = cancellationReason(state, roomId, job);
    if (reason) {
      pendingReplies[roomId] = transitionPendingReplyJob(job, 'cancelled', now, reason);
      changed = true;
      continue;
    }
    const resumed = { ...job, attempt: job.attempt + 1, updatedAt: now };
    pendingReplies[roomId] = resumed;
    resumable.push(resumed);
    changed = true;
  }

  return {
    state: changed ? { ...state, pendingReplies } : state,
    resumable,
  };
}
