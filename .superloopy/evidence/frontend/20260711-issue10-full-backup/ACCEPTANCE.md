# Issue #10 Acceptance Verification

Run: 2026-07-11

Branch: `codex/issue-10-full-zip-backup`

Base commit: `c8974f036ec2320bd364f742037b8de96275d0c6`

| # | Acceptance criterion | Status | Evidence |
|---|---|---|---|
| 1 | full ZIP import registers restored files in manifest. | PASS | Every archived record is restored through canonical storage; the resulting manifest row is required before URI replacement. |
| 2 | explicitly selected older backup is not silently skipped due revision. | PASS | Import persistence promotes the selected backup above both its own and the persisted revision; regression source assertion covers the rule. |
| 3 | state-only and full-media backup are clearly distinguished in UI and payload. | PASS | Settings labels and explains `사진 포함 전체 ZIP` and `상태만 JSON`; full ZIP metadata is `snsgod-full-backup-v2`/`full-media`. |
| 4 | export → delete → import restores state and media. | PASS | Round-trip policy test deletes the old reference, restores canonical media, and verifies the state URI points to the registered restored file. |
| 5 | failure preserves original state and explains cause. | PASS | Partial media is rolled back, the pre-restore state is re-imported at a new revision after state-import failure, and a native alert exposes the exact cause even after the safety reload remounts Settings. |

## Additional evidence

- Strict ZIP metadata, unknown-file, path, CRC, entry-count, expanded-size, and compression-ratio validation
- Only state-reachable manifest media is exported; missing or unmanaged file references fail instead of producing a partial backup
- TypeScript: PASS
- Tests: 110/110 PASS
- Android release build and lintVital: PASS
- Real-device confirmation, cancellation, and corrupt-ZIP failure alert: PASS
- README backup guidance synchronized

Summary: **5 PASS, 0 FAIL, 0 PARTIAL, 0 SKIP**.
