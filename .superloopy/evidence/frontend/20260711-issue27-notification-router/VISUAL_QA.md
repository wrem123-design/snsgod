# Issue 27 visual QA

## Environment

- Device: Samsung SM-S948N
- Physical size: 1440 × 3120
- Package: `com.snsgod.rn`
- QA install: temporary version code 12 over the existing version code 11; source restored to version code 8 after verification
- Surface: native React Native app, so browser breakpoints and Lighthouse are not applicable

## Verified flows

1. Force-stopped the app and launched `snsgod://notifications` through Android VIEW intent.
2. Android reported `LaunchState: COLD`; the first rendered screen title was `알림`.
3. Delivered the same root link while the app was running; the existing activity received it and opened the notification list.
4. Tapped an existing SNS post notification. The app opened the correct X/Twitter character feed and the target post text was present in the UI hierarchy.
5. Delivered `snsgod://notification?id=deleted` while the app was running. The missing target returned to the notification list without a crash or unrelated room navigation.
6. Confirmed existing header, list density, touch targets, scrolling, read state, and empty-safe fallback remain usable.

## Privacy handling

The physical-device PNG and XML captures contain private local character content. They remain in this ignored evidence directory for local inspection and are intentionally excluded from the PR. The committed artifact records the commands, states, and observed outcomes without copying that content.

## Design-system and anti-slop preflight

- Pass: no visual value, layout, animation, gradient, glow, card grid, pill, hero, or decorative element was added.
- Pass: the existing warm compact native hierarchy and design tokens are unchanged.
- Pass: no new visible copy, em dash, placeholder, fake statistic, or AI cliché was introduced.
- Pass: design-system compliance exited successfully for `NotificationsScreen.tsx` and `SNSScreen.tsx`.
- Not applicable: browser hover, 390/768/1280 breakpoints, Lighthouse, image-first composition, and reduced-motion checks for this behavior-only native change.

## Result

Pass. Cold start, warm routing, typed SNS target navigation, and stale-target fallback work on the physical Android device.
