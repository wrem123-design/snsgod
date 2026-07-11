import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function typescriptDataUrl(source, fileName) {
  const transpiled = ts.transpileModule(source, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  assert.equal(transpiled.diagnostics?.length ?? 0, 0);
  return `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`;
}

const notificationsModuleUrl = typescriptDataUrl(
  readFileSync(new URL('../src/logic/notifications.ts', import.meta.url), 'utf8')
    .replace("import { makeId } from './ids';", "let testId = 0; const makeId = prefix => `${prefix}_${++testId}`;"),
  'src/logic/notifications.ts',
);

async function importPureTypeScript(relativePath) {
  const source = readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8')
    .replace("from './notifications';", `from '${notificationsModuleUrl}';`);
  return import(typescriptDataUrl(source, relativePath));
}

const {
  hasSameServerEndpoint,
  hasSameServerIdentity,
  mergeChangedIdentifiedArray,
  mergeServerConnectionResult,
  mergeStaleState,
} = await importPureTypeScript('src/logic/staleStateMergePolicy.ts');
const { withServerConnectionSettings } = await importPureTypeScript('src/logic/serverConnectionPolicy.ts');
const { canCommitRuntimeEpoch } = await importPureTypeScript('src/logic/runtimeEpochPolicy.ts');
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const referenceFaceSource = readFileSync(new URL('../src/screens/ReferenceFaceScreen.tsx', import.meta.url), 'utf8');
const datingAppSource = readFileSync(new URL('../src/screens/DatingAppScreen.tsx', import.meta.url), 'utf8');
const debugScreenSource = readFileSync(new URL('../src/screens/DebugScreen.tsx', import.meta.url), 'utf8');
const replyEngineSource = readFileSync(new URL('../src/logic/replyEngine.ts', import.meta.url), 'utf8');
const groupChatSource = readFileSync(new URL('../src/screens/GroupChatRoomScreen.tsx', import.meta.url), 'utf8');
const settingsScreenSource = readFileSync(new URL('../src/screens/SettingsScreen.tsx', import.meta.url), 'utf8');
const roomSettingsSource = readFileSync(new URL('../src/screens/RoomSettingsScreen.tsx', import.meta.url), 'utf8');
const newCharacterSource = readFileSync(new URL('../src/screens/NewCharacterScreen.tsx', import.meta.url), 'utf8');
const characterSettingsSource = readFileSync(new URL('../src/screens/CharacterSettingsScreen.tsx', import.meta.url), 'utf8');
const snsScreenSource = readFileSync(new URL('../src/screens/SNSScreen.tsx', import.meta.url), 'utf8');
const randomChatSource = readFileSync(new URL('../src/screens/RandomChatScreen.tsx', import.meta.url), 'utf8');
const blindDateSource = readFileSync(new URL('../src/screens/BlindDateScreen.tsx', import.meta.url), 'utf8');
const worldcupSource = readFileSync(new URL('../src/screens/IdealWorldcupScreen.tsx', import.meta.url), 'utf8');
const datingLogicSource = readFileSync(new URL('../src/logic/datingApp.ts', import.meta.url), 'utf8');
const sumGodSource = readFileSync(new URL('../src/logic/sumgod.ts', import.meta.url), 'utf8');
const sumGodScreenSource = readFileSync(new URL('../src/screens/SumGodScreen.tsx', import.meta.url), 'utf8');

function baseState(overrides = {}) {
  return {
    __revision: 1,
    config: {
      theme: 'light',
      serverMessaging: { deviceToken: 'old-token', syncCursor: 1 },
    },
    characters: [{ id: 'character-1', name: 'A', avatar: 'data:image/jpeg;base64,b2xk' }],
    messages: {
      room: [{ id: 'message-1', role: 'user', content: 'first', createdAt: 1 }],
    },
    referenceFaceSlots: [{ id: 'reference-1', image: 'data:image/jpeg;base64,cmVm', createdAt: 1 }],
    userStickers: [
      { id: 'sticker-a', name: 'A', data: 'file:///a' },
      { id: 'sticker-b', name: 'B', data: 'file:///b' },
    ],
    snsPosts: [],
    snsDmThreads: [],
    meetingEventSessions: [],
    unreadCounts: {},
    chatRooms: {},
    ...overrides,
  };
}

test('concurrent notification receipts restore the exact unread total after stale merge', () => {
  const base = baseState({ unreadCounts: { room: 0 }, notifications: [], notificationEvents: {} });
  const latest = {
    ...base,
    unreadCounts: { room: 1 },
    notificationEvents: {
      'room:room:message-1': { targetKind: 'room', targetId: 'room', receivedAt: 2 },
    },
    notifications: [{
      id: 'notification-1', type: 'chat', title: 'one', roomId: 'room',
      eventIds: ['room:room:message-1'], count: 1, createdAt: 2,
    }],
  };
  const incoming = {
    ...base,
    unreadCounts: { room: 1 },
    notificationEvents: {
      'room:room:message-2': { targetKind: 'room', targetId: 'room', receivedAt: 3 },
    },
    notifications: [{
      id: 'notification-2', type: 'chat', title: 'two', roomId: 'room',
      eventIds: ['room:room:message-2'], count: 1, createdAt: 3,
    }],
  };

  const merged = mergeStaleState(latest, base, incoming);
  assert.equal(merged.unreadCounts.room, 2);
  assert.equal(merged.notifications.length, 2);
  assert.equal(Object.keys(merged.notificationEvents).length, 2);
});

test('a stale settings result preserves newer server state, messages, media patches, and deletions', () => {
  const base = baseState();
  const latest = {
    ...base,
    __revision: 3,
    config: {
      ...base.config,
      serverMessaging: { deviceToken: 'new-token', syncCursor: 9 },
    },
    characters: [{ ...base.characters[0], avatar: 'file:///media/canonical.jpg' }],
    messages: {
      room: [
        ...base.messages.room,
        { id: 'message-2', role: 'character', content: 'new', createdAt: 2 },
      ],
    },
    referenceFaceSlots: [],
  };
  const incoming = {
    ...base,
    config: { ...base.config, theme: 'dark' },
  };

  const merged = mergeStaleState(latest, base, incoming);

  assert.equal(merged.__revision, 3);
  assert.equal(merged.config.theme, 'dark');
  assert.equal(merged.config.serverMessaging.deviceToken, 'new-token');
  assert.equal(merged.config.serverMessaging.syncCursor, 9);
  assert.deepEqual(merged.messages.room.map(message => message.id), ['message-1', 'message-2']);
  assert.equal(merged.characters[0].avatar, 'file:///media/canonical.jpg');
  assert.deepEqual(merged.referenceFaceSlots, []);
});

test('a stale async result can add its own message without dropping a concurrent message', () => {
  const base = baseState();
  const latest = {
    ...base,
    __revision: 2,
    messages: {
      room: [
        ...base.messages.room,
        { id: 'message-live', role: 'character', content: 'live', createdAt: 2 },
      ],
    },
  };
  const incoming = {
    ...base,
    messages: {
      room: [
        ...base.messages.room,
        { id: 'message-async', role: 'system', content: 'async', createdAt: 3 },
      ],
    },
  };

  const merged = mergeStaleState(latest, base, incoming);

  assert.deepEqual(
    merged.messages.room.map(message => message.id),
    ['message-1', 'message-live', 'message-async'],
  );
});

test('incoming deletion and concurrent addition are both preserved in identified arrays', () => {
  const base = baseState();
  const latest = {
    ...base,
    __revision: 2,
    userStickers: [
      ...base.userStickers,
      { id: 'sticker-c', name: 'C', data: 'file:///c' },
    ],
  };
  const incoming = {
    ...base,
    userStickers: base.userStickers.filter(sticker => sticker.id !== 'sticker-a'),
  };

  const merged = mergeStaleState(latest, base, incoming);

  assert.deepEqual(merged.userStickers.map(sticker => sticker.id), ['sticker-b', 'sticker-c']);
});

test('an incoming edit never resurrects an entity deleted from the latest state', () => {
  const base = baseState();
  const latest = { ...base, __revision: 2, referenceFaceSlots: [] };
  const incoming = {
    ...base,
    referenceFaceSlots: [{ ...base.referenceFaceSlots[0], image: 'file:///replacement.jpg' }],
  };

  const merged = mergeStaleState(latest, base, incoming);

  assert.deepEqual(merged.referenceFaceSlots, []);
});

test('different fields changed concurrently on one entity are merged', () => {
  const base = baseState();
  const latest = {
    ...base,
    __revision: 2,
    characters: [{ ...base.characters[0], avatar: 'file:///latest-avatar.jpg' }],
  };
  const incoming = {
    ...base,
    characters: [{ ...base.characters[0], name: 'Renamed' }],
  };

  const merged = mergeStaleState(latest, base, incoming);

  assert.equal(merged.characters[0].name, 'Renamed');
  assert.equal(merged.characters[0].avatar, 'file:///latest-avatar.jpg');
});

test('background conflict mode keeps current same-field edits and applies independent changes', () => {
  const base = baseState({
    characters: [{ ...baseState().characters[0], tone: 'old', memories: [] }],
  });
  const latest = {
    ...base,
    __revision: 2,
    characters: [{ ...base.characters[0], tone: 'manual' }],
  };
  const incoming = {
    ...base,
    characters: [{ ...base.characters[0], tone: 'generated', memories: ['fact'] }],
  };

  const merged = mergeStaleState(latest, base, incoming, { conflict: 'latest' });

  assert.equal(merged.characters[0].tone, 'manual');
  assert.deepEqual(merged.characters[0].memories, ['fact']);
});

test('background conflict mode keeps a current field when stale output omits it', () => {
  const base = baseState({
    characters: [{ ...baseState().characters[0], note: 'old', memories: [] }],
  });
  const latest = {
    ...base,
    __revision: 2,
    characters: [{ ...base.characters[0], note: 'manual' }],
  };
  const incomingCharacter = { ...base.characters[0], memories: ['fact'] };
  delete incomingCharacter.note;
  const incoming = { ...base, characters: [incomingCharacter] };

  const merged = mergeStaleState(latest, base, incoming, { conflict: 'latest' });

  assert.equal(merged.characters[0].note, 'manual');
  assert.deepEqual(merged.characters[0].memories, ['fact']);
});

test('a deep-cloned unchanged primitive array does not erase a concurrent addition', () => {
  const base = baseState({
    characters: [{
      ...baseState().characters[0],
      tone: 'calm',
      memoryPartition: { facts: ['likes tea'] },
      profileReferenceImages: ['file:///reference-a.jpg'],
    }],
  });
  const latest = {
    ...base,
    __revision: 2,
    characters: [{
      ...base.characters[0],
      memoryPartition: { facts: ['likes tea', 'called today'] },
      profileReferenceImages: ['file:///reference-a.jpg', 'file:///reference-live.jpg'],
    }],
  };
  const incoming = {
    ...base,
    characters: [{
      ...base.characters[0],
      tone: 'bright',
      memoryPartition: { facts: [...base.characters[0].memoryPartition.facts] },
      profileReferenceImages: [...base.characters[0].profileReferenceImages],
    }],
  };

  const merged = mergeStaleState(latest, base, incoming);

  assert.equal(merged.characters[0].tone, 'bright');
  assert.deepEqual(merged.characters[0].memoryPartition.facts, ['likes tea', 'called today']);
  assert.deepEqual(merged.characters[0].profileReferenceImages, [
    'file:///reference-a.jpg',
    'file:///reference-live.jpg',
  ]);
});

test('duplicate legacy memories do not make a concurrent manual fact disappear', () => {
  const base = baseState({
    characters: [{ ...baseState().characters[0], memories: ['same', 'same'] }],
  });
  const latest = {
    ...base,
    __revision: 2,
    characters: [{
      ...base.characters[0],
      memories: ['same', 'same', 'automation fact'],
    }],
  };
  const incoming = {
    ...base,
    characters: [{
      ...base.characters[0],
      memories: ['same', 'same', 'manual fact'],
    }],
  };

  const merged = mergeStaleState(latest, base, incoming);

  assert.deepEqual(merged.characters[0].memories, [
    'same',
    'automation fact',
    'manual fact',
  ]);
});

test('a deliberate profile reference replacement wins over canonicalization of the old slot', () => {
  const base = baseState({
    characters: [{
      ...baseState().characters[0],
      profileReferenceImage: 'data:image/jpeg;base64,b2xk',
      profileReferenceImages: ['data:image/jpeg;base64,b2xk'],
    }],
  });
  const latest = {
    ...base,
    __revision: 2,
    characters: [{
      ...base.characters[0],
      profileReferenceImage: 'file:///canonical-old.jpg',
      profileReferenceImages: ['file:///canonical-old.jpg'],
    }],
  };
  const incoming = {
    ...base,
    characters: [{
      ...base.characters[0],
      profileReferenceImage: 'file:///new-reference.jpg',
      profileReferenceImages: ['file:///new-reference.jpg'],
    }],
  };

  const merged = mergeStaleState(latest, base, incoming);

  assert.equal(merged.characters[0].profileReferenceImage, 'file:///new-reference.jpg');
  assert.deepEqual(merged.characters[0].profileReferenceImages, ['file:///new-reference.jpg']);
});

test('server sync progress stays monotonic when stale settings finish later', () => {
  const base = baseState();
  const latest = {
    ...base,
    __revision: 2,
    config: {
      ...base.config,
      serverMessaging: {
        ...base.config.serverMessaging,
        syncCursor: 12,
        lastSyncAt: 1200,
      },
    },
  };
  const incoming = {
    ...base,
    config: {
      ...base.config,
      theme: 'dark',
      serverMessaging: {
        ...base.config.serverMessaging,
        syncCursor: 7,
        lastSyncAt: 700,
      },
    },
  };

  const merged = mergeStaleState(latest, base, incoming);

  assert.equal(merged.config.theme, 'dark');
  assert.equal(merged.config.serverMessaging.syncCursor, 12);
  assert.equal(merged.config.serverMessaging.lastSyncAt, 1200);
});

test('equivalent server URLs with trailing slash differences share monotonic progress', () => {
  const base = baseState({
    config: {
      theme: 'light',
      serverMessaging: {
        enabled: true,
        baseUrl: 'https://server.example/',
        deviceId: 'device',
        syncCursor: 1,
        lastSyncAt: 100,
      },
    },
  });
  const latest = {
    ...base,
    __revision: 2,
    config: {
      ...base.config,
      serverMessaging: {
        ...base.config.serverMessaging,
        syncCursor: 12,
        lastSyncAt: 1200,
      },
    },
  };
  const incoming = {
    ...base,
    config: {
      ...base.config,
      serverMessaging: {
        ...base.config.serverMessaging,
        baseUrl: 'https://server.example',
        syncCursor: 7,
        lastSyncAt: 700,
      },
    },
  };

  const merged = mergeStaleState(latest, base, incoming);

  assert.equal(merged.config.serverMessaging.syncCursor, 12);
  assert.equal(merged.config.serverMessaging.lastSyncAt, 1200);
  assert.equal(hasSameServerIdentity(latest, incoming), true);
});

test('server endpoint comparison ignores registration details and trailing slashes', () => {
  const first = baseState({
    config: {
      theme: 'light',
      serverMessaging: {
        baseUrl: 'https://server.example/',
        deviceId: 'device-one',
      },
    },
  });
  const sameEndpoint = baseState({
    config: {
      theme: 'light',
      serverMessaging: {
        baseUrl: 'https://server.example',
        deviceId: 'device-two',
      },
    },
  });
  const differentEndpoint = baseState({
    config: {
      theme: 'light',
      serverMessaging: {
        baseUrl: 'https://other.example',
        deviceId: 'device-one',
      },
    },
  });

  assert.equal(hasSameServerEndpoint(first, sameEndpoint), true);
  assert.equal(hasSameServerEndpoint(first, differentEndpoint), false);
});

test('server connection completions reject endpoint ABA, newer requests, and stale device identities', () => {
  const requested = baseState({
    config: {
      theme: 'light',
      serverMessaging: {
        baseUrl: 'https://server-a.example',
        connectionRequestId: 'request-a',
      },
    },
  });
  const registered = {
    ...requested,
    config: {
      ...requested.config,
      serverMessaging: {
        ...requested.config.serverMessaging,
        deviceId: 'device-a',
        deviceToken: 'token-a',
      },
    },
  };
  const returnedToOldEndpoint = baseState({
    config: {
      theme: 'light',
      serverMessaging: {
        baseUrl: 'https://old.example',
        connectionRequestId: 'request-new',
      },
    },
  });
  const sameEndpointNewRequest = {
    ...requested,
    config: {
      ...requested.config,
      serverMessaging: {
        ...requested.config.serverMessaging,
        connectionRequestId: 'request-new',
      },
    },
  };
  const newerDevice = {
    ...registered,
    config: {
      ...registered.config,
      serverMessaging: {
        ...registered.config.serverMessaging,
        deviceId: 'device-new',
        deviceToken: 'token-new',
      },
    },
  };

  assert.strictEqual(
    mergeServerConnectionResult(returnedToOldEndpoint, requested, registered, 'request-a'),
    returnedToOldEndpoint,
  );
  assert.strictEqual(
    mergeServerConnectionResult(sameEndpointNewRequest, requested, registered, 'request-a'),
    sameEndpointNewRequest,
  );
  assert.strictEqual(
    mergeServerConnectionResult(newerDevice, requested, registered, 'request-a', { requireIdentity: true }),
    newerDevice,
  );
  assert.equal(
    mergeServerConnectionResult(requested, requested, registered, 'request-a').config.serverMessaging.deviceId,
    'device-a',
  );
});

test('concurrent creation of one optional object merges fields from both results', () => {
  const base = baseState({ config: { theme: 'light' } });
  const latest = {
    ...base,
    __revision: 2,
    config: {
      ...base.config,
      serverMessaging: { pushToken: 'FCM-LIVE' },
    },
  };
  const incoming = {
    ...base,
    config: {
      ...base.config,
      serverMessaging: { enabled: true, baseUrl: 'https://server.example' },
    },
  };

  const merged = mergeStaleState(latest, base, incoming);

  assert.equal(merged.config.serverMessaging.pushToken, 'FCM-LIVE');
  assert.equal(merged.config.serverMessaging.enabled, true);
  assert.equal(merged.config.serverMessaging.baseUrl, 'https://server.example');
});

test('changing server identity never carries progress or credentials from the old server', () => {
  const base = baseState({
    config: {
      theme: 'light',
      serverMessaging: {
        enabled: true,
        baseUrl: 'https://old.example',
        deviceId: 'old-device',
        deviceToken: 'old-token',
        syncCursor: 1,
        lastSyncAt: 100,
      },
    },
  });
  const latest = {
    ...base,
    __revision: 2,
    config: {
      ...base.config,
      serverMessaging: {
        ...base.config.serverMessaging,
        syncCursor: 12,
        lastSyncAt: 1200,
      },
    },
  };
  const incoming = {
    ...base,
    config: {
      ...base.config,
      serverMessaging: {
        enabled: true,
        baseUrl: 'https://new.example',
        pairingSecret: 'new-secret',
        syncCursor: 0,
      },
    },
  };

  const merged = mergeStaleState(latest, base, incoming);

  assert.equal(merged.config.serverMessaging.baseUrl, 'https://new.example');
  assert.equal(merged.config.serverMessaging.deviceId, undefined);
  assert.equal(merged.config.serverMessaging.deviceToken, undefined);
  assert.equal(merged.config.serverMessaging.syncCursor, 0);
  assert.equal(merged.config.serverMessaging.lastSyncAt, undefined);
});

test('the current registration wins when two async registrations finish out of order', () => {
  const base = baseState({
    config: {
      theme: 'light',
      serverMessaging: { enabled: true, baseUrl: 'https://server.example' },
    },
  });
  const latest = {
    ...base,
    __revision: 2,
    config: {
      ...base.config,
      serverMessaging: {
        ...base.config.serverMessaging,
        deviceId: 'device-current',
        deviceToken: 'token-current',
        syncCursor: 10,
      },
    },
  };
  const incoming = {
    ...base,
    config: {
      ...base.config,
      serverMessaging: {
        ...base.config.serverMessaging,
        deviceId: 'device-stale',
        deviceToken: 'token-stale',
        syncCursor: 3,
      },
    },
  };

  const merged = mergeStaleState(latest, base, incoming);

  assert.equal(merged.config.serverMessaging.deviceId, 'device-current');
  assert.equal(merged.config.serverMessaging.deviceToken, 'token-current');
  assert.equal(merged.config.serverMessaging.syncCursor, 10);
});

test('editing the server URL clears identity-bound state but keeps the native push token', () => {
  const base = baseState({
    config: {
      theme: 'light',
      serverMessaging: {
        enabled: true,
        baseUrl: 'https://old.example',
        pairingSecret: 'old-secret',
        deviceId: 'old-device',
        deviceToken: 'old-token',
        pushToken: 'fcm-token',
        syncCursor: 9,
        lastSyncAt: 900,
        outbox: [{ id: 'queued', roomId: 'room', content: 'old', createdAt: 1 }],
      },
    },
  });

  const changed = withServerConnectionSettings(base, {
    baseUrl: 'https://new.example/',
    pairingSecret: '',
  });

  assert.equal(changed.config.serverMessaging.baseUrl, 'https://new.example');
  assert.equal(changed.config.serverMessaging.deviceId, undefined);
  assert.equal(changed.config.serverMessaging.deviceToken, undefined);
  assert.equal(changed.config.serverMessaging.pairingSecret, '');
  assert.equal(changed.config.serverMessaging.pushToken, 'fcm-token');
  assert.equal(changed.config.serverMessaging.syncCursor, 0);
  assert.equal(changed.config.serverMessaging.lastSyncAt, undefined);
  assert.deepEqual(changed.config.serverMessaging.outbox, []);
});

test('editing settings for the same server preserves its registration and queue', () => {
  const base = baseState({
    config: {
      theme: 'light',
      serverMessaging: {
        enabled: true,
        baseUrl: 'https://same.example',
        deviceId: 'device',
        deviceToken: 'token',
        syncCursor: 4,
        outbox: [{ id: 'queued', roomId: 'room', content: 'pending', createdAt: 1 }],
      },
    },
  });

  const changed = withServerConnectionSettings(base, {
    baseUrl: 'https://same.example/',
    pairingSecret: 'pair-again',
  });

  assert.equal(changed.config.serverMessaging.deviceId, 'device');
  assert.equal(changed.config.serverMessaging.deviceToken, 'token');
  assert.equal(changed.config.serverMessaging.syncCursor, 4);
  assert.equal(changed.config.serverMessaging.outbox.length, 1);
});

test('concurrent creation of an optional reference array preserves both additions', () => {
  const base = baseState({
    characters: [{ ...baseState().characters[0], profileReferenceImages: undefined }],
  });
  const latest = {
    ...base,
    __revision: 2,
    characters: [{ ...base.characters[0], profileReferenceImages: ['file:///live.jpg'] }],
  };
  const incoming = {
    ...base,
    characters: [{ ...base.characters[0], profileReferenceImages: ['file:///async.jpg'] }],
  };

  const merged = mergeStaleState(latest, base, incoming);

  assert.deepEqual(merged.characters[0].profileReferenceImages, [
    'file:///live.jpg',
    'file:///async.jpg',
  ]);
});

test('an imported room deletion does not erase a message received during the import', () => {
  const base = baseState();
  const latest = {
    ...base,
    __revision: 2,
    messages: {
      room: [
        ...base.messages.room,
        { id: 'message-live', role: 'character', content: 'arrived during import', createdAt: 2 },
      ],
    },
  };
  const incoming = { ...base, messages: {}, __importedAt: 2000 };

  const merged = mergeStaleState(latest, base, incoming, { intent: 'import' });

  assert.deepEqual(
    merged.messages.room.map(message => message.id),
    ['message-1', 'message-live'],
  );
});

test('an explicit incoming entity deletion wins even if storage rewrote its media URI', () => {
  const base = baseState();
  const latest = {
    ...base,
    __revision: 2,
    characters: [{ ...base.characters[0], avatar: 'file:///canonical-avatar.jpg' }],
  };
  const incoming = { ...base, characters: [] };

  const merged = mergeStaleState(latest, base, incoming);

  assert.deepEqual(merged.characters, []);
});

test('concurrent unique primitive and profile-keyed additions are both preserved', () => {
  const base = baseState({
    config: {
      ...baseState().config,
      selectedReferencePhotoIds: ['photo-base'],
    },
    datingApp: {
      decisions: [{ profileId: 'profile-base', decision: 'like' }],
    },
  });
  const latest = {
    ...base,
    __revision: 2,
    config: {
      ...base.config,
      selectedReferencePhotoIds: ['photo-base', 'photo-live'],
    },
    datingApp: {
      decisions: [
        ...base.datingApp.decisions,
        { profileId: 'profile-live', decision: 'pass' },
      ],
    },
  };
  const incoming = {
    ...base,
    config: {
      ...base.config,
      selectedReferencePhotoIds: ['photo-base', 'photo-async'],
    },
    datingApp: {
      decisions: [
        ...base.datingApp.decisions,
        { profileId: 'profile-async', decision: 'like' },
      ],
    },
  };

  const merged = mergeStaleState(latest, base, incoming);

  assert.deepEqual(merged.config.selectedReferencePhotoIds, [
    'photo-base',
    'photo-live',
    'photo-async',
  ]);
  assert.deepEqual(
    merged.datingApp.decisions.map(item => item.profileId),
    ['profile-base', 'profile-live', 'profile-async'],
  );
});

test('a latest primitive selection deletion is not revived by a stale addition', () => {
  const base = baseState({
    datingApp: { selectedReferencePhotoIds: ['photo-old'] },
  });
  const latest = {
    ...base,
    __revision: 2,
    datingApp: { selectedReferencePhotoIds: [] },
  };
  const incoming = {
    ...base,
    datingApp: { selectedReferencePhotoIds: ['photo-old', 'photo-new'] },
  };

  const merged = mergeStaleState(latest, base, incoming);

  assert.deepEqual(merged.datingApp.selectedReferencePhotoIds, ['photo-new']);
});

test('reference slots never exceed the app limit during concurrent additions', () => {
  const slots = Array.from({ length: 49 }, (_, index) => ({
    id: `reference-${index}`,
    image: `file:///reference-${index}.jpg`,
    createdAt: index,
  }));
  const base = baseState({ referenceFaceSlots: slots });
  const latest = {
    ...base,
    __revision: 2,
    referenceFaceSlots: [
      ...slots,
      { id: 'reference-live', image: 'file:///live.jpg', createdAt: 50 },
    ],
  };
  const incoming = {
    ...base,
    referenceFaceSlots: [
      ...slots,
      { id: 'reference-async', image: 'file:///async.jpg', createdAt: 51 },
    ],
  };

  const merged = mergeStaleState(latest, base, incoming);

  assert.equal(merged.referenceFaceSlots.length, 50);
  assert.ok(merged.referenceFaceSlots.some(slot => slot.id === 'reference-live'));
});

test('reference picking locks immediately and reports a race that fills the last slot', () => {
  const addSlotSource = referenceFaceSource.slice(
    referenceFaceSource.indexOf('async function addSlot'),
    referenceFaceSource.indexOf('async function replaceSlot'),
  );

  assert.ok(addSlotSource.indexOf('setSaving(true)') < addSlotSource.indexOf('await pickPersistentReferenceImageUris'));
  assert.match(appSource, /일부 사진을 추가하지 못했어요/);
  assert.match(appSource, /rejectedReferenceSlotCount/);
});

test('background result merging never resurrects a deleted base entity', () => {
  const base = [{ id: 'character-1', name: 'before' }];
  const latest = [];
  const incoming = [{ id: 'character-1', name: 'stale edit' }];

  assert.deepEqual(mergeChangedIdentifiedArray(latest, base, incoming), []);
});

test('background entity merging preserves independent current and automation fields', () => {
  const base = [{ id: 'character-1', avatar: 'old', memories: [] }];
  const latest = [{ id: 'character-1', avatar: 'new', memories: [] }];
  const incoming = [{ id: 'character-1', avatar: 'old', memories: ['automation fact'] }];

  assert.deepEqual(mergeChangedIdentifiedArray(latest, base, incoming), [{
    id: 'character-1',
    avatar: 'new',
    memories: ['automation fact'],
  }]);
});

test('background entity merging never overwrites a current edit to the same field', () => {
  const base = [{ id: 'character-1', avatar: 'old' }];
  const latest = [{ id: 'character-1', avatar: 'manual' }];
  const incoming = [{ id: 'character-1', avatar: 'generated' }];

  assert.deepEqual(mergeChangedIdentifiedArray(latest, base, incoming), latest);
});

test('background property omission cannot delete a concurrently edited current field', () => {
  const base = [{ id: 'character-1', note: 'old' }];
  const latest = [{ id: 'character-1', note: 'manual' }];
  const incoming = [{ id: 'character-1' }];

  assert.deepEqual(mergeChangedIdentifiedArray(latest, base, incoming), latest);
});

test('a deferred stale completion merges after a live update without losing either result', async () => {
  const base = baseState();
  let release;
  const deferred = new Promise(resolve => { release = resolve; });
  let current = base;
  const staleWork = (async () => {
    await deferred;
    const incoming = {
      ...base,
      messages: {
        room: [
          ...base.messages.room,
          { id: 'message-async', role: 'system', content: 'async result', createdAt: 3 },
        ],
      },
    };
    current = mergeStaleState(current, base, incoming);
  })();

  current = {
    ...base,
    __revision: 2,
    messages: {
      room: [
        ...base.messages.room,
        { id: 'message-live', role: 'character', content: 'live update', createdAt: 2 },
      ],
    },
  };
  release();
  await staleWork;

  assert.deepEqual(
    current.messages.room.map(message => message.id),
    ['message-1', 'message-live', 'message-async'],
  );
});

test('a completion from before full restore cannot enter the imported generation', async () => {
  const base = baseState({ __importedAt: 1000 });
  let release;
  const deferred = new Promise(resolve => { release = resolve; });
  const latest = {
    ...base,
    __revision: 10,
    __importedAt: 2000,
    messages: {
      room: [{ id: 'message-backup', role: 'character', content: 'from backup', createdAt: 1 }],
    },
  };
  let current = latest;
  const staleWork = (async () => {
    await deferred;
    const incoming = {
      ...base,
      messages: {
        room: [
          ...base.messages.room,
          { id: 'message-stale', role: 'character', content: 'old completion', createdAt: 2 },
        ],
      },
    };
    current = mergeStaleState(current, base, incoming, { conflict: 'latest' });
  })();

  release();
  await staleWork;

  assert.equal(current, latest);
  assert.deepEqual(current.messages.room.map(message => message.id), ['message-backup']);
});

test('a deferred reply commitCurrent is rejected after restore advances the runtime epoch', async () => {
  const base = baseState({ __importedAt: 1000 });
  let current = base;
  let runtimeEpoch = 0;
  let restoring = false;
  let release;
  const deferred = new Promise(resolve => { release = resolve; });
  const operationEpoch = runtimeEpoch;
  const commitCurrentAtEpoch = async (epoch, patch) => {
    if (!canCommitRuntimeEpoch(runtimeEpoch, epoch, restoring)) return;
    current = patch(current);
  };
  const reply = (async () => {
    await deferred;
    await commitCurrentAtEpoch(operationEpoch, latest => ({
      ...latest,
      messages: {
        ...latest.messages,
        room: [
          ...(latest.messages.room || []),
          { id: 'message-old-reply', role: 'character', content: 'old reply', createdAt: 3 },
        ],
      },
    }));
  })();

  restoring = true;
  runtimeEpoch += 1;
  current = {
    ...base,
    __importedAt: 2000,
    messages: {
      room: [{ id: 'message-imported', role: 'character', content: 'imported', createdAt: 2 }],
    },
  };
  restoring = false;
  release();
  await reply;

  assert.deepEqual(current.messages.room.map(message => message.id), ['message-imported']);
});

test('a stale generated dependent cannot survive deletion of its character or room', () => {
  const room = { id: 'room', characterId: 'character-1', name: 'chat' };
  const base = baseState({ chatRooms: { 'character-1': [room] } });
  const latest = {
    ...base,
    __revision: 2,
    characters: [],
    chatRooms: {},
    messages: {},
    unreadCounts: {},
  };
  const incoming = {
    ...base,
    snsPosts: [{
      id: 'post-stale',
      characterId: 'character-1',
      platform: 'instagram',
      content: 'orphan',
      createdAt: 2,
    }],
    meetingEventSessions: [{
      id: 'meeting-stale',
      roomId: 'room',
      characterId: 'character-1',
      startedAt: 2,
      status: 'pending',
      turnCount: 0,
      maxTurns: 5,
      lines: [],
    }],
    messages: {
      room: [
        ...base.messages.room,
        { id: 'message-stale', role: 'system', content: 'orphan card', createdAt: 2 },
      ],
    },
  };

  const merged = mergeStaleState(latest, base, incoming);

  assert.deepEqual(merged.characters, []);
  assert.deepEqual(merged.snsPosts, []);
  assert.deepEqual(merged.meetingEventSessions, []);
  assert.equal(merged.messages.room, undefined);
});

test('auto-SNS artifacts cannot survive deletion of their generation room', () => {
  const room = { id: 'room', characterId: 'character-1', name: 'chat' };
  const base = baseState({ chatRooms: { 'character-1': [room] } });
  const latest = {
    ...base,
    __revision: 2,
    chatRooms: {},
    messages: {},
    unreadCounts: {},
  };
  const incoming = {
    ...base,
    snsPosts: [{
      id: 'post-room-stale',
      characterId: 'character-1',
      platform: 'instagram',
      content: 'orphan',
      createdAt: 2,
      generationRoomId: 'room',
    }],
    snsDmThreads: [{
      id: 'thread-room-stale',
      postId: 'post-room-stale',
      characterId: 'character-1',
      title: 'orphan',
      messages: [],
      createdAt: 2,
    }],
    notifications: [{
      id: 'notification-room-stale',
      type: 'sns',
      title: 'orphan',
      target: { postId: 'post-room-stale' },
      createdAt: 2,
    }],
  };

  const merged = mergeStaleState(latest, base, incoming, { conflict: 'latest' });

  assert.deepEqual(merged.characters.map(character => character.id), ['character-1']);
  assert.deepEqual(merged.snsPosts, []);
  assert.deepEqual(merged.snsDmThreads, []);
  assert.deepEqual(merged.notifications, []);
});

test('BlindDate async output preserves live messages and nested candidate deletion', async () => {
  const base = baseState({
    blindDate: {
      sessions: [{
        id: 'session-1',
        mode: 'profile',
        status: 'active',
        candidateCount: 1,
        candidates: [{ id: 'candidate-old', name: 'Old' }],
        rounds: [],
        createdAt: 1,
      }],
      activeSessionId: 'session-1',
    },
  });
  let release;
  const deferred = new Promise(resolve => { release = resolve; });
  let current = {
    ...base,
    __revision: 2,
    characters: [],
    messages: {
      room: [
        ...base.messages.room,
        { id: 'message-live', role: 'character', content: 'live', createdAt: 2 },
      ],
    },
    blindDate: {
      ...base.blindDate,
      sessions: [{ ...base.blindDate.sessions[0], candidates: [] }],
    },
  };
  const staleWork = (async () => {
    await deferred;
    const incoming = {
      ...base,
      messages: {
        room: [
          ...base.messages.room,
          { id: 'message-blind', role: 'system', content: 'candidate ready', createdAt: 3 },
        ],
      },
      blindDate: {
        ...base.blindDate,
        sessions: [{
          ...base.blindDate.sessions[0],
          candidates: [
            { id: 'candidate-old', name: 'Stale edit' },
            { id: 'candidate-new', name: 'New' },
          ],
          rounds: [{ id: 'round-1', roundIndex: 0, question: 'Q', answers: [], createdAt: 3 }],
        }],
      },
    };
    current = mergeStaleState(current, base, incoming);
  })();

  release();
  await staleWork;

  assert.deepEqual(
    current.messages.room.map(message => message.id),
    ['message-1', 'message-live', 'message-blind'],
  );
  assert.deepEqual(
    current.blindDate.sessions[0].candidates.map(candidate => candidate.id),
    ['candidate-new'],
  );
  assert.equal(current.blindDate.sessions[0].rounds[0].id, 'round-1');
  assert.deepEqual(current.characters, []);
});

test('a late route-bound dating result cannot reactivate its superseded session', () => {
  const base = baseState({ blindDate: { activeSessionId: undefined, sessions: [] } });
  const latest = {
    ...base,
    blindDate: {
      activeSessionId: 'session-new',
      sessions: [{ id: 'session-new', mode: 'worldcup', status: 'active', candidates: [], createdAt: 2 }],
    },
  };
  const incoming = {
    ...base,
    blindDate: {
      activeSessionId: 'session-old',
      sessions: [{ id: 'session-old', mode: 'profile', status: 'active', candidates: [], createdAt: 1 }],
    },
  };

  const merged = mergeStaleState(latest, base, incoming, { conflict: 'latest' });

  assert.equal(merged.blindDate.activeSessionId, 'session-new');
  assert.ok(merged.blindDate.sessions.some(session => session.id === 'session-new'));
});

test('all rendered screen onChange handlers route through the base-aware commit wrapper', () => {
  assert.match(appSource, /function commitFromRenderedSnapshot/);
  assert.match(appSource, /next\.__importedAt !== base\.__importedAt \? 'import' : 'screen'/);
  assert.match(appSource, /mergeStaleState\(current, base, next, \{ conflict: options\.conflict, intent \}\)/);
  assert.match(appSource, /const candidate = mergeStaleState\(latest, base, next, \{ conflict: 'latest' \}\)/);
  assert.match(
    appSource,
    /const commitRenderedState = \(next: SNSGodState, options: CommitOptions = \{\}\): Promise<void> => \([\s\S]*?isRuntimeEpochCurrent\(renderedEpoch\)[\s\S]*?commitFromRenderedSnapshot\(state, next, options\)/,
  );
  assert.match(
    appSource,
    /const commitRenderedStateAndFlush = \(next: SNSGodState\): Promise<void> => \([\s\S]*?isRuntimeEpochCurrent\(renderedEpoch\)[\s\S]*?commitAndFlush\(state, next\)/,
  );
  assert.match(appSource, /const navigateRendered = \(\.\.\.args: Parameters<typeof navigate>\)/);
  assert.match(appSource, /const isRenderedScreenCurrent = \(\): boolean => \([\s\S]*?routeEpochRef\.current === renderedRouteEpoch/);
  assert.match(appSource, /const navigateRendered[\s\S]*?if \(isRenderedScreenCurrent\(\)\) navigate/);
  assert.match(appSource, /const requestRenderedReply[\s\S]*?isRuntimeEpochCurrent\(renderedEpoch\)/);
  assert.doesNotMatch(appSource, /onChange=\{commit\}/);
  const onChangeBindings = [...appSource.matchAll(/onChange=\{([^}]+)\}/g)].map(match => match[1]);
  assert.equal(onChangeBindings.length, 22);
  assert.ok(onChangeBindings.every(binding => (
    binding === 'commitRenderedState'
    || binding === 'commitRenderedRouteState'
    || binding === 'commitRenderedStateAndFlush'
  )));
  assert.equal(onChangeBindings.filter(binding => binding === 'commitRenderedState').length, 17);
  assert.equal(onChangeBindings.filter(binding => binding === 'commitRenderedRouteState').length, 4);
  assert.equal(onChangeBindings.filter(binding => binding === 'commitRenderedStateAndFlush').length, 1);
  assert.match(appSource, /<ReferenceFaceScreen state=\{state\} onChange=\{commitRenderedStateAndFlush\}/);
  assert.equal((appSource.match(/onCreate=\{async \(next, roomId\) => \{ await commitRenderedState\(next\)/g) || []).length, 3);
});

test('Settings async results patch the latest state and bind server results to one request', () => {
  const apiTestSource = settingsScreenSource.slice(
    settingsScreenSource.indexOf('async function testApi'),
    settingsScreenSource.indexOf('async function saveAppearance'),
  );
  const serverSaveSource = settingsScreenSource.slice(
    settingsScreenSource.indexOf('async function saveServerMessaging'),
    settingsScreenSource.indexOf('async function saveImageGeneration'),
  );

  assert.match(
    settingsScreenSource,
    /onCommitCurrent: \(patch: \(current: SNSGodState\) => SNSGodState\)/,
  );
  const apiCompletion = apiTestSource.slice(
    apiTestSource.indexOf('const result = await callLLMText'),
    apiTestSource.indexOf('async function setSnsTheme'),
  );
  assert.match(apiCompletion, /const requestProvider = next\.config\.apiType/);
  assert.match(apiCompletion, /await onCommitCurrent\(current =>/);
  assert.match(apiCompletion, /\[requestProvider\]: \{ \.\.\.currentProfile, apiKeyIndex: result\.keyIndex \}/);
  assert.doesNotMatch(apiCompletion, /await onChange\(/);
  assert.match(serverSaveSource, /const requestId = makeId\('server-connection'\)/);
  assert.match(serverSaveSource, /await onChange\(requested\)/);
  assert.equal(
    (serverSaveSource.match(/mergeServerConnectionResult\(/g) || []).length,
    2,
  );
  assert.match(serverSaveSource, /\{ requireIdentity: true \}/);
});

test('room summary completion keeps edits typed while the LLM is running', () => {
  const summaryStart = roomSettingsSource.indexOf('async function summarizeCurrentRoom');
  const summarySource = roomSettingsSource.slice(
    summaryStart,
    roomSettingsSource.indexOf('\n  return (', summaryStart),
  );

  assert.match(roomSettingsSource, /const draftRef = useRef<SNSGodRoom \| null>\(draft\)/);
  assert.match(roomSettingsSource, /draftRef\.current = next/);
  assert.match(summarySource, /const liveDraft = draftRef\.current/);
  assert.match(summarySource, /await onCommitCurrent\(current =>/);
  assert.match(summarySource, /applyPrivateRoomLlmSummary\(current, roomId, result\.summary, \{ draft: liveDraft \}\)/);
  assert.match(summarySource, /replaceAutoSummaryBlock\(String\(liveDraft\.roomPrompt \|\| ''\), result\.summary\)/);
  assert.doesNotMatch(summarySource, /onChange\(result\.state\)/);
});

test('AI-assisted character fields preserve edits made while generation is running', () => {
  assert.match(newCharacterSource, /const requested = \{ name, prompt, firstMessage \}/);
  assert.match(newCharacterSource, /const generationInFlightRef = useRef\(false\)/);
  assert.match(newCharacterSource, /setName\(current => current === requested\.name \? parsed\.name : current\)/);
  assert.match(newCharacterSource, /setPrompt\(current => current === requested\.prompt \? parsed\.prompt : current\)/);
  assert.match(newCharacterSource, /setFirstMessage\(current => current === requested\.firstMessage \? parsed\.firstMessage : current\)/);
  assert.match(characterSettingsSource, /setMemoryText\(current => \{[\s\S]*?partitionMemoryEntries\(current\.split/);
  assert.match(characterSettingsSource, /const imageGenerationRequestRef = useRef\(\{ avatar: 0, coverImage: 0 \}\)/);
  assert.match(characterSettingsSource, /imageGenerationRequestRef\.current\.avatar !== requestId/);
  assert.match(characterSettingsSource, /String\(prev\.avatar \|\| prev\.profileImage \|\| ''\) !== originalImage/);
  assert.match(characterSettingsSource, /imageGenerationRequestRef\.current\.coverImage !== requestId/);
});

test('route-bound navigation cannot hijack the user while background state work stays durable', () => {
  assert.equal((randomChatSource.match(/onChange\(next, \{ conflict: 'latest' \}\)/g) || []).length, 2);
  assert.ok((blindDateSource.match(/conflict: 'latest'/g) || []).length >= 10);
  assert.ok((worldcupSource.match(/conflict: 'latest'/g) || []).length >= 2);
  assert.match(snsScreenSource, /pointerEvents=\{loading \? 'none' : 'auto'\}/);
  assert.ok((snsScreenSource.match(/editable=\{!loading\}/g) || []).length >= 3);
  assert.match(snsScreenSource, /function TogglePill\(\{ label, value, disabled, onPress \}/);
  assert.match(snsScreenSource, /await onChange\(next, \{ conflict: 'latest' \}\)/);
  assert.equal((appSource.match(/<(?:BlindDate|DatingApp|IdealWorldcup)Screen[^>]*onChange=\{commitRenderedRouteState\}/g) || []).length, 4);
  assert.match(appSource, /routeRef\.current\.name === 'datingApp'[\s\S]*?resetDatingImageQueue\(\)/);
  assert.doesNotMatch(appSource, /const commitRenderedCurrent[\s\S]{0,250}isRenderedScreenCurrent/);
  assert.match(blindDateSource, /const busyRef = useRef\(false\)/);
  assert.match(blindDateSource, /function importArchive[\s\S]*?runBusy\(async \(\) =>[\s\S]*?conflict: 'latest'/);
  assert.match(blindDateSource, /onImport\(archive\.id\)\} disabled=\{busy\}/);
  assert.match(worldcupSource, /async function importChampion\(\)[\s\S]*?operationRef\.current !== operationId[\s\S]*?conflict: 'latest'/);
  assert.match(worldcupSource, /onPress=\{\(\) => void importChampion\(\)\} disabled=\{busy\}/);
  assert.match(worldcupSource, /const selectionPairRef = useRef\(''\)/);
  assert.match(worldcupSource, /selectionPairRef\.current === currentPair\.id\) return/);
  assert.match(worldcupSource, /animation\.start\(\(\{ finished \}\) => \{\s*if \(!finished \|\| selectionPairRef\.current !== pairId\) return/);
  assert.equal((worldcupSource.match(/disabled=\{selectionPairRef\.current === currentPair\?\.id\}/g) || []).length, 2);
});

test('restore resets auxiliary queues and binds the SumGod sidecar to the imported generation', () => {
  const restoreSource = appSource.slice(
    appSource.indexOf('async function executeImportedStateRestore'),
    appSource.indexOf('async function reloadSavedState'),
  );

  assert.match(restoreSource, /resetDatingImageQueue\(\)/);
  assert.match(restoreSource, /const sumGodBackupGeneration = invalidateSumGodBackupWrites\(\)/);
  assert.ok(restoreSource.indexOf('invalidateSumGodBackupWrites()') < restoreSource.indexOf('await importState'));
  assert.ok(restoreSource.indexOf('await importState') < restoreSource.indexOf('await replaceSumGodBackup'));
  assert.match(sumGodSource, /let sumGodBackupWriteQueue: Promise<void> = Promise\.resolve\(\)/);
  assert.match(sumGodSource, /generation !== sumGodBackupGeneration/);
  assert.match(sumGodSource, /Object\.is\(backup\.stateImportedAt, state\.__importedAt\)/);
  assert.equal((sumGodScreenSource.match(/saveSumGodBackup\(getSumGodProgress\(next\), next\.__importedAt\)/g) || []).length, 2);
  assert.match(datingLogicSource, /export function resetDatingImageQueue\(\): void/);
  assert.match(datingLogicSource, /const generation = datingImageGeneration;[\s\S]*?generateDatingAppProfileBundle\([\s\S]*?generation\)/);
  assert.match(datingLogicSource, /assertDatingImageGeneration\(generation\);[\s\S]*?await delay\(waitMs\);[\s\S]*?assertDatingImageGeneration\(generation\)/);
  assert.match(datingLogicSource, /DATING_IMAGE_TIMEOUT_MS = 3 \* 60 \* 1000/);
  assert.match(datingLogicSource, /if \(generation === datingImageGeneration\) lastDatingImageRequestAt = Date\.now\(\)/);
});

test('App-owned async reply and meeting flows also commit against their await base', () => {
  const serverReplySource = appSource.slice(
    appSource.indexOf('async function requestServerReply'),
    appSource.indexOf('function requestReply'),
  );
  const meetingSource = appSource.slice(
    appSource.indexOf('async function maybeStartMeetingEvent'),
    appSource.indexOf('function resumeInterruptedReplies'),
  );

  assert.match(serverReplySource, /const base = stateRef\.current \|\| queued/);
  assert.match(serverReplySource, /commitFromRenderedSnapshot\(base, next, \{ conflict: 'latest' \}\)/);
  assert.match(serverReplySource, /commitFromRenderedSnapshot\(base, failed, \{ conflict: 'latest' \}\)/);
  assert.doesNotMatch(serverReplySource, /await commit\(next\)/);
  assert.ok((meetingSource.match(/commitFromRenderedSnapshot\(/g) || []).length >= 4);
  assert.doesNotMatch(meetingSource, /await commit\(next\)/);
  assert.match(meetingSource, /runMeetingEventWork\(roomId, false/);
  assert.match(meetingSource, /runMeetingEventWork\(roomId, true/);
  assert.match(appSource, /const task = work\(\)/);
  assert.match(appSource, /meetingEventWorkRef\.current\.set\(roomId, task\)/);
  assert.match(appSource, /await running\.catch\(\(\) => false\)/);
  assert.match(appSource, /meetingEventWorkRef\.current\.delete\(roomId\)/);
  assert.match(appSource, /function mergeServerSyncResult[\s\S]*?return mergeStaleState\(latest, base, next, \{ conflict: 'latest' \}\)/);
  assert.match(appSource, /const candidateRoomIds = new Set/);
  assert.match(appSource, /if \(!candidateRoomIds\.has\(roomId\)\) continue/);
});

test('DatingApp generation uses a synchronous in-flight guard across mount effects', () => {
  const generateSource = datingAppSource.slice(
    datingAppSource.indexOf('async function generateRound'),
    datingAppSource.indexOf('async function refreshIfReady'),
  );

  assert.match(datingAppSource, /const generationInFlightRef = useRef\(false\)/);
  assert.match(generateSource, /if \(loading \|\| generationInFlightRef\.current\) return/);
  assert.ok(
    generateSource.indexOf('generationInFlightRef.current = true')
      < generateSource.indexOf('await ensureDatingAppProfile'),
  );
  assert.match(generateSource, /finally \{\s*generationInFlightRef\.current = false/);
});

test('full backup restore reloads imported state without flushing stale runtime state over it', () => {
  const restoreSource = appSource.slice(
    appSource.indexOf('async function executeImportedStateRestore'),
    appSource.indexOf('async function reloadSavedState'),
  );

  assert.match(debugScreenSource, /await onRestoreFullBackup\(state, picked\.assets\[0\]\.uri\)/);
  assert.match(settingsScreenSource, /await onRestoreState\(state, next\)/);
  assert.match(settingsScreenSource, /onRestoreFullBackup\(state, uri\)/);
  assert.match(debugScreenSource, /전체 백업에서 복구하고 화면 데이터도 갱신했습니다/);
  assert.match(restoreSource, /mergeStaleState\(currentBeforeRestore, base, prepared\.state, \{ intent: 'import' \}\)/);
  assert.match(restoreSource, /restoringRef\.current = true/);
  assert.match(restoreSource, /runtimeEpochRef\.current \+= 1/);
  assert.match(restoreSource, /cancelAllChatJobs\(\)/);
  assert.match(restoreSource, /resetReplyLlmQueue\(\)/);
  assert.match(restoreSource, /meetingEventWorkRef\.current\.clear\(\)/);
  assert.match(restoreSource, /await flushSaveState\(undefined, \{ reason: 'before full backup import' \}\)/);
  assert.match(restoreSource, /await importState\(candidate, JSON\.stringify\(candidate\)\)/);
  assert.match(restoreSource, /await importState\(currentBeforeRestore, JSON\.stringify\(currentBeforeRestore\)\)/);
  assert.match(restoreSource, /clearRuntimeOnlyState\(await loadState\(\)\)/);
  assert.match(restoreSource, /setRuntimeReloadNonce\(value => value \+ 1\)/);
  assert.match(restoreSource, /catch \(error\)[\s\S]*?setState\(recovered\)[\s\S]*?setRuntimeReloadNonce/);
  assert.ok(restoreSource.indexOf('runtimeEpochRef.current += 1') < restoreSource.indexOf('await flushSaveState'));
  assert.ok(restoreSource.indexOf('await flushSaveState') < restoreSource.indexOf('await importState'));
  assert.match(appSource, /AppState\.addEventListener\('change', nextState => \{\s*if \(restoringRef\.current\) return/);
  assert.match(appSource, /getState: \(\) => isRuntimeEpochCurrent\(operationEpoch\) \? stateRef\.current : null/);
  assert.match(appSource, /commitCurrent: \(patch, commitOptions\) => commitCurrentAtEpoch\(operationEpoch, patch, commitOptions\)/);
  assert.match(replyEngineSource, /export function resetReplyLlmQueue\(\): void/);
  assert.match(replyEngineSource, /await previous\.catch\(\(\) => undefined\);\s*try \{\s*if \(!isCurrentChatJob/);
});

test('reply-engine meeting and summary completions merge against their own await bases', () => {
  const meetingCompletion = replyEngineSource.slice(
    replyEngineSource.indexOf('const beforeMeeting = input.getState()'),
    replyEngineSource.indexOf('// Auto SNS is independent'),
  );
  const summaryCompletion = replyEngineSource.slice(
    replyEngineSource.indexOf('const beforeSummary = input.getState()'),
    replyEngineSource.indexOf("await appendDebugLog('memory.summary'"),
  );

  assert.match(meetingCompletion, /roomStillValid\(current, input\.roomId, input\.characterId\)/);
  assert.match(meetingCompletion, /mergeStaleState\(current, sourceState, generated, \{ conflict: 'latest' \}\)/);
  assert.match(meetingCompletion, /session\.roomId === input\.roomId/);
  assert.doesNotMatch(meetingCompletion, /\.\.\.generated/);
  assert.match(summaryCompletion, /mergeStaleState\(current, beforeSummary, summarized, \{ conflict: 'latest' \}\)/);
  assert.doesNotMatch(summaryCompletion, /\.\.\.summarized/);
  assert.match(replyEngineSource, /const mergedState = mergeStaleState\(current, before, generated, \{ conflict: 'latest' \}\)/);
  assert.match(replyEngineSource, /config: mergedState\.config/);
  assert.doesNotMatch(replyEngineSource, /\.\.\.generated\.config\.apiProfiles/);
  assert.match(replyEngineSource, /preserveLatestDeletionInvariants\(candidate, current, before\)/);
});

test('image reply commits revalidate private and group room ownership after generation', () => {
  const groupReadSource = groupChatSource.slice(
    groupChatSource.indexOf('function markUserMessagesRead'),
    groupChatSource.indexOf('function clearGroupReadState'),
  );

  assert.match(replyEngineSource, /const currentTarget = roomStillValid\(current, input\.roomId, input\.characterId\)/);
  assert.match(replyEngineSource, /if \(!currentTarget\) return current/);
  assert.match(replyEngineSource, /appendPrivateMessageIfValid\(current, input\.roomId, input\.characterId/);
  assert.match(replyEngineSource, /reply\.newMemory[\s\S]*?roomStillValid\(current, input\.roomId, input\.characterId\)/);
  assert.match(groupChatSource, /const currentSpeaker = activeGroupSpeaker\(current, roomId, speaker\.id\)/);
  assert.match(groupChatSource, /if \(!currentSpeaker\) return current/);
  assert.match(groupChatSource, /if \(!findGroup\(state, roomId\)\) return state/);
  assert.match(groupChatSource, /appendGroupMessageIfActive\(current, roomId, systemMessage\)/);
  assert.match(groupReadSource, /if \(!findGroup\(state, roomId\)\) return state/);
});
