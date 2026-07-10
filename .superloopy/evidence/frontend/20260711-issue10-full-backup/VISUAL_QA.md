# Full-backup settings visual QA

## Target

- Build: Android release APK with a temporarily isolated QA application ID
- Device: Samsung SM-S948N
- Surface: 1440 × 3120 physical pixels, approximately 360dp app width
- Scope: native Android phone app. Browser widths 768px and 1280px are not applicable because this repository has no web target or responsive desktop surface.

## Evidence

- `backup-all.png` / `backup-all.xml`: full-media and state-only backup choices in one Settings card
- `restore-confirm.png` / `restore-confirm.xml`: destructive restore confirmation and cancellation controls
- `restore-error-alert.png` / `restore-error-alert.xml`: invalid ZIP rejected before state activation with the exact cause

## Interaction results

- [x] Settings opens from the chat header and retains the existing section navigation.
- [x] `사진 포함 전체 ZIP` and `상태만 JSON` are visually and verbally distinct.
- [x] All action labels and Korean explanations remain unclipped at the target phone width.
- [x] Export, restore, JSON paste, and JSON import actions use the existing full-width touch target.
- [x] Restore selection opens a confirmation describing both state/media replacement and rollback behavior.
- [x] Cancellation closes the confirmation without starting restore.
- [x] A 133-byte invalid ZIP is rejected before media/state writes and shows `state.json이 없는 백업입니다.` in a native alert.
- [x] The safety reload no longer hides the failure cause.
- [x] The temporary QA package and device test ZIP were removed; the installed production app and its data were not replaced.

## Anti-slop pre-flight

- [x] Visible copy contains no em dash or AI-style marketing language.
- [x] No eyebrow label, repeated feature-card pattern, gradient, glow, glass effect, or fake metric was introduced.
- [x] Existing warm palette, card, border, radius, typography, and native Korean font stack remain consistent.
- [x] No new raw visual value or animation was introduced.
- [x] Loading/disabled, confirmation, cancellation, success text, and error alert states are represented.
- [x] No fabricated imagery or placeholder identity appears in the backup surface.

## Verdict

PASS for the scoped native phone surface.
