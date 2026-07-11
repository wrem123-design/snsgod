# Visual QA: Chat Keyboard Avoidance

## Build and device

- Build: Android release APK, 289 Gradle tasks
- Install: data-preserving `adb install -r`
- Device: physical Android handset at `1440 x 3120`, portrait
- Screen: existing direct chat with enough history to fill the viewport
- Keyboard: Samsung Korean software keyboard, confirmed by `mInputShown=true` and `mIsInputViewShown=true`

## Measured layout

| State | Composer input bounds | Latest message bounds | Result |
| --- | --- | --- | --- |
| Keyboard closed | `[600,2925][1133,3083]` | `[180,2672][1162,2861]` | Latest message sits above composer |
| Keyboard open | `[600,1579][1133,1737]` | `[180,1326][1162,1515]` | Composer and latest message move upward together |

- The keyboard begins immediately below the composer at `y=1737`.
- The latest message ends at `y=1515`, leaving a visible gap before the composer begins at `y=1579`.
- No message bubble, timestamp, composer control, or keyboard surface overlaps.
- The list stays on the latest conversation when focus begins from the latest position.
- The shared hook preserves intentionally scrolled history because focus uses the non-forced pin path.

## Surface coverage

- Direct chat: visually passed on the installed release APK.
- Random chat: uses the same `ChatRoomScreen` implementation and is covered by the same release code path.
- Group chat: uses the same Android keyboard behavior and non-forced focus pin; the source-level regression test verifies both properties. A temporary group was not added to the user's local-only data solely for QA.
- iOS: existing padding behavior is preserved by the platform branch and covered by the regression test.

## Native viewport note

This is a portrait-only React Native Android app rather than a served browser page. Browser viewport captures at 390, 768, and 1280 px do not apply. The actual physical-device viewport and software keyboard were used instead.

## Anti-slop pre-flight

- [x] No visual redesign or new color, type, spacing, radius, or shadow value introduced.
- [x] Existing color, shape, theme, font, and component systems remain unchanged.
- [x] No new visible copy, decorative treatment, fake asset, or motion introduced.
- [x] Existing enabled, disabled, focus, typing, and empty states remain intact.
- [x] Keyboard-open and keyboard-closed states were both exercised.
- [x] No horizontal overflow or clipped composer control was observed.
- [x] Every new layout decision traces to the chat keyboard interaction tokens in `DESIGN.md`.

Screenshots used during physical-device inspection contained the user's local conversation and were intentionally excluded from version control. The non-sensitive bounds and verification outcome are recorded above.
