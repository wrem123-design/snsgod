# SNSGod 오라클 서버 배포 안내서

이 문서는 `168.110.122.66`의 Ubuntu 서버에 SNSGod 메시지 서비스를 설치하는 절차다. 서비스가 설치되면 폰 앱이 꺼져 있어도 서버가 답장/선톡 시간을 계산하고 AI로 메시지를 생성한 뒤 SQLite에 보관한다. 앱을 다시 열면 서버에 이미 생성된 메시지가 동기화된다.

## 현재 확인된 상태

- 서버 주소: `168.110.122.66`
- SSH 사용자: `ubuntu`
- SSH 포트(22): 외부에서 정상 응답
- 인증 방식: 개인키만 허용
- SSH 개인키: 보안상 저장소에서 제외되며 운영자가 로컬에서 별도로 지정
- 메시지 서버: Oracle 배포 및 자동 복구·중복 방지·장기 메모리 필터 검증 완료
- 폰 앱: 서버 연결·동기화·장기 사실 기억/장면 보관 분리 완료(버전 0.3.2, versionCode 8)
- 푸시 알림: Firebase 설정 전이므로 아직 미사용

## 가장 먼저 필요한 것

OCI 인스턴스를 만들 때 받은 개인키 파일이 필요하다. 보통 파일명은 `ssh-key-....key`, `id_rsa`, `id_ed25519`, `*.pem` 중 하나다. **키 내용은 채팅, GitHub, 메모장 캡처에 올리지 않는다.** 키 파일을 PC의 안전한 폴더에 둔 뒤 그 **경로만** 알려주면 배포를 대신 진행할 수 있다.

개인키를 잃어버렸다면 OCI 콘솔에서 새 키 쌍을 만든 뒤 인스턴스의 `~ubuntu/.ssh/authorized_keys`에 공개키를 추가해야 한다. 일반 SSH 접속이 안 되므로 OCI 콘솔 연결(Cloud Shell/인스턴스 콘솔 연결)을 이용한다. 공개키는 공개되어도 되지만 개인키는 PC 밖으로 보내지 않는다.

## 자동 배포(권장)

개인키가 `C:\Keys\oracle.key`에 있다고 가정하면 프로젝트 폴더의 PowerShell에서 다음 한 줄을 실행한다.

```powershell
powershell -ExecutionPolicy Bypass -File .\message-service\deploy\deploy-from-windows.ps1 -KeyPath "C:\Keys\oracle.key"
```

이 작업은 다음을 자동으로 수행한다.

1. 메시지 서버 코드만 압축한다(API 키와 앱 데이터는 포함하지 않음).
2. `ubuntu@168.110.122.66`의 임시 폴더로 전송한다.
3. Node.js 22가 없으면 설치한다.
4. 전용 저권한 계정 `snsgod-msg`를 만든다.
5. `/opt/snsgod-message`에 프로그램을 설치한다.
6. `/var/lib/snsgod-message`에 메시지 DB를 만든다.
7. `/etc/snsgod-message.env`에 64자리 연결 암호를 자동 생성한다.
8. systemd 서비스로 등록해 재부팅 후에도 자동 실행한다.
9. 서버 내부 상태 확인을 실행한다.

재배포해도 기존 `/etc/snsgod-message.env`와 `/var/lib/snsgod-message`는 보존된다.

## Cerebras 또는 Custom API 연결

배포 후 SSH 터미널에서 아래를 실행한다.

```bash
sudo bash /opt/snsgod-message/deploy/configure-ai.sh
```

화면에서 API 주소, 모델명, API 키를 입력한다. Cerebras 기본 주소는 다음과 같다.

```text
https://api.cerebras.ai/v1/chat/completions
```

API 키 입력은 화면에 표시되지 않고 `/etc/snsgod-message.env`에 root만 읽을 수 있는 권한으로 저장된다. 기존 이미지 생성 서버의 API 키를 자동으로 가져오지는 않는다. 그 서버의 설정 파일 구조를 확인한 후 같은 키를 안전하게 참조하거나 별도 키를 넣는다.

## 기존 이미지 서버와 함께 외부에 연결

메시지 서비스는 기본적으로 `127.0.0.1:8787`에서만 듣기 때문에 인터넷에 직접 노출되지 않는다. 기존 이미지 서버 앞에 Nginx가 있다면 기존 `server { ... }` 블록 안에 [`nginx-location.conf`](../message-service/deploy/nginx-location.conf)의 내용을 추가한다.

이후 폰 앱에 넣을 서버 주소는 다음과 같다.

```text
http://168.110.122.66/snsgod-message
```

Caddy를 쓰고 있다면 [`Caddyfile.snippet`](../message-service/deploy/Caddyfile.snippet)을 기존 사이트 블록에 추가한다. 도메인이 있다면 HTTPS 주소를 사용하는 것이 가장 안전하다.

Nginx 설정 적용 전에는 반드시 검사한다.

```bash
sudo nginx -t
sudo systemctl reload nginx
curl http://127.0.0.1:8787/health
curl http://168.110.122.66/snsgod-message/health
```

기존 서버가 Nginx/Caddy 없이 80번 포트를 직접 쓰는 경우에는 먼저 현재 프로세스와 설정을 확인해야 한다. 이 경우 임의로 80번 포트를 변경하지 않는다.

## 폰 앱 연결

서버에서 페어링 암호를 확인한다.

```bash
sudo /opt/snsgod-message/deploy/show-pairing-secret.sh
```

폰 앱에서 다음 순서로 입력한다.

1. 설정 → API → Oracle 메시지 서버로 이동한다.
2. 서버 주소에 `http://168.110.122.66/snsgod-message` 또는 준비한 HTTPS 주소를 입력한다.
3. 위에서 확인한 연결 암호를 입력한다.
4. 1:1 답장, 단체방 답장, 선톡 옵션과 시간을 정한다.
5. 서버 메시지를 켜고 연결/동기화를 누른다.

정상 연결되면 폰이 꺼져 있는 동안에도 서버 DB에 메시지가 생긴다. 앱을 켰을 때 동기화되어 과거 시간으로 조작된 메시지가 아니라 실제 서버 생성 시각의 메시지로 들어온다.

## 운영 확인과 복구

```bash
sudo systemctl status snsgod-message.service
sudo journalctl -u snsgod-message.service -n 100 --no-pager
curl http://127.0.0.1:8787/health
sudo systemctl restart snsgod-message.service
```

정상 상태 응답에는 `ok: true`, 대기 작업 수, 실패 작업 수, 메시지/기기 수, AI 제공자 정보가 표시된다. 로그에 API 키 자체는 출력하지 않지만 오류 응답 일부가 기록될 수 있으므로 로그도 외부에 공개하지 않는다.

## 푸시 알림은 별도 단계

현재 단계만으로도 앱을 다시 열었을 때 이미 생성된 메시지를 받을 수 있다. 앱이 닫힌 상태에서 카카오톡처럼 즉시 알림까지 띄우려면 Firebase Android 앱(`com.snsgod.rn`)과 다음 두 파일이 추가로 필요하다.

- `google-services.json`: 로컬 Android 프로젝트에만 둠
- Firebase 서비스 계정 JSON: 오라클 서버에만 두고 권한을 `600`으로 제한

두 파일 모두 Git에 커밋하거나 채팅으로 보내지 않는다. Firebase 준비 후 폰의 푸시 토큰 등록, 서버 FCM 발송, 강제 종료/절전 상태 수신을 별도로 검증한다.

## 완료 판정

- 서버 재부팅 뒤 서비스가 자동 실행됨
- 1:1 답장과 단체방 답장이 예정 시각에 서버 DB에 생성됨
- 선톡 제한/간격이 지켜짐
- 앱을 종료한 채 기다린 뒤 다시 열었을 때 이미 생성된 메시지가 동기화됨
- 같은 메시지가 중복 생성되지 않음
- 잘못된 연결 암호와 기기 토큰이 거부됨
- 기존 Grok 이미지 서버가 영향 없이 계속 동작함
