# Encrypted-backup settings visual QA

## Automated and static evidence

- PASS: the full-backup card offers a clearly labeled encryption switch and keeps ordinary ZIP compatible.
- PASS: password and confirmation are required only for encrypted export, with 10-character minimum and mismatch feedback before file work.
- PASS: restore has one optional secure password field whose placeholder says to leave it empty for ordinary ZIP.
- PASS: copy states that passwords are not stored or recoverable and that plain ZIP is unencrypted.
- PASS: passwords remain component-only state and are cleared after successful export or restore.
- PASS: no raw color, gradient, glow, decorative emoji, glass card, fake metric, or placeholder identity was added.

## Device evidence

- PASS: versionCode 13 release APK installed on Samsung SM-S948N with `adb install -r`; existing characters, conversations, notifications, and media remained present.
- PASS: the disabled state shows a plain-ZIP export label, optional restore-password field, compatibility copy, and backup actions at 384dp logical width without horizontal clipping.
- PASS: enabling the component-local switch reveals two secure new-password fields, changes the export label to encrypted backup, and reports `전체 백업 암호화, 켬` in the Android accessibility tree.
- PASS: the accessibility tree distinguishes `새 백업 암호`, `새 백업 암호 확인`, and `암호화 백업 복원 암호`, with the ordinary-ZIP empty-field hint.
- PASS: the release bundle loaded the noble crypto modules and the crash buffer remained empty after cold start, navigation, scrolling, and switch interaction.
- Personal backup export/import was intentionally not invoked; raw screenshot and UI XML remain in the ignored local device-evidence directory.
