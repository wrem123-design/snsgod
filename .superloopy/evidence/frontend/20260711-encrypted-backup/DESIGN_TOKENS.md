# Encrypted-backup settings token reuse

- Reused the existing settings section, card, `SwitchLine`, input, help, and primary/secondary button tokens defined by `DESIGN.md` and `SettingsScreen`.
- The encryption choice is explicit and off by default so existing plain-ZIP behavior remains predictable.
- New-password and confirmation inputs appear only when encryption is enabled; the restore password remains optional for ordinary ZIP files.
- Password fields use secure entry, disable automatic capitalization, and have distinct Android accessibility labels.
- No new raw color, gradient, shadow, radius, type scale, decorative icon, or nested navigation pattern was introduced.
