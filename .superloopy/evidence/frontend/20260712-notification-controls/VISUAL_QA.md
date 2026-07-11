# Notification Controls Visual QA

## Environment

- Device: Samsung SM-S948N
- Android viewport: 1440 x 3120 physical pixels
- Build: SNSGod 0.3.6 (versionCode 15)
- Evidence: `notification-settings.png`, `notification-drawer.png`

The feature is native React Native UI, so browser breakpoints do not apply. The connected production-size Android device was used for the visual gate.

## Results

- PASS: the new `알림` category is visible in Basic Settings without clipping.
- PASS: `답장 메시지` and `캐릭터 선톡` switches have clear labels, helper text, and accessible switch semantics.
- PASS: the display-only scope is explained before the controls; message generation/storage is not implied to stop.
- PASS: the Android system permission link is visually separated from app-level type switches.
- PASS: the foreground-service notification exception is visible and does not compete with the primary controls.
- PASS: no horizontal overflow, overlapping text, inaccessible control, or truncated Korean copy was observed.
- PASS: the Android notification drawer shows the character name `김도희`, message content, and the character profile image as the large icon.

## Anti-slop preflight

- No nested-card excess, gradient, glassmorphism, hero treatment, decorative chart, or gratuitous animation.
- No newly invented color or spacing system.
- The screen preserves the app's warm, dense, utility-first settings language.
