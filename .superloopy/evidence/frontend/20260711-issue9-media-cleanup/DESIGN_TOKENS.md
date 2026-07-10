# Gallery media cleanup token record

Source contract: `DESIGN.md`

- Direction: warm, compact, character-first local messenger utility
- Background: `app.bg`
- Header surface: `app.panel`
- Cleanup control surface: `colors.surfaceAlt`, the existing warm neutral control surface
- Text: `app.text` and `app.sub`
- Border: `app.border`
- Touch height: `control.touch` (42px minimum)
- Shape: `control.round` (8px)
- Pressed state: `control.pressedOpacity` (0.78)
- Disabled state: `control.disabledOpacity` (0.5)
- Font: native system sans for Korean legibility and offline rendering

No new color family, font dependency, shadow, gradient, or motion was introduced.
