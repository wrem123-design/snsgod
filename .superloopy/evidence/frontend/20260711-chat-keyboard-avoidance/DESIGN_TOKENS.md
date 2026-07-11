# Design Token Trace

- Surface: general, random, and group chat composer layout
- Direction: preserve the existing warm local-messenger visual language and change only keyboard layout behavior
- DESIGN_VARIANCE: 1/10
- MOTION_INTENSITY: 1/10
- VISUAL_DENSITY: 8/10
- `chat.keyboardAvoidance`: iOS padding, Android height with native `adjustResize`
- `chat.keyboardVerticalOffset`: 0px inside the root safe area
- `chat.composerFocus`: pin the latest message only when the list was already near its visual bottom
- Existing colors, typography, spacing, shape, and touch targets remain unchanged
