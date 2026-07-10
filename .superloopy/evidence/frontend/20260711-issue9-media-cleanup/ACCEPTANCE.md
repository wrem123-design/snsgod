# Issue #9 Acceptance Verification

Run: 2026-07-10T20:37:55Z

Branch: `codex/issue-9-media-gc`

Base commit: `4e715011eb39983badd6975fe0d73ef7fb7e5c58`

| # | Acceptance criterion | Status | Evidence |
|---|---|---|---|
| 1 | state reference graph로 reachable media를 계산한다. | PASS | One canonical visitor exposes the complete non-deduplicated graph, including 51+ reference slots, character/SNS/DM/meeting/dating media. |
| 2 | unlink와 물리 삭제를 구분한다. | PASS | Gallery delete only unlinks state. Explicit “미사용 정리” flushes state, previews candidates, then moves only unreachable app-owned files to recoverable trash. |
| 3 | 캐릭터·방·메시지 삭제 시 관련 job·notification·session·DM reference가 정리된다. | PASS | Central cascade is wired to character, direct/group/random room, message, SNS post, and DM deletion paths; affected runtime jobs are cancelled. |
| 4 | 공유 자산은 마지막 reference가 사라질 때만 삭제 대상이 된다. | PASS | Reachability counts every state edge; two-owner and final-reference cases are covered by GC tests. |
| 5 | GC dry-run과 삭제 회귀 테스트가 통과한다. | PASS | Dry-run is read-only; rollback, interrupted recovery, purge, concurrency, traversal protection, and cascade tests pass. Full suite 105/105. |

## Additional evidence

- TypeScript: PASS
- Android release build and lintVital: PASS
- Real-device empty/loading/result interaction: PASS
- Physical deletion safety: files outside the owned media root and traversal-shaped paths are protected
- Retention: committed trash is permanently purged only after 30 days at startup

Summary: **5 PASS, 0 FAIL, 0 PARTIAL, 0 SKIP**.
