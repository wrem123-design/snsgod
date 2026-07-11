import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

async function importPureTypeScript(relativePath) {
  const source = readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8')
    .replace("import { markNotificationItemsRead } from './notifications';", `const markNotificationItemsRead = (state, ids) => {
      const selected = (state.notifications || []).filter(item => ids.includes(item.id));
      const roomIds = new Set(selected.map(item => item.roomId || item.target?.roomId).filter(Boolean));
      const unreadCounts = { ...(state.unreadCounts || {}) };
      roomIds.forEach(roomId => { unreadCounts[roomId] = 0; });
      return { ...state, unreadCounts, notifications: (state.notifications || []).map(item => roomIds.has(item.roomId || item.target?.roomId) || ids.includes(item.id) ? { ...item, read: true } : item) };
    };`);
  const transpiled = ts.transpileModule(source, {
    fileName: relativePath,
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  assert.equal(transpiled.diagnostics?.length ?? 0, 0);
  return import(`data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`);
}

const { openNotificationRequest, notificationRouteRequestFromUrl, notificationUrlForId, resolveNotificationRoute } = await importPureTypeScript('src/logic/notificationRouting.ts');
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const notificationsScreenSource = readFileSync(new URL('../src/screens/NotificationsScreen.tsx', import.meta.url), 'utf8');
const snsScreenSource = readFileSync(new URL('../src/screens/SNSScreen.tsx', import.meta.url), 'utf8');
const keepAliveSource = readFileSync(new URL('../android/app/src/main/java/com/snsgod/rn/AutomationKeepAliveService.kt', import.meta.url), 'utf8');

function state() {
  return {
    characters: [{ id: 'character-1' }],
    chatRooms: { 'character-1': [{ id: 'direct-1', characterId: 'character-1' }] },
    groupRooms: [{ id: 'group-1', participantIds: ['character-1'] }],
    randomChats: [{ id: 'random-1', characterId: 'character-1' }],
    snsPosts: [{ id: 'post-1', platform: 'twitter', characterId: 'character-1' }],
    snsDmThreads: [{ id: 'thread-1', postId: 'post-1', characterId: 'character-1' }],
    meetingEventSessions: [{ id: 'meeting-1', roomId: 'direct-1', status: 'paused' }],
  };
}

test('routes valid room notifications by direct, group, and random room kind', () => {
  const snapshot = state();
  assert.deepEqual(resolveNotificationRoute(snapshot, { target: { app: 'messenger', roomId: 'direct-1' } }), { name: 'chatRoom', roomId: 'direct-1' });
  assert.deepEqual(resolveNotificationRoute(snapshot, { target: { app: 'messenger', roomId: 'group-1' } }), { name: 'groupChatRoom', roomId: 'group-1' });
  assert.deepEqual(resolveNotificationRoute(snapshot, { target: { app: 'randomchat', roomId: 'random-1' } }), { name: 'randomChatRoom', roomId: 'random-1' });
});

test('routes valid social, DM, SumGod, call, and meeting targets', () => {
  const snapshot = state();
  assert.deepEqual(resolveNotificationRoute(snapshot, { target: { app: 'social', postId: 'post-1' } }), { name: 'sns', platform: 'twitter', postId: 'post-1' });
  assert.deepEqual(resolveNotificationRoute(snapshot, { target: { app: 'snsdm', threadId: 'thread-1' } }), { name: 'sns', platform: 'twitter', postId: 'post-1', threadId: 'thread-1' });
  assert.deepEqual(resolveNotificationRoute(snapshot, { target: { app: 'sumgod', characterId: 'character-1' } }), { name: 'sumgod' });
  assert.deepEqual(resolveNotificationRoute(snapshot, { target: { app: 'call', characterId: 'character-1', roomId: 'direct-1', sourceMessageId: 'message-1' } }), { name: 'call', characterId: 'character-1', roomId: 'direct-1', sourceMessageId: 'message-1' });
  assert.deepEqual(resolveNotificationRoute(snapshot, { target: { app: 'meeting', sessionId: 'meeting-1' } }), { name: 'meeting', sessionId: 'meeting-1' });
});

test('round-trips notification root and item deep links for cold or warm app entry', () => {
  assert.deepEqual(notificationRouteRequestFromUrl('snsgod://notifications'), { kind: 'root' });
  assert.equal(notificationUrlForId('noti:1'), 'snsgod://notification?id=noti%3A1');
  assert.deepEqual(notificationRouteRequestFromUrl(notificationUrlForId('noti:1')), { kind: 'item', notificationId: 'noti:1' });
  assert.equal(notificationRouteRequestFromUrl('https://example.com/notification?id=noti-1'), undefined);
  assert.equal(notificationRouteRequestFromUrl('snsgod://notification'), undefined);
  assert.equal(notificationRouteRequestFromUrl('snsgod://notification/unexpected?id=noti-1'), undefined);
  assert.equal(notificationRouteRequestFromUrl('snsgod://user:password@notification?id=noti-1'), undefined);
  assert.equal(notificationRouteRequestFromUrl(`snsgod://notification?id=${'n'.repeat(513)}`), undefined);
});

test('opens one notification request, marks only that item read, and falls back safely', () => {
  const snapshot = {
    ...state(),
    unreadCounts: { 'direct-1': 2 },
    notifications: [
      { id: 'noti-1', createdAt: 2, read: false, target: { app: 'social', postId: 'post-1' } },
      { id: 'noti-2', createdAt: 1, read: false, target: { app: 'messenger', roomId: 'direct-1' } },
    ],
  };
  const opened = openNotificationRequest(snapshot, { kind: 'item', notificationId: 'noti-1' });
  assert.deepEqual(opened.route, { name: 'sns', platform: 'twitter', postId: 'post-1' });
  assert.equal(opened.state.notifications[0].read, true);
  assert.equal(opened.state.notifications[1].read, false);

  const missing = openNotificationRequest(snapshot, { kind: 'item', notificationId: 'deleted' });
  assert.deepEqual(missing.route, { name: 'notifications' });
  assert.strictEqual(missing.state, snapshot);
});

test('opening a room target clears its unread and related notifications in the same state change', () => {
  const snapshot = {
    ...state(),
    unreadCounts: { 'direct-1': 2 },
    notifications: [
      { id: 'noti-1', createdAt: 2, read: false, roomId: 'direct-1', target: { app: 'messenger', roomId: 'direct-1' } },
      { id: 'noti-2', createdAt: 1, read: false, roomId: 'direct-1', target: { app: 'messenger', roomId: 'direct-1' } },
    ],
  };
  const opened = openNotificationRequest(snapshot, { kind: 'item', notificationId: 'noti-1' });
  assert.equal(opened.state.unreadCounts['direct-1'], 0);
  assert.ok(opened.state.notifications.every(item => item.read === true));
});

test('connects list taps and Android cold or warm roots to the shared notification router', () => {
  assert.match(notificationsScreenSource, /onOpenNotification:\s*\(item:\s*NotificationItem\)/);
  assert.match(notificationsScreenSource, /onOpenNotification\(item\)/);
  assert.doesNotMatch(notificationsScreenSource, /onOpenRoom/);
  assert.match(appSource, /Linking\.getInitialURL\(\)/);
  assert.match(appSource, /Linking\.addEventListener\('url'/);
  assert.match(appSource, /openNotificationRequest/);
  assert.match(appSource, /onOpenNotification=/);
  assert.match(snsScreenSource, /initialPostId\?:\s*string/);
  assert.match(snsScreenSource, /initialThreadId\?:\s*string/);
  assert.match(keepAliveSource, /snsgod:\/\/notifications/);
});

test('falls back for deleted or system-only targets instead of opening unrelated legacy fields', () => {
  const snapshot = state();
  assert.deepEqual(resolveNotificationRoute(snapshot, { target: { app: 'social', postId: 'deleted-post' } }), { name: 'notifications' });
  assert.deepEqual(resolveNotificationRoute(snapshot, { target: { app: 'call', characterId: 'deleted-character', roomId: 'direct-1' } }), { name: 'notifications' });
  assert.deepEqual(resolveNotificationRoute(snapshot, { target: { app: 'meeting', sessionId: 'deleted-meeting' } }), { name: 'notifications' });
  assert.deepEqual(resolveNotificationRoute(snapshot, { roomId: 'direct-1', target: { app: 'system' } }), { name: 'notifications' });
  assert.deepEqual(resolveNotificationRoute(snapshot, { roomId: 'direct-1' }), { name: 'chatRoom', roomId: 'direct-1' });
});
