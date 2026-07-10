# SNSGod Message Service

Oracle 서버에서 1:1·단톡방 메시지 예약, 생성, 저장, 동기화를 처리하는 개인용 서비스다.

## Local run

```powershell
Copy-Item .env.example .env
$env:BOOTSTRAP_SECRET = 'development-only-secret'
npm.cmd start
```

기본 주소는 `http://127.0.0.1:8787`이다. 서버에는 외부 라이브러리가 필요하지 않으며 Node 22.5 이상의 `node:sqlite`를 사용한다.

## Production notes

- 기존 Grok 이미지 서버와 별도 프로세스·데이터 폴더·환경변수로 실행한다.
- 공개 인터넷에는 Caddy/Nginx를 통해 HTTPS만 노출한다.
- `BOOTSTRAP_SECRET`, LLM 키, Firebase 서비스 계정 JSON을 Git이나 모바일 백업에 넣지 않는다.
- Firebase 설정 전에도 서버 생성 및 앱의 증분 동기화는 가능하지만 실제 원격 알림은 발송되지 않는다.
