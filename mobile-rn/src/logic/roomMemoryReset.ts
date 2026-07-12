import type { SNSGodRoom, SNSGodState } from '../types';

type EmptyRoomMemoryDraft = Pick<SNSGodRoom, 'relationshipNote' | 'roomPrompt'>;

/**
 * Clears one local transcript and records the epoch that remote synchronization
 * must treat as the beginning of a new conversation.
 */
export function markRoomConversationReset(
  state: SNSGodState,
  roomId: string,
  resetAt: number = Date.now(),
): SNSGodState {
  const chatRooms = Object.fromEntries(Object.entries(state.chatRooms || {}).map(([characterId, rooms]) => [
    characterId,
    (rooms || []).map(room => room.id === roomId
      ? { ...room, conversationResetAt: Math.max(Number(room.conversationResetAt || 0), resetAt) }
      : room),
  ]));
  const unreadCounts = { ...state.unreadCounts };
  delete unreadCounts[roomId];
  return {
    ...state,
    chatRooms,
    messages: { ...state.messages, [roomId]: [] },
    unreadCounts,
    notifications: (state.notifications || []).filter(item => item.roomId !== roomId && item.target?.roomId !== roomId),
  };
}

/**
 * Removes summaries generated from a cleaned room once the user also clears
 * its explicit relationship memory. Memories belonging to other rooms remain.
 */
export function clearDerivedRoomMemoryWhenEmpty(
  state: SNSGodState,
  roomId: string,
  draft: EmptyRoomMemoryDraft,
): SNSGodState {
  if ((state.messages[roomId] || []).length > 0) return state;
  if (String(draft.relationshipNote || '').trim() || String(draft.roomPrompt || '').trim()) return state;
  return {
    ...state,
    roomSummaries: (state.roomSummaries || []).filter(summary => summary.roomId !== roomId),
    groupRoomSummaries: (state.groupRoomSummaries || []).filter(summary => summary.roomId !== roomId),
    characterMemories: (state.characterMemories || []).filter(memory => memory.sourceRoomId !== roomId),
  };
}
