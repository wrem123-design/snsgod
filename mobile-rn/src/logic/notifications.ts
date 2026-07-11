import { NotificationItem, SNSGodState } from '../types';
import { makeId } from './ids';

const MAX_NOTIFICATIONS = 50;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const COLLAPSE_WINDOW_MS = 45 * 1000;

export type PushNotificationInput = Omit<NotificationItem, 'id' | 'createdAt'> & {
  id?: string;
  createdAt?: number;
};

export function normalizeNotifications(state: SNSGodState): SNSGodState {
  const now = Date.now();
  const notifications = (state.notifications || [])
    .filter(item => item && item.id && item.createdAt && now - Number(item.createdAt) <= MAX_AGE_MS)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, MAX_NOTIFICATIONS);
  return { ...state, notifications };
}

export function pushNotification(state: SNSGodState, input: PushNotificationInput): SNSGodState {
  const now = input.createdAt || Date.now();
  const source = normalizeNotifications(state).notifications || [];
  const collapseKey = input.collapseKey || (input.roomId ? `room:${input.roomId}` : input.characterId ? `character:${input.characterId}` : undefined);
  if (collapseKey) {
    const index = source.findIndex(item => item.collapseKey === collapseKey && now - item.createdAt <= COLLAPSE_WINDOW_MS);
    if (index >= 0) {
      const updated = [...source];
      const existing = updated[index];
      updated[index] = {
        ...existing,
        ...input,
        id: existing.id,
        createdAt: now,
        count: Number(existing.count || 1) + 1,
        read: false,
        collapseKey
      };
      return normalizeNotifications({ ...state, notifications: updated });
    }
  }
  const item: NotificationItem = {
    id: input.id || makeId('noti'),
    type: input.type,
    title: input.title,
    body: input.body,
    app: input.app,
    target: input.target,
    roomId: input.roomId,
    characterId: input.characterId,
    collapseKey,
    count: 1,
    createdAt: now,
    read: input.read === true
  };
  return normalizeNotifications({ ...state, notifications: [item, ...source] });
}

export function markRoomNotificationsRead(state: SNSGodState, roomId: string): SNSGodState {
  return {
    ...state,
    notifications: (state.notifications || []).map(item => item.roomId === roomId || item.target?.roomId === roomId ? { ...item, read: true } : item)
  };
}

export function markRoomRead(state: SNSGodState, roomId: string): SNSGodState {
  const unreadCounts = state.unreadCounts?.[roomId]
    ? { ...state.unreadCounts, [roomId]: 0 }
    : state.unreadCounts;
  const notifications = (state.notifications || []).map(item => item.roomId === roomId || item.target?.roomId === roomId ? { ...item, read: true } : item);
  return { ...state, unreadCounts, notifications };
}

export function notifyRoomMessage(state: SNSGodState, input: {
  roomId: string;
  characterId?: string;
  title: string;
  body?: string;
  app?: NotificationItem['app'];
  visibleRoomId?: string;
}): SNSGodState {
  if (input.visibleRoomId === input.roomId) return markRoomRead(state, input.roomId);
  const app = input.app === 'randomchat' ? 'randomchat' : 'messenger';
  const next = {
    ...state,
    unreadCounts: {
      ...state.unreadCounts,
      [input.roomId]: (state.unreadCounts[input.roomId] || 0) + 1
    }
  };
  return pushNotification(next, {
    type: app === 'randomchat' ? 'randomchat' : 'chat',
    title: input.title,
    body: input.body,
    app,
    roomId: input.roomId,
    characterId: input.characterId,
    target: { app, roomId: input.roomId, characterId: input.characterId },
    collapseKey: `room:${input.roomId}`
  });
}
