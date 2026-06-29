# SNSGod 전화걸기 / SNS DM 깊은 분석 및 React Native 복각 가이드

대상 원본: `SNSGod.js` 0.2.2, RisuAI Plugin API v3용 메신저 플러그인.

이 문서는 이전에 정리한 일반 AI 채팅, SNS 게시물 생성, 자동 SNS 생성, API 옵션, 이미지 provider 분석과 분리해서 **전화 통화 모드**와 **SNS DM**만 깊게 다룬다. 목적은 React Native 구현자가 이 문서를 보고 원본과 같은 기능을 화면/상태/엔진 단위로 재구성할 수 있게 하는 것이다.

---

## 0. 핵심 결론

전화 기능은 단순히 `전화 버튼을 누르면 LLM 대화가 시작된다`가 아니다. 원본 최종형은 다음 흐름을 가진다.

```text
채팅 답장/선톡/명시적 전화 요청
  -> callInvite 또는 [[PHONE_CALL]] 마커 생성
  -> phone-call 메시지 카드 삽입
  -> 수신 전화 오버레이 표시
  -> 15초 내 수락/거절/부재중 처리
  -> 수락 시 live phone overlay 시작
  -> LLM이 전화 대사 lines + 사용자 선택지 생성
  -> 사용자가 선택지 또는 직접 입력으로 이어감
  -> 통화 종료 시 duration log 저장
  -> 통화 transcript를 summary로 압축해 이후 채팅/SNS context에 사용
```

SNS DM도 단순히 `SNS 게시물에 댓글을 다는 기능`이 아니다. 원본 최종형은 다음처럼 나뉜다.

```text
SNS 게시물 post.platforms[index]
  -> 내 DM thread: state.snsDmThreads[] 안에 저장되는 대화형 DM
  -> 제3자 DM: post.dms[] 안에 저장되는 읽기 전용 SNS-side DM
  -> SNS DM 허브: 내 DM + 제3자 DM 목록을 보여주는 중간 화면
  -> 내 DM에서는 LLM으로 캐릭터가 답장
  -> 제3자 DM은 조회만 가능
```

---

# Part A. 전화걸기 / 전화받기 기능

## A-1. 관련 원본 위치 요약

| 범위 | 원본 위치 | 의미 |
|---|---:|---|
| 기본 전화 상태, 카드, callInvite 정규화 | `SNSGod.js 18004~18173` | `mgPhoneCall`, `mgPhoneCallCardHtml`, `mgNormalizePhoneItem`, callInvite delivery |
| 전화 LLM turn prompt, live overlay, 끊기 반응 | `18360~18529` | `mgPhoneLanguageRule`, `mgGeneratePhoneTurn`, `mgEndPhoneCallWithReaction` |
| 프로필 통화 버튼, 캐릭터 먼저 전화 토글 | `18529~18766` | 프로필 modal `통화`, `characterPhoneCallEnabled` |
| 전화 의도/선톡 전화/마커 처리 | `18960~19313` | intent regex, spontaneous proactive phone, `[[PHONE_CALL]]` marker |
| 명시적 전화 요청 / direct card delivery | `19380~19598` | 유저가 전화 요청 시 marker 강제, direct phone card delivery |
| 수신 전화, 부재중, 거절, 수락, 통화 기록 | `19594~19823` | incoming overlay, 15초 miss timer, duration log |
| 최종 marker precision / phone artifact 제거 | `19824~20114` | strict marker, phone log UI, 직접 입력, 다음 버튼 |
| 전화 요약 context / SNS phone artifact clean | `20255~20578` | 통화 요약, 이후 채팅/SNS prompt 정제 |
| any-screen ringing | `22374~22453` | 어느 화면에서든 최근 pending phone-call을 링으로 띄움 |
| canonical marker contract | `22850~23054` | 최종 마커 계약, marker variant 인식 |

---

## A-2. 설정값과 상태 모델

### A-2-1. 전역 설정

원본 기본 config에는 다음 값이 있다.

```ts
characterPhoneCallEnabled: true
```

의미는 `캐릭터가 먼저 전화 카드를 보낼 수 있는가`다. 원본 UI에는 `캐릭터 먼저 전화` 토글로 표시된다. 이 값이 꺼지면 캐릭터가 output에 `callInvite`, `phoneCall`, `callTitle`, `callLine`을 내도 delivery 단계에서 제거하고 일반 텍스트로 바꾼다. 단, **프로필에서 사용자가 직접 거는 통화는 계속 가능**하다고 안내한다.

```ts
function mgCharacterPhoneInvitesAllowed() {
  return state.config.characterPhoneCallEnabled !== false;
}
```

### A-2-2. 라이브 통화 상태 `mgPhoneCall`

원본은 전역 변수 하나로 현재 진행 중인 live call을 관리한다.

```ts
let mgPhoneCall = null;
let mgPhoneTypeTimer = 0;
let mgIncomingPhoneCall = null;
let mgIncomingPhoneTimer = 0;
let mgAcceptingIncomingPhoneCall = false;
```

React Native에서는 전역 mutable 대신 store로 분리하는 것이 좋다.

```ts
type PhoneCallSession = {
  open: boolean;
  hidden?: boolean;
  roomId: string;
  characterId: string;
  initiator: 'user' | 'character';
  transcript: Array<{ role: 'user' | 'character'; text: string }>;
  line: string;
  displayLine: string;
  options: string[];
  loading: boolean;
  typing: boolean;
  ending?: boolean;
  awaitingNextLine?: boolean;
  manualLines?: string[];
  manualLineIndex?: number;
  createdAt?: number;
  connectedAt?: number;
  acceptedAt?: number;
  sourceMessageId?: string;
  incomingLine?: string;
  phoneLogRecorded?: boolean;
};
```

### A-2-3. 수신 전화 상태 `mgIncomingPhoneCall`

수신 전화 overlay는 live call과 별도 상태다.

```ts
type IncomingPhoneCall = {
  roomId: string;
  characterId: string;
  messageId: string;
  title: string;
  line: string;
  createdAt: number;
};
```

### A-2-4. 전화 카드 메시지

전화 카드 자체는 일반 채팅 메시지 배열에 저장된다.

```ts
type PhoneCallCardMessage = {
  id: string;
  role: 'character';
  characterId: string;
  content: '';
  createdAt: number;
  mediaType: 'phone-call';
  mediaName: string;
  callTitle: string;
  callLine: string;
  sourceMode: 'reply' | 'proactive' | 'calendar' | 'randomchat' | string;
  callStatus?: 'ringing' | 'accepted' | 'rejected' | 'missed';
  callHandledAt?: number;
};
```

### A-2-5. 전화 기록 메시지

전화 종료/거절/부재중은 `phoneLog` 메시지로 저장된다.

```ts
type PhoneLogMessage = {
  id: string;
  role: 'character';
  characterId: string;
  content: '통화 취소' | '부재중 전화' | `통화 기록 ${string}`;
  createdAt: number;
  phoneLog: 'rejected' | 'missed' | 'ended' | true;
  phoneSummaryContext?: string;
  phoneTranscriptContext?: string;
  phoneStartedAt?: number;
  phoneEndedAt?: number;
};
```

---

## A-3. 전화가 발생하는 모든 경로

## A-3-1. 사용자가 프로필에서 직접 전화

후반 패치에서 일반 toolbar의 전화 버튼은 제거되고, bot profile modal의 action 버튼이 `통화`로 바뀐다.

```text
프로필 modal > 통화 버튼
  -> action: start-phone-call-from-profile
  -> mgStartPhoneCall(room.id, 'user')
```

이 경로는 `characterPhoneCallEnabled`가 꺼져도 유지된다. 이유는 원본 안내문 자체가 `끄면 캐릭터가 먼저 전화 카드를 보내지 않습니다. 프로필에서 직접 거는 통화는 계속 사용할 수 있습니다.`라고 되어 있기 때문이다.

RN 구현 diff:

```diff
- Chat header에 항상 전화 버튼 표시
+ 캐릭터 프로필/상세 화면의 action으로 통화 버튼 표시
+ 사용자 직접 통화는 characterPhoneCallEnabled와 무관하게 허용
```

---

## A-3-2. 캐릭터 답장이 구조화 필드로 전화 요청

초기 전화 지원 prompt는 LLM에게 다음 형태를 허용한다.

```json
{"content":"","callInvite":true,"callTitle":"밤 전화","callLine":"문자로는 좀 애매해서. 잠깐 받을래?"}
```

`parseAssistantPayload`와 `normalizeReplyMessages`가 `callInvite`, `phoneCall`, `callTitle`, `callLine`, `phoneTitle`, `phoneLine`, `call`을 읽어 `callInvite:true`로 정규화한다.

RN 구현 diff:

```diff
- reply item에서 content/sticker/imagePrompt만 파싱
+ callInvite, phoneCall, call, callTitle, callLine, phoneTitle, phoneLine까지 파싱
+ callInvite true면 PhoneCallCardMessage로 변환
```

---

## A-3-3. 캐릭터 답장이 `[[PHONE_CALL]]` 마커를 붙임

원본은 최종적으로 **정확한 canonical marker**를 요구한다.

```text
[[PHONE_CALL]]
```

LLM prompt에는 다음 계약이 들어간다.

```text
If the character is actually calling the user now,
append exactly [[PHONE_CALL]] to the end of the same visible chat bubble.
The app will hide [[PHONE_CALL]] from the chat bubble and show the incoming full-screen phone overlay.
```

그리고 delivery에서 marker가 붙은 메시지를 다음처럼 분해한다.

```text
"받아. 지금 전화할게. [[PHONE_CALL]]"
  -> text bubble: "받아. 지금 전화할게."
  -> phone-call card: callLine = "받아. 지금 전화할게."
```

원본은 최종적으로 다양한 변형도 인식한다. 예를 들어 `[[CALL]]`, `<PHONE_CALL>`, `(phone call)`, 전화 emoji 등도 `mgLooksLikeImmediatePhoneCallText`에서 어느 정도 흡수하지만, prompt에는 오직 `[[PHONE_CALL]]`만 쓰라고 한다.

RN 구현에서는 **출력은 canonical만 요구하되, parser는 변형을 방어적으로 흡수**하는 방식이 좋다.

```ts
const CANONICAL_PHONE_CALL_MARKER = '[[PHONE_CALL]]';

function hasPhoneCallIntent(text: string): boolean {
  return looksLikeImmediatePhoneCallText(text); // canonical + known variants + phone/call intent
}

function stripPhoneCallMarker(text: string): string {
  return stripCanonicalPhoneMarkerVariants(text);
}
```

---

## A-3-4. 사용자가 명시적으로 “전화해/통화하자”라고 요청

원본은 별도 wrapper에서 최신 유저 메시지가 전화 요청인지 판단한다.

```text
Explicit user phone request:
- The latest user message directly asks for a phone call.
- If character agrees, teases while agreeing, tells the user to pick up,
  says they will call now, or otherwise continues toward a call,
  MUST append [[PHONE_CALL]] to that same visible chat bubble.
- Only omit if clearly refuses/postpones/cannot call.
```

후처리도 있다. LLM이 marker를 빼먹었지만 답장이 `알았어, 받을 준비해`처럼 수락으로 보이면 `mgAddPhoneMarkerForExplicitRequest`가 해당 메시지에 `[[PHONE_CALL]]`을 붙인다.

RN 구현 diff:

```diff
+ latestUserText가 전화 요청인지 판정
+ 전화 요청이면 chat prompt에 explicit phone request block 추가
+ normalize 후 marker/callInvite가 없고, 답장이 수락처럼 들리면 marker를 자동 부착
```

---

## A-3-5. proactive 선톡에서 갑자기 전화

원본은 proactive contact에서만 spontaneous phone을 허용한다.

조건:

```text
- characterPhoneCallEnabled true
- sourceMode === 'proactive'
- room exists
- group room 아님
- output messages가 비어 있지 않음
- 이미 callInvite/phoneCall/call이 없어야 함
- sticker/image/gift/media가 없어야 함
- character.lastPhoneInviteAt 기준 35분 cooldown 통과
- 확률 통과
```

확률은 `initiative`, `proactiveStyle`, `unansweredProactiveCount`에 따라 달라진다.

```text
base = 5 + initiative * 0.08
reserved  * 0.35
steady    * 0.65
attached  * 1.45
obsessive * 1.9

무응답 있음:
- obsessive가 아니면 점점 감소
- obsessive면 점점 증가
최종 1~24% 범위
```

prompt에도 다음 지시가 들어간다.

```text
Spontaneous phone call option:
- This is a proactive contact.
- The character may choose to call first instead of texting.
- Decide from mood, relationship, silence, time of day, and personality.
- Keep it rare.
```

RN 구현 diff:

```diff
- 선톡은 항상 텍스트만 생성
+ proactive mode일 때만 spontaneousPhoneChance 계산
+ 조건 통과 시 첫 텍스트 답장을 phone-call card로 승격
+ group room에서는 spontaneous phone 금지
+ cooldown 35분 유지
```

---

## A-3-6. 이미 생성된 전화 카드가 어느 화면에서든 다시 울림

최종 패치에는 `any-screen ring`이 있다.

```text
renderIncomingChange(roomId)
  -> 120ms 뒤 mgShowPendingPhoneFromAnyScreen(roomId)
```

`mgNewestPendingPhoneCandidate`는 최근 5분 이내의 `mediaType:'phone-call'`이고 `callStatus`가 없는 메시지를 찾는다. 이미 live call이 열려 있거나 incoming overlay가 있으면 띄우지 않는다.

RN 구현 diff:

```diff
+ message append 후 phone-call card이면 incoming overlay scheduler 호출
+ 앱/탭이 chat이 아니어도 수신 overlay를 띄울 수 있게 전역 PhoneOverlayHost 사용
+ 단, 현재 live call 또는 incoming call이 있으면 중복 표시 금지
```

---

## A-4. 전화 수신 / 거절 / 부재중 / 수락

## A-4-1. 수신 표시

`mgShowIncomingPhoneCall(roomId, message)`는 전화 카드에서 `IncomingPhoneCall`을 만들고:

```text
- mgIncomingPhoneCall = incoming
- callMessage.callStatus = 'ringing'
- 15초 timer 시작
- render()
```

15초 안에 수락/거절하지 않으면 `mgMissIncomingPhoneCall()`이 실행된다.

RN 구현:

```ts
function showIncomingPhoneCall(roomId: string, messageId?: string) {
  const card = findPendingPhoneCard(roomId, messageId);
  if (!card) return false;
  setIncomingCall({ roomId, characterId: card.characterId, messageId: card.id, title: card.callTitle, line: card.callLine });
  updateMessage(card.id, { callStatus: 'ringing' });
  startTimer(15000, missIncomingPhoneCall);
}
```

## A-4-2. 거절

거절 시:

```text
- incoming timer clear
- mgIncomingPhoneCall = null
- phone card callStatus = 'rejected'
- callHandledAt = now
- phoneLog message 추가: content '통화 취소', phoneLog 'rejected'
```

## A-4-3. 부재중

부재중 시:

```text
- incoming timer clear
- mgIncomingPhoneCall = null
- phone card callStatus = 'missed'
- callHandledAt = now
- phoneLog message 추가: content '부재중 전화', phoneLog 'missed'
```

후반 알림 센터 wrapper에서는 부재중 전화가 현재 화면에 보이지 않을 경우 `phone-missed:${roomId}` collapseKey로 알림을 띄운다.

## A-4-4. 수락

수락 시:

```text
- incoming timer clear
- mgIncomingPhoneCall = null
- phone card callStatus = 'accepted'
- callHandledAt = now
- saveState
- mgAcceptingIncomingPhoneCall = true
- mgStartPhoneCall(roomId, 'character') 호출
- live session에 acceptedAt, connectedAt, sourceMessageId, incomingLine 저장
```

주의: `mgStartPhoneCall(roomId, 'character')`는 일반적으로 수신 overlay를 띄우도록 wrap되어 있다. 그래서 수락 과정에서는 `mgAcceptingIncomingPhoneCall` 플래그로 재진입을 막는다.

RN 구현 diff:

```diff
- 전화 카드 클릭 시 바로 live call 시작
+ 먼저 incoming overlay 표시
+ 수락 버튼에서만 live call 시작
+ 15초 timeout이면 missed log
+ 거절 버튼이면 rejected log
```

---

## A-5. 라이브 전화 UI 및 진행

## A-5-1. 통화 overlay 구조

원본 live overlay는 다음 요소로 구성된다.

```text
- fixed full-screen overlay
- blurred avatar/background
- close button / hangup button
- 캐릭터 avatar
- 캐릭터 이름 + 상태: 통화 중 / 통화 연결됨 / 통화 종료 중
- 현재 character line 표시 영역
- choices 버튼 2~3개
- 직접 답하기 input
- 여러 줄 대사일 때 '다음' 버튼
```

초기에는 자동 typewriter로 여러 줄을 순차 재생했지만, 후반 패치에서 수동 line flow가 들어가서 여러 줄 대사가 있을 때 한 줄씩 보여주고 `다음` 버튼으로 넘긴다.

RN 화면 설계:

```tsx
<PhoneOverlay>
  <BlurredAvatarBackground />
  <CloseOrMinimizeButton />
  <Avatar />
  <NameAndStatus />
  <PhoneLineText />
  {awaitingNextLine ? <NextLineButton /> : <ChoiceButtons />}
  {!loading && !typing && !awaitingNextLine && <CustomReplyInput />}
  <HangupButton />
</PhoneOverlay>
```

## A-5-2. LLM phone turn prompt

최종 전화 turn prompt는 일반 채팅 prompt와 완전히 다르다.

```text
You are {character.name} in a private live phone call with {userName}.
{language rule}

Character profile:
...
User profile:
...
Recent chat before the call:
...
Phone call so far:
...

JSON schema exactly:
{"lines":["character line 1","character line 2","character line 3"],"choices":["user reply option 1","user reply option 2","user reply option 3"]}

lines: 2-4 sequential spoken lines from the character before the user can answer.
Each line must be short enough to read on a phone screen.
No narration, no speaker name, no JSON syntax inside the lines.
Use callbacks to the call history and character personality.
choices: 2-3 concise replies.
Do not end the call unless the user clearly chooses to hang up.
```

사용자 메시지:

```text
처음 연결: The call has just connected. Let the character speak for 2-4 short lines, then give choices. JSON only.
이후 선택: Continue after my selected reply. Let the character speak for 2-4 short lines, then give choices. JSON only.
```

출력 schema:

```ts
type PhoneTurn = {
  lines: string[];   // 원본은 parse 후 line 문자열로 합치기도 함
  choices: string[]; // 2~3개
};
```

## A-5-3. 언어 규칙

`mgPhoneLanguageRule(character)`는 전화 전용 언어 규칙을 만든다.

```text
The phone call language is {character.language || config.language}.
Write the character line in that language.
Write every user choice in that language.
Keep voice/rhythm/relationship consistent.
Return raw JSON only.
```

따라서 랜덤채팅 캐릭터의 언어가 일본어/영어로 설정되어 있으면 전화 선택지도 그 언어로 나오는 것이 원본 동작이다.

## A-5-4. parser

원본은 전화 JSON이 깨지는 경우가 많아서 parser가 방어적이다.

흡수하는 필드:

```text
lines
characterLines
dialogue
line
content
text
choices
options
messages[].content
```

`line` 안에 다시 JSON 문자열이 들어간 경우도 재파싱한다. 최종적으로 `lines`는 최대 4줄, choices는 최대 3개로 제한한다. choices가 부족하면 fallback choices를 넣는다.

RN 구현 diff:

```diff
- JSON.parse 성공만 가정
+ rawText에서 JSON 추출/repair
+ lines/characterLines/dialogue/line/content/text 모두 허용
+ choices/options 모두 허용
+ line 안에 JSON이 들어간 경우 재파싱
+ choices 2개 미만이면 기본 선택지 제공
```

---

## A-6. 사용자의 전화 응답 방식

원본은 두 가지 입력 방식을 제공한다.

1. **선택지 버튼**: `phone-choice`
2. **직접 답하기**: `phone-custom-reply`

선택지가 `끊`, `종료`, `나중`, `그만`, `hang up`, `bye` 등을 포함하면 통화 종료 흐름으로 간다.

직접 답하기 input은 `loading`, `typing`, `awaitingNextLine` 상태에서는 비활성이다. Enter를 누르면 전송된다.

RN 구현:

```ts
function canSendPhoneReply(call: PhoneCallSession) {
  return call.open && !call.loading && !call.typing && !call.awaitingNextLine;
}

function onPhoneChoice(choice: string) {
  if (looksLikeHangupChoice(choice)) return endPhoneCallWithReaction();
  return generatePhoneTurn(choice);
}
```

---

## A-7. 통화 종료와 기록 저장

통화 종료는 그냥 overlay를 닫는 것이 아니다.

1. 아직 기록을 안 남겼으면 `통화 기록 HH시간 MM분 SS초` 메시지를 추가한다.
2. `phoneLogRecorded = true`로 중복 방지한다.
3. LLM에게 마지막 작별 대사를 요청한다.
4. 실패하면 `알았어. 나중에 다시 전화할게.` fallback을 사용한다.
5. typewriter로 마지막 줄을 보여준 후 약 1.15초 뒤 overlay를 닫는다.

종료 prompt:

```text
You are {character.name}. The user is ending the phone call now.
Character profile: ...
Phone call so far: ...
Return only JSON: {"line":"one final in-character goodbye before hanging up"}.
The line should be brief, natural, and emotionally consistent. No choices.
```

---

## A-8. 통화 기록이 이후 대화/SNS에 반영되는 방식

원본은 전화 transcript를 그대로 계속 넣지 않는다. 최종적으로는 summary만 저장한다.

```text
mgPhoneSummaryFromRows
  -> {characterName}와 {userName}가 전화로 대화했다.
  -> 주요 내용은 ...
  -> 캐릭터 마지막 뉘앙스: ...
  -> 유저 반응: ...
```

종료 로그에는 다음 필드가 생긴다.

```ts
phoneSummaryContext: string;
phoneStartedAt: number;
phoneEndedAt: number;
```

이후 일반 채팅 prompt에는 다음 블록이 붙는다.

```text
Recent phone-call memory summaries:
- ...
Use these summaries as relationship context.
The visible chat may naturally mention that a call happened,
but never quote phone-log UI labels, call duration, or raw transcript lines unless the user explicitly asks.
```

SNS prompt에서는 더 엄격하다.

```text
Do not output phone-call markers, phone labels, missed/canceled call labels,
or duration records.
Do not make hashtags from 전화, 통화, 부재중, PHONE_CALL, call, phone
unless explicitly asked for a phone-themed SNS post.
```

RN 구현 diff:

```diff
- 통화 종료 후 transcript 전체를 messages에 그대로 저장
+ phoneLog message에는 summaryContext 저장
+ 다음 채팅 prompt에는 summary만 넣기
+ SNS prompt/context에는 phone UI artifact 제거
```

---

## A-9. 전화 기능 RN 엔진 구조

권장 모듈:

```text
PhoneStore
PhoneTriggerNormalizer
IncomingPhoneService
LivePhoneEngine
PhonePromptBuilder
PhoneLogService
PhoneNotificationService
```

### A-9-1. 핵심 타입

```ts
type PhoneSettings = {
  characterPhoneCallEnabled: boolean;
};

type PhoneCardStatus = 'ringing' | 'accepted' | 'rejected' | 'missed';

type PhoneCallCardMessage = {
  id: string;
  role: 'character';
  characterId: string;
  content: '';
  mediaType: 'phone-call';
  mediaName: string;
  callTitle: string;
  callLine: string;
  sourceMode: string;
  callStatus?: PhoneCardStatus;
  callHandledAt?: number;
  createdAt: number;
};
```

### A-9-2. 답장 output → 전화 카드 변환

```ts
function normalizePhoneItem(character: Character, item: ReplyItem): PhoneInvite | null {
  const rawText = item.content ?? item.text ?? item.body ?? '';
  const structuredIntent =
    item.callInvite === true ||
    item.phoneCall === true ||
    item.call === true ||
    item.call?.callInvite === true ||
    item.call?.phoneCall === true ||
    /^(phone[_\s-]*call|incoming[_\s-]*call|call[_\s-]*(now|user|invite))$/i.test(
      String(item.type ?? item.intent ?? item.action ?? item.marker ?? item.call?.type ?? '')
    );

  const explicitInvite = structuredIntent || looksLikeImmediatePhoneCallText(rawText);
  if (!explicitInvite) return null;

  const clean = stripPhoneCallMarker(rawText);
  return {
    title: visibleText(item.callTitle ?? item.call?.title ?? item.phoneTitle ?? `${character.name} 전화`),
    line: visibleText(item.callLine ?? item.call?.line ?? item.phoneLine ?? clean ?? rawText, '지금 전화 걸게.'),
  };
}
```

### A-9-3. 수신 전화 service

```ts
function showIncomingPhoneCall(roomId: string, messageId?: string): boolean {
  const card = findPendingPhoneCard(roomId, messageId);
  if (!card) return false;

  if (phoneStore.liveCall?.open || phoneStore.incomingCall) return false;

  updateMessage(roomId, card.id, { callStatus: 'ringing' });
  phoneStore.incomingCall = {
    roomId,
    characterId: card.characterId,
    messageId: card.id,
    title: card.callTitle || card.mediaName,
    line: card.callLine || '지금 통화할 수 있어?',
    createdAt: Date.now(),
  };

  phoneStore.missTimer = setTimeout(() => missIncomingPhoneCall(), 15_000);
  return true;
}
```

### A-9-4. 종료 기록

```ts
async function endPhoneCallWithReaction() {
  const call = phoneStore.liveCall;
  if (!call?.open || call.ending) return;

  if (!call.phoneLogRecorded) {
    call.phoneLogRecorded = true;
    const startedAt = call.acceptedAt ?? call.connectedAt ?? call.createdAt ?? Date.now();
    appendPhoneLog(call.roomId, call.characterId, `통화 기록 ${formatPhoneDuration(Date.now() - startedAt)}`, 'ended');
  }

  const finalLine = await generatePhoneGoodbyeLine(call).catch(() => '알았어. 나중에 다시 전화할게.');
  call.transcript.push({ role: 'character', text: finalLine });
  playFinalLineThenClose(finalLine);
  updateLatestPhoneLogSummary(call);
}
```

---

## A-10. 전화 기능 회귀 테스트

```text
1. 사용자가 프로필에서 통화 버튼 클릭
   -> incoming overlay 없이 live phone overlay 시작
   -> connectedAt/acceptedAt 기록

2. 캐릭터가 "받아. 지금 전화할게. [[PHONE_CALL]]" 출력
   -> 채팅에는 marker 없는 텍스트만 보임
   -> phone-call card 생성
   -> 수신 overlay 표시

3. characterPhoneCallEnabled=false
   -> 캐릭터 output의 callInvite/PHONE_CALL 제거
   -> 일반 텍스트로만 출력
   -> 프로필 직접 통화는 가능

4. 수신 overlay 15초 방치
   -> phone card callStatus='missed'
   -> phoneLog='missed', content='부재중 전화'
   -> 부재중 알림 생성

5. 수신 overlay 거절
   -> callStatus='rejected'
   -> phoneLog='rejected', content='통화 취소'

6. 수락 후 통화 종료
   -> phoneLog='ended', content='통화 기록 00시간 00분 NN초'
   -> phoneSummaryContext 저장
   -> 다음 채팅 prompt에 summary만 들어감

7. 통화 기록 직후 SNS 생성
   -> SNS text/hashtag/imagePrompt에 PHONE_CALL, 부재중, 통화 기록 duration이 섞이지 않음

8. proactive 선톡에서 spontaneous phone
   -> group room에서는 발생하지 않음
   -> 35분 cooldown 적용
   -> reserved는 낮고 obsessive/attached는 높음
```

---

# Part B. SNS DM 기능

## B-1. 관련 원본 위치 요약

| 범위 | 원본 위치 | 의미 |
|---|---:|---|
| 초기 SNS DM thread/button | `SNSGod.js 2005~2026`, `2897~2930` | SNS card의 DM 버튼, 초기 thread 생성 |
| SNS DM full 화면 | `3905~3925` | 기본 `snsDmFullHtml`, message renderer |
| SNS DM send prompt | `4075~4144`, `5360~5429` | 유저 메시지 push 후 LLM 답장 |
| compact UI / preview / openSnsDm 개선 | `4950~5019` | thread preview, compact full screen, 빈 thread 생성 |
| message edit/delete/reroll | `5626~5715` | DM 메시지 메뉴, 수정/삭제/재생성 |
| SNS 생성 시 제3자 DM 생성 지시 | `22590~22659` | `post.dms[]`, read-only DMs |
| SNS DM hub 최종형 | `22649~22853` | 내 DM + 제3자 DM 목록 |
| SNS DM 알림 | `29095~29134` | 새 캐릭터 DM 답장 notification |

---

## B-2. SNS DM의 두 종류

원본에는 이름이 비슷한 두 개의 DM 개념이 있다.

## B-2-1. `state.snsDmThreads[]`: 사용자가 직접 대화하는 SNS DM

이건 진짜 대화형 DM이다. 사용자가 메시지를 보내면 LLM이 캐릭터 답장을 만든다.

```ts
type SnsDmThread = {
  id: string;
  postId: string;
  platformIndex: number;
  characterId: string;
  kind?: 'user';
  title: string;
  context: string;
  messages: SnsDmMessage[];
  createdAt: number;
};

type SnsDmMessage = {
  from: 'user' | 'character' | string;
  name?: string;
  body: string;
  createdAt: number;
  mediaData?: string;
  image?: string;
  sticker?: string;
};
```

## B-2-2. `post.dms[]`: SNS 글에 딸린 제3자 DM

SNS 게시물 생성 단계에서 `dms`가 만들어질 수 있다. 후반 패치에서는 이것을 “읽기 전용 제3자 DM”으로 본다.

```ts
type SnsPostThirdPartyDm = {
  id?: string;
  title: string;
  messages: Array<{ from: string; body: string; createdAt?: number }>;
};
```

이 DM은 유저가 답장하는 thread가 아니다. SNS 게시물 주변에서 벌어진 follower/commenter/third-party 대화를 보여주는 장식/서브컨텐츠다.

---

## B-3. SNS DM 열기 흐름

## B-3-1. SNS 카드의 버튼

각 platform card에는 버튼이 있다.

```html
<button data-action="open-sns-dm" data-id="post.id" data-index="platformIndex">SNS DM</button>
```

초기에는 이 버튼을 누르면 바로 `selectedSnsDmThreadId = thread.id`로 thread 화면에 들어갔다. 후반 최종형은 다르다.

## B-3-2. 최종 openSnsDm 흐름

최종 `openSnsDm(postId, index)`는 다음을 한다.

```text
1. post 찾기
2. platformIndex 확정
3. character 찾기
4. mgEnsurePostThirdPartyDms(post, character, characterSns) 호출 가능
5. mgFindUserSnsDmThread(post, platformIndex, true)로 내 DM thread 생성/확보
6. mgSnsDmHubPostId = post.id
7. mgSnsDmHubPlatformIndex = platformIndex
8. selectedSnsDmThreadId = ''
9. selectedCharacterId = post.characterId
10. activeTab = 'snsdm'
11. saveState -> render
```

즉, 최종 UX는 **바로 DM 채팅으로 들어가는 것이 아니라 DM 허브 목록 화면을 먼저 띄우는 구조**다.

RN 구현 diff:

```diff
- openSnsDm(postId,index) -> selectedThreadId 바로 설정
+ openSnsDm(postId,index) -> SNS DM Hub 열기
+ Hub에서 "나와 캐릭터의 DM" 카드를 누르면 selectedThreadId 설정
+ Hub에서 제3자 DM 카드를 누르면 postdm:{postId}:{dmId} 선택
```

---

## B-4. SNS DM Hub UI

최종 hub는 다음을 보여준다.

```text
Header:
  캐릭터 avatar + "{character.name} DM"
  "SNS 게시물에서 이어진 대화 목록"

Post preview:
  플랫폼 label + 해당 platform text preview

Thread list:
  - 나와 {character.name}의 DM
  - post.dms[]에서 온 제3자 DM 카드들
```

선택 상태는 다음 세 가지다.

```ts
mgSnsDmHubPostId: string;
mgSnsDmHubPlatformIndex: number;
selectedSnsDmThreadId: string;
```

`selectedSnsDmThreadId` 값에 따라 화면이 갈린다.

```text
''                         -> hub list
'{thread.id}'              -> 내 DM 대화 화면
'postdm:{postId}:{dmId}'   -> 제3자 DM 읽기 화면
```

RN navigation model:

```ts
type SnsDmRoute =
  | { screen: 'SnsDmHub'; postId: string; platformIndex: number }
  | { screen: 'SnsDmUserThread'; threadId: string }
  | { screen: 'SnsDmThirdPartyThread'; postId: string; dmId: string };
```

---

## B-5. 내 SNS DM thread 생성

`mgFindUserSnsDmThread(post, platformIndex, create)`는 다음 조건으로 기존 thread를 찾는다.

```text
thread.postId === post.id
Number(thread.platformIndex || 0) === platformIndex
thread.id가 'postdm:'로 시작하지 않음
thread.kind !== 'thirdParty'
```

없고 `create=true`이면 생성한다.

```ts
thread = {
  id: makeId(),
  postId: post.id,
  platformIndex,
  characterId: post.characterId,
  kind: 'user',
  title: `${platformLabel(platform.platform)} DM`,
  context: snsPlatformContext(post, platform),
  messages: [],
  createdAt: Date.now()
};
```

초기 버전에는 첫 메시지로 `방금 올린 글 보고 DM한 거야?` 같은 캐릭터 seed 메시지가 있었지만, compact 패치에서 그런 seed 하나만 있는 thread는 비워준다. 최종형에서는 빈 thread로 시작한다고 보는 것이 안전하다.

---

## B-6. 내 SNS DM 화면

기본 full 화면은 다음 요소를 가진다.

```text
- 게시물 context preview
- messages list
- composer
  - back button
  - textarea id='mg-sns-dm-input'
  - send button data-action='send-sns-dm'
```

메시지 렌더링은 일반 chat bubble과 유사하지만 `from === 'user'`이면 오른쪽 user bubble, 그 외는 캐릭터 bubble이다. 후반 패치에서는 메시지 bubble에 메뉴가 붙는다.

```text
메시지 클릭
  -> openMessageMenuId toggle
  -> 수정 / 삭제
  -> 캐릭터 메시지는 재생성 버튼 추가
```

---

## B-7. SNS DM 보내기 / 캐릭터 답장 생성

최종 `sendSnsDm(threadId)` 흐름:

```text
1. thread 찾기
2. character 찾기
3. inline input 또는 full input에서 body 추출
4. 빈 문자열이면 return
5. input clear
6. thread.messages에 user message push
7. saveState
8. render
9. history 구성
10. LLM 호출
11. visibleReplyTextsFromPayload(payload)로 최대 3개 답장 추출
12. thread.messages에 character messages push
13. saveState
14. 실패 시 "DM reply failed: ..." 메시지 push
15. render
```

최종 prompt:

```text
Act as {character.name} in a private SNS DM thread that is separate from the normal chat room.
Character profile: ...
{lorePromptBlock(... mode: 'snsdm')}
SNS post context:
{thread.context || '(none)'}
Output language: {config.language}.
Return JSON only: {"messages":[{"content":"visible DM text"}]}.
Do not put JSON, braces, keys, arrays, labels like Refined Response, or analysis headings in the visible content.
```

User message:

```text
SNS DM history:
{history}

Reply as {character.name}.
```

RN 구현 diff:

```diff
- SNS DM 답장에 일반 ChatEngine buildChatPrompt 재사용
+ SNS DM 전용 prompt 사용
+ "normal chat room과 분리된 private SNS DM thread"라고 명시
+ SNS post context와 lorePromptBlock(mode:'snsdm') 삽입
+ visible text parser로 JSON key/brace 누수 제거
```

### B-7-1. parser

`visibleReplyTextsFromPayload(payload)`는 다음 순서로 답장을 뽑는다.

```text
1. rawText에서 JSON 추출/repair
2. parsed.messages[].content/body/text
3. parsed.content/body/text
4. payload.messages[].content/body/text/imageCaption
5. rawText fallback
6. cleanChatOutputText
7. 최대 3개
```

SNS DM은 `normalizeReplyMessages`를 그대로 쓰면 phone/image/sticker 등 일반 채팅 요소가 섞일 수 있기 때문에, 최종형에서는 `visibleReplyTextsFromPayload`를 거쳐 **텍스트만** thread message body로 넣는 쪽이 더 안전하다.

---

## B-8. SNS DM 재생성 / 수정 / 삭제

최종 message menu:

```text
유저 메시지:
  수정 / 삭제

캐릭터 메시지:
  수정 / 삭제 / 재생성
```

재생성은 target 이전 메시지만 context로 사용한다.

```text
previousMessages = thread.messages.slice(0, targetIndex)
lastUser = previousMessages reverse find from === 'user'
```

Prompt:

```text
Act as {character.name} in a private SNS DM thread.
Character profile: ...
SNS post context: ...
Output language: ...
Return JSON only: {"messages":[{"content":"visible DM text"}]}.

SNS DM history:
{previous history}

Regenerate the last reply to: {lastUser.body}
```

RN 구현 diff:

```diff
+ SNS DM 메시지별 context menu
+ 유저 메시지는 reroll 없음
+ 캐릭터 메시지 reroll은 해당 메시지 이전 history만 사용
+ replacement는 첫 visible reply만 사용
```

---

## B-9. 제3자 DM / read-only DM

SNS 생성 prompt는 `noDM`이 false일 때 `dms`를 만들 수 있다. 후반 패치에서는 fresh SNS rules로 다음을 요구한다.

```text
Create 1-2 short read-only dms between the character account and
a follower/commenter/third party sparked by this post.
These are not the user sending a DM.
They are extra SNS-side conversations the user can view with the post.
```

이 `post.dms[]`는 SNS DM Hub에서 “다른 DM” 카드로 표시된다. 선택하면 `selectedSnsDmThreadId = postdm:{post.id}:{dm.id}` 형태가 되고, `mgSnsThirdPartyDmFullHtml()`이 읽기 전용 메시지 목록을 렌더한다.

중요한 구분:

```text
state.snsDmThreads[]  -> 유저와 캐릭터의 대화형 DM
post.dms[]            -> 캐릭터와 follower/third party의 읽기 전용 DM
```

RN에서 이 둘을 섞으면 안 된다.

---

## B-10. `noDM`, `thirdPartyDM` 옵션과 실제 영향

원본 SNS 옵션에는 다음이 있다.

```ts
sns.noDM
sns.thirdPartyDM
```

관찰되는 동작:

```text
noDM=true:
  - SNS post 생성 prompt에서 dms 생성 금지
  - post.dms는 비거나 제거됨
  - 제3자/read-only DM은 없어야 함

thirdPartyDM=true:
  - 제3자 commenter/follower DM을 드라마적으로 허용
```

주의할 점: 일반 SNS platform card의 `SNS DM` 버튼은 기본 renderer에 항상 존재하는 형태다. 그래서 `noDM`은 주로 **자동 생성되는 post.dms / 제3자 DM**을 막는 옵션으로 보는 것이 안전하다. 유저가 수동으로 여는 `내 DM thread`까지 완전히 막으려면 RN에서 정책을 별도로 정해야 한다.

권장 RN 정책:

```ts
const allowUserSnsDm = true;              // 원본 호환
const allowGeneratedThirdPartyDms = !sns.noDM;
```

또는 완전 차단을 원하면:

```ts
const allowUserSnsDm = !sns.noDM;
```

이 경우 원본과 달라질 수 있으니 명시해야 한다.

---

## B-11. SNS DM 알림

후반 notification center wrapper는 `sendSnsDm`을 감싼다.

```text
before = thread.messages.length
sendSnsDm(threadId)
updated = find thread
added = messages.slice(before).filter(from !== 'user')
if added.length && 현재 SNSDM thread가 보이지 않으면:
  mgPushNotification({
    app: 'snsdm',
    title: '{character.name} DM',
    body: 마지막 추가 메시지,
    target: { app:'snsdm', threadId, postId, characterId },
    collapseKey: `snsdm:${threadId}`
  })
```

즉, 유저가 SNS DM 화면을 보고 있으면 알림을 띄우지 않고, 다른 화면이면 알림 센터에 들어간다.

RN 구현 diff:

```diff
+ sendSnsDm 전/후 message count 비교
+ 새 character reply가 생겼고 현재 thread가 visible하지 않으면 notification push
+ collapseKey = snsdm:{threadId}
+ 알림 클릭 시 activeTab='snsdm', selectedSnsDmThreadId=threadId
```

---

## B-12. SNS DM RN 엔진 구조

권장 모듈:

```text
SnsDmStore
SnsDmRouter
SnsDmPromptBuilder
SnsDmEngine
SnsDmParser
SnsDmNotificationService
```

### B-12-1. 상태 타입

```ts
type SnsDmState = {
  hubPostId: string;
  hubPlatformIndex: number;
  selectedThreadId: string;
  threads: SnsDmThread[];
};

type SnsDmThread = {
  id: string;
  postId: string;
  platformIndex: number;
  characterId: string;
  kind: 'user';
  title: string;
  context: string;
  messages: SnsDmMessage[];
  createdAt: number;
};

type SnsDmMessage = {
  from: 'user' | 'character';
  name: string;
  body: string;
  createdAt: number;
};
```

### B-12-2. 열기

```ts
function openSnsDm(postId: string, platformIndex = 0) {
  const post = snsStore.findPost(postId);
  if (!post) return;

  const character = getCharacter(post.characterId);
  const sns = snsConfigForCharacter(post.characterId);

  if (!sns.noDM) ensurePostThirdPartyDms(post, character, sns);

  ensureUserSnsDmThread(post, platformIndex, true);

  snsDmStore.hubPostId = post.id;
  snsDmStore.hubPlatformIndex = platformIndex;
  snsDmStore.selectedThreadId = '';
  navigation.navigate('SnsDmHub', { postId, platformIndex });
}
```

### B-12-3. 보내기

```ts
async function sendSnsDm(threadId: string, body: string) {
  const thread = findThread(threadId);
  const character = getCharacter(thread.characterId);
  if (!thread || !character || !body.trim()) return;

  thread.messages.push({
    from: 'user',
    name: userNameFor(character),
    body: body.trim(),
    createdAt: Date.now(),
  });
  await persist();

  const before = thread.messages.length;

  try {
    const payload = await llm.call(buildSnsDmMessages(character, thread, body), { maxTokens: 900 });
    const texts = visibleReplyTextsFromPayload(payload);
    for (const text of texts) {
      thread.messages.push({ from: 'character', name: character.name, body: text, createdAt: Date.now() });
    }
  } catch (error) {
    thread.messages.push({ from: 'character', name: character.name, body: `DM reply failed: ${error.message}`, createdAt: Date.now() });
  }

  await persist();
  notifyIfNotVisible(thread, before);
}
```

### B-12-4. 동시성 보완

원본에는 SNS DM thread별 generating lock이 보이지 않는다. 같은 thread에서 빠르게 여러 번 전송하면 LLM 호출이 겹칠 수 있다. RN에서는 보완하는 것이 좋다.

```ts
const generatingSnsDmThreads = new Set<string>();

async function sendSnsDm(threadId: string, body: string) {
  if (generatingSnsDmThreads.has(threadId)) {
    queueSnsDmUserMessage(threadId, body);
    return;
  }
  generatingSnsDmThreads.add(threadId);
  try {
    await sendSnsDmCore(threadId, body);
  } finally {
    generatingSnsDmThreads.delete(threadId);
    drainQueuedSnsDm(threadId);
  }
}
```

---

## B-13. SNS DM 회귀 테스트

```text
1. SNS post에서 SNS DM 버튼 클릭
   -> 바로 thread 화면이 아니라 hub 화면 표시
   -> 내 DM card와 제3자 DM card 구분

2. 내 DM card 클릭
   -> selectedThreadId 설정
   -> post preview + messages + composer 표시

3. 첫 DM 전송
   -> user message 즉시 push
   -> LLM 답장 1~3개 push
   -> 답장 visible text에 JSON braces/keys 없음

4. 같은 thread에서 빠른 연속 전송
   -> RN 보완 lock/queue로 응답 순서 유지

5. 캐릭터 DM 메시지 재생성
   -> 해당 메시지 이전 history만 사용
   -> user message에는 reroll 버튼 없음

6. 제3자 DM 클릭
   -> 읽기 전용으로 표시
   -> composer 없음

7. noDM=true SNS post
   -> post.dms[] 생성 안 됨
   -> 유저 수동 DM 버튼 유지 여부는 정책에 따라 테스트

8. 다른 화면에 있을 때 SNS DM 답장 도착
   -> app='snsdm' notification 생성
   -> 클릭 시 해당 thread로 이동

9. SNS DM prompt에서 일반 채팅방과 분리
   -> 캐릭터가 “방금 일반 DM에서...”처럼 혼동하지 않고 SNS post context 기반으로 답장
```

---

# Part C. 전화와 SNS DM의 교차 주의점

## C-1. 전화 로그가 SNS/SNS DM에 새지 않게 해야 한다

원본은 전화 UI artifact를 SNS에서 강하게 제거한다.

제거 대상:

```text
PHONE_CALL
[전화: ...]
[통화: ...]
부재중 전화
통화 취소
전화 취소
전화 거절
통화 기록 00시간 00분 00초
call record
missed call
duration
```

SNS DM에서도 일반 `lorePromptBlock`과 `thread.context`를 쓰므로, post context를 만들 때 이미 phone artifact가 제거되어야 한다.

## C-2. Messenger-only boundary

후반 패치에서는 대화형 prompt 전체에 “현실에서 직접 만나러 간다/문 열어줘/집 앞이야” 같은 오프스크린 물리 이동을 금지하는 boundary가 붙는다. 대신 전화, DM, SNS, 사진, 스티커, 선물, 편지 등 메신저 내부 상호작용으로 감정을 표현하라고 한다.

전화와 SNS DM은 이 boundary에서 의도적으로 허용되는 표현 수단이다. 따라서 RN prompt에서도 physical meeting을 전화/DM으로 재프레이밍하는 규칙을 유지해야 한다.

---

# Part D. 최종 작업 우선순위

```text
1. PhoneStore / IncomingPhoneOverlay / LivePhoneOverlay 분리
2. reply output parser에 callInvite + [[PHONE_CALL]] marker 지원
3. phone-call card message type 추가
4. incoming flow: ringing / accepted / rejected / missed / 15초 timer
5. live call LLM prompt + parser + 선택지/직접 입력/다음 버튼
6. end call duration log + summary context 저장
7. phone artifact cleaner를 chat/SNS/SNSDM context builder 앞에 배치
8. SnsDmStore: user threads와 post.dms(read-only)를 분리
9. SNS DM Hub 화면 구현
10. sendSnsDm 전용 prompt/parser/notification 구현
11. thread별 SNS DM generation lock/queue 추가
12. 전화/SNSDM 교차 회귀 테스트 고정
```

---

# Appendix. React Native 화면 구성 제안

## Phone screens/components

```text
PhoneIncomingOverlay
  - avatar/background
  - caller name
  - callLine
  - accept/reject buttons
  - 15초 timeout display optional

PhoneLiveOverlay
  - avatar/background
  - status
  - line display
  - next line button
  - choice buttons
  - custom reply input
  - hangup button

PhoneLogBubble
  - missed/rejected/ended icon
  - label
  - duration/detail
  - time

PhoneCallCardBubble
  - callTitle
  - callLine
  - accept/start button or status badge
```

## SNS DM screens/components

```text
SnsDmHubScreen
  - post preview
  - my DM card
  - third-party DM cards

SnsDmUserThreadScreen
  - post preview header
  - message list
  - composer
  - message context menu

SnsDmThirdPartyThreadScreen
  - post preview header
  - read-only messages
  - no composer
```

---

# Appendix. 원본 호환 정책 체크

| 항목 | 원본 최종형 | RN 권장 |
|---|---|---|
| 캐릭터 먼저 전화 토글 | 끄면 캐릭터 initiated call 차단, 사용자 직접 통화는 허용 | 동일 |
| marker 출력 | prompt는 `[[PHONE_CALL]]`만 허용 | 동일, parser는 variant도 흡수 |
| 전화 수신 제한 | 15초 뒤 부재중 | 동일 |
| 통화 종료 | duration log + final goodbye LLM | 동일 |
| 통화 context | raw transcript 대신 summary | 동일 |
| SNS phone artifact | 강하게 제거 | 동일 |
| SNS DM thread | `state.snsDmThreads[]` | 동일 |
| 제3자 DM | `post.dms[]`, 읽기 전용 | 동일 |
| SNS DM hub | post별 hub + 내 DM + 제3자 DM | 동일 |
| SNS DM lock | 원본에 명확한 lock 없음 | RN에서 보완 권장 |
