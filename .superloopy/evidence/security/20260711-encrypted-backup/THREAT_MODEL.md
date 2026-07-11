# Password-encrypted full backup threat model

## Protected artifact and trust boundary

- Portable full-backup files can contain private conversations, character data, settings, and app-managed media.
- The destination chosen by Android sharing or the document provider is outside the app's trusted storage boundary.
- Provider credentials and Oracle secrets remain excluded by the existing redaction boundary even when the archive is encrypted.
- The user password exists only in component/runtime memory. It is not added to application state, SecureStore, logs, or the backup.

## Cryptographic construction

- `SNSGODENC1` identifies the versioned binary envelope.
- PBKDF2-HMAC-SHA256 derives a 256-bit key with the production default of 600,000 iterations and a fresh 16-byte CSPRNG salt.
- XChaCha20-Poly1305 encrypts and authenticates the ZIP bytes with a fresh 24-byte CSPRNG nonce; the complete header is authenticated as associated data.
- The KDF iteration value is authenticated and accepted only from 100,000 through 2,000,000 to reject trivial work factors and hostile resource amplification.
- Passwords are limited to 10–1,024 UTF-16 code units to reject weak input and excessive attacker-controlled work.
- Derived key bytes are overwritten after encryption or decryption completes.

## Failure and compatibility behavior

- Plain `.zip` export/import remains available for compatibility and is explicitly labeled as unencrypted.
- Wrong passwords, ciphertext changes, header changes, malformed base64, invalid KDF metadata, and truncated envelopes fail before JSZip parsing or media restore preparation.
- A failed authentication path returns no plaintext and reports that current data was not changed.
- Full restore retains its transactional media rollback and runtime-generation boundary after successful authentication.

## Verification and sources

- Node tests cover production-strength KDF round-trip, unique salt/nonce output, wrong password, ciphertext tamper, KDF/header validation, weak/oversized passwords, plain-ZIP compatibility wiring, and UI password non-persistence.
- TypeScript and Android release builds are required before merge; device verification uses data-preserving `adb install -r` and does not export the user's real archive.
- Parameter basis: [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html), [noble-ciphers](https://github.com/paulmillr/noble-ciphers), and [noble-hashes](https://github.com/paulmillr/noble-hashes).

## Residual risks

- A rooted/unlocked device, compromised OS, screen recorder, or process-memory reader can observe a password or decrypted content while in use.
- Password loss is intentionally unrecoverable; the UI states this before export.
- Very large backups still require memory for JSZip and encryption. The existing 512 MiB input limit bounds restore allocation but does not make low-memory devices immune to process termination.
