import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as serverConnectionPolicy from '../src/logic/serverConnectionPolicy.ts';

function state(serverMessaging = {}) {
  return {
    config: {
      dataBoundaryMode: 'remote-assisted',
      apiType: 'custom',
      apiProfiles: {},
      userName: '나',
      userDescription: '',
      roomName: '',
      language: 'Korean',
      serverMessaging: {
        enabled: true,
        baseUrl: 'https://message.example.test',
        ...serverMessaging,
      },
    },
    characters: [],
    chatRooms: {},
    groupRooms: [],
    messages: {},
  };
}

const settingsSource = readFileSync(
  new URL('../src/screens/SettingsScreen.tsx', import.meta.url),
  'utf8',
);

test('registered devices resync with their stored identity instead of pairing again', () => {
  assert.equal(serverConnectionPolicy.requiresServerRegistration(state({
    deviceId: 'device-1',
    deviceToken: 'token-1',
  })), false);
  assert.equal(serverConnectionPolicy.requiresServerRegistration(state({ deviceId: 'device-1' })), true);
  assert.equal(serverConnectionPolicy.requiresServerRegistration(state({ deviceToken: 'token-1' })), true);
});

test('401 responses become an explicit device authentication error', () => {
  const error = serverConnectionPolicy.serverRequestError(401, {
    error: 'Invalid device authentication',
  });

  assert.ok(error instanceof serverConnectionPolicy.ServerAuthenticationError);
  assert.equal(
    error.message,
    '기기 인증이 만료되었습니다. 서버 연결 키를 입력해 기기를 다시 등록하세요.',
  );
  assert.equal(
    serverConnectionPolicy.serverRequestError(503, { error: 'Server busy' }).message,
    'Server busy',
  );
});

test('invalid authentication clears only registration-bound progress', () => {
  const original = state({
    deviceId: 'device-1',
    deviceToken: 'expired-token',
    pairingSecret: '',
    syncCursor: 41,
    lastSyncAt: 1000,
    outbox: [{ id: 'out-1', roomId: 'room-1', content: '안녕', createdAt: 1 }],
  });

  const next = serverConnectionPolicy.invalidateServerRegistration(original);

  assert.equal(next.config.serverMessaging.deviceId, 'device-1');
  assert.equal(next.config.serverMessaging.deviceToken, undefined);
  assert.equal(next.config.serverMessaging.syncCursor, 0);
  assert.equal(next.config.serverMessaging.lastSyncAt, undefined);
  assert.deepEqual(next.config.serverMessaging.outbox, original.config.serverMessaging.outbox);
  assert.match(next.config.serverMessaging.lastError, /기기 인증이 만료/);
});

test('a stale authentication failure cannot erase a newer registration', () => {
  const requested = state({
    connectionRequestId: 'request-old',
    deviceId: 'device-1',
    deviceToken: 'token-old',
  });
  const newerRequest = state({
    connectionRequestId: 'request-new',
    deviceId: 'device-1',
    deviceToken: 'token-new',
    syncCursor: 52,
  });
  const newerIdentity = state({
    connectionRequestId: 'request-old',
    deviceId: 'device-1',
    deviceToken: 'token-new',
    syncCursor: 52,
  });

  assert.equal(
    serverConnectionPolicy.invalidateServerRegistrationForRequest(
      newerRequest,
      requested,
      'request-old',
    ),
    newerRequest,
  );
  assert.equal(
    serverConnectionPolicy.invalidateServerRegistrationForRequest(
      newerIdentity,
      requested,
      'request-old',
    ),
    newerIdentity,
  );
  const accepted = serverConnectionPolicy.invalidateServerRegistrationForRequest(
    requested,
    requested,
    'request-old',
  );
  assert.equal(accepted.config.serverMessaging.deviceToken, undefined);
});

test('settings resync conditionally registers and keeps feedback inside the Oracle card', () => {
  const saveStart = settingsSource.indexOf('async function saveServerMessaging');
  const saveEnd = settingsSource.indexOf('async function changeDataBoundaryMode', saveStart);
  const saveSource = settingsSource.slice(saveStart, saveEnd);
  const cardStart = settingsSource.indexOf('<Text style={styles.cardTitle}>Oracle 메시지 서버</Text>');
  const cardEnd = settingsSource.indexOf('<View style={[styles.card, activeSection !== \'screen\'', cardStart);
  const cardSource = settingsSource.slice(cardStart, cardEnd);

  assert.match(saveSource, /requiresServerRegistration\(requested\)/);
  assert.match(saveSource, /if \(requiresRegistration\)[\s\S]*?registerServerDevice\(requested\)/);
  assert.match(saveSource, /ServerAuthenticationError/);
  assert.match(saveSource, /invalidateServerRegistrationForRequest/);
  assert.match(
    saveSource,
    /registeredThisRequest \? 'Oracle 메시지 서버 연결 및 초기 동기화 완료' : 'Oracle 메시지 서버 동기화 완료'/,
  );
  assert.match(cardSource, /serverStatus \? <View style={styles\.statusBox}>/);
  assert.match(cardSource, /기기 다시 등록|연결 및 동기화/);
});
