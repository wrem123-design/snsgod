# Visual QA

Device: Android, 1440 x 3120, release build 0.3.7 (16).

## Notification channel

- `automation-notification-settings.png` confirms that the in-app action opens the exact Android `자동화 실행` notification category.
- The system switch, title, explanatory text, and navigation all remain readable without clipping.
- The in-app row uses the existing settings hierarchy and does not add a duplicate fake toggle.

## SNS generation

- `sns-image-retry-result.png` confirms the server-signaled SNS post is present in the Instagram feed.
- `sns-debug-verification.png` confirms the legacy FormData failure is gone. The retry reached the image server and stopped at the independently expired xAI OAuth session.

Verdict: PASS for the changed notification UI and SNS feed rendering. External image-account authentication requires re-login and is not a layout defect.
