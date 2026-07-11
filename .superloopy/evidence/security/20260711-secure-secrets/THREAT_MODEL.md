# Secure local secrets threat model

## Protected values

- Provider API keys and key rotation slots
- Vertex service-account JSON, including private key material
- Proxy access token
- Image-generation API key
- Oracle one-time pairing secret and registered device token

## Trust boundary

- Runtime state may hold credentials only while the app process uses them.
- Durable general state stores (SQLite, JSON/file snapshots, AsyncStorage pointer), full backups, and debug logs are untrusted for credentials.
- Expo SecureStore is the only durable credential boundary. Android backup configuration excludes its encrypted preference data from unsafe restore.

## Controls

- SecureStore generation chunks are written before a final manifest switch. A failed switch leaves the previous generation readable.
- Each chunk remains below 1,800 characters so large Vertex service-account JSON does not depend on one oversized platform value.
- Manifest version, generation, chunk count, exact length, provider count, and credential field types are validated before hydration.
- A SecureStore write failure aborts ordinary state persistence before redacted state can replace the only credential copy.
- First legacy hydration writes plaintext credentials securely before scheduling a redacted state rewrite.
- Backup export applies the shared redaction boundary; backup import carries current device credentials rather than importing secrets.
- Debug text redacts bearer tokens, private-key blocks, scalar credential fields, and API key arrays before SQLite insertion.

## Out of scope and tracked work

- A rooted/unlocked device or compromised OS process can access runtime memory.
- User-selected password encryption for portable full-backup files is tracked in #50.
- Expo transitive dependency advisories remain tracked in #32.
