# SNSGod Message Service

Oracle 서버에서 1:1·단톡방 메시지 예약, 생성, 저장, 동기화를 처리하는 개인용 서비스다.

## Local run

```powershell
Copy-Item .env.example .env
$env:BOOTSTRAP_SECRET = 'development-only-secret'
npm.cmd start
```

기본 주소는 `http://127.0.0.1:8787`이다. 서버에는 외부 라이브러리가 필요하지 않으며 Node 22.5 이상의 `node:sqlite`를 사용한다.

전체 HTTP 계약과 인증 헤더, 요청 예시는 [`openapi.yaml`](openapi.yaml)에 정리되어 있다.

## Production notes

- 기존 Grok 이미지 서버와 별도 프로세스·데이터 폴더·환경변수로 실행한다.
- 공개 인터넷에는 Caddy/Nginx를 통해 HTTPS만 노출한다.
- `BOOTSTRAP_SECRET`, LLM 키, Firebase 서비스 계정 JSON을 Git이나 모바일 백업에 넣지 않는다.
- Firebase 설정 전에도 서버 생성 및 앱의 증분 동기화는 가능하지만 실제 원격 알림은 발송되지 않는다.
- 기기별 `pushPreferences`는 FCM 표시만 제어한다. 답장·선톡 알림이 꺼져도 서버 메시지 생성과 `/v1/sync/changes` 전달은 계속된다.
- 알림 제목에는 저장된 캐릭터 이름을 사용한다. 앱이 제공한 프로필 이미지 URL을 기기에서 읽을 수 있으면 알림의 큰 아이콘으로 사용한다.
- 방의 `conversationResetAt`이 저장된 값보다 새로우면 서버 transcript, push outbox와 대기 메시지 작업을 제거한다. 같은 epoch 재전송은 새 메시지를 지우지 않는다.
- SNS 게시물 생성은 모바일의 캐릭터별 설정과 provider를 사용한다. 성공한 서버 동기화가 모바일 SNS 평가 신호가 되며 서버는 SNS 게시물을 직접 생성하지 않는다.
