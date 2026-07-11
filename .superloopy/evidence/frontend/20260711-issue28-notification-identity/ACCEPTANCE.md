# Issue 28 acceptance verification

| # | Acceptance criterion | Status | Evidence |
|---|---|---|---|
| 1 | Stable identity for user-visible receive events | PASS | Room message IDs and SNS DM message IDs form durable receipt keys. |
| 2 | Replay, merge and restart are idempotent | PASS | Serialized restart replay, duplicate receipt and concurrent stale merge tests pass. |
| 3 | Collapse count equals actual new messages | PASS | Multi-event collapse and unread floor tests pass without double increments. |
| 4 | Open/read clears related state atomically | PASS | Room and SNS DM tests clear notification, receipt and unread state in one pure transaction. |
| 5 | Direct/group/random/SNS DM and concurrency regressions pass | PASS | Producer connection tests, stale merge test, 155-test full suite, TypeScript and Android release build pass. |

All 5 criteria pass with no skipped or partial result.
