<!-- REVIEW:START -->
# Code review complete

| Property | Value |
| --- | --- |
| Worker | `root` |
| Issue | #59 |
| Scope | Major, authentication flow and visible recovery state |
| Security-sensitive | Yes |
| Reviewed | 2026-07-11 |

## Review scope

- Changed: server connection policy, server request error classification, Settings Oracle flow, dedicated tests.
- Impacted: startup/resume Oracle sync, stale state merge, SecureStore token persistence, server registration and bootstrap endpoints.
- Integration: installed Android release against the live Oracle service.

## Criteria results

| # | Criterion | Status | Findings |
| --- | --- | --- | --- |
| 1 | Blindspots | Fixed | 1 stale 401 race |
| 2 | Clarity and consistency | Pass | 0 |
| 3 | Maintainability | Pass | 0 |
| 4 | Security | Fixed | 1, detailed in `SECURITY_REVIEW.md` |
| 5 | Performance | Pass | Existing-token sync removes an unnecessary registration request. |
| 6 | Documentation | Pass | Public policy APIs have JSDoc and evidence covers recovery semantics. |
| 7 | Standards and style | Pass | Strict TypeScript, existing tokens, no new dependency. |

## Findings fixed in this PR

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | Major | A late 401 from an old request could clear a newer valid registration. | Token invalidation now requires matching request ID, endpoint, device ID, and device token; dedicated regression test added. |
| 2 | Minor | Existing-token success incorrectly said `초기 동기화 완료`. | Initial registration and ordinary resync now use distinct accurate copy. |

## Summary

| Category | Count |
| --- | --- |
| Fixed in PR | 2 |
| Deferred with tracking | 0 |
| Unaddressed | 0 |

**Review Status:** ✅ COMPLETE
<!-- REVIEW:END -->
