# Notification Controls Functional QA

## Enabled notification

- Server preference: `{"replies":true,"proactive":true}`
- A reply was generated while the app was backgrounded.
- FCM outbox status: `sent`
- Android title: `김도희` (not internal ID `ren`)
- Android large icon: bitmap populated from the character profile image
- Android body: generated character message

## Reply notification disabled

- Server preference: `{"replies":false,"proactive":true}`
- The exact test reply job completed successfully.
- Two `server_reply` messages were generated and persisted.
- Both corresponding FCM outbox rows were `skipped`, not failed.
- The active FCM notification count did not increase.
- After opening the app, both generated replies were visible through normal synchronization.

## Cleanup

- `답장 메시지` and `캐릭터 선톡` were both restored to ON.
- The server confirmed `{"replies":true,"proactive":true}` after restoration.
