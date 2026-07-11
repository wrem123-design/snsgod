# SNS GOD Design Tokens

## Atmosphere
The app uses warm messenger surfaces with soft contrast, compact controls, and clear character-first content. Event screens may be more cinematic, but they still keep the same warm accent and compact mobile rhythm.

## Color
- app.bg: `#f7f4ed`
- app.panel: `#fffdf7`
- app.panelSoft: `#fffefa`
- app.surfaceAlt: `#eee8dc`
- app.text: `#27221b`
- app.sub: `#766f64`
- app.border: `#ded5c6`
- app.accent: `#f1d15b`
- app.accentText: `#241a00`
- app.kakao: `#fee500`
- app.danger: `#ff665e`
- meeting.ink: `#edf2f6`
- meeting.backdrop: `#151d27`
- meeting.card: `rgba(0,0,0,0.56)`
- meeting.cardBorder: `rgba(255,255,255,0.1)`
- dating.heart: `#d0006f`
- dating.heartSoft: `#ffe5f1`
- dating.online: `#16c784`
- dating.shadow: `rgba(39,34,27,0.16)`

## Typography
- font.family: native system sans, selected for Korean legibility and fully offline rendering
- screen.title: 19px, 900
- screen.subtitle: 12px, 700
- chat.body: 16px, line-height 22
- meeting.body: 18px, line-height 28, 800
- compact.label: 11px, 900

## Spacing
- screen.gutter: 12px
- meeting.gutter: 18px
- compact.gap: 8px
- card.padding: 12px
- meeting.cardPadding: 18px

## Shape
- control.round: 8px
- bubble.round: 16px
- image.round: 12px
- meeting.round: 14px

## Interaction
- control.touch: 42px minimum height
- control.pressedOpacity: 0.78
- control.disabledOpacity: 0.5

## Components
- Chat bubbles use warm off-white for other speakers and yellow for the user.
- System event cards stay centered and compact, with actions directly below the content.
- Meeting visuals prioritize real generated images. If absent, use a structured visual placeholder with place, mood, and participant silhouettes rather than text alone.
- Album header: 72px height; album grid uses 12px gutter, 8px gap, and 12px image radius.
- Album filter: 42px minimum touch height, 8px radius, surfaceAlt default and accent selected state.
- Album states: 26px favorite badge, 220px empty-state minimum, 170px detail information maximum, and 34/36px back glyph size/line-height.

## Motion
- Meeting text fades in with opacity only.
