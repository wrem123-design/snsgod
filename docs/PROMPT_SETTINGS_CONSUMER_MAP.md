# 프롬프트 설정 소비 경로

프롬프트 설정 화면에는 실제 생성 경로에서 읽는 값만 표시합니다. 화면의 라벨과 설명은 `promptSettingsPolicy.ts` 한 곳에서 관리하며, 저장할 때는 숨긴 레거시 필드도 그대로 보존합니다.

## 화면에 표시하는 전역 프롬프트

| 설정 키 | 화면 표시 | 주요 소비 경로 |
| --- | --- | --- |
| `systemRules` | 대화 공통 안전 규칙 | 개인톡과 자동 선톡 |
| `characterActing` | 개인톡 연기 지침 | 개인톡 prompt compiler |
| `jsonFormat` | 개인톡 JSON 형식 | 개인톡 응답 형식 |
| `memoryRules` | 개인톡 메모리 생성 | 개인톡 `newMemory` 출력 |
| `stickerRules` | 스티커 사용 규칙 | 스티커 기능이 있는 개인톡 |
| `adultBoundaryRules` | 성인 및 미성년자 경계 규칙 | 개인톡, 단톡, SNS 생성 |
| `chatImageRules` | 개인톡 이미지 규칙 | 개인톡 이미지 capability block |
| `groupChatImageRules` | 단톡 이미지 규칙 | 단톡 이미지 capability block |
| `imageGenerationToneRules` | 이미지 생성 공통 톤 | 프로필, 채팅, SNS, 만남 이미지 |
| `meetingEventRules` | 만남 이벤트 발동 규칙 | 만남 이벤트 판정 |
| `blindDateCandidateRules` | 블라인드 후보 생성 규칙 | 블라인드·우연한 만남 후보 |
| `datingAppProfileRules` | 데이트앱 프로필 생성 규칙 | 데이트앱 프로필과 첫 메시지 |
| `randomCharacterRules` | 랜덤 캐릭터 생성 규칙 | 랜덤채팅 캐릭터와 첫 메시지 |
| `sumgodRules` | 썸갓 응답 규칙 | 썸갓 성인 질문 응답 |
| `snsPosting` | SNS 게시 규칙 | SNS 게시물 본문 |
| `snsSubjectGuide` | SNS 주제 해석 규칙 | 저장 주제의 게시물 소재 변환 |
| `snsNsfwBackAccount` | SNS 성인 뒷계 규칙 | NSFW 뒷계정 모드 |
| `profileCreation` | 신규 캐릭터 생성 규칙 | 신규·랜덤 캐릭터 생성 |

## 숨기는 레거시 필드

| 설정 키 | 처리 | 이유 |
| --- | --- | --- |
| `roleObjective` | UI에서 숨김, 백업·복원 값은 보존 | canonical Persona가 같은 책임을 담당하며 생성 경로에서 별도로 읽지 않음 |
| `language` | UI에서 숨김, 백업·복원 값은 보존 | 전역 출력 언어와 캐릭터별 언어가 canonical Persona에 포함됨 |

## 캐릭터별 입력

- `firstMessage`: 새 캐릭터를 만들 때만 초기 방 메시지로 소비합니다. 이미 생성된 캐릭터 설정에서 수정해도 기존 방에는 반영되지 않으므로 기존 캐릭터 편집 화면에서는 숨깁니다.
- `illustrationTags`: 캐릭터별 외형 식별자로 유지하며 일반 이미지, 레퍼런스 장면, 만남 이미지 prompt에 넣습니다.

## 호환성 원칙

- 숨김은 삭제가 아닙니다. `DEFAULT_PROMPTS`와 저장된 전체 prompt draft를 합쳐 저장하므로 기존 JSON·ZIP 백업의 레거시 값은 유실되지 않습니다.
- 새 캐릭터 화면의 `firstMessage`는 계속 유지합니다.
- 표시 설정 목록, 라벨, 도움말과 소비 경로 메타데이터는 `PROMPT_SETTING_DEFINITIONS`를 단일 기준으로 사용합니다.
