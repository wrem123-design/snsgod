# SNSGod React Native

This is the replacement mobile app path for SNSGod. The old Android WebView app is kept in `../android-app`; this folder is the new React Native implementation.

## Current scope

- Native React Native screens instead of WebView HTML.
- Legacy `msgod_state_v2.json` backups are imported from the Settings screen by selecting a JSON file or pasting JSON text. Personal backup JSON is intentionally not committed or bundled because it can contain API keys and private character data.
- API settings screen preserves provider model and key rotation slots.
- Image generation settings support an OpenAI-compatible Responses or image generation endpoint. Generated media can be attached to chat replies, SNS posts, character profile photos, and cover photos when enabled.
- Image selection uses the Android document picker so character photos, SNS post images, and chat image messages are stored inside app backup JSON.
- Sticker entries can include inline data URI images, show previews in character settings, and render as image stickers in 1:1 and group chats.
- Chat list screen renders existing characters, 1:1 rooms, group rooms, unread counts, SNS, gallery, random chat, SumGod, notifications, and settings entry points.
- SNS generation stores richer Instagram/Twitter-style posts with stats, comments, optional generated images, AI comment replies, and SNS DM threads that can continue through the configured model.
- Settings writes wait for AsyncStorage persistence before showing a success message.
- Release APKs are built from the native Android project under `android/`.

## Run

Install dependencies once:

```powershell
npm install
```

Then run on Android:

```powershell
npm run android
```

## Verify

```powershell
npm test
npm run check
npm run android:release
npm run android:crashlog
```

The Windows release script intentionally uses `C:\sg-gradle` as its Gradle user
home. React Native 0.86 Prefab headers can otherwise exceed the legacy Windows
path-length limit when this repository is opened from a nested worktree. This
directory is only a reproducible build cache; app data and source files are not
stored there.

This bare native project is upgraded manually. Run `npx expo install --check`
and `npx expo-doctor` after dependency changes, but do not run `expo prebuild`
without reviewing the generated native diff: `MainApplication.kt` registers the
local `TermuxBridgePackage` and `AutomationKeepAlivePackage` packages.

The release APK is written to:

```text
android/app/build/outputs/apk/release/app-release.apk
```

Install the release APK to the connected Android device:

```powershell
npm run android:install:release
```

## Migration note

The current device backup is stored outside this app at:

```text
../backup/device-20260628-154522/
```

To migrate it into the RN app, open Settings and use either the JSON file picker or paste the JSON contents into:

```text
Settings > Backup > JSON file import / pasted JSON import
```

`assets/import/*.json`, `node_modules`, Android build outputs, and local SDK paths are ignored by git.
