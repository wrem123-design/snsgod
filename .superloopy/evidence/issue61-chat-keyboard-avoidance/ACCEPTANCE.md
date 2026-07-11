# Acceptance Verification: Issue #61

Verified: 2026-07-11T16:27:00+09:00

| # | Acceptance criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Android direct chat resizes the message list and composer above the keyboard | PASS | Release APK physical-device test; composer moved from `y=2925..3083` to `y=1579..1737` and ended exactly where the keyboard began |
| 2 | Android group chat uses the same keyboard-aware layout | PASS | `chat-keyboard-avoidance.test.mjs` verifies Android `height`, zero offset, and conditional focus pin on `GroupChatRoomScreen`; release TypeScript and Android compilation passed |
| 3 | The latest message remains visible above the composer when focus begins at latest | PASS | Physical-device bounds moved from `y=2672..2861` to `y=1326..1515`, leaving a visible gap before the composer at `y=1579` |
| 4 | Existing iOS padding behavior remains | PASS | Regression test verifies both chat screens keep the iOS `padding` branch |
| 5 | Native `adjustResize` and screen behavior are regression-protected | PASS | Focused test verifies the manifest and both screen branches; 3/3 passed |
| 6 | Release build and physical-device visual QA pass | PASS | 289 Gradle tasks succeeded; data-preserving install succeeded; keyboard-open visual QA passed; crash buffer empty |

## Verification summary

- Focused keyboard tests: 3/3 passed
- Full Node tests: 252/252 passed
- TypeScript: passed
- Dependency audit: 0 vulnerabilities
- Design system compliance: passed
- Android release build: passed
- Physical-device keyboard-open layout: passed
- Crash buffer: empty

Result: 6/6 acceptance criteria passed.
