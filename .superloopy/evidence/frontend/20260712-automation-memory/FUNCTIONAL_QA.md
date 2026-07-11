# Functional QA

## SNS automation

- Oracle startup synchronization emitted `server-sync tick evaluated reason=startup result=no-change` in the device diagnostic log.
- A later eligible evaluation created the visible Karina Instagram post, proving server sync -> local per-character policy -> text generation -> persistence.
- Unit tests verify every eligible character is reached even when earlier characters miss their probability check, with one priority room per character.
- Expo SDK 57 reference uploads now append an `expo-file-system` `File` Blob. Device retry no longer reports `Unsupported FormDataPart implementation`.
- The remaining image retry failure is `xAI OAuth 인증에 실패했습니다`; the remote image account must be re-authenticated.

## Notifications

- The exact Android foreground-service channel can be inspected and changed from basic settings.
- Turning that Android channel off affects display only; automation and message processing are not gated by the notification preference.

## Conversation reset

- Local tests verify room cleanup records a reset epoch, clears transcript/unread/notifications, preserves explicit room memory, and clears room-derived memory only when both transcript and explicit room memory are empty.
- Service integration tests verify a newer reset epoch deletes the old server transcript, reply jobs, outbox entries, and sync events.
- Reusing the same epoch does not delete messages created after the reset.
- Client synchronization filters pre-reset messages before and after bootstrap, preventing old Oracle history from reappearing.

## Automated verification

- Mobile: 270/270 tests passed; TypeScript passed.
- Message service: 23/23 tests passed, including rejection of non-finite reset epochs.
- OpenAPI YAML parsed successfully.
- Android release APK built and installed without clearing app data; version 0.3.7 (16).
