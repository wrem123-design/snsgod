# Visual QA

Device: Galaxy Android, 1440 x 3120, density 600, release build 0.3.7 (16).

## Result

- Android reported the visible status bar frame as `y=0..140px`.
- UI Automator reported the `채팅` title at `y=207..334px` and the first header action at `y=200..343px`.
- The full 140px system status bar region is therefore clear of app content.
- `statusbar-inset-after.png` confirms the battery indicator and app title no longer overlap.
- The existing header spacing, list density, and bottom navigation remain unchanged.

## Anti-slop pre-flight

- No new decorative UI, copy, gradients, cards, pills, icons, or motion.
- Existing palette, type, shape, and navigation systems remain unchanged.
- The only new spacing value is the device-provided system inset declared in `DESIGN.md`.

Verdict: PASS.
