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

## 검증 명령

```powershell
cd mobile-rn
npm ci
npm run check

cd ..\message-service
npm test
```

현재 Android 앱 버전은 `0.3.2`(`versionCode 8`)입니다.
