<!-- REVIEW:START -->
## Code Review Complete

| Property | Value |
|----------|-------|
| Worker | `codex/root` |
| Issue | #61 |
| Scope | MAJOR |
| Security-Sensitive | NO |
| Reviewed | 2026-07-11T16:27:00+09:00 |

### Scope

- Changed behavior: Android keyboard avoidance and conditional latest-message pinning
- Changed production files: `useStickToBottomList.ts`, `ChatRoomScreen.tsx`, `GroupChatRoomScreen.tsx`
- Impacted callers: direct chat, random chat through direct-screen reuse, and group chat
- Integration points: root `SafeAreaView`, native `adjustResize`, inverted `FlatList`, multiline composer focus

### Criteria Results

| # | Criterion | Status | Findings |
|---|-----------|--------|----------|
| 1 | Blindspots | ✅ PASS | 0 |
| 2 | Clarity | ✅ PASS | 0 |
| 3 | Maintainability | ✅ FIXED | 1 |
| 4 | Security | ✅ PASS | 0 |
| 5 | Performance | ✅ PASS | 0 |
| 6 | Documentation | ✅ FIXED | 1 |
| 7 | Style | ✅ PASS | 0 |

### Findings Fixed in This PR

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 1 | Minor | The new non-forced composer-focus behavior was not described by the shared hook's public documentation | Added a JSDoc explanation that latest conversations are stabilized while intentionally scrolled history remains in place |

### Findings Deferred (With Tracking Issues)

None.

### Review Notes

- Android `height` behavior works with the existing native `adjustResize` without double-shrinking; verified on the installed release APK.
- The focus handler uses the existing non-forced pin path, so a user reading older history is not jumped to latest.
- No timers, subscriptions, network calls, persistence, secrets, or user data handling changed.
- The new focus callback schedules at most one existing `requestAnimationFrame` scroll when already near latest; no material performance cost was introduced.
- New regression coverage protects direct, random-by-reuse, group, iOS, and manifest behavior.

### Summary

| Category | Count |
|----------|-------|
| Fixed in PR | 1 |
| Deferred (with tracking) | 0 |
| Unaddressed | 0 |

**Review Status:** ✅ COMPLETE
<!-- REVIEW:END -->
