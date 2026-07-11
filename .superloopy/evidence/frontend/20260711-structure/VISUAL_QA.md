# Structural extraction visual QA

## Automated evidence

- PASS: 240 Node tests cover module boundaries, four-root orchestration, settings IA, encrypted/plain backup flows, transactional restore, local-only policy, SecureStore redaction, media lifecycle, and stale async work.
- PASS: public settings mode/section and backup-props types compile without circular imports.
- PASS: App contains no duplicated bottom-navigation route chain; backup UI contains no file, crypto, ZIP, or restore operation.
- PASS: settings and backup source-contract tests were updated to follow the extracted components rather than weakening assertions.

## Device evidence

- PASS: final versionCode 13 release APK installed on Samsung SM-S948N with `adb install -r`; local conversations, notifications, characters, and media remained present.
- PASS: Contact, Feed, Discover, and Archive roots each rendered their expected hub title and feature entries through the extracted root-navigation visibility policy.
- PASS: settings opened in basic mode with five sections and the local-data card; advanced mode rendered four sections, its warning, and existing Provider values.
- PASS: extracted backup section rendered compatible/full controls. Its component-local encryption switch changed from `끔` to `켬` and exposed both secure new-password fields with the expected accessibility labels.
- PASS: no saved setting, password, export, import, deletion, or server action was invoked; the switch state is non-persistent UI state.
- PASS: Android crash buffer remained empty after cold start, three root transitions, settings mode transitions, backup navigation, and conditional-field interaction.
- Raw final UI hierarchy remains local-only and is removed after inspection; previous ignored screenshots document the unchanged settings visual layout.
