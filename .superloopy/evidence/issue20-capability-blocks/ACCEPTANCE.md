# Issue #20 Acceptance Verification

Verdict: **PASS — 5/5**

- Date calendar activates only for date/weekday intent; time follows the character setting; weather requires enabled, non-empty data.
- Image generation rules require enabled output plus image input, visual intent, or proactive mode.
- Phone rules require enabled calls plus explicit call intent; disabled-capability prohibition text was removed.
- Sticker lists and rules exist only when usable stickers exist in that chat.
- Shared capability snapshots, stable `capability.*` compiler IDs, and prompt budget tests pass.

Verification: focused 9/9, full suite 130/130, TypeScript, diff check, and Android release build passed.

APK SHA-256: `EB8369DE96C96D8B4F74532CC13BE3F2E428FB4127DBD33836E02CAFB7B77A92`
