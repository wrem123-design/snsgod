import { NotificationEventReceipt, NotificationItem, SNSGodState } from '../types';
import { makeId } from './ids';

const MAX_NOTIFICATIONS = 50;
const MAX_NOTIFICATION_EVENTS = 2000;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const COLLAPSE_WINDOW_MS = 45 * 1000;

export type PushNotificationInput = Omit<NotificationItem, 'id' | 'createdAt' | 'eventIds'> & {
  id?: string;
  createdAt?: number;
  eventId?: string;
  eventTarget?: Pick<NotificationEventReceipt, 'targetKind' | 'targetId'>;
};

function uniqueEventIds(values: readonly string[] | undefined): string[] {
  return [...new Set((values || []).map(value => String(value || '').trim()).filter(Boolean))];
}

function boundedNotificationEvents(events: Record<string, NotificationEventReceipt>): Record<string, NotificationEventReceipt> {
  const entries = Object.entries(events);
  if (entries.length <= MAX_NOTIFICATION_EVENTS) return events;
  const unread = entries.filter(([, receipt]) => !receipt.readAt);
  const recentRead = entries
    .filter(([, receipt]) => Boolean(receipt.readAt))
    .sort((left, right) => right[1].receivedAt - left[1].receivedAt)
    .slice(0, Math.max(0, MAX_NOTIFICATION_EVENTS - unread.length));
  return Object.fromEntries([...unread, ...recentRead]);
}

function notificationEventTarget(input: PushNotificationInput): Pick<NotificationEventReceipt, 'targetKind' | 'targetId'> {
  if (input.eventTarget) return input.eventTarget;
  if (input.target?.app === 'snsdm') return { targetKind: 'snsdm', targetId: input.target.threadId };
  if (input.roomId || input.target?.roomId) return { targetKind: 'room', targetId: String(input.roomId || input.target?.roomId) };
  return { targetKind: 'notification', targetId: String(input.collapseKey || input.id || input.eventId || 'notification') };
}

function withEventReceipt(
  state: SNSGodState,
  eventId: string,
  target: Pick<NotificationEventReceipt, 'targetKind' | 'targetId'>,
  receivedAt: number,
  readAt?: number,
): SNSGodState {
  if (state.notificationEvents?.[eventId]) return state;
  return {
    ...state,
    notificationEvents: {
      ...(state.notificationEvents || {}),
      [eventId]: { ...target, receivedAt, readAt },
    },
  };
}

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
  const eventId = String(input.eventId || '').trim();
  if (eventId && state.notificationEvents?.[eventId]) return state;
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
        collapseKey,
        eventIds: eventId ? uniqueEventIds([...(existing.eventIds || []), eventId]) : existing.eventIds,
      };
      const next = normalizeNotifications({ ...state, notifications: updated });
      return eventId ? withEventReceipt(next, eventId, notificationEventTarget(input), now) : next;
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
    eventIds: eventId ? [eventId] : undefined,
    count: 1,
    createdAt: now,
    read: input.read === true
  };
  const next = normalizeNotifications({ ...state, notifications: [item, ...source] });
  return eventId ? withEventReceipt(next, eventId, notificationEventTarget(input), now) : next;
}

export function reconcileNotificationEvents(state: SNSGodState): SNSGodState {
  const notificationEvents = boundedNotificationEvents(state.notificationEvents || {});
  const seenEventIds = new Set<string>();
  const notifications: NotificationItem[] = [];
  for (const item of state.notifications || []) {
    const eventIds = uniqueEventIds(item.eventIds);
    if (!eventIds.length) {
      notifications.push(item);
      continue;
    }
    const retainedEventIds = eventIds.filter(eventId => !seenEventIds.has(eventId));
    retainedEventIds.forEach(eventId => seenEventIds.add(eventId));
    if (!retainedEventIds.length) continue;
    notifications.push({ ...item, eventIds: retainedEventIds, count: retainedEventIds.length });
  }

  const roomEventCounts: Record<string, number> = {};
  const snsDmEventCounts: Record<string, number> = {};
  for (const receipt of Object.values(notificationEvents)) {
    if (receipt.readAt) continue;
    if (receipt.targetKind === 'room') roomEventCounts[receipt.targetId] = (roomEventCounts[receipt.targetId] || 0) + 1;
    if (receipt.targetKind === 'snsdm') snsDmEventCounts[receipt.targetId] = (snsDmEventCounts[receipt.targetId] || 0) + 1;
  }
  const unreadCounts = { ...(state.unreadCounts || {}) };
  for (const [roomId, count] of Object.entries(roomEventCounts)) {
    unreadCounts[roomId] = Math.max(Number(unreadCounts[roomId] || 0), count);
  }
  const snsDmThreads = (state.snsDmThreads || []).map(thread => ({
    ...thread,
    unread: Math.max(Number(thread.unread || 0), Number(snsDmEventCounts[thread.id] || 0)),
  }));
  return { ...state, notifications, unreadCounts, snsDmThreads, notificationEvents };
}

export function markNotificationItemsRead(state: SNSGodState, notificationIds: readonly string[], readAt = Date.now()): SNSGodState {
  const selectedIds = new Set(notificationIds);
  const selected = (state.notifications || []).filter(item => selectedIds.has(item.id));
  const roomIds = new Set(selected.map(item => String(item.roomId || item.target?.roomId || '')).filter(Boolean));
  const threadIds = new Set(selected.map(item => item.target?.app === 'snsdm' ? item.target.threadId : '').filter(Boolean));
  const selectedEventIds = new Set(selected.flatMap(item => item.eventIds || []));
  const notifications = (state.notifications || []).map(item => {
    const roomId = String(item.roomId || item.target?.roomId || '');
    const threadId = item.target?.app === 'snsdm' ? item.target.threadId : '';
    return selectedIds.has(item.id) || roomIds.has(roomId) || threadIds.has(threadId)
      ? { ...item, read: true }
      : item;
  });
  const unreadCounts = { ...(state.unreadCounts || {}) };
  roomIds.forEach(roomId => { unreadCounts[roomId] = 0; });
  const snsDmThreads = (state.snsDmThreads || []).map(thread => threadIds.has(thread.id) ? { ...thread, unread: 0 } : thread);
  const notificationEvents = Object.fromEntries(Object.entries(state.notificationEvents || {}).map(([eventId, receipt]) => (
    roomIds.has(receipt.targetId) && receipt.targetKind === 'room'
      || threadIds.has(receipt.targetId) && receipt.targetKind === 'snsdm'
      || selectedEventIds.has(eventId)
      ? [eventId, { ...receipt, readAt }]
      : [eventId, receipt]
  )));
  return reconcileNotificationEvents({ ...state, notifications, unreadCounts, snsDmThreads, notificationEvents });
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
  const notificationEvents = Object.fromEntries(Object.entries(state.notificationEvents || {}).map(([eventId, receipt]) => (
    receipt.targetKind === 'room' && receipt.targetId === roomId
      ? [eventId, { ...receipt, readAt: Date.now() }]
      : [eventId, receipt]
  )));
  return { ...state, unreadCounts, notifications, notificationEvents };
}

export function notifyRoomMessage(state: SNSGodState, input: {
  roomId: string;
  characterId?: string;
  title: string;
  body?: string;
  app?: NotificationItem['app'];
  visibleRoomId?: string;
  eventIds?: readonly string[];
  createdAt?: number;
  unreadFloor?: number;
}): SNSGodState {
  const createdAt = input.createdAt || Date.now();
  const eventIds = uniqueEventIds(input.eventIds);
  const unseenEventIds = eventIds.filter(eventId => !state.notificationEvents?.[eventId]);
  if (eventIds.length && !unseenEventIds.length) return state;
  if (input.visibleRoomId === input.roomId) {
    const read = markRoomRead(state, input.roomId);
    return unseenEventIds.reduce((next, eventId) => withEventReceipt(
      next,
      eventId,
      { targetKind: 'room', targetId: input.roomId },
      createdAt,
      createdAt,
    ), read);
  }
  const app = input.app === 'randomchat' ? 'randomchat' : 'messenger';
  const increment = unseenEventIds.length || 1;
  const currentUnread = Number(state.unreadCounts[input.roomId] || 0);
  const nextUnread = input.unreadFloor === undefined
    ? currentUnread + increment
    : Math.max(currentUnread, input.unreadFloor);
  const next = {
    ...state,
    unreadCounts: {
      ...state.unreadCounts,
      [input.roomId]: nextUnread
    }
  };
  const notificationInput = {
    type: app === 'randomchat' ? 'randomchat' : 'chat',
    title: input.title,
    body: input.body,
    app,
    roomId: input.roomId,
    characterId: input.characterId,
    target: { app, roomId: input.roomId, characterId: input.characterId },
    collapseKey: `room:${input.roomId}`,
    createdAt,
  } satisfies PushNotificationInput;
  if (!eventIds.length) return pushNotification(next, notificationInput);
  return unseenEventIds.reduce((current, eventId) => pushNotification(current, {
    ...notificationInput,
    eventId,
    eventTarget: { targetKind: 'room', targetId: input.roomId },
  }), next);
}

export function notifySnsDmMessages(state: SNSGodState, input: {
  threadId: string;
  characterId?: string;
  title: string;
  body?: string;
  eventIds: readonly string[];
  visibleThreadId?: string;
  createdAt?: number;
  unreadFloor?: number;
}): SNSGodState {
  const createdAt = input.createdAt || Date.now();
  const eventIds = uniqueEventIds(input.eventIds);
  const unseenEventIds = eventIds.filter(eventId => !state.notificationEvents?.[eventId]);
  if (!unseenEventIds.length) return state;
  const visible = input.visibleThreadId === input.threadId;
  let next: SNSGodState = {
    ...state,
    snsDmThreads: (state.snsDmThreads || []).map(thread => thread.id === input.threadId
      ? {
        ...thread,
        unread: visible
          ? 0
          : input.unreadFloor === undefined
            ? Number(thread.unread || 0) + unseenEventIds.length
            : Math.max(Number(thread.unread || 0), input.unreadFloor),
      }
      : thread),
  };
  if (visible) {
    return unseenEventIds.reduce((current, eventId) => withEventReceipt(
      current,
      eventId,
      { targetKind: 'snsdm', targetId: input.threadId },
      createdAt,
      createdAt,
    ), next);
  }
  for (const eventId of unseenEventIds) {
    next = pushNotification(next, {
      type: 'snsdm',
      title: input.title,
      body: input.body,
      app: 'snsdm',
      characterId: input.characterId,
      target: { app: 'snsdm', threadId: input.threadId, characterId: input.characterId },
      collapseKey: `snsdm:${input.threadId}`,
      createdAt,
      eventId,
      eventTarget: { targetKind: 'snsdm', targetId: input.threadId },
    });
  }
  return next;
}
