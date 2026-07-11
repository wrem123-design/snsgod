import type { NotificationItem, SNSGodState } from '../types';

export type NotificationRoute =
  | { name: 'chatRoom'; roomId: string }
  | { name: 'groupChatRoom'; roomId: string }
  | { name: 'randomChatRoom'; roomId: string }
  | { name: 'sns'; platform: 'instagram' | 'twitter'; postId?: string; threadId?: string }
  | { name: 'sumgod' }
  | { name: 'call'; characterId: string; roomId?: string; sourceMessageId?: string }
  | { name: 'meeting'; sessionId: string }
  | { name: 'notifications' };

type NotificationRoutingState = Pick<SNSGodState, 'characters' | 'chatRooms' | 'groupRooms' | 'randomChats' | 'snsPosts' | 'snsDmThreads' | 'meetingEventSessions'>;
type NotificationRouteInput = Pick<NotificationItem, 'app' | 'roomId' | 'target'>;

const MAX_NOTIFICATION_ID_LENGTH = 512;

export type NotificationRouteRequest =
  | { kind: 'root' }
  | { kind: 'item'; notificationId: string };

export function notificationUrlForId(notificationId: string): string {
  return `snsgod://notification?id=${encodeURIComponent(notificationId)}`;
}

export function notificationRouteRequestFromUrl(value: string): NotificationRouteRequest | undefined {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'snsgod:') return undefined;
    if (url.username || url.password || url.port || url.hash) return undefined;
    if (url.pathname && url.pathname !== '/') return undefined;
    if (url.hostname === 'notifications') return { kind: 'root' };
    if (url.hostname !== 'notification') return undefined;
    const notificationId = String(url.searchParams.get('id') || '').trim();
    return notificationId && notificationId.length <= MAX_NOTIFICATION_ID_LENGTH
      ? { kind: 'item', notificationId }
      : undefined;
  } catch {
    return undefined;
  }
}

export function openNotificationRequest(state: SNSGodState, request: NotificationRouteRequest): { state: SNSGodState; route: NotificationRoute } {
  if (request.kind === 'root') return { state, route: { name: 'notifications' } };
  const notification = (state.notifications || []).find(item => item.id === request.notificationId);
  if (!notification) return { state, route: { name: 'notifications' } };
  const notifications = (state.notifications || []).map(item => item.id === notification.id ? { ...item, read: true } : item);
  return {
    state: { ...state, notifications },
    route: resolveNotificationRoute(state, notification),
  };
}

function routeForRoom(state: NotificationRoutingState, roomId: string): NotificationRoute {
  if ((state.groupRooms || []).some(room => room.id === roomId)) {
    return { name: 'groupChatRoom', roomId };
  }
  if ((state.randomChats || []).some(room => room.id === roomId)) {
    return { name: 'randomChatRoom', roomId };
  }
  if (Object.values(state.chatRooms || {}).some(rooms => rooms.some(room => room.id === roomId))) {
    return { name: 'chatRoom', roomId };
  }
  return { name: 'notifications' };
}

export function resolveNotificationRoute(state: NotificationRoutingState, item: NotificationRouteInput): NotificationRoute {
  const target = item.target;
  if (target?.app === 'social') {
    const post = (state.snsPosts || []).find(candidate => candidate.id === target.postId);
    return post ? { name: 'sns', platform: post.platform, postId: post.id } : { name: 'notifications' };
  }
  if (target?.app === 'snsdm') {
    const thread = (state.snsDmThreads || []).find(candidate => candidate.id === target.threadId);
    const post = thread?.postId ? (state.snsPosts || []).find(candidate => candidate.id === thread.postId) : undefined;
    return thread && post
      ? { name: 'sns', platform: post.platform, postId: post.id, threadId: thread.id }
      : { name: 'notifications' };
  }
  if (target?.app === 'sumgod') {
    const characterExists = !target.characterId || state.characters.some(character => character.id === target.characterId);
    return characterExists ? { name: 'sumgod' } : { name: 'notifications' };
  }
  if (target?.app === 'call') {
    const characterExists = state.characters.some(character => character.id === target.characterId);
    const roomRoute = target.roomId ? routeForRoom(state, target.roomId) : undefined;
    if (!characterExists || roomRoute?.name === 'notifications') return { name: 'notifications' };
    return { name: 'call', characterId: target.characterId, roomId: target.roomId, sourceMessageId: target.sourceMessageId };
  }
  if (target?.app === 'meeting') {
    const session = (state.meetingEventSessions || []).find(candidate => candidate.id === target.sessionId);
    return session ? { name: 'meeting', sessionId: session.id } : { name: 'notifications' };
  }
  if (target?.app === 'messenger' || target?.app === 'randomchat') {
    return routeForRoom(state, target.roomId);
  }
  if (target?.app) return { name: 'notifications' };
  const legacyRoomId = target && target.app === undefined ? target.roomId : undefined;
  const roomId = String(legacyRoomId || item.roomId || '').trim();
  return roomId ? routeForRoom(state, roomId) : { name: 'notifications' };
}
