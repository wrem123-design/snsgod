import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = relativePath => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('message copy relies on the Android clipboard toast without a duplicate success dialog', () => {
  for (const screen of ['src/screens/ChatRoomScreen.tsx', 'src/screens/GroupChatRoomScreen.tsx']) {
    const source = read(screen);
    assert.doesNotMatch(source, /Alert\.alert\('복사 완료',\s*'말풍선 텍스트를 복사했습니다\.'/);
    assert.match(source, /await .*copyText\(copyValue\)/);
  }
});

test('Oracle messaging polls while the JS runtime is alive and keeps the foreground service enabled', () => {
  const app = read('src/App.tsx');
  const server = read('src/logic/serverMessaging.ts');
  assert.match(app, /ORACLE_SYNC_INTERVAL_MS/);
  assert.match(app, /syncOracleMessages\('server-interval'\)/);
  assert.match(app, /setAutomationKeepAliveRunning\(autoOn\)/);
  assert.doesNotMatch(app, /autoOn[^;]+!isServerMessagingEnabled/);
  assert.match(app, /shouldBootstrapOracleSync\(reason, registeredNow\)/);
  assert.doesNotMatch(app, /outbox \|\| \[\]\)\.length \? await flushServerOutbox\(next\) : await bootstrapServer\(next\)/);
  assert.match(app, /mergeServerSyncResult\(latest, current, next\)/);
  assert.match(app, /oracleSyncPendingReasonRef/);
  const syncStart = app.indexOf('async function syncOracleMessages');
  const syncEnd = app.indexOf('\n  function ', syncStart + 1);
  const syncBody = app.slice(syncStart, syncEnd);
  assert.ok(syncBody.indexOf('next = await syncServerMessages(next)') < syncBody.indexOf('shouldBootstrapOracleSync'));
  const bootstrapStart = server.indexOf('export async function bootstrapServer');
  const bootstrapEnd = server.indexOf('\n}\n', bootstrapStart) + 2;
  assert.doesNotMatch(server.slice(bootstrapStart, bootstrapEnd), /syncCursor\s*:/);
});

test('Android keeps the foreground service when the task is dismissed', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /android:stopWithTask="false"/);
});

test('release metadata identifies the updated mobile build', () => {
  const appConfig = JSON.parse(read('app.json'));
  const packageConfig = JSON.parse(read('package.json'));
  const gradle = read('android/app/build.gradle');
  const rootGradle = read('android/build.gradle');
  assert.equal(appConfig.expo.version, '0.3.5');
  assert.equal(packageConfig.version, '0.3.5');
  assert.match(gradle, /versionCode 14/);
  assert.match(gradle, /versionName "0\.3\.5"/);
  assert.match(rootGradle, /com\.google\.gms:google-services/);
  assert.match(gradle, /google-services\.json/);
  assert.match(gradle, /apply plugin: "com\.google\.gms\.google-services"/);
});

test('native FCM token is registered and refreshed without being logged', () => {
  const packageConfig = JSON.parse(read('package.json'));
  const appConfig = JSON.parse(read('app.json'));
  const app = read('src/App.tsx');
  const push = read('src/logic/pushNotifications.ts');
  const server = read('src/logic/serverMessaging.ts');
  const types = read('src/types.ts');

  assert.equal(packageConfig.dependencies['expo-notifications'], '~57.0.3');
  assert.equal(appConfig.expo.plugins.some(plugin => Array.isArray(plugin)
    && plugin[0] === 'expo-notifications'
    && plugin[1]?.defaultChannel === 'snsgod_messages'), true);
  assert.match(push, /getDevicePushTokenAsync/);
  assert.match(push, /addPushTokenListener/);
  assert.match(push, /token\.type !== 'android'/);
  assert.doesNotMatch(push, /if \(!permission\.granted\) return/);
  assert.match(push, /permissionGranted/);
  assert.match(push, /registrationError/);
  assert.match(push, /refreshPushNotificationRegistration/);
  assert.doesNotMatch(push, /console\.(?:log|info|debug).*token/i);
  assert.match(types, /pushToken\?: string/);
  assert.match(types, /pushPermissionGranted\?: boolean/);
  assert.match(types, /pushRegistrationError\?: string/);
  assert.match(server, /pushToken: config\.pushToken/);
  assert.match(server, /pushToken: state\.config\.serverMessaging\?\.pushToken/);
  assert.match(app, /initializePushNotifications/);
  assert.match(app, /!isRemoteServicesEnabled\(current\) \|\| !isServerMessagingEnabled\(current\)/);
  assert.match(app, /initializePushNotifications\([\s\S]*, true\)/);
  assert.match(app, /refreshPushNotificationRegistration/);
  assert.match(app, /updateServerPushRegistration/);
  assert.match(app, /'push-token-changed'/);
  assert.match(read('android/app/src/main/AndroidManifest.xml'), /com\.google\.firebase\.messaging\.default_notification_channel_id[^>]+snsgod_messages/);
});

test('Oracle settings expose notification delivery state and system recovery action', () => {
  const settings = read('src/screens/SettingsScreen.tsx');
  assert.match(settings, /pushPermissionGranted === false/);
  assert.match(settings, /백그라운드 답장 알림이 꺼져 있습니다/);
  assert.match(settings, /Linking\.openSettings\(\)/);
  assert.match(settings, /알림 설정 열기/);
});

test('returning to the foreground refreshes both push registration and Oracle messages', () => {
  const app = read('src/App.tsx');
  assert.match(app, /nextState === 'active'/);
  assert.match(app, /refreshPushNotificationRegistration\(false\)/);
  assert.match(app, /syncOracleMessages\('app-active'\)/);
});

test('Oracle requests time out and release the single-flight sync queue', () => {
  const app = read('src/App.tsx');
  const server = read('src/logic/serverMessaging.ts');

  assert.match(server, /ORACLE_REQUEST_TIMEOUT_MS/);
  assert.match(server, /AbortController/);
  assert.match(server, /clearTimeout\(timeoutId\)/);
  assert.match(server, /Oracle 서버 응답 시간 초과/);
  assert.match(app, /oracleSyncInFlightRef\.current = false/);
  assert.match(app, /sync failed reason=/);
  assert.match(app, /Oracle 서버 연결 정보가 없습니다\. 설정에서 연결 키를 입력해 다시 연결하세요\./);
  assert.doesNotMatch(app, /if \(!String\(next\.config\.serverMessaging\?\.pairingSecret \|\| ''\)\.trim\(\)\) return;/);
});
