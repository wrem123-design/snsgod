<!-- SECURITY_REVIEW:START -->
# Security review

| Property | Value |
| --- | --- |
| Issue | #59 |
| Security-sensitive | Yes, registered-device token handling |
| Reviewed | 2026-07-11 |

## OWASP checklist

| Category | Result | Notes |
| --- | --- | --- |
| A01 Broken access control | Pass | Server requests still require both device ID and token; first registration still requires the bootstrap secret. |
| A02 Cryptographic failures | Pass | Token and pairing secret are never included in status text, logs, screenshots, or ordinary state backups; existing SecureStore boundary remains intact. |
| A03 Injection | Pass | No query, shell, HTML, or command construction was added. Server error text is rendered through React Native text. |
| A04 Insecure design | Fixed | A stale 401 could initially clear a newer token. Request ID, normalized endpoint, device ID, and token must now all match before invalidation. |
| A05 Security misconfiguration | Pass | No platform or server configuration changed. |
| A06 Vulnerable components | Pass | `npm audit --audit-level=moderate`: zero vulnerabilities. |
| A07 Authentication failures | Pass | Only HTTP 401 is classified as rejected device authentication; invalid bootstrap secret remains a separate registration failure. |
| A08 Data integrity failures | Pass | Registration progress is reset only for the exact failed identity; outbox and local messages are retained. |
| A09 Logging failures | Pass | User receives a safe recovery message without token, secret, response body, or stack trace exposure. |
| A10 SSRF | Not introduced | No server-side URL fetching was added; the existing user-configured client endpoint boundary is unchanged. |

Security findings: 1 fixed, 0 deferred, 0 unaddressed.

Security review status: PASS.
<!-- SECURITY_REVIEW:END -->
