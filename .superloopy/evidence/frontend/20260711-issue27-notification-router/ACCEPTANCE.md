# Issue 27 acceptance verification

Verified: 2026-07-11T09:17:33+09:00

| # | Acceptance criterion | Status | Evidence |
|---|---|---|---|
| 1 | Typed targets cover direct/group messenger, random chat, SNS post, SNS DM, SumGod, call and meeting. | PASS | `NotificationTarget` discriminated union and target-specific unit tests. |
| 2 | One pure resolver validates the target against current state and returns a route or safe fallback. | PASS | `resolveNotificationRoute()` tests valid and deleted room, post, thread, character and session entities. |
| 3 | Notification list taps and Android root/cold-start entry share the resolver. | PASS | Static wiring test, Android VIEW intent cold start and warm intent physical-device QA. |
| 4 | Stale targets are read and return safely to the list. | PASS | `openNotificationRequest()` unit test and physical-device `id=deleted` warm-link QA. |
| 5 | Target, missing entity and cold/warm regression coverage passes. | PASS | 6 focused tests, 143/143 full Node tests, TypeScript check, Android release build and physical-device QA. |

## Verification commands

```text
node --test test/notification-routing.test.mjs: 6 passed
node --test test/*.test.mjs: 143 passed
npm run check: passed
npm run android:release: BUILD SUCCESSFUL
ds-compliance.mjs: passed
git diff --check: passed
```

## Result

All 5 acceptance criteria pass. No skipped or partial criterion remains.
