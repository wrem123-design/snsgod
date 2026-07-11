import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

async function importPolicy() {
  const source = readFileSync(new URL('../src/logic/remoteServicePolicy.ts', import.meta.url), 'utf8');
  const transpiled = ts.transpileModule(source, {
    fileName: 'src/logic/remoteServicePolicy.ts',
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  assert.equal(transpiled.diagnostics?.length ?? 0, 0);
  return import(`data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`);
}

const { isRemoteServicesEnabled, resolvedDataBoundaryMode, withDataBoundaryMode } = await importPolicy();
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const defaultSource = readFileSync(new URL('../src/data/defaultState.ts', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../src/logic/serverMessaging.ts', import.meta.url), 'utf8');
const settingsSource = readFileSync(new URL('../src/screens/SettingsScreen.tsx', import.meta.url), 'utf8');
const packageSource = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
const appConfigSource = readFileSync(new URL('../app.json', import.meta.url), 'utf8');

function state(config = {}) {
  return {
    marker: 'local data stays intact',
    config: {
      apiType: 'openai',
      apiProfiles: {},
      userName: '나',
      userDescription: '',
      roomName: '채팅',
      language: 'Korean',
      ...config,
    },
  };
}

test('new and existing local configurations resolve to local-only', () => {
  assert.equal(resolvedDataBoundaryMode(state().config), 'local-only');
  assert.equal(isRemoteServicesEnabled(state()), false);
  assert.match(defaultSource, /dataBoundaryMode: 'local-only'/);
});

test('legacy configured servers remain remote unless local-only is explicit', () => {
  const legacy = state({ serverMessaging: { enabled: true, baseUrl: 'https://example.test' } });
  assert.equal(resolvedDataBoundaryMode(legacy.config), 'remote-assisted');
  assert.equal(isRemoteServicesEnabled(legacy), true);
  assert.equal(isRemoteServicesEnabled(state({
    dataBoundaryMode: 'local-only',
    serverMessaging: { enabled: true, baseUrl: 'https://example.test' },
  })), false);
});

test('switching to local-only invalidates pending server work without deleting local data or reusable credentials', () => {
  const current = state({
    dataBoundaryMode: 'remote-assisted',
    serverMessaging: {
      enabled: true,
      baseUrl: 'https://example.test',
      pairingSecret: 'one-time',
      connectionRequestId: 'request-1',
      deviceId: 'device-1',
      deviceToken: 'token-1',
      outbox: [{ id: 'queued', roomId: 'room', content: 'hello', createdAt: 1 }],
    },
  });
  const local = withDataBoundaryMode(current, 'local-only');
  assert.equal(local.marker, current.marker);
  assert.equal(local.config.serverMessaging.enabled, false);
  assert.equal(local.config.serverMessaging.pairingSecret, '');
  assert.equal(local.config.serverMessaging.connectionRequestId, undefined);
  assert.deepEqual(local.config.serverMessaging.outbox, []);
  assert.equal(local.config.serverMessaging.deviceId, 'device-1');
  assert.equal(local.config.serverMessaging.deviceToken, 'token-1');
});

test('remote mode permits but does not itself start or enable a server connection', () => {
  const remote = withDataBoundaryMode(state({ serverMessaging: { enabled: false } }), 'remote-assisted');
  assert.equal(isRemoteServicesEnabled(remote), true);
  assert.equal(remote.config.serverMessaging.enabled, false);
});

test('every Oracle network entry and in-flight completion is gated by the remote policy', () => {
  assert.match(serverSource, /function serverConfig[\s\S]*!isRemoteServicesEnabled\(state\)/);
  assert.match(serverSource, /registerServerDevice[\s\S]*!isRemoteServicesEnabled\(state\)[\s\S]*fetch/);
  assert.match(appSource, /await registerServerDevice[\s\S]*!isRemoteServicesEnabled\(stateRef\.current\)/);
  assert.match(appSource, /await syncServerMessages[\s\S]*!isRemoteServicesEnabled\(stateRef\.current\)/);
});

test('settings explains the local network boundary and disables server actions', () => {
  assert.match(settingsSource, /Oracle 원격 보조 모드/);
  assert.match(settingsSource, /외부 푸시 초기화를 수행하지 않습니다/);
  assert.match(settingsSource, /AI 답장이나 이미지 생성을 직접 실행하면/);
  assert.match(settingsSource, /disabled=\{saving \|\| !remoteServicesEnabled\}/);
});

test('the local build has no implicit FCM initialization surface', () => {
  assert.doesNotMatch(packageSource, /expo-notifications|firebase|react-native-firebase/i);
  assert.doesNotMatch(appConfigSource, /googleServicesFile|google-services/i);
});
