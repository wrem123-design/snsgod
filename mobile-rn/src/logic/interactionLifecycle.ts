export type InteractionLifecycleStatus = 'pending' | 'active' | 'paused' | 'cancelled' | 'finished';

export type InteractionLifecycleState = {
  status: InteractionLifecycleStatus;
  lifecycleRevision?: number;
  updatedAt?: number;
  pausedAt?: number;
  cancelledAt?: number;
  finishedAt?: number;
  resultAppliedAt?: number;
};

type InteractionCollectionState = {
  activeMeetingEventId?: string;
  activeCallSessionId?: string;
  meetingEventSessions?: InteractionLifecycleState[];
  callSessions?: InteractionLifecycleState[];
};

type ResumableCallSession = InteractionLifecycleState & {
  id?: string;
  characterId?: string;
  roomId?: string;
  sourceMessageId?: string;
  startedAt?: number;
};

const ALLOWED_TRANSITIONS: Record<InteractionLifecycleStatus, ReadonlySet<InteractionLifecycleStatus>> = {
  pending: new Set(['active', 'cancelled']),
  active: new Set(['paused', 'cancelled', 'finished']),
  paused: new Set(['active', 'cancelled']),
  cancelled: new Set(),
  finished: new Set(),
};

/** Converts pre-lifecycle meeting values while keeping unknown imports safe. */
export function normalizeInteractionLifecycleStatus(value: unknown): InteractionLifecycleStatus {
  if (value === 'pending' || value === 'active' || value === 'paused' || value === 'cancelled' || value === 'finished') return value;
  if (value === 'dismissed') return 'cancelled';
  if (value === 'ended') return 'finished';
  return 'pending';
}

/** Applies the shared monotonic call/meeting lifecycle transition table. */
export function transitionInteractionLifecycle<T extends InteractionLifecycleState>(
  session: T,
  status: InteractionLifecycleStatus,
  now = Date.now(),
): T {
  if (session.status === status || !ALLOWED_TRANSITIONS[session.status].has(status)) return session;
  return {
    ...session,
    status,
    lifecycleRevision: Number(session.lifecycleRevision || 0) + 1,
    updatedAt: now,
    ...(status === 'paused' ? { pausedAt: now } : {}),
    ...(status === 'cancelled' ? { cancelledAt: now } : {}),
    ...(status === 'finished' ? { finishedAt: now } : {}),
  };
}

export function canResumeLifecycle(session: InteractionLifecycleState | undefined): boolean {
  return session?.status === 'paused';
}

/** Pauses active foreground interactions before the persisted app snapshot is flushed. */
export function pauseActiveInteractions<T extends InteractionCollectionState>(state: T, now = Date.now()): T {
  let changed = false;
  const pauseCollection = (items: InteractionLifecycleState[] | undefined, activeId: string | undefined) => (items || []).map(item => {
    const itemId = 'id' in item ? String(item.id || '') : '';
    if (item.status !== 'active' || (activeId && itemId !== activeId)) return item;
    changed = true;
    return transitionInteractionLifecycle(item, 'paused', now);
  });
  const meetingEventSessions = pauseCollection(state.meetingEventSessions, state.activeMeetingEventId);
  const callSessions = pauseCollection(state.callSessions, state.activeCallSessionId);
  if (!changed) return state;
  return { ...state, meetingEventSessions, callSessions };
}

/** Resumes only sessions whose durable pointer says they still own the foreground flow. */
export function resumePointedInteractions<T extends InteractionCollectionState>(state: T, now = Date.now()): T {
  let changed = false;
  const resumeCollection = (items: InteractionLifecycleState[] | undefined, activeId: string | undefined) => (items || []).map(item => {
    const itemId = 'id' in item ? String(item.id || '') : '';
    if (!activeId || itemId !== activeId || item.status !== 'paused') return item;
    changed = true;
    return transitionInteractionLifecycle(item, 'active', now);
  });
  const meetingEventSessions = resumeCollection(state.meetingEventSessions, state.activeMeetingEventId);
  const callSessions = resumeCollection(state.callSessions, state.activeCallSessionId);
  return changed ? { ...state, meetingEventSessions, callSessions } : state;
}

/** Migrates saved legacy values and drops pointers that already reached a terminal state. */
export function normalizePersistedInteractionLifecycles<T extends InteractionCollectionState>(state: T): T {
  let changed = false;
  const normalizeCollection = (items: InteractionLifecycleState[] | undefined) => (items || []).map(item => {
    const status = normalizeInteractionLifecycleStatus(item.status);
    if (status === item.status) return item;
    changed = true;
    return { ...item, status };
  });
  const meetingEventSessions = normalizeCollection(state.meetingEventSessions);
  const callSessions = normalizeCollection(state.callSessions);
  const activeMeeting = meetingEventSessions.find(item => 'id' in item && item.id === state.activeMeetingEventId);
  const activeCall = callSessions.find(item => 'id' in item && item.id === state.activeCallSessionId);
  const activeMeetingEventId = activeMeeting && (activeMeeting.status === 'active' || activeMeeting.status === 'paused') ? state.activeMeetingEventId : undefined;
  const activeCallSessionId = activeCall && (activeCall.status === 'active' || activeCall.status === 'paused') ? state.activeCallSessionId : undefined;
  if (activeMeetingEventId !== state.activeMeetingEventId || activeCallSessionId !== state.activeCallSessionId) changed = true;
  if (!changed) return state;
  return { ...state, meetingEventSessions, callSessions, activeMeetingEventId, activeCallSessionId };
}

/** Finds the newest non-terminal call matching a source card or conversation. */
export function findResumableCallSession<T extends { callSessions?: ResumableCallSession[] }>(
  state: T,
  input: { characterId: string; roomId?: string; sourceMessageId?: string },
): ResumableCallSession | undefined {
  const candidates = (state.callSessions || []).filter(session => {
    if (session.status !== 'active' && session.status !== 'paused') return false;
    if (session.characterId !== input.characterId) return false;
    if (input.sourceMessageId) return session.sourceMessageId === input.sourceMessageId;
    return session.roomId === input.roomId;
  });
  return candidates.sort((a, b) => Number(b.updatedAt || b.startedAt || 0) - Number(a.updatedAt || a.startedAt || 0))[0];
}

/** Claims result side effects once after a finished transition. */
export function applyLifecycleResultOnce<T extends InteractionLifecycleState>(
  session: T,
  now = Date.now(),
): { session: T; applied: boolean } {
  if (session.status !== 'finished' || session.resultAppliedAt) return { session, applied: false };
  return {
    session: {
      ...session,
      resultAppliedAt: now,
      lifecycleRevision: Number(session.lifecycleRevision || 0) + 1,
      updatedAt: now,
    },
    applied: true,
  };
}
