import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

async function importPureTypeScript(relativePath) {
  const source = readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
  const transpiled = ts.transpileModule(source, {
    fileName: relativePath,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  assert.equal(transpiled.diagnostics?.length ?? 0, 0);
  return import(`data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`);
}

const {
  deleteCharacterCascade,
  deleteMessageCascade,
  deleteRoomCascade,
  deleteSnsDmThreadCascade,
  deleteSnsPostCascade,
} = await importPureTypeScript('src/logic/deletionCascadePolicy.ts');
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const stateHelpersSource = readFileSync(new URL('../src/logic/stateHelpers.ts', import.meta.url), 'utf8');
const randomChatSource = readFileSync(new URL('../src/logic/randomChat.ts', import.meta.url), 'utf8');
const chatListSource = readFileSync(new URL('../src/screens/ChatListScreen.tsx', import.meta.url), 'utf8');
const roomSettingsSource = readFileSync(new URL('../src/screens/RoomSettingsScreen.tsx', import.meta.url), 'utf8');
const groupSettingsSource = readFileSync(new URL('../src/screens/GroupRoomSettingsScreen.tsx', import.meta.url), 'utf8');
const chatRoomSource = readFileSync(new URL('../src/screens/ChatRoomScreen.tsx', import.meta.url), 'utf8');
const groupChatSource = readFileSync(new URL('../src/screens/GroupChatRoomScreen.tsx', import.meta.url), 'utf8');
const snsSource = readFileSync(new URL('../src/screens/SNSScreen.tsx', import.meta.url), 'utf8');

function character(id) {
  return { id, name: id };
}

function message(id, characterId, role = 'character', mediaData) {
  return { id, role, characterId, content: id, createdAt: 1, mediaData };
}

function baseState(overrides = {}) {
  return {
    config: {
      apiType: 'openai', apiProfiles: {}, userName: '나', userDescription: '', roomName: '', language: 'ko',
      serverMessaging: { outbox: [] },
    },
    characters: [character('character-1'), character('character-2'), character('character-3')],
    chatRooms: {
      'character-1': [{ id: 'room-1', characterId: 'character-1', name: '하나' }],
      'character-2': [{ id: 'room-2', characterId: 'character-2', name: '둘' }],
    },
    messages: {},
    unreadCounts: {},
    snsPosts: [],
    snsDmThreads: [],
    ...overrides,
  };
}

test('room deletion cascades through jobs, sessions, generated SNS, DM, notifications, and pointers', () => {
  const state = baseState({
    config: { ...baseState().config, serverMessaging: { outbox: [{ id: 'out-1', roomId: 'room-1', content: '', createdAt: 1 }, { id: 'out-2', roomId: 'room-2', content: '', createdAt: 1 }] } },
    messages: { 'room-1': [message('message-1', 'character-1')], 'room-2': [message('message-2', 'character-2')] },
    unreadCounts: { 'room-1': 2, 'room-2': 1 },
    pendingReplies: { 'room-1': { jobId: 'job-1', startedAt: 1 }, 'room-2': { jobId: 'job-2', startedAt: 1 } },
    roomSummaries: [{ id: 'summary-1', roomId: 'room-1', characterIds: ['character-1'] }, { id: 'summary-2', roomId: 'room-2', characterIds: ['character-2'] }],
    groupRoomSummaries: [{ id: 'group-summary-1', roomId: 'room-1', characterIds: ['character-1'] }],
    characterMemories: [{ id: 'memory-1', characterId: 'character-1', sourceRoomId: 'room-1', knownByCharacterIds: ['character-1'] }, { id: 'memory-2', characterId: 'character-2', sourceRoomId: 'room-2', knownByCharacterIds: ['character-2'] }],
    loreEntries: [{ id: 'lore-room', title: '', keys: [], content: '', roomId: 'room-1' }, { id: 'lore-other', title: '', keys: [], content: '', roomId: 'room-2' }],
    meetingEventSessions: [{ id: 'meeting-1', roomId: 'room-1' }, { id: 'meeting-2', roomId: 'room-2' }],
    activeMeetingEventId: 'meeting-1',
    snsPosts: [{ id: 'post-room', characterId: 'character-2', platform: 'instagram', content: '', createdAt: 1, generationRoomId: 'room-1' }, { id: 'post-other', characterId: 'character-2', platform: 'instagram', content: '', createdAt: 1 }],
    snsDmThreads: [{ id: 'thread-room', postId: 'post-room', characterId: 'character-2', title: '', messages: [], createdAt: 1 }, { id: 'thread-other', postId: 'post-other', characterId: 'character-2', title: '', messages: [], createdAt: 1 }],
    notifications: [
      { id: 'notification-room', type: 'chat', title: '', roomId: 'room-1', createdAt: 1 },
      { id: 'notification-target', type: 'sns', title: '', target: { postId: 'post-room', threadId: 'thread-room' }, createdAt: 1 },
      { id: 'notification-other', type: 'chat', title: '', roomId: 'room-2', createdAt: 1 },
    ],
    notificationEvents: {
      'event-room': { targetKind: 'room', targetId: 'room-1', receivedAt: 1 },
      'event-thread': { targetKind: 'snsdm', targetId: 'thread-room', receivedAt: 1 },
      'event-other': { targetKind: 'room', targetId: 'room-2', receivedAt: 1 },
    },
    datingApp: { requestStatus: 'accepted', acceptedRoomId: 'room-1', acceptedCharacterId: 'character-1', history: [{ id: 'history-1', finalProfileId: 'profile', finalProfile: {}, decisions: [], savedAt: 1, acceptedRoomId: 'room-1', acceptedCharacterId: 'character-1', requestStatus: 'accepted' }] },
    selectedRoomId: 'room-1',
  });

  const result = deleteRoomCascade(state, 'room-1');
  const next = result.state;

  assert.deepEqual(result.removedRoomIds, ['room-1']);
  assert.deepEqual(result.cancelledJobRoomIds, ['room-1']);
  assert.equal(next.chatRooms['character-1'].length, 0);
  assert.equal(next.messages['room-1'], undefined);
  assert.equal(next.unreadCounts['room-1'], undefined);
  assert.equal(next.pendingReplies['room-1'], undefined);
  assert.deepEqual(next.config.serverMessaging.outbox.map(item => item.id), ['out-2']);
  assert.deepEqual(next.meetingEventSessions.map(item => item.id), ['meeting-2']);
  assert.equal(next.activeMeetingEventId, undefined);
  assert.deepEqual(next.snsPosts.map(item => item.id), ['post-other']);
  assert.deepEqual(next.snsDmThreads.map(item => item.id), ['thread-other']);
  assert.deepEqual(next.notifications.map(item => item.id), ['notification-other']);
  assert.deepEqual(Object.keys(next.notificationEvents), ['event-other']);
  assert.equal(next.datingApp.acceptedRoomId, undefined);
  assert.equal(next.datingApp.acceptedCharacterId, undefined);
  assert.equal(next.datingApp.requestStatus, 'none');
  assert.equal(next.selectedRoomId, undefined);
  assert.deepEqual(next.loreEntries.map(item => item.id), ['lore-other']);
});

test('character deletion removes owned rooms and collapses undersized groups while preserving valid groups', () => {
  const state = baseState({
    groupRooms: [
      { id: 'group-small', name: '작은방', participantIds: ['character-1', 'character-2'], createdAt: 1 },
      { id: 'group-keep', name: '남는방', participantIds: ['character-1', 'character-2', 'character-3'], createdAt: 1 },
    ],
    randomChats: [{ id: 'random-1', name: '랜덤', type: 'random', characterId: 'character-1', character: character('character-1'), createdAt: 1 }],
    messages: {
      'room-1': [message('direct', 'character-1')],
      'room-2': [message('other', 'character-2')],
      'group-small': [message('small', 'character-1')],
      'group-keep': [message('removed-author', 'character-1', 'character', 'file:///media/removed.jpg'), message('kept-author', 'character-2')],
      'random-1': [message('random', 'character-1')],
    },
    unreadCounts: { 'room-1': 1, 'room-2': 1, 'group-small': 1, 'group-keep': 1, 'random-1': 1 },
    pendingReplies: { 'room-1': { jobId: 'one', startedAt: 1 }, 'group-small': { jobId: 'two', startedAt: 1 }, 'group-keep': { jobId: 'three', startedAt: 1 }, 'random-1': { jobId: 'four', startedAt: 1 } },
    characterEvents: [{ id: 'event-1', characterId: 'character-1' }, { id: 'event-2', characterId: 'character-2' }],
    loreEntries: [{ id: 'lore-1', title: '', keys: [], content: '', characterId: 'character-1' }, { id: 'lore-2', title: '', keys: [], content: '', characterId: 'character-2' }],
    snsPosts: [{ id: 'post-1', characterId: 'character-1', platform: 'instagram', content: '', createdAt: 1 }, { id: 'post-2', characterId: 'character-2', platform: 'instagram', content: '', createdAt: 1 }],
    snsDmThreads: [{ id: 'thread-1', postId: 'post-1', characterId: 'character-1', title: '', messages: [], createdAt: 1 }, { id: 'thread-2', postId: 'post-2', characterId: 'character-2', title: '', messages: [], createdAt: 1 }],
    meetingEventSessions: [
      { id: 'meeting-direct', roomId: 'room-1', characterId: 'character-1' },
      { id: 'meeting-group', roomId: 'group-keep', participantCharacterIds: ['character-1', 'character-2'] },
      { id: 'meeting-other', roomId: 'room-2', characterId: 'character-2' },
    ],
    activeMeetingEventId: 'meeting-group',
    notifications: [{ id: 'notification-target', type: 'sns', title: '', target: { characterId: 'character-1', postId: 'post-1', threadId: 'thread-1' }, createdAt: 1 }, { id: 'notification-other', type: 'chat', title: '', characterId: 'character-2', roomId: 'room-2', createdAt: 1 }],
    sumGod: { characterId: 'character-1', view: 'today', questionOpen: false, entries: [], characterArchives: [{ id: 'archive-1', characterId: 'character-1', archivedAt: 1, entries: [] }, { id: 'archive-2', characterId: 'character-2', archivedAt: 1, entries: [] }] },
    datingApp: { requestStatus: 'accepted', acceptedRoomId: 'room-1', acceptedCharacterId: 'character-1' },
  });

  const result = deleteCharacterCascade(state, 'character-1');
  const next = result.state;

  assert.deepEqual(next.characters.map(item => item.id), ['character-2', 'character-3']);
  assert.deepEqual(new Set(result.removedRoomIds), new Set(['room-1', 'group-small', 'random-1']));
  assert.deepEqual(new Set(result.cancelledJobRoomIds), new Set(['room-1', 'group-small', 'group-keep', 'random-1']));
  assert.deepEqual(next.groupRooms.map(item => [item.id, item.participantIds]), [['group-keep', ['character-2', 'character-3']]]);
  assert.deepEqual(next.messages['group-keep'].map(item => item.id), ['kept-author']);
  assert.equal(next.pendingReplies['group-keep'], undefined);
  assert.deepEqual(next.snsPosts.map(item => item.id), ['post-2']);
  assert.deepEqual(next.snsDmThreads.map(item => item.id), ['thread-2']);
  assert.deepEqual(next.meetingEventSessions.map(item => item.id), ['meeting-other']);
  assert.equal(next.activeMeetingEventId, undefined);
  assert.deepEqual(next.characterEvents.map(item => item.id), ['event-2']);
  assert.deepEqual(next.loreEntries.map(item => item.id), ['lore-2']);
  assert.deepEqual(next.notifications.map(item => item.id), ['notification-other']);
  assert.equal(next.sumGod.characterId, '');
  assert.deepEqual(next.sumGod.characterArchives.map(item => item.id), ['archive-2']);
  assert.equal(next.datingApp.requestStatus, 'none');
});

test('deleting the latest user message cancels its pending reply and pending meeting shell', () => {
  const state = baseState({
    messages: { room: [message('old-user', undefined, 'user'), { ...message('latest-user', undefined, 'user', 'file:///media/message.jpg'), meetingEventId: 'meeting-pending' }] },
    pendingReplies: { room: { jobId: 'job', sourceMessageId: 'latest-user', startedAt: 1, updatedAt: 1, phase: 'delay' } },
    meetingEventSessions: [{ id: 'meeting-pending', roomId: 'room', status: 'pending' }, { id: 'meeting-ended', roomId: 'room', status: 'ended' }],
    activeMeetingEventId: 'meeting-pending',
  });
  const result = deleteMessageCascade(state, 'room', 'latest-user');
  assert.deepEqual(result.state.messages.room.map(item => item.id), ['old-user']);
  assert.equal(result.state.pendingReplies.room.phase, 'cancelled');
  assert.equal(result.state.pendingReplies.room.failureReason, 'source-message-deleted');
  assert.deepEqual(result.cancelledJobRoomIds, ['room']);
  assert.deepEqual(result.state.meetingEventSessions.map(item => item.id), ['meeting-ended']);
  assert.equal(result.state.activeMeetingEventId, undefined);
});

test('deleting an older message preserves the current pending reply job', () => {
  const state = baseState({
    messages: { room: [message('old-user', undefined, 'user'), message('latest-user', undefined, 'user')] },
    pendingReplies: { room: { jobId: 'job', sourceMessageId: 'latest-user', startedAt: 1, updatedAt: 1, phase: 'delay' } },
  });
  const result = deleteMessageCascade(state, 'room', 'old-user');
  assert.equal(result.state.pendingReplies.room.jobId, 'job');
  assert.deepEqual(result.cancelledJobRoomIds, []);
});

test('SNS post and DM deletion clear all derivative threads, embedded copies, and notification targets', () => {
  const state = baseState({
    snsPosts: [
      { id: 'post-1', characterId: 'character-1', platform: 'instagram', content: '', createdAt: 1, dms: [{ id: 'dm-1', title: '', messages: [] }, { id: 'dm-2', title: '', messages: [] }] },
      { id: 'post-2', characterId: 'character-2', platform: 'instagram', content: '', createdAt: 1 },
    ],
    snsDmThreads: [
      { id: 'thread-1', postId: 'post-1', characterId: 'character-1', title: '', messages: [], createdAt: 1 },
      { id: 'postdmthread:post-1:dm-2', postId: 'post-1', characterId: 'character-1', title: '', messages: [], createdAt: 1 },
      { id: 'thread-2', postId: 'post-2', characterId: 'character-2', title: '', messages: [], createdAt: 1 },
    ],
    notifications: [
      { id: 'post-notification', type: 'sns', title: '', target: { postId: 'post-1' }, createdAt: 1 },
      { id: 'thread-notification', type: 'snsdm', title: '', target: { threadId: 'thread-1' }, createdAt: 1 },
      { id: 'other-notification', type: 'sns', title: '', target: { postId: 'post-2' }, createdAt: 1 },
    ],
  });

  const afterThread = deleteSnsDmThreadCascade(state, 'postdmthread:post-1:dm-2').state;
  assert.deepEqual(afterThread.snsPosts[0].dms.map(item => item.id), ['dm-1']);
  assert.deepEqual(afterThread.snsDmThreads.map(item => item.id), ['thread-1', 'thread-2']);

  const afterPost = deleteSnsPostCascade(afterThread, 'post-1').state;
  assert.deepEqual(afterPost.snsPosts.map(item => item.id), ['post-2']);
  assert.deepEqual(afterPost.snsDmThreads.map(item => item.id), ['thread-2']);
  assert.deepEqual(afterPost.notifications.map(item => item.id), ['other-notification']);
});

test('cascade checks both direct and target notification ownership fields', () => {
  const state = baseState({
    notifications: [
      { id: 'mixed-character', type: 'chat', title: '', characterId: 'character-2', target: { characterId: 'character-1' }, createdAt: 1 },
      { id: 'mixed-room', type: 'chat', title: '', roomId: 'room-2', target: { roomId: 'room-1' }, createdAt: 1 },
      { id: 'other', type: 'chat', title: '', characterId: 'character-2', roomId: 'room-2', createdAt: 1 },
    ],
  });
  assert.deepEqual(
    deleteCharacterCascade(state, 'character-1').state.notifications.map(item => item.id),
    ['other'],
  );
  assert.deepEqual(
    deleteRoomCascade(state, 'room-1').state.notifications.map(item => item.id),
    ['mixed-character', 'other'],
  );
});

test('all user-facing deletion paths delegate to the central cascade and cancel affected jobs', () => {
  assert.match(stateHelpersSource, /deleteRoomCascade\(state, roomId\)\.state/);
  assert.match(stateHelpersSource, /deleteCharacterCascade\(state, characterId\)\.state/);
  assert.match(randomChatSource, /deleteRoomCascade\(state, roomId\)\.state/);
  assert.match(chatListSource, /deleteRoomCascade\(state, row\.room\.id\)/);
  assert.match(roomSettingsSource, /deleteRoomCascade\(state, roomId\)/);
  assert.match(groupSettingsSource, /deleteRoomCascade\(state, roomId\)/);
  assert.match(chatRoomSource, /deleteMessageCascade\(current, roomId, messageId\)/);
  assert.match(groupChatSource, /deleteMessageCascade\(current, roomId, messageId\)/);
  assert.match(snsSource, /deleteSnsPostCascade\(state, postId\)\.state/);
  assert.match(snsSource, /deleteSnsDmThreadCascade\(state, threadId\)\.state/);
  assert.match(appSource, /for \(const roomId of deletion\.cancelledJobRoomIds\) cancelChatJob\(roomId\)/);
  assert.match(appSource, /async function leaveRandomRoom[\s\S]*?deleteRoomCascade\(current, roomId\)[\s\S]*?cancelChatJob\(affectedRoomId\)/);
});
