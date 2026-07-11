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

- PASS: versionCode 13 release installed on Samsung SM-S948N at 192.168.0.15:45691 without clearing app data.
- PASS: the 384dp-wide device shows all four bottom labels and selected states without clipping.
- PASS: Android accessibility trees expose 연락/피드/발견/보관함 탭 names, selected state, and 52dp root targets.
- PASS: 1.3 font scale keeps the root labels and chat list readable; the original 0.9 scale was restored after capture.
- PASS: notification VIEW intent opens the notification root, Back returns to the prior album, and root Back returns to 연락 instead of stale history.
- PASS: final crash buffer is empty and the foreground process remains alive.
