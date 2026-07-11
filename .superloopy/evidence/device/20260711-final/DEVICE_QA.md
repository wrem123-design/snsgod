# Final Android device QA

## Target and build

- Date: 2026-07-11 (Asia/Seoul)
- Device: Samsung SM-S948N (`m3qksx`), Android viewport 1440x3120 at 600dpi (384dp logical width)
- ADB target: `192.168.0.15:45691`
- Package: `com.snsgod.rn`
- Installed upgrade: versionCode 13, versionName 0.3.2; existing app data preserved with `adb install -r`
- APK SHA-256: `E0B0B02905478D33532DAD438F6152C5ACF18ADD85A3EDDD6A02CDA93E166280`

## Results

- PASS: full Node regression 210/210.
- PASS: TypeScript `tsc --noEmit`.
- PASS: Android release build, 276 tasks; Kotlin daemon access warning recovered through the compiler fallback and the build completed successfully.
- PASS: 연락, 피드, 발견, 보관함 roots render, switch, and expose distinct selected states.
- PASS: Feed exposes Instagram and X; Discover exposes random, encounter, blind date, dating app, and ideal-world-cup entries; Archive exposes album, references, SumGod, backup/settings, and diagnostics.
- PASS: notification deep link opens through Android VIEW intent and Back returns to the previous album route.
- PASS: switching to a root clears stale detail history; Back from Feed returns to 연락.
- PASS: Android UI trees expose meaningful tab, hub-row, album-filter, and album-action names.
- PASS: root targets are 52dp high. Album selection actions render at the intended approximately 42dp minimum height.
- PASS: 1.3 font scale keeps the chat list and all four bottom labels visible. The original 0.9 font scale was restored.
- PASS: album renders 361 existing items. Selection mode was inspected without saving, sharing, assigning, trashing, or deleting user data.
- PASS: copied-data trash/restore and rollback paths remain covered by automated temporary-file tests; destructive device testing was intentionally not performed on existing personal data.
- PASS: crash log buffer remained empty and `com.snsgod.rn/.MainActivity` stayed resumed with a live process.

## Evidence map

- Raw captures remain local-only and are ignored by Git because they contain personal character images and conversation previews.
- `contacts.png`, `feed.png`, `discover.png`, `archive.png`: four root states.
- `album.png`, `album-one-selected.png`: album and non-destructive selection state.
- `notifications.png`: Android notification deep-link destination.
- `large-font.png`: 1.3 font-scale layout.
- `window-*.xml`: Android accessibility names, bounds, selected states, and return-route states.

## Data-safety note

The installed application was upgraded without clearing storage. No existing media reference, file, favorite, character, room, or backup was changed by the QA run.
