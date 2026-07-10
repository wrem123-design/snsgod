<!-- LOCAL-TESTING:START -->
## Local Service Testing

| Service | Status | Evidence |
| --- | --- | --- |
| SQLite | ✅ Running | Node 22 built-in SQLite executed the production-aligned schema and transaction flow against a real temporary database. |

Tests Run:

- `node --test test/message-retention-sqlite.integration.test.mjs` — PASSED
- Preserved 121 initial messages and the first message's media after close/reopen.
- Incrementally appended message 122, then replaced a room after editing an old message.
- Forced a message-row write failure and confirmed state, metadata, and messages all rolled back.

Tested At: 2026-07-11 (Asia/Seoul)
<!-- LOCAL-TESTING:END -->
