# Visual QA evidence

## Scope

This change keeps the existing call, private meeting, group meeting, and chat-card layouts. It adds resume labels and lifecycle behavior without adding styles or layout values.

## Static checks

- PASS: all values continue to trace to the existing `DESIGN.md`; no new visual token was introduced.
- PASS: no new hex color, font, spacing, radius, shadow, image, icon, or animation was added.
- PASS: existing pressed, disabled, loading, input, choice, and terminal result states remain in place.
- PASS: anti-slop copy check for the three new Korean labels; no banned cliché, decorative micro-tell, em dash, or placeholder copy was added.
- PASS: TypeScript check, 183 Node tests, and Android release build.

## Device visual check

- DEFERRED BY USER: 390 px Android device screenshots, back-button interaction, background/foreground transition, and APK installation will be performed in the final device stage when a phone is available.
- No browser surrogate is used because this is a React Native Android screen and the user explicitly requested device work to be postponed.
