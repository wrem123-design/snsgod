# Issue #59 acceptance verification

Date: 2026-07-11
Branch: `codex/issue-59-oracle-resync`

| # | Criterion | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Registered device resyncs with an empty pairing field | Pass | Physical release APK resync advanced 15:57:09 to 15:57:25 without entering a key. |
| 2 | First registration still requires pairing secret | Pass | `registerServerDevice` retains the non-empty secret gate; unit policy distinguishes incomplete identity. |
| 3 | Invalid token produces explicit re-registration | Pass | HTTP 401 maps to a safe Korean authentication error, clears only token-bound progress, and changes the button to `기기 다시 등록`. |
| 4 | Feedback is visible beside Oracle controls | Pass | Physical screenshot shows the status box directly under the Oracle card title. |
| 5 | Registration, resync, invalid token, and stale-result tests | Pass | Five dedicated tests pass, including stale request ID and newer-token preservation. Existing stale-state merge tests also pass. |
| 6 | Release and physical resync without clearing data | Pass | 249 tests, TypeScript, 289-task release build, `adb install -r`, physical resync, server health, and empty crash buffer passed. |

Summary: 6/6 passed.
