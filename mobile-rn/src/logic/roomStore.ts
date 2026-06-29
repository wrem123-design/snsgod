import { GroupRoom, RandomChatRoom, SNSGodRoom, SNSGodState } from '../types';
import { findRandomChat } from './randomChat';
import { findRoom } from './stateHelpers';

export type AnyRoom =
  | { kind: 'direct'; room: SNSGodRoom }
  | { kind: 'group'; room: GroupRoom }
  | { kind: 'random'; room: RandomChatRoom };

export function getAnyRoom(state: SNSGodState, roomId?: string): AnyRoom | undefined {
  if (!roomId) return undefined;
  const group = (state.groupRooms || []).find(room => room.id === roomId);
  if (group) return { kind: 'group', room: group };
  const random = findRandomChat(state, roomId);
  if (random) return { kind: 'random', room: random };
  const direct = findRoom(state, roomId);
  if (direct) return { kind: 'direct', room: direct };
  return undefined;
}

export function roomRouteKind(state: SNSGodState, roomId?: string): 'chatRoom' | 'groupChatRoom' | 'randomChatRoom' {
  const anyRoom = getAnyRoom(state, roomId);
  if (anyRoom?.kind === 'group') return 'groupChatRoom';
  if (anyRoom?.kind === 'random') return 'randomChatRoom';
  return 'chatRoom';
}

export function clearRoomUnread(state: SNSGodState, roomId: string): SNSGodState {
  if (!state.unreadCounts?.[roomId]) return state;
  return { ...state, unreadCounts: { ...state.unreadCounts, [roomId]: 0 } };
}
