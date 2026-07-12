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
- settings.sectionTitle: 17px, 900
- settings.rowTitle: 14px, 900
- settings.help: 12px, line-height 18, 700

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
- chat.keyboardAvoidance: all chat screens use bottom padding so Galaxy IME toolbars and keyboards cannot cover the composer; Android also keeps native adjustResize
- chat.keyboardVerticalOffset: Android 56dp to include the Galaxy IME toolbar in avoidance; iOS 0px because chat screens render inside the root safe area without a navigation header overlay
- chat.composerFocus: keep the latest message visible only when the conversation was already near the bottom; preserve intentionally scrolled history
- system.statusBarInset: Android uses the runtime `StatusBar.currentHeight`; iOS continues to use the native `SafeAreaView` inset

## Components
- Chat bubbles use warm off-white for other speakers and yellow for the user.
- System event cards stay centered and compact, with actions directly below the content.
- Meeting visuals prioritize real generated images. If absent, use a structured visual placeholder with place, mood, and participant silhouettes rather than text alone.
- Album header: 72px height; album grid uses 12px gutter, 8px gap, and 12px image radius.
- Album filter: 42px minimum touch height, 8px radius, surfaceAlt default and accent selected state.
- Album states: 26px favorite badge, 220px empty-state minimum, 170px detail information maximum, and 34/36px back glyph size/line-height.
- Album selection: 52px action bar minimum, 42px action touch height, 28px selected marker, and 12px action bar gap. Selection confirmation uses the existing panel, border, accent, and danger tokens without introducing another surface style.
- Album trash: reuse the 42px action touch height, 12px image radius, 12px card padding, and 8px compact gap. Restore uses surfaceAlt; permanent delete uses danger only on the final action. Impact rows remain plain panel rows rather than a new card family.
- Root navigation: four equal roots in a 68px bottom bar, each with a 24px system glyph and visible 11px Korean label. Selected state uses accent on panel; unselected state uses panelSoft and sub text. Root hub rows use 72px minimum height, 12px padding, 12px radius, and 8px gap.
- Notification settings: reuse the panel card with 12px padding and 8px radius. Each system-alert row is at least 72px high with an accessible 42px on/off control. The foreground-service row uses the same rhythm with a 42px Android channel-settings action. Explanatory and Android permission blocks use panelSoft rather than introducing another card family.
- Android message notifications: use the system conversation template with the character profile as the leading conversation identity. Never duplicate the profile as a right-side large image; the mandatory app identity remains only as Android's small badge.
- Android automation service: remote/server mode relies on high-priority FCM and does not start the local foreground service, so no automation status card appears. Local-only mode may use Android's required low-priority foreground-service card to keep in-process timers alive.

## Motion
- Meeting text fades in with opacity only.
