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

test('Oracle messaging polls while the JS runtime is alive without requiring its foreground service', () => {
  const app = read('src/App.tsx');
  const server = read('src/logic/serverMessaging.ts');
  assert.match(app, /ORACLE_SYNC_INTERVAL_MS/);
  assert.match(app, /syncOracleMessages\('server-interval'\)/);
  assert.match(app, /const keepAliveOn = autoOn && state !== null && !isServerMessagingEnabled\(state\)/);
  assert.match(app, /setAutomationKeepAliveRunning\(keepAliveOn\)/);
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

test('Android root content starts below the Galaxy system status bar', () => {
  const app = read('src/App.tsx');
  assert.match(app, /const ANDROID_STATUS_BAR_INSET = Platform\.OS === 'android'\s*\? StatusBar\.currentHeight \|\| 0\s*: 0/);
  assert.match(app, /safe: \{[^}]*paddingTop: ANDROID_STATUS_BAR_INSET/);
  assert.match(app, /loading: \{[^}]*paddingTop: ANDROID_STATUS_BAR_INSET/);
});

test('release metadata identifies the updated mobile build', () => {
  const appConfig = JSON.parse(read('app.json'));
  const packageConfig = JSON.parse(read('package.json'));
  const gradle = read('android/app/build.gradle');
  const rootGradle = read('android/build.gradle');
  assert.equal(appConfig.expo.version, '0.3.7');
  assert.equal(packageConfig.version, '0.3.7');
  assert.match(gradle, /versionCode 16/);
  assert.match(gradle, /versionName "0\.3\.7"/);
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

test('Grok reference uploads use the native multipart uploader without constructing unsupported FormData parts', () => {
  const api = read('src/logic/api.ts');
  assert.doesNotMatch(api, /import \{ File as ExpoFile \} from 'expo-file-system'/);
  assert.doesNotMatch(api, /new ExpoFile\(uri\)/);
  assert.doesNotMatch(api, /type ReactNativeFormDataFile/);
  assert.doesNotMatch(api, /appendReactNativeFile/);
  assert.match(api, /FileSystem\.uploadAsync\(`\$\{baseUrl\}\/api\/i2i`, upload\.uri,/);
  assert.match(api, /uploadType: FileSystem\.FileSystemUploadType\.MULTIPART/);
  assert.match(api, /fieldName: 'image'/);
  assert.match(api, /parameters: \{ prompt: finalPrompt, resolution \}/);
  assert.doesNotMatch(api, /response\.blob\(\)/);
  assert.match(api, /FileSystem\.downloadAsync\(url, uri\)/);
  assert.match(api, /FileSystem\.readAsStringAsync\(uri, \{ encoding: FileSystem\.EncodingType\.Base64 \}\)/);
});

test('basic settings expose system notification categories without gating message sync', () => {
  const types = read('src/types.ts');
  const navigation = read('src/screens/settings/SettingsNavigation.tsx');
  const settings = read('src/screens/SettingsScreen.tsx');
  const notificationSection = read('src/screens/settings/NotificationSettingsSection.tsx');
  const app = read('src/App.tsx');
  const server = read('src/logic/serverMessaging.ts');

  assert.match(types, /export type NotificationDisplayPreferences/);
  assert.match(types, /notificationPreferences\?: NotificationDisplayPreferences/);
  assert.match(navigation, /key: 'notifications', label: '알림'/);
  assert.match(settings, /<NotificationSettingsSection/);
  assert.match(notificationSection, /답장 메시지/);
  assert.match(notificationSection, /캐릭터 선톡/);
  assert.match(notificationSection, /메시지 생성과 앱 내부 저장·읽지 않음 표시는 계속 동작/);
  assert.match(app, /notificationPreferences: state\.config\.notificationPreferences/);
  assert.match(server, /pushPreferences: notificationPreferencesForServer\(state\)/);
  assert.match(server, /notificationImage: notificationImageForServer\(character\)/);
  assert.doesNotMatch(server, /notificationPreferences[\s\S]{0,120}isServerMessagingEnabled/);
});

test('Oracle synchronization signals fair SNS automation without replacing server message handling', () => {
  const app = read('src/App.tsx');
  const sns = read('src/logic/sns.ts');

  assert.match(app, /runServerAssistedSnsTick/);
  assert.match(app, /sync completed reason=[^\n]+[\s\S]{0,300}runServerAssistedSnsTick/);
  assert.match(app, /server-sync tick evaluated reason=/);
  assert.doesNotMatch(sns, /pairs\.slice\(0,\s*6\)/);
  assert.match(sns, /evaluateSnsAutomationCandidates/);
});

test('room reset epochs prevent Oracle history from reappearing before bootstrap cleanup', () => {
  const server = read('src/logic/serverMessaging.ts');
  const roomSettings = read('src/screens/RoomSettingsScreen.tsx');

  assert.match(roomSettings, /markRoomConversationReset\(state, roomId\)/);
  assert.match(server, /conversationResetAt: Number\(room\.conversationResetAt \|\| 0\)/);
  assert.match(server, /Number\(remote\.createdAt \|\| 0\) <= resetAt/);
  assert.match(server, /Number\(message\.createdAt \|\| 0\) > resetAt/);
});

test('notification settings distinguish remote delivery from the local Android service', () => {
  const settings = read('src/screens/settings/NotificationSettingsSection.tsx');
  const background = read('src/logic/backgroundAutomation.ts');
  const nativeModule = read('android/app/src/main/java/com/snsgod/rn/AutomationKeepAliveModule.kt');

  assert.match(settings, /백그라운드 자동화 상태/);
  assert.match(settings, /원격 보조 모드에서는 상태 알림 없이 서버가 처리합니다/);
  assert.match(settings, /로컬 전용 자동화는 Android 필수 상태 알림/);
  assert.match(background, /getAutomationNotificationChannelState/);
  assert.match(background, /openAutomationNotificationChannelSettings/);
  assert.match(nativeModule, /areAutomationNotificationsEnabled/);
  assert.match(nativeModule, /openAutomationNotificationSettings/);
  assert.doesNotMatch(settings, /setAutomationKeepAliveRunning\(false/);
});

test('Android renders server messages as character-first conversation notifications', () => {
  const service = read('android/app/src/main/java/com/snsgod/rn/CharacterMessagingService.kt');
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  const gradle = read('android/app/build.gradle');

  assert.match(service, /class CharacterMessagingService : ExpoFirebaseMessagingService/);
  assert.match(service, /NotificationCompat\.MessagingStyle/);
  assert.match(service, /Person\.Builder\(\)/);
  assert.match(service, /ShortcutManagerCompat\.pushDynamicShortcut/);
  assert.match(service, /setShortcutId\(shortcutId\)/);
  assert.doesNotMatch(service, /setLargeIcon/);
  assert.match(service, /loadLocalAvatar/);
  assert.match(service, /canonicalFile/);
  assert.match(service, /allowedRoots\.any/);
  assert.match(manifest, /expo\.modules\.notifications\.service\.ExpoFirebaseMessagingService[^>]+tools:node="remove"/);
  assert.match(manifest, /\.CharacterMessagingService[\s\S]+com\.google\.firebase\.MESSAGING_EVENT/);
  assert.match(gradle, /com\.google\.firebase:firebase-messaging:25\.0\.1/);
});

test('remote server mode avoids the foreground automation service and its persistent card', () => {
  const app = read('src/App.tsx');
  const service = read('android/app/src/main/java/com/snsgod/rn/AutomationKeepAliveService.kt');
  const settings = read('src/screens/settings/NotificationSettingsSection.tsx');

  assert.match(app, /const keepAliveOn = autoOn && state !== null && !isServerMessagingEnabled\(state\)/);
  assert.match(app, /setAutomationKeepAliveRunning\(keepAliveOn\)/);
  assert.match(app, /if \(isServerMessagingEnabled\(current\)\) \{[\s\S]{0,180}setAutomationKeepAliveRunning\(false\)/);
  assert.match(service, /ServiceCompat\.startForeground/);
  assert.match(settings, /원격 보조 모드에서는 상태 알림 없이 서버가 처리합니다/);
  assert.match(settings, /로컬 전용 자동화는 Android 필수 상태 알림/);
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
