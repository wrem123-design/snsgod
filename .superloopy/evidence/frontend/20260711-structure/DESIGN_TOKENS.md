# Structural extraction token contract

- `SettingsNavigation` owns the same mode, section-pill, selected-state, and warning tokens previously declared inline by `SettingsScreen`.
- `BackupSettingsSection` owns the same card, label, help, input, toggle, and secondary-action tokens previously declared inline by `SettingsScreen`.
- Component extraction preserves text, order, dimensions, accessibility labels, conditional password fields, disabled opacity, and existing color values.
- No new visual token, layout hierarchy, raw color family, animation, decorative icon, or navigation depth was introduced.
