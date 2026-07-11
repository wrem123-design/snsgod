# Expo SDK 57 visual compatibility note

Date: 2026-07-11
Issue: #32

- Scope was compatibility-only: `StyleSheet.absoluteFillObject` references were replaced by the equivalent supported `StyleSheet.absoluteFill` value.
- No layout tokens, spacing, typography, color, navigation hierarchy, or interaction copy changed.
- The immediately preceding device pass in this work session covered the app's primary screens and settings hierarchy.
- The upgraded binary launched its bridgeless React surface, handled the notifications deep link, and remained crash-free.
- The device then required user authentication, so no lock-screen bypass or destructive test was attempted. A post-upgrade screenshot set is therefore not claimed.

Verdict: no intentional visual delta; automated source gates prevent the removed style API from returning. Final unlocked-device visual confirmation remains a release checklist item rather than evidence fabricated from a locked screen.
