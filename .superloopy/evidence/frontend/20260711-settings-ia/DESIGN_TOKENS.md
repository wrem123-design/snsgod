# Settings information architecture token reuse

- Reused the established panel, section pill, card, warning panel, input, switch, and button tokens from `DESIGN.md` and `SettingsScreen`.
- Added one two-option hierarchy control: `기본 설정` and `고급 설정`. The selected mode uses the existing high-contrast text color; its child sections keep the existing accent pill treatment.
- Basic sections are limited to `기본`, `캐릭터`, `스티커`, `화면`, and `백업`; advanced sections are limited to `AI·서버`, `이미지 생성`, `원문 프롬프트`, and `로어북`.
- The local-data boundary is the first basic card. Advanced mode begins with a concise warning before any endpoint, token, server, or raw-prompt input.
- No new raw color family, gradient, shadow, decorative icon, glass card, fake metric, or deep navigation layer was introduced.
