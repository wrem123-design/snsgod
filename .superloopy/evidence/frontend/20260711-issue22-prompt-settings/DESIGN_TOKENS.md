# Design token evidence

- Source of truth: repository root `DESIGN.md`
- Atmosphere: warm, compact, character-first native messenger settings
- Variance: `DESIGN_VARIANCE=2`
- Motion: `MOTION_INTENSITY=1`
- Density: `VISUAL_DENSITY=7`
- Added named tokens for values already used by the prompt settings screen: `app.panelSoft`, `app.surfaceAlt`, `app.accentText`
- The changed screen now reads every color through `src/theme.ts`; it introduces no orphan color, spacing, radius, or shadow literal.
- `ds-compliance.mjs` exited successfully for `PromptSettingsScreen.tsx` and `CharacterSettingsScreen.tsx`.
