# Mobile responsibility boundaries

The React Native app keeps one local `SNSGodState` compatibility model, but high-risk and frequently changed responsibilities are separated behind directional modules. This is an incremental boundary: it avoids a destructive state migration while preventing new UI code from absorbing storage, crypto, or network policy.

## Dependency direction

```text
App lifecycle / screen composition
  ├─ rootNavigation (root mapping and bottom-navigation visibility)
  ├─ SettingsScreen (draft orchestration and existing save handlers)
  │    ├─ settings/SettingsNavigation (basic/advanced IA and public types)
  │    └─ settings/BackupSettingsSection (backup controls only)
  ├─ backup (archive validation, media plan, transactional restore preparation)
  │    ├─ backupEncryptionPolicy (binary envelope, KDF, AEAD)
  │    └─ secureSecrets (credential redaction boundary)
  ├─ persist / SQLite / media storage
  └─ remoteServicePolicy (local-only versus explicit Oracle assistance)
```

Dependencies point from app/screens toward logic/storage. Logic and storage modules do not import `App.tsx` or screen components. `BackupSettingsSection` owns no file, persistence, crypto, or restore mutation; its typed callbacks return user intent to `SettingsScreen`. Password state remains in the parent screen's component memory and is never added to durable config.

## Error and data boundaries

- `App.tsx` owns runtime lifecycle cancellation, stale-operation epochs, screen publication, and rollback coordination for a completed restore.
- `backup.ts` rejects size, file-count, path, CRC, manifest, media, and state-shape violations before returning a prepared restore and rollback.
- `backupEncryptionPolicy.ts` authenticates/decrypts before ZIP parsing. It exposes only base64 envelope operations and validation constants.
- `secureSecrets.ts` is the sole durable credential boundary; ordinary state, backups, and diagnostic logs receive redacted values.
- `remoteServicePolicy.ts` is the single gate for Oracle registration, sync, and in-flight result acceptance. Direct user-triggered Provider requests remain separate.
- `rootNavigation.ts` is the single source for four-root mapping and bottom-navigation visibility. Screen composition does not repeat route lists.

## Settings boundaries

- `SettingsNavigation.tsx`: public `SettingsMode`/`SettingsSection` types, the five basic and four advanced destinations, selected accessibility state, and advanced warning.
- `BackupSettingsSection.tsx`: compatible/encrypted full-backup inputs and state-only JSON controls. All operations are injected callbacks.
- `SettingsScreen.tsx`: existing draft values, validation, API/Oracle/image actions, profile/automation handlers, and section composition. Further sections can be extracted by following the same callback-only rule.

## Regression gates

- Module-boundary tests assert dependency direction, public types, absence of duplicated root-route orchestration, and callback-only backup UI.
- Feature tests cover local-only policy, backup encryption/authentication, transactional restore, settings IA, stale completion rejection, media rollback, and secret redaction.
- Every release candidate runs all Node tests, TypeScript, Android release assembly, data-preserving installation, accessibility navigation, and crash-buffer inspection.
