# Expo SDK 57 upgrade verification

Date: 2026-07-11
Issue: #32

## Dependency and security result

- `npx expo install --check`: dependencies are up to date.
- `npm audit`: zero vulnerabilities after pinning the transitive `uuid` package to 11.1.1.
- Supported baseline: Expo 57.0.4, React Native 0.86.0, React 19.2.3, TypeScript 6.0.3.
- Existing `expo-file-system` calls explicitly use the SDK 57 legacy entry point so backup, persistence, media, and album behavior does not silently change during the security upgrade.

## Native migration

- Removed the obsolete `newArchEnabled=false` flag; React Native 0.86 uses the new architecture.
- Migrated Android startup from the removed host wrapper to `ExpoReactHostFactory` and `loadReactNative`.
- Preserved both custom native packages: `TermuxBridgePackage` and `AutomationKeepAlivePackage`.
- Removed the old manual Hermes executable override and added the React Native release-level build field.
- The release build uses `C:\sg-gradle` because nested worktree paths plus generated Prefab headers exceed the legacy Windows path limit.

## Automated verification

- Node tests: 244/244 passed, including four Expo 57 native and dependency regression gates.
- TypeScript: passed.
- Android release assembly: `BUILD SUCCESSFUL`, 289 tasks, target SDK 36.
- Expo Doctor: 19/20 checks passed. The only warning is the expected bare-project app-config synchronization warning. Prebuild is intentionally not run because it can replace custom native package registration; native compatibility was verified by release assembly and physical-device runtime checks.

## Physical device verification

Device: Samsung SM-S948N at `192.168.0.15:45691`

- Installed the release APK with `adb install -r`; existing app data was preserved.
- Package reports version 0.3.2, version code 13, and target SDK 36.
- The bridgeless React Native surface and JavaScript bundle started without a fatal exception.
- `snsgod://notifications` was delivered to the running MainActivity without a crash.
- The persisted automation configuration restored `AutomationKeepAliveService` as an active foreground service, confirming custom package registration and state hydration.
- Android crash buffer was empty.

The phone locked before a second post-upgrade visual traversal could be captured. No authentication bypass was attempted. Runtime startup, deep linking, persistence-driven automation, installation, and crash safety were still verified on the upgraded binary.

## Residual risk

- A later unlocked-device pass should visually revisit file selection, image selection, album save/delete, and notification navigation. Their code paths and tests are covered, but the final SDK 57 binary could not be visually traversed after the device locked.
