import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

async function importNotifications() {
  const source = readFileSync(new URL('../src/logic/notifications.ts', import.meta.url), 'utf8')
    .replace("import { makeId } from './ids';", "let testId = 0; const makeId = prefix => `${prefix}_${++testId}`;");
  const transpiled = ts.transpileModule(source, {
    fileName: 'src/logic/notifications.ts',
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  assert.equal(transpiled.diagnostics?.length ?? 0, 0);
  return import(`data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`);
}

const {
  markNotificationItemsRead,
  notifyRoomMessage,
  notifySnsDmMessages,
  reconcileNotificationEvents,
} = await importNotifications();
const staleMergeSource = readFileSync(new URL('../src/logic/staleStateMergePolicy.ts', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const automationSource = readFileSync(new URL('../src/logic/automation.ts', import.meta.url), 'utf8');
const notificationsScreenSource = readFileSync(new URL('../src/screens/NotificationsScreen.tsx', import.meta.url), 'utf8');

function state(overrides = {}) {
  return {
    config: {},
    characters: [{ id: 'character-1', name: 'Character' }],
    chatRooms: { 'character-1': [{ id: 'room-1', characterId: 'character-1' }] },
    messages: {},
    unreadCounts: {},
    snsPosts: [],
    snsDmThreads: [{
      id: 'thread-1',
      characterId: 'character-1',
      title: 'DM',
      messages: [],
      createdAt: 1,
      unread: 0,
    }],
    notifications: [],
    notificationEvents: {},
    ...overrides,
  };
}

test('reapplying one room event is idempotent across a serialized restart', () => {
  const input = {
    roomId: 'room-1',
    characterId: 'character-1',
    title: 'Character',
    body: 'hello',
    app: 'messenger',
    eventIds: ['room:room-1:message-1'],
    createdAt: Date.now(),
  };
  const once = notifyRoomMessage(state(), input);
  const restarted = JSON.parse(JSON.stringify(once));
  const twice = notifyRoomMessage(restarted, input);

  assert.deepEqual(twice, restarted);
  assert.equal(twice.unreadCounts['room-1'], 1);
  assert.equal(twice.notifications.length, 1);
  assert.equal(twice.notifications[0].count, 1);
});

test('collapsed unique room events increase unread and count by actual messages only', () => {
  const createdAt = Date.now();
  const next = notifyRoomMessage(state(), {
    roomId: 'room-1',
    characterId: 'character-1',
    title: 'Character',
    body: 'second',
    app: 'messenger',
    eventIds: ['room:room-1:message-1', 'room:room-1:message-2'],
    createdAt,
  });

  assert.equal(next.unreadCounts['room-1'], 2);
  assert.equal(next.notifications.length, 1);
  assert.equal(next.notifications[0].count, 2);
  assert.deepEqual(next.notifications[0].eventIds.sort(), [
    'room:room-1:message-1',
    'room:room-1:message-2',
  ]);
});

test('an integration unread floor does not add the same new message twice', () => {
  const next = notifyRoomMessage(state({ unreadCounts: { 'room-1': 1 } }), {
    roomId: 'room-1',
    characterId: 'character-1',
    title: 'Character',
    app: 'messenger',
    eventIds: ['room:room-1:message-1'],
    unreadFloor: 1,
    createdAt: Date.now(),
  });
  assert.equal(next.unreadCounts['room-1'], 1);
});

test('reconciliation restores distinct stale events and removes duplicate notifications', () => {
  const createdAt = Date.now();
  const first = notifyRoomMessage(state(), {
    roomId: 'room-1', characterId: 'character-1', title: 'Character', app: 'messenger',
    eventIds: ['room:room-1:message-1'], createdAt,
  });
  const second = notifyRoomMessage(state(), {
    roomId: 'room-1', characterId: 'character-1', title: 'Character', app: 'messenger',
    eventIds: ['room:room-1:message-2'], createdAt: createdAt + 1,
  });
  const duplicate = { ...first.notifications[0], id: 'duplicate-notification' };
  const candidate = {
    ...first,
    unreadCounts: { 'room-1': 1 },
    notificationEvents: { ...first.notificationEvents, ...second.notificationEvents },
    notifications: [...first.notifications, ...second.notifications, duplicate],
  };
  const reconciled = reconcileNotificationEvents(candidate);

  assert.equal(reconciled.unreadCounts['room-1'], 2);
  assert.equal(reconciled.notifications.length, 2);
  assert.equal(reconciled.notifications.reduce((sum, item) => sum + item.count, 0), 2);
});

test('stale state merge runs notification event reconciliation', () => {
  assert.match(staleMergeSource, /reconcileNotificationEvents/);
});

test('reading a room notification clears related unread, notifications, and receipts atomically', () => {
  const received = notifyRoomMessage(state(), {
    roomId: 'room-1', characterId: 'character-1', title: 'Character', app: 'messenger',
    eventIds: ['room:room-1:message-1', 'room:room-1:message-2'], createdAt: Date.now(),
  });
  const read = markNotificationItemsRead(received, [received.notifications[0].id], Date.now() + 10);

  assert.equal(read.unreadCounts['room-1'], 0);
  assert.ok(read.notifications.every(item => item.roomId !== 'room-1' || item.read === true));
  assert.ok(Object.values(read.notificationEvents).every(event => event.targetId !== 'room-1' || event.readAt));
});

test('SNS DM events share the same replay and read transaction semantics', () => {
  const input = {
    threadId: 'thread-1',
    characterId: 'character-1',
    title: 'Character DM',
    body: 'hello',
    eventIds: ['snsdm:thread-1:message-1'],
    createdAt: Date.now(),
  };
  const once = notifySnsDmMessages(state(), input);
  const twice = notifySnsDmMessages(once, input);
  assert.deepEqual(twice, once);
  assert.equal(once.snsDmThreads[0].unread, 1);
  assert.equal(once.notifications[0].target.threadId, 'thread-1');

  const read = markNotificationItemsRead(once, [once.notifications[0].id], Date.now() + 10);
  assert.equal(read.snsDmThreads[0].unread, 0);
  assert.equal(read.notifications[0].read, true);
});

test('an SNS DM integration floor does not add pre-counted messages twice', () => {
  const next = notifySnsDmMessages(state({
    snsDmThreads: [{
      id: 'thread-1', characterId: 'character-1', title: 'DM', messages: [], createdAt: 1, unread: 2,
    }],
  }), {
    threadId: 'thread-1',
    characterId: 'character-1',
    title: 'Character DM',
    eventIds: ['snsdm:thread-1:message-1', 'snsdm:thread-1:message-2'],
    unreadFloor: 2,
    createdAt: Date.now(),
  });
  assert.equal(next.snsDmThreads[0].unread, 2);
});

test('the durable event ledger stays bounded without dropping unread receipts', () => {
  const notificationEvents = Object.fromEntries(Array.from({ length: 2105 }, (_, index) => [
    `read-${index}`,
    { targetKind: 'notification', targetId: 'old', receivedAt: index + 1, readAt: index + 2 },
  ]));
  notificationEvents.unread = { targetKind: 'room', targetId: 'room-1', receivedAt: 9999 };
  const next = reconcileNotificationEvents(state({ notificationEvents }));

  assert.ok(Object.keys(next.notificationEvents).length <= 2000);
  assert.deepEqual(next.notificationEvents.unread, notificationEvents.unread);
});

test('message, SNS DM, automation, and list-read producers use the event transaction', () => {
  assert.match(appSource, /notifyRoomMessage/);
  assert.match(appSource, /notifySnsDmMessages/);
  assert.match(appSource, /roomNotificationEventId\(roomId, message\.id\)/);
  assert.match(appSource, /snsDmNotificationEventId\(thread\.id, message\.id\)/);
  assert.match(automationSource, /eventIds:\s*deliveredEventIds/);
  assert.match(notificationsScreenSource, /markNotificationItemsRead\(state, \[\.\.\.visibleIds\]\)/);
});
