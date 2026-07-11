<!-- REVIEW:START -->
# Code review complete

| Property | Value |
|----------|-------|
| Worker | `Codex` |
| Issue | #27 |
| Scope | MAJOR |
| Security-Sensitive | YES |
| Reviewed | 2026-07-11T09:17:33+09:00 |

## Criteria results

| # | Criterion | Status | Findings |
|---|-----------|--------|----------|
| 1 | Blindspots | FIXED | 1 |
| 2 | Clarity | PASS | 0 |
| 3 | Maintainability | PASS | 0 |
| 4 | Security | FIXED AND DEFERRED | 2 |
| 5 | Performance | PASS | 0 |
| 6 | Documentation | PASS | 0 |
| 7 | Style | PASS | 0 |

## Findings fixed in this PR

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 1 | Major | A rapid state update could make the read flag use current state while navigation used an older snapshot. | Read update and route resolution now execute together inside one latest-state patch. |
| 2 | Medium | The custom URL parser accepted unexpected paths, credentials, fragments and unbounded notification IDs. | Parser now restricts structure and caps IDs at 512 characters; negative tests cover each form. |

## Findings deferred with tracking issues

| # | Severity | Finding | Tracking issue | Justification |
|---|----------|---------|----------------|---------------|
| 3 | Medium | Existing Expo 53 transitive dependencies report 11 moderate advisories in `postcss` and `uuid`. | #32 | The available automatic fix migrates Expo to SDK 57 and requires a dedicated native framework upgrade and regression cycle. This PR adds no dependency. |

## Security review

Security-sensitive input is limited to the `snsgod:` custom URL. Only the exact `notifications` and `notification` hosts are accepted. Credentials, ports, fragments, unexpected paths, foreign schemes, missing IDs and IDs over 512 characters are rejected. Accepted IDs are compared with local in-memory entities and are never used in shell commands, file paths, SQL, templates or network requests.

| OWASP category | Result |
|----------------|--------|
| A01 Broken Access Control | N/A, single-user local app and no privileged operation |
| A02 Cryptographic Failures | PASS, no secret or sensitive payload added to links |
| A03 Injection | PASS, ID is only an exact local lookup key |
| A04 Insecure Design | PASS, deleted and malformed targets fall back safely |
| A05 Security Misconfiguration | PASS, Android intent is restricted by the app scheme and parser |
| A06 Vulnerable Components | DEFERRED #32, pre-existing moderate Expo transitive advisories |
| A07 Authentication Failures | N/A, no authentication flow changed |
| A08 Data Integrity Failures | PASS, only one matched notification read flag is updated |
| A09 Logging Failures | PASS, no sensitive link value is logged by this change |
| A10 SSRF | N/A, no server-side request is made |

## Summary

| Category | Count |
|----------|-------|
| Fixed in PR | 2 |
| Deferred with tracking | 1 |
| Unaddressed | 0 |

**Review Status:** COMPLETE
<!-- REVIEW:END -->
