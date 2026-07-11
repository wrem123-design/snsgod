# SNSGod

SNSGod는 각 캐릭터의 페르소나와 관계 기억을 바탕으로 1:1 채팅, 단체 채팅, SNS, 이미지 생성과 선톡·예약 답장을 제공하는 개인용 AI 관계 시뮬레이션 앱입니다.

이 저장소에는 다음 두 실행 단위가 함께 들어 있습니다.

- `mobile-rn`: Android용 React Native/Expo 앱
- `message-service`: 앱이 꺼져 있을 때도 선톡과 답장을 예약·생성·보관하는 Oracle 서버용 Node.js 서비스

## 새 PC에서 시작하기

필수 도구:

- Git
- Node.js 22.5 이상
- Android Studio 또는 Android SDK 35
- JDK 17

저장소를 받은 뒤 모바일 앱을 준비합니다.

```powershell
git clone https://github.com/wrem123-design/snsgod.git
cd snsgod\mobile-rn
npm ci
npm run check
npm run android
```

연결된 Android 기기에 릴리스 빌드를 설치하려면 다음 순서로 실행합니다.

```powershell
cd snsgod\mobile-rn
npm ci
npm run check
npm run android:release
adb install -r android\app\build\outputs\apk\release\app-release.apk
```

Windows에서 경로가 너무 길어 네이티브 빌드가 실패하면 저장소를 `C:\work\snsgod`처럼 짧은 경로에 복제하십시오.

## 로컬 백업과 복원

앱의 `설정 > 사용자 > 백업`에는 용도가 다른 두 형식이 있습니다.

- **사진 포함 전체 ZIP**: 캐릭터·대화·설정과 현재 상태에서 사용하는 앱 관리 미디어를 함께 저장합니다. 재설치나 다른 기기 복원에는 이 형식을 사용합니다. API 키와 서버 인증값은 포함하지 않으며, ZIP 및 압축 해제 용량은 최대 512MB입니다.
- **상태만 JSON**: 사진 파일을 제외한 캐릭터·대화·설정만 저장합니다. 기존 WebView의 `msgod_state_v2.json` 가져오기도 지원합니다.

전체 ZIP 복원은 파일 구조, CRC, 미디어 manifest와 상태 참조를 먼저 검증합니다. 복원 중 실패하면 기존 상태를 다시 저장하고 이번 작업에서 새로 추가한 미디어만 정리합니다. 사용자가 직접 선택한 이전 백업도 현재 저장 revision보다 낮다는 이유로 건너뛰지 않습니다.

## 메시지 서버 실행

서버는 별도 외부 패키지 없이 Node.js 내장 SQLite를 사용합니다.

```bash
cd message-service
cp .env.example .env
# .env의 BOOTSTRAP_SECRET과 사용할 텍스트 API 값을 설정
npm test
npm start
```

실제 `.env`, API 키, 페어링 비밀값, Firebase 서비스 계정, SQLite 데이터와 SSH 개인 키는 Git에 저장하지 않습니다. 새 환경에서는 `.env.example`을 복사해 각자 설정해야 합니다.

Oracle Ubuntu 배포 절차는 [`docs/ORACLE_SERVER_DEPLOYMENT_GUIDE.md`](docs/ORACLE_SERVER_DEPLOYMENT_GUIDE.md), 전체 구조와 개선 계획은 [`docs/ORACLE_MESSAGE_AND_MOBILE_REFACTOR_PLAN.md`](docs/ORACLE_MESSAGE_AND_MOBILE_REFACTOR_PLAN.md)를 참고하십시오.

대화 원문 저장, 모델 context window, 채팅 화면 가상화의 경계는 [`docs/MESSAGE_RETENTION_POLICY.md`](docs/MESSAGE_RETENTION_POLICY.md)를 참고하십시오.

프롬프트 block 조립, trace, budget과 최신 사용자 입력 중복 방지 정책은 [`docs/PROMPT_COMPILER.md`](docs/PROMPT_COMPILER.md)를 참고하십시오.
프롬프트 설정별 실제 소비 경로와 숨김 호환성 정책은 [`docs/PROMPT_SETTINGS_CONSUMER_MAP.md`](docs/PROMPT_SETTINGS_CONSUMER_MAP.md)를 참고하십시오.
사용자 기능과 주요 사용 흐름은 [`docs/FEATURES.md`](docs/FEATURES.md)를 참고하십시오.

개인톡·단톡·선톡·통화가 공유하는 캐릭터 정체성·언어·기억 경계는 [`docs/CANONICAL_PERSONA_POLICY.md`](docs/CANONICAL_PERSONA_POLICY.md)를 참고하십시오.

## 검증 명령

```powershell
cd mobile-rn
npm ci
npm run check

cd ..\message-service
npm test
```

현재 Android 앱 버전은 `0.3.2`(`versionCode 8`)입니다.
