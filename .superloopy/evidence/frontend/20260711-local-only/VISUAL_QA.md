# Local-only settings visual QA

## Automated and static evidence

- PASS: new state explicitly defaults to `local-only`; legacy enabled Oracle installations remain compatible until the user turns them off.
- PASS: Oracle registration, startup/resume sync, settings sync, and in-flight completion are gated by one policy.
- PASS: the build contains no Firebase/FCM initialization dependency or Google services file.
- PASS: the API section explains Oracle background networking separately from user-triggered AI provider requests.
- PASS: server save/connect controls are disabled while local-only is active.
- PASS: no raw color, gradient, glow, decorative emoji, glass card, fake metric, or placeholder identity was added.

## Device evidence

- PASS: versionCode 13 APK installed with `adb install -r` without clearing data.
- PASS: Samsung SM-S948N accessibility tree reports `Oracle 원격 보조 모드, 끔` and includes the local boundary/network explanations.
- PASS: the local-only card, switch, and provider card render at 384dp logical width without clipping.
- PASS: crash log buffer remained empty after navigation to the API section.
- Raw screenshot and UI XML remain local-only under the ignored device evidence directory.
