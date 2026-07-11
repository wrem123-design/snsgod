# Root navigation visual QA

## Automated and static evidence

- PASS: exactly four roots are visible with Korean labels: 연락, 피드, 발견, 보관함.
- PASS: each root item exposes tab role, selected state, and a screen-reader label.
- PASS: personal/group/notifications, Instagram/X, discovery modes, and album/reference/backup are at most two taps from their owner root.
- PASS: generic settings and notifications are removed from the feed header to avoid duplicate root ownership.
- PASS: root switches replace and clear stale root history while notification, call, and meeting detail routes remain typed.
- PASS: no raw color was added to BottomNav, FeedHubScreen, or MenuHubScreen.
- PASS: no gradient, glow, decorative emoji, glass card, fake metric, or placeholder identity was introduced.

## Device evidence

- PENDING FINAL DEVICE RUN: bottom labels, 390px width, font scale, back stack, deep-link destinations, and TalkBack will be verified on 192.168.0.15:45691 after installation.
