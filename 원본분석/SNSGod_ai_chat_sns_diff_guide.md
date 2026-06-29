# SNSGod 원본 기반 AI 채팅/SNS 복각 Diff 가이드

> 대상: 사용자가 공유한 “바이브 채팅” 대화에서 언급된 걱정 지점.  
> 범위: AI 채팅 엔진, 자동화/선톡과 답장 경계, SNS 생성/자동 SNS, SNS 데이터 모델, 파서/정규화, 프롬프트 조립, SNS 이미지 처리 순서.  
> 제외: API provider별 세부 옵션, 이미지 생성 provider 구현 자체. 단, SNS `textOnly`/`autoImage`/첨부 이미지/NSFW 태그 순서는 채팅-SNS 경계에 직접 영향을 주므로 포함한다.

원본은 `SNSGod.js`의 RisuAI Plugin API v3용 `chat-style multi-character messenger` 플러그인이다. 파일 초반 기본 상태에는 `isPosting`, `pendingRoomStatus`, `roomTimers`, `replyJobs`, `generatingRooms`, `randomTimers`, `nextAutonomyAt` 등 동시성/자동화 상태가 분리되어 있다. 원본 복각의 핵심은 “화면 컴포넌트에서 LLM을 직접 호출하지 않고, 방 단위 job/timer/stale guard를 가진 엔진을 거쳐 출력한다”는 점이다.

---

## 0. 원본을 읽을 때 가장 중요한 전제

`SNSGod.js`는 같은 함수명을 뒤에서 계속 재정의한다.

예를 들어 다음 함수들은 초반 정의만 보면 안 된다.

- `buildMessages`
- `deliverCharacterMessages`
- `buildSnsPostMessages`
- `generateSnsPost`
- `maybeCreateAutoSnsPost`
- `normalizeReplyMessages`
- `sanitizeSnsPlatform`
- `normalizeSnsPlatforms`

RN 복각에서는 JS처럼 함수 재정의를 반복하지 말고, 아래처럼 **명시적 final pipeline**으로 바꾸는 것이 안전하다.

```ts
ChatEngine.requestReply()
  -> ChatPromptBuilder.buildFinalChatMessages()
  -> LlmClient.callJson()
  -> ChatOutputParser.normalizeFinalReplyMessages()
  -> MessageDelivery.deliverFinalCharacterMessages()
  -> SnsEngine.enqueueAutoSnsCheck()

SnsEngine.generatePostFinal()
  -> SnsPromptBuilder.buildCoreMessages()
  -> LlmClient.callRawText()
  -> SnsParser.payloadFromRaw()
  -> SnsNormalizer.ensurePlatforms()
  -> SnsImagePolicy.applyPlatformImageRules()
  -> SnsPostStore.unshift()
  -> SnsPostFinalizers.retention/hybrid/freshComments/dms/dailyMicro/log
```

---

# 1. 채팅 답장 엔진: `ChatScreen`에서 직접 LLM 호출 금지

## 1.1 원본 함수 위치

| 원본 함수 | 위치 | 역할 |
|---|---:|---|
| `sendUserMessage` | `SNSGod.js L1470-L1493` | 유저 메시지/첨부 저장 후 답장 예약 시작 |
| `generateCharacterReply` | `L1496-L1524` | room별 jobId, read/reply timer 생성 |
| `runCharacterReply` | `L1527-L1559` | LLM 호출, stale guard, normalize, deliver, auto SNS 연결 |
| `replyTiming` | `L1569-L1573`, 후반 `L15961-L15966` | 읽음/답장 지연 계산 |
| `scheduleRoomTimer` / `clearRoomTimers` / `cancelPendingReply` | `L1594-L1619` | room별 timer 관리와 pending reply 취소 |
| `deliverCharacterMessages` | `L1657-L1696` + 후반 wrapper 다수 | 말풍선/스티커/이미지/전화/기프티콘 순차 출력 |

## 1.2 원본 동작 요약

### `sendUserMessage(text)`

역할:

- 현재 room/character를 가져온다.
- 새 유저 메시지가 들어오면 이전 pending reply를 취소한다.
- 첨부가 있으면 user media message를 먼저 push한다.
- 텍스트가 있으면 user text message를 다음에 push한다.
- `room.lastActivity`를 갱신하고 저장/렌더한다.
- 마지막으로 `generateCharacterReply(character, room.id, latestText, 'reply')`를 호출한다.

상태 변경:

```ts
cancelPendingReply(room.id, '새 메시지로 이전 대기 답장 취소', true)
state.messages[room.id].push(userAttachment?)
state.messages[room.id].push(userText?)
room.lastActivity = Date.now()
forceScrollRoomId = room.id
```

RN에서 맞춰야 할 점:

```diff
- ChatScreen.onSend 안에서 바로 await callLLM(prompt)
+ ChatScreen.onSend는 ChatEngine.sendUserMessage(roomId, text, attachment)만 호출
+ 유저가 새 메시지를 보내면 해당 room의 기존 timer/job/status를 취소
+ 첨부와 텍스트가 함께 있으면 원본처럼 첨부 message -> text message 순서로 push
```

---

### `generateCharacterReply(character, roomId, userText, mode)`

역할:

- 방이 이미 API 생성 중이면 바로 API를 또 부르지 않고, 700ms 뒤 재시도 job을 예약한다.
- 생성 중이 아니면 기존 room timer를 모두 지우고 새 `jobId`를 만든다.
- `pendingRoomStatus`를 `sent` 또는 `read`로 설정한다.
- read delay 뒤 `read` 상태로 바꾸고, reply delay 뒤 `runCharacterReply`를 호출한다.

원본 핵심:

```ts
if (generatingRooms.has(roomId)) {
  const retryJobId = makeId();
  replyJobs[roomId] = retryJobId;
  pendingRoomStatus[roomId] = { phase: 'read', jobId: retryJobId, detail: '이전 API 응답 정리 후 최신 메시지로 다시 요청 예정' };
  scheduleRoomTimer(roomId, 700, () => {
    if (replyJobs[roomId] === retryJobId) generateCharacterReply(...);
  });
  return;
}

clearRoomTimers(roomId);
const jobId = makeId();
replyJobs[roomId] = jobId;
pendingRoomStatus[roomId] = { phase: readDelay > 0 ? 'sent' : 'read', jobId, ... };
scheduleRoomTimer(roomId, readDelay * 1000, markRead);
scheduleRoomTimer(roomId, replyDelay * 1000, () => runCharacterReply(..., jobId));
```

RN diff:

```diff
- const res = await callLLM(...); append(res)
+ const jobId = createJob(roomId)
+ clearRoomTimers(roomId)
+ setPendingStatus(roomId, { phase: 'sent' | 'read', jobId })
+ scheduleRoomTimer(roomId, readDelay, () => markReadIfCurrent(roomId, jobId))
+ scheduleRoomTimer(roomId, replyDelay, () => runCharacterReply(roomId, jobId))
```

권장 RN 구현:

```ts
class ChatJobStore {
  replyJobs = new Map<RoomId, JobId>();
  generatingRooms = new Set<RoomId>();
  roomTimers = new Map<RoomId, Set<ReturnType<typeof setTimeout>>>();
  pendingRoomStatus = new Map<RoomId, PendingRoomStatus>();

  isCurrent(roomId: string, jobId: string) {
    return this.replyJobs.get(roomId) === jobId;
  }

  clearRoomTimers(roomId: string) {
    for (const t of this.roomTimers.get(roomId) ?? []) clearTimeout(t);
    this.roomTimers.delete(roomId);
  }

  cancelPendingReply(roomId: string) {
    this.clearRoomTimers(roomId);
    this.replyJobs.delete(roomId);
    this.pendingRoomStatus.delete(roomId);
    // 원본은 generatingRooms 자체는 취소하지 않음. 이미 날아간 API 응답은 jobId stale guard로 버림.
  }
}
```

---

### `runCharacterReply(...)`

역할:

- `replyJobs[roomId] !== jobId`면 오래된 작업으로 보고 중단한다.
- `generatingRooms.has(roomId)`면 중복 API 호출로 보고 중단한다.
- `generatingRooms.add(roomId)`로 방 단위 API lock을 건다.
- `pendingRoomStatus.phase = 'thinking'`으로 바꾼다.
- `callLLM(await buildMessages(...))`를 호출한다.
- API 응답 뒤 다시 jobId를 검사한다.
- `normalizeReplyMessages` 후 `deliverCharacterMessages`를 호출한다.
- 성공 후 `scheduleCharacter(character, false)`, `saveState`, `maybeCreateAutoSnsPost`를 실행한다.
- finally에서 `isSending`, `generatingRooms`, `replyJobs`, `pendingRoomStatus`를 정리한다.

원본의 핵심 guard:

```ts
if (replyJobs[roomId] !== jobId) return;
if (generatingRooms.has(roomId)) return;
generatingRooms.add(roomId);
try {
  const payload = await callLLM(await buildMessages(...));
  if (replyJobs[roomId] !== jobId) return;
  const messages = normalizeReplyMessages(...);
  await deliverCharacterMessages(..., jobId, mode);
  scheduleCharacter(character, false);
  await saveState();
  maybeCreateAutoSnsPost(character, roomId).catch(console.warn);
} finally {
  generatingRooms.delete(roomId);
  if (replyJobs[roomId] === jobId) {
    delete replyJobs[roomId];
    delete pendingRoomStatus[roomId];
  }
}
```

RN diff:

```diff
- API 응답 도착 시 무조건 append
+ API 응답 직후 jobId가 현재 job인지 확인
+ delivery 중 gap 대기 후에도 jobId 확인
+ 이미지 생성/전화카드/스티커 push 후에도 필요하면 jobId 확인

- 자동 SNS를 유저 메시지 저장 직후 검사
+ 캐릭터 답장 delivery 성공 후에만 자동 SNS 검사
```

권장 구현:

```ts
async function runCharacterReply(ctx: ReplyContext) {
  const { roomId, jobId, character, mode } = ctx;

  if (!jobStore.isCurrent(roomId, jobId)) return;
  if (jobStore.generatingRooms.has(roomId)) return;

  jobStore.generatingRooms.add(roomId);
  jobStore.setPending(roomId, { phase: 'thinking', jobId, characterId: character.id });

  try {
    const messages = await chatPromptBuilder.buildFinal(character, ctx);
    const payload = await llm.callJson(messages);

    if (!jobStore.isCurrent(roomId, jobId)) return;

    const items = chatParser.normalizeFinal(character, { ...payload, userText: ctx.userText });
    await messageDelivery.deliver(character, roomId, items, jobId, mode);

    if (!jobStore.isCurrent(roomId, jobId)) return;

    scheduleCharacter(character, false);
    await persist();
    snsEngine.enqueueAutoSnsCheck(character.id, roomId);
  } catch (error) {
    pushSystemMessage(roomId, `전송 실패: ${error.message}`);
    await persist();
  } finally {
    jobStore.generatingRooms.delete(roomId);
    jobStore.clearIfCurrent(roomId, jobId);
  }
}
```

---

## 1.3 “채팅이 SNS처럼 답장”되는 원인 후보와 diff

대화에서 언급된 “프롬프트 연결 꼬임”, “채팅이 SNS처럼 답장”은 보통 아래 둘 중 하나다.

### 원인 A: 채팅/SNS prompt builder가 같은 함수 또는 같은 state를 공유

원본은 채팅 prompt와 SNS prompt가 완전히 다르다.

- 채팅: `buildMessages(character, { mode, userText, roomId, replyDelay })`
- SNS: `mgSnsBuildCoreMessages(character, hintText, roomId, options)`

채팅은 `Reply as character in JSON`으로 끝나고, SNS는 `Create the SNS JSON now`로 끝난다.

RN diff:

```diff
- buildPrompt(kind, character, room, text) 하나로 chat/sns 공용 처리
+ buildChatPrompt(...)와 buildSnsPrompt(...)를 타입부터 분리

- mode 또는 screen state에 따라 같은 parser 사용
+ ChatParser.parseAssistantPayload와 SnsParser.payloadFromRaw 분리
```

권장 타입:

```ts
type PromptKind = 'chat-reply' | 'chat-proactive' | 'chat-calendar' | 'sns-manual' | 'sns-auto';

function assertChatKind(kind: PromptKind) {
  if (!kind.startsWith('chat-')) throw new Error(`Invalid chat prompt kind: ${kind}`);
}

function assertSnsKind(kind: PromptKind) {
  if (!kind.startsWith('sns-')) throw new Error(`Invalid SNS prompt kind: ${kind}`);
}
```

### 원인 B: SNS parser가 `messages[]` 응답을 채팅 메시지로 오해

원본 초반 SNS prompt는 `messages array containing one short post` 같은 문구가 있었지만, 최종 SNS는 `platforms[]` schema로 확장된다. 그래서 RN에서 `payload.messages`를 곧바로 채팅 bubble로 append하면 SNS 결과가 채팅으로 새어 들어갈 수 있다.

RN diff:

```diff
- const payload = parseAssistantPayload(raw)
- appendChatMessages(payload.messages)
+ if (context.kind.startsWith('sns-')) {
+   const snsPayload = parseSnsPayloadFromRaw(raw)
+   saveSnsPost(snsPayload)
+ } else {
+   const chatPayload = parseChatPayload(raw)
+   deliverChatMessages(chatPayload.messages)
+ }
```

---

# 2. MessageDelivery: 다중 말풍선/특수 메시지/stale guard

## 2.1 원본 기본 delivery

기본 `deliverCharacterMessages`는 각 message item을 순회한다.

순서:

1. 현재 job인지 확인
2. 두 번째 말풍선부터 `messageGapSeconds`만큼 대기
3. 다시 현재 job인지 확인
4. sticker 있으면 sticker message push
5. imagePrompt 있고 이미지 생성 enabled면 이미지 생성 후 image message push
6. `content || imageCaption`이 있으면 text message push
7. 각 push마다 `noteIncomingMessage`, `saveState`, `renderIncomingChange`

RN diff:

```diff
- normalized messages를 한 번에 setMessages([...messages, ...items])
+ item 단위로 gap을 두고 push
+ gap 대기 후 stale job이면 중단
+ 이미지 생성 후 stale job이면 push하지 않음
```

권장 구현:

```ts
async function deliverCharacterMessages(character, roomId, items, jobId, sourceMode) {
  for (let i = 0; i < items.length; i++) {
    if (!jobStore.isCurrent(roomId, jobId)) return;

    if (i > 0) {
      await jobStore.delayRoom(roomId, messageGapMs(character, items[i]));
      if (!jobStore.isCurrent(roomId, jobId)) return;
    }

    const item = items[i];

    if (item.sticker) await pushSticker(roomId, character, item.sticker, sourceMode);
    if (item.giftType) await pushGift(roomId, character, item, sourceMode);
    if (item.callInvite || item.phoneCall) await pushPhoneCall(roomId, character, item, sourceMode);

    if (item.imagePrompt && imagePolicy.chatImageEnabled()) {
      const img = await tryGenerateChatImage(character, item);
      if (!jobStore.isCurrent(roomId, jobId)) return;
      if (img) await pushImage(roomId, character, img, item, sourceMode);
    }

    const text = cleanChatOutputText(item.content || item.imageCaption || '');
    if (text) await pushCharacterText(roomId, character, text, sourceMode);
  }
}
```

---

# 3. 자동화/선톡과 일반 답장의 경계

## 3.1 원본의 자동화 흐름

### `sendAutonomousMessage(character)`

원본 조건:

```ts
if (!state.config.proactiveChatEnabled || !character.enabled || !character.proactiveEnabled) return;
const roomId = state.chatRooms[character.id]?.[0]?.id;
if (!roomId || generatingRooms.has(roomId)) return;
const count = unansweredProactiveCount(roomId);
if (Math.random() * 100 > adjustedInitiative(character, count)) return scheduleCharacter(character, false);
await generateCharacterReply(character, roomId, '', 'proactive');
```

주의:

- 첫 번째 개인 DM 방만 사용한다.
- `generatingRooms`만 본다.
- `replyJobs`, `pendingRoomStatus`, `roomTimers`는 보지 않는다.
- busy로 return할 때 재스케줄하지 않는다.

RN에서는 원본 약점을 그대로 복각하지 말고 보완해야 한다.

```diff
- if (generatingRooms.has(roomId)) return
+ if (isRoomBusy(roomId)) {
+   rescheduleSoon(character.id, 'room-busy');
+   return;
+ }
```

권장 busy 판정:

```ts
function isRoomBusy(roomId: string) {
  return (
    jobStore.generatingRooms.has(roomId) ||
    jobStore.replyJobs.has(roomId) ||
    jobStore.pendingRoomStatus.has(roomId) ||
    (jobStore.roomTimers.get(roomId)?.size ?? 0) > 0
  );
}
```

---

## 3.2 `startAutonomyLoop`와 due 캐릭터 처리

원본:

```ts
setInterval(() => {
  checkCalendarEvents().catch(console.warn);
  if (!state.config.proactiveChatEnabled) return;
  const due = state.characters.find(character =>
    character.enabled && Date.now() >= (nextAutonomyAt.get(character.id) || 0)
  );
  if (due) sendAutonomousMessage(due);
}, AUTONOMY_TICK_MS);
```

문제:

- 한 tick에서 due 캐릭터를 한 명만 처리한다.
- 배열 앞 캐릭터가 busy면 뒤 캐릭터가 계속 밀릴 수 있다.
- 여러 캐릭터가 동시에 몰릴 때 “생성 안 됨”처럼 보일 수 있다.

RN diff:

```diff
- const due = characters.find(...)
- if (due) sendAutonomousMessage(due)
+ const dueList = characters.filter(...).sort(byNextAutonomyAt)
+ for (const character of dueList) automationQueue.enqueue({ type: 'proactive', characterId })
+ drainAutomationQueue({ concurrency: 1 })
```

권장 구현:

```ts
async function runAutonomyTick() {
  enqueueDueCalendarEvents();

  if (!config.proactiveChatEnabled) return;

  const due = characters
    .filter(c => c.enabled !== false)
    .filter(c => Date.now() >= (nextAutonomyAt.get(c.id) ?? 0))
    .sort((a, b) => (nextAutonomyAt.get(a.id) ?? 0) - (nextAutonomyAt.get(b.id) ?? 0));

  for (const character of due) {
    automationQueue.enqueueUnique(`proactive:${character.id}`, {
      type: 'proactive',
      characterId: character.id,
    });
  }
}
```

---

## 3.3 `scheduleRandomChats`: 이름이 헷갈림

원본 `scheduleRandomChats`는 “랜덤채팅 캐릭터 생성”이 아니다. 전역 설정 `randomFirstMessageEnabled`가 켜졌을 때 **기존 캐릭터들의 랜덤 첫 발화 timeout**을 거는 기능이다.

원본:

```ts
randomTimers.forEach(clearTimeout);
randomTimers = [];
if (!state.config.randomFirstMessageEnabled) return;
const enabled = state.characters.filter(character => character.enabled).slice(0, Number(state.config.randomCharacterCount) || 3);
for (const character of enabled) {
  const min = Math.max(1, Number(state.config.randomMessageFrequencyMin) || 10);
  const max = Math.max(min, Number(state.config.randomMessageFrequencyMax) || 120);
  randomTimers.push(setTimeout(() => sendAutonomousMessage(character), random(min,max) * 60000));
}
```

중요:

- 캐릭터 선택은 랜덤이 아니다.
- 활성 캐릭터 배열 앞에서 `randomCharacterCount`명만 대상이다.
- 각 character마다 1회 timeout을 건다.
- timeout 실행 후 자동 재등록하지 않는다.
- 결국 `sendAutonomousMessage`를 호출하므로 전역 proactive/캐릭터 proactive 조건을 그대로 탄다.

RN diff:

```diff
- 랜덤채팅 기능과 randomFirstMessage를 같은 모듈에서 처리
+ RandomChatFeature(임시 캐릭터 생성)와 RandomFirstMessageAutomation(기존 캐릭터 선톡)을 분리

- randomFirstMessage timeout에서 직접 LLM 호출
+ automationQueue.enqueue({ type: 'random-first-message', characterId })
```

---

## 3.4 캘린더 선톡은 proactive가 꺼져도 동작

원본 `checkCalendarEvents`는 `startAutonomyLoop`에서 proactive 체크보다 먼저 실행된다. `sendCalendarEventMessage` prompt에도 “proactive first messages are disabled여도 허용”이라고 명시되어 있다.

원본 약점:

- 이벤트를 발견하면 먼저 `lastTriggeredDate` 또는 `lastTriggeredByCharacter`를 오늘로 저장한다.
- 그 뒤 `sendCalendarEventMessage`를 호출한다.
- 방이 `generatingRooms`이면 `sendCalendarEventMessage`는 return한다.
- 결과적으로 “오늘 발송 처리됐지만 실제 메시지는 없음”이 될 수 있다.

RN diff:

```diff
- 이벤트 감지 즉시 lastTriggered 저장
- room busy면 return
+ 이벤트 감지 시 calendarQueue enqueue
+ 실제 deliver 성공 후 lastTriggered 저장
+ room busy면 retryAt을 두고 재시도
```

권장 job:

```ts
type CalendarJob = {
  key: string;
  characterId: string;
  eventId: string;
  scope: 'user' | 'character';
  dateKey: string;
  retryCount: number;
};
```

---

# 4. 자동 SNS 연결부: 답장 성공 후 검사, 큐 필수

## 4.1 원본 위치

- 자동 SNS 조건: `SNSGod.js L2849-L2875`
- 후반 캐릭터별 toggle wrapper: `L26275-L26292`
- operation log wrapper: `L30579-L30607`

## 4.2 원본 조건

```ts
async function maybeCreateAutoSnsPost(character, roomId) {
  if (!state.config.autoSnsEnabled || isPosting || !character || !roomId) return;
  const messages = state.messages[roomId] || [];
  const minMessages = Math.max(2, Number(state.config.autoSnsMinMessages) || 6);
  const cooldown = Math.max(1, Number(state.config.autoSnsCooldownMessages) || 4);
  if (messages.length < minMessages) return;
  if (messages.length - (Number(character.lastSnsMessageCount) || 0) < cooldown) return;
  const chance = Math.max(0, Math.min(100, Number(state.config.autoSnsChance) || 40));
  if (Math.random() * 100 >= chance) return;
  isPosting = true;
  try {
    await generateSnsPost(character, roomId, 'Recent chat may contain something worth posting as a private-account update.', { manual: false });
    await saveState();
  } finally {
    isPosting = false;
    render();
  }
}
```

후반 wrapper:

```ts
if (character?.snsAutoEnabled === false) return;
```

## 4.3 원본 약점

`isPosting`은 전역 boolean이다. 자동 SNS 생성 중 다른 캐릭터의 자동 SNS 검사 요청이 들어오면 그냥 return한다. queue가 아니므로 유실된다.

RN diff:

```diff
- if (isPosting) return
+ enqueueAutoSnsCheck(characterId, roomId)
+ SNS 생성은 concurrency 1 queue에서 순차 실행
+ queue 실행 시점에 조건을 다시 검사
```

권장 구현:

```ts
type AutoSnsJob = {
  key: string;
  characterId: string;
  roomId: string;
  enqueuedAt: number;
  sourceMessageCount: number;
};

function enqueueAutoSnsCheck(characterId: string, roomId: string) {
  const key = `auto-sns:${characterId}:${roomId}`;
  const existing = snsQueue.find(j => j.key === key);
  const sourceMessageCount = messagesByRoom[roomId]?.length ?? 0;

  if (existing) {
    existing.sourceMessageCount = Math.max(existing.sourceMessageCount, sourceMessageCount);
    return;
  }

  snsQueue.push({ key, characterId, roomId, enqueuedAt: Date.now(), sourceMessageCount });
  void drainSnsQueue();
}

async function drainSnsQueue() {
  if (snsPosting) return;
  snsPosting = true;
  try {
    while (snsQueue.length) {
      const job = snsQueue.shift()!;
      await runAutoSnsCheck(job);
    }
  } finally {
    snsPosting = false;
  }
}
```

실행 시점 재검사:

```ts
async function runAutoSnsCheck(job: AutoSnsJob) {
  const character = getCharacter(job.characterId);
  if (!character) return;
  if (character.snsAutoEnabled === false) return;
  if (!config.autoSnsEnabled) return;

  const messages = messagesByRoom[job.roomId] ?? [];
  const minMessages = Math.max(2, Number(config.autoSnsMinMessages) || 6);
  const cooldown = Math.max(1, Number(config.autoSnsCooldownMessages) || 4);

  if (messages.length < minMessages) return;
  if (messages.length - (Number(character.lastSnsMessageCount) || 0) < cooldown) return;

  const chance = clamp(Number(config.autoSnsChance) || 40, 0, 100);
  if (Math.random() * 100 >= chance) return;

  await generateSnsPostFinal(character, job.roomId, AUTO_SNS_HINT, { manual: false });
}
```

---

# 5. SNS 데이터 모델: `platforms[]`가 본체

## 5.1 원본 최종 post model

최종 `generateSnsPost`는 다음 구조를 만든다.

```ts
const post = {
  id: makeId(),
  characterId: character?.id,
  platforms,
  dms: Array.isArray(parsed?.dms) && !sns.noDM ? parsed.dms.slice(0, 2) : [],
  text: first.text || cleanSnsVisibleText(raw),
  image: first.image || attachedImage,
  imagePrompt: first.finalImagePrompt || first.imagePrompt || '',
  likes: Number(first.stats?.likes) || 0,
  createdAt: Date.now(),
  sourceRoomId: roomId,
  hint: direction,
  auto: options.manual ? false : true,
  llmGenerated: !fallbackReason,
  fallbackReason
};
state.snsPosts.unshift(post);
character.lastSnsMessageCount = messages.length;
```

## 5.2 RN 타입 diff

현재 RN이 대화에서 언급된 것처럼 `SNSPost = { platform, content, comments, image }` 중심이면 원본과 다르다.

```diff
- type SNSPost = {
-   id: string;
-   characterId: string;
-   platform: 'twitter' | 'instagram';
-   content: string;
-   comments: Comment[];
-   image?: string;
- }
+ type SNSPost = {
+   id: string;
+   characterId: string;
+   platforms: SNSPlatformItem[];
+   dms: SnsDmThreadPreview[];
+   text: string;       // first platform cache
+   image?: string;     // first platform cache
+   imagePrompt?: string;
+   likes: number;
+   createdAt: number;
+   sourceRoomId: string;
+   hint: string;
+   auto: boolean;
+   llmGenerated?: boolean;
+   fallbackReason?: string;
+   dailyMicroPost?: boolean;
+ }
```

```ts
type SNSPlatformItem = {
  platform: 'twitter' | 'instagram';
  displayName: string;
  handle: string;
  text: string;
  hashtags: string[];
  time: string;
  stats: {
    views: number;
    likes: number;
    replies: number;
    reposts: number;
    bookmarks: number;
  };
  comments: Array<{
    id?: string;
    name: string;
    handle?: string;
    body: string;
    likes: number;
    isUser?: boolean;
    isCharacter?: boolean;
    createdAt?: number;
  }>;
  image?: string;
  imagePrompt?: string;
  imageCaption?: string;
  finalImagePrompt?: string;
};
```

## 5.3 Migration

기존 RN 저장값이 단일 post라면 앱 시작 시 migration을 넣는다.

```ts
function migrateOldSnsPost(post: any): SNSPost {
  if (Array.isArray(post.platforms)) return normalizeSnsPost(post);

  const platform = post.platform === 'instagram' ? 'instagram' : 'twitter';
  const text = post.content || post.text || '';

  return normalizeSnsPost({
    ...post,
    platforms: [{
      platform,
      displayName: post.displayName || characterName(post.characterId),
      handle: post.handle || characterHandle(post.characterId),
      text,
      hashtags: post.hashtags || [],
      time: post.time || 'now',
      stats: post.stats || { views: 0, likes: post.likes || 0, replies: post.comments?.length || 0, reposts: 0, bookmarks: 0 },
      comments: post.comments || [],
      image: post.image || '',
      imagePrompt: post.imagePrompt || '',
      imageCaption: post.imageCaption || '',
    }],
    text,
    image: post.image || '',
    dms: post.dms || [],
  });
}
```

## 5.4 Rendering diff

```diff
- <SnsCard post={post} /> 가 post.platform 하나만 렌더
+ post.platforms.map((item, index) => <PlatformCard post={post} item={item} index={index} />)

- hybrid 생성 시 post 2개 저장
+ 원본은 post 1개 안에 X item + Instagram item 2개 저장
```

---

# 6. SNS 생성 엔진: core와 final wrapper 분리

## 6.1 원본 최종 core 위치

| 함수 | 위치 | 역할 |
|---|---:|---|
| `mgSnsBuildCoreMessages` | `SNSGod.js L20993-L21046` | SNS 전용 prompt 조립 |
| `mgSnsCallLLMForPost` | `L21051-L21062` | SNS LLM 호출, raw text 반환 |
| `generateSnsPost` final core | `L21073-L21166` | raw -> parsed -> platforms -> image policy -> post push |
| retention wrapper | `L21178-L21190` | 최신 30개 유지 |
| hybrid wrapper | `L22376-L22379` | hybrid 다양화/NSFW split |
| fresh comments/DM wrapper | `L22622-L22630` | 댓글/DM 후처리 |
| daily micro wrapper | `L28684-L28710` | 일상 짧은 글 모드, 이미지 제거 |
| ops log wrapper | `L30579-L30606` | 생성 시작/완료/실패 로그 |

## 6.2 RN final pipeline

JS 원본처럼 함수를 계속 덮어쓰지 말고 아래 순서로 한 함수에서 명시한다.

```ts
async function generateSnsPostFinal(character, roomId, hintText, options) {
  logSnsStart(character, roomId, options);

  const sns = resolveSnsConfig(character, options);
  const dailyMode = detectDailyMicroMode(character, roomId, hintText, options, sns);
  const nextOptions = dailyMode
    ? { ...options, __snsDailyMicroMode: true, sns: { ...(options.sns ?? {}), autoImage: false } }
    : { ...options, __snsDailyMicroMode: false };

  let post = await generateSnsPostCore(character, roomId, hintText, nextOptions);

  pruneSnsPosts(30);

  if (sns.platform === 'hybrid') {
    await diversifyHybridSnsPost(post, character, sns, roomId, hintText, options);
  }

  freshenSnsPostComments(post, character, sns);
  ensurePostThirdPartyDms(post, character, sns);

  if (dailyMode && !options.image) stripDailyMicroImages(post);

  logSnsDone(post);
  return post;
}
```

Core:

```ts
async function generateSnsPostCore(character, roomId, hintText, options) {
  const sns = sanitizeSnsConfig(resolveSnsConfig(character, options), hintText);
  const direction = effectiveSnsDirection(hintText, sns);

  let raw = '';
  let fallbackReason = '';

  try {
    raw = await callSnsLLMForRawText(character, roomId, direction, options, sns);
  } catch (error) {
    fallbackReason = error.message;
    raw = freshFallbackSnsText(character, roomId, direction);
  }

  const parsed = snsParser.payloadFromRaw(raw, sns, character, roomId, direction);
  const platforms = snsNormalizer.ensurePlatforms(parsed, sns, character, roomId, direction);

  await applySnsImagePolicy(platforms, character, sns, options.image, raw, direction);

  const post = buildSnsPost({ character, roomId, direction, raw, parsed, platforms, fallbackReason, manual: options.manual });
  snsStore.unshift(post);
  character.lastSnsMessageCount = messagesByRoom[roomId]?.length ?? 0;
  notifySnsPost(character, post);
  return post;
}
```

---

# 7. SNS prompt builder: 채팅 prompt와 절대 공유하지 말 것

## 7.1 최종 SNS builder 구성

최종 `mgSnsBuildCoreMessages`는 다음 블록을 포함한다.

System:

- SNS posting 기본 prompt
- “Lightboard SNS post result as one valid JSON object”
- schema: `platforms[]`, `dms[]`
- target platform: `twitter`, `instagram`, 또는 `twitter and instagram`
- visible language
- character/account/user profile
- lorePromptBlock
- characterTaggingGuide
- memories
- writing rules
- comment count rule
- textOnly/imagePrompt rule
- noDM rule
- previous posts

User:

- clean recent private DM timeline
- recent phone-call summaries
- user direction
- mood
- attached image 여부
- `Create the SNS JSON now.`

RN diff:

```diff
- SNS prompt에 채팅 timeline 그대로 사용
+ SNS 전용 clean timeline 사용

- phone-call card/PHONE_CALL/통화기록이 prompt에 섞임
+ phone summary만 넣고 UI artifact는 제거

- chat prompt와 동일한 JSON schema 사용
+ SNS 전용 schema: { platforms:[...], dms:[...] }
```

권장 builder skeleton:

```ts
function buildSnsMessages(character, roomId, hintText, options) {
  const sns = resolveSnsConfig(character, options);
  const direction = effectiveSnsDirection(hintText, sns);
  const cleanTranscript = snsTimelineCleaner.recentCleanMessages(roomId, character, contextLimit).join('\n');
  const phoneSummary = phoneMemory.recentSummaryForSns(roomId, character, 2);
  const platform = sns.platform === 'hybrid' ? 'twitter and instagram' : sns.platform;

  const system = [
    prompts.sns_posting.replaceAll('{character.name}', character.name),
    'Create a Lightboard SNS post result as one valid JSON object.',
    'Return JSON only. No markdown, no prose outside JSON, no trailing commas.',
    'Schema: {"platforms":[{"platform":"twitter|instagram",...}],"dms":[...]}',
    `Target platform: ${platform}. If target is twitter and instagram, create one platform item for each.`,
    `Visible language: ${config.language}.`,
    `Character: ${character.name} (@${character.handle || character.id}).`,
    `User: ${userNameFor(character)}. Profile: ${userProfileFor(character) || '(empty)'}`,
    `Character profile: ${character.prompt || '(empty)'}`,
    lorePromptBlock(character, { roomId, userText: direction || phoneSummary, mode: 'sns' }),
    characterTaggingGuide(character),
    `Memories: ${(character.memories || []).join(' / ') || '(none)'}`,
    snsWritingRules(sns),
  ].filter(Boolean).join('\n');

  const user = [
    `Clean recent private DM timeline with ${character.name}:`,
    cleanTranscript || '(no recent chat text; use the character profile and direction)',
    '',
    'Recent phone-call summaries:',
    phoneSummary || '(none)',
    '',
    `User direction for this post: ${direction || '(none)'}`,
    `Mood: ${cleanSnsText(sns.mood || '') || '(none)'}`,
    `Attached image: ${options.image ? 'yes' : 'none'}`,
    '',
    'Create the SNS JSON now.',
  ].join('\n');

  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}
```

---

# 8. Chat prompt builder: 원본 final block에 맞추기

## 8.1 원본 final `buildMessages` 방향

초반 `buildMessages`는 단순하지만, 후반에 다음이 추가된다.

- character별 userName/userProfile
- room별 transcript
- lorePromptBlock
- characterTaggingGuide
- memories
- messageStyleInstruction
- imageGenerationInstruction
- reply timing
- proactive/reroll/reply mode line
- realtimeContextBlock 시간/날씨
- gift instruction
- phone call instruction/marker
- phone summary memory
- random chat grounding
- relationship note

RN에서 지금 `buildChatPrompt`가 단순하다면, 아래처럼 block list 방식으로 확장한다.

```ts
function buildChatMessagesFinal(character, ctx) {
  const roomMessages = last(messagesByRoom[ctx.roomId] ?? [], contextLimit);
  const transcript = chatTimeline(roomMessages, character);
  const userName = userNameFor(character);
  const userProfile = userProfileFor(character);

  const systemBlocks = [
    mainPromptJoined(),
    `This is a private 1:1 DM room between ${userName} and ${character.name}. Do not bring in other characters unless the user mentions them.`,
    `Output language: ${config.language}.`,
    `User: ${userName}. Profile: ${userProfile || '(empty)'}`,
    `Character profile: ${character.prompt}`,
    lorePromptBlock(character, { roomId: ctx.roomId, userText: ctx.userText, mode: ctx.mode }),
    characterTaggingGuide(character),
    `Character sliders: response=${character.responseTime}, thinking=${character.thinkingTime}, reactivity=${character.reactivity}, tone=${character.tone}`,
    messageStyleInstruction(character),
    chatImageInstruction(character),
    `Reply timing: this reply is delivered after about ${Math.round(ctx.replyDelay || 0)} seconds...`,
    `Memories: ${(character.memories || []).join(' / ') || '(none)'}`,
    modeInstruction(character, ctx.mode, ctx.roomId),
    realtimeContextBlockIfAvailable(character),
    giftInstructionIfEnabled(character),
    phoneInstructionIfEnabled(character, ctx),
    phoneSummaryIfAny(ctx.roomId, character),
    randomChatGroundingIfRoom(ctx.roomId),
    relationshipNoteIfAny(ctx.roomId, character),
  ].filter(Boolean);

  const userContent = [
    `Recent private DM timeline with ${character.name}:`,
    transcript || '(empty)',
    '',
    `Latest user message: ${ctx.userText || ''}`,
    '',
    `Reply as ${character.name} in JSON.`,
  ].join('\n');

  return [{ role: 'system', content: systemBlocks.join('\n') }, { role: 'user', content: userContent }];
}
```

RN diff:

```diff
- buildChatPrompt = character.prompt + recentMessages + userText
+ buildChatPrompt = block pipeline
+ 각 block은 테스트 가능하게 함수 분리
+ SNS block과 chat block을 섞지 않도록 PromptKind로 assert
```

---

# 9. Chat parser와 SNS parser 차이

## 9.1 Chat parser

원본 chat parser `parseAssistantPayload`는 다음을 한다.

- JSON object 추출
- `repairJsonish`로 키 quote 보정
- `messages` array가 있으면 사용
- 없으면 `{content/body/text}`를 단일 message로 변환
- 실패 시 `extractVisibleTextsFromBrokenJson`로 content/body/text/imageCaption 추출
- 최종적으로 `{ reactionDelay, messages, newMemory }` 반환

RN ChatParser:

```ts
type ChatPayload = {
  reactionDelay: number;
  messages: ChatReplyItem[];
  newMemory: string;
  rawText: string;
};
```

```diff
- JSON.parse(raw) 실패 시 에러 표시
+ repairJsonish/extractVisibleTexts fallback으로 최소 텍스트 메시지 생성
```

---

## 9.2 SNS parser

SNS parser는 chat parser와 다르다. 원본 `mgSnsPayloadFromRaw`는 다음 순서다.

1. `mgSnsTryJson(raw)`로 raw, code fence 제거, extractJson, repairJsonish를 차례로 JSON.parse 시도
2. parsed에 `platforms`가 있으면 그대로 사용
3. platforms가 없으면 `messages/replies/posts`에서 text를 뽑거나 `text/post/tweet/caption/body`를 단일 platform으로 변환
4. JSON이 완전히 실패하면 raw visible text, loose hashtags, trailing comments, imagePrompt, imageCaption를 뽑아 단일 platform으로 만든다

RN diff:

```diff
- SNS도 ChatParser.parseAssistantPayload 사용
+ SNS 전용 parser 사용

- platforms가 없으면 실패
+ text/post/tweet/caption/body/messages/replies/posts를 단일 platform으로 복구

- comments/hashtags/imagePrompt 누락 시 빈 값 그대로
+ normalizer에서 fallback comments/hashtags/stats/imagePrompt 보정
```

권장 SNS parser:

```ts
function payloadFromRaw(raw: string, sns: SnsConfig, character: Character): SnsPayload {
  const parsed = tryJsonVariants(raw);

  if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.platforms)) {
      return { ...parsed, platforms: parsed.platforms };
    }

    const text = cleanSnsVisibleText(
      parsed.text || parsed.post || parsed.tweet || parsed.caption || parsed.body ||
      textFromMessageArray(parsed.messages || parsed.replies || parsed.posts) || raw
    );

    return {
      platforms: [{
        platform: sns.platform === 'instagram' ? 'instagram' : 'twitter',
        displayName: parsed.displayName || character.name,
        handle: parsed.handle || character.handle || character.id,
        text,
        hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : extractLooseHashtags(raw, text),
        comments: Array.isArray(parsed.comments) ? parsed.comments : Array.isArray(parsed.replies) ? parsed.replies : [],
        stats: parsed.stats || {},
        imagePrompt: parsed.imagePrompt || parsed.image_desc || '',
        imageCaption: parsed.imageCaption || parsed.caption || '',
      }],
      dms: Array.isArray(parsed.dms) ? parsed.dms : [],
    };
  }

  const looseText = cleanSnsVisibleText(raw);
  return {
    platforms: [{
      platform: sns.platform === 'instagram' ? 'instagram' : 'twitter',
      text: looseText,
      hashtags: extractLooseHashtags(raw, looseText),
      comments: extractSnsTrailingComments(raw),
      stats: {},
      imagePrompt: extractSnsLooseField(raw, 'imagePrompt'),
      imageCaption: extractSnsLooseField(raw, 'imageCaption'),
    }],
    dms: [],
  };
}
```

---

# 10. SNS normalizer/sanitizer

## 10.1 원본 보장 사항

최종 `sanitizeSnsPlatform`/`normalizeSnsPlatforms`는 다음을 보장한다.

- target platform 보정
- hybrid면 X/Instagram 둘 다 보장
- displayName/handle 기본값
- text 정제
- phone artifact/call invite seed 제거
- fallback text 생성
- hashtags 보정
- comment count 보정
- stats 랜덤 기본값 생성
- image/imagePrompt/imageCaption 정제

RN diff:

```diff
- LLM이 준 platform item을 그대로 저장
+ sanitizeSnsPlatform 통과 후 저장

- hybrid 응답이 하나만 오면 그대로 하나만 저장
+ expected ['twitter','instagram'] 기준으로 누락 platform을 복제/보정

- comments가 적거나 없으면 그대로 둠
+ commentQty 기준으로 fallback comments 보충
```

권장:

```ts
function normalizeSnsPlatforms(platforms, sns, character, context): SNSPlatformItem[] {
  const expected = sns.platform === 'hybrid'
    ? ['twitter', 'instagram']
    : [sns.platform === 'instagram' ? 'instagram' : 'twitter'];

  const picked = Array.isArray(platforms) && platforms.length
    ? [...platforms]
    : expected.map(platform => ({ platform, text: '' }));

  if (sns.platform === 'hybrid') {
    for (const platform of expected) {
      if (!picked.some(item => item.platform === platform)) {
        picked.push({ platform, text: picked[0]?.text || '' });
      }
    }
  }

  return picked
    .slice(0, expected.length)
    .map((item, index) => sanitizeSnsPlatform({
      ...item,
      platform: isKnownPlatform(item.platform) ? item.platform : expected[index],
    }, sns, character, context))
    .filter(item => item.text || item.image || item.imagePrompt);
}
```

---

# 11. SNS 이미지 정책: provider 구현 말고 순서만 복각

대화에서 언급된 “이미지 API와 SNS textOnly/autoImage/attached image 세부 동작”은 provider API가 아니라 **SNS post item별 처리 순서**가 중요하다.

원본 순서:

```ts
for (const [index, item] of platforms.entries()) {
  item.hashtags = ensureSnsHashtags(...);

  if (attachedImage && index === 0) item.image = attachedImage;

  if (!item.imagePrompt && !sns.textOnly && sns.autoImage !== false) {
    item.imagePrompt = fallbackSnsImagePrompt(character, item.text || raw);
  }

  if (sns.nsfw && item.imagePrompt) {
    item.imagePrompt = ensureNsfwTag(item.imagePrompt, { nsfw: true });
  }

  if (!item.image && !sns.textOnly && sns.autoImage !== false && item.imagePrompt && imageGeneration.enabled) {
    try {
      item.image = await callImageGeneration(character, imageItem);
      item.finalImagePrompt = imageItem.finalImagePrompt || item.imagePrompt;
    } catch (error) {
      log only;
    }
  }
}
```

RN diff:

```diff
- attached image를 모든 platform에 넣음
+ 원본은 index === 0 첫 platform에만 attached image 적용

- textOnly여도 imagePrompt 저장/이미지 호출
+ textOnly면 imagePrompt/imageCaption 생성 및 이미지 호출 차단

- autoImage false여도 fallback imagePrompt 생성
+ autoImage false면 fallback imagePrompt도 만들지 않음

- 이미지 생성 실패 시 SNS 생성 실패
+ 이미지 실패는 log만 남기고 텍스트 post 유지

- nsfw 옵션이 켜져도 imagePrompt 그대로
+ imagePrompt 앞에 nsfw tag 보정
```

권장 함수:

```ts
async function applySnsImagePolicy(platforms, character, sns, attachedImage, raw, direction) {
  for (const [index, item] of platforms.entries()) {
    item.hashtags = ensureSnsHashtags(item.hashtags || [], character, item.text || raw, direction);

    if (attachedImage && index === 0) {
      item.image = attachedImage;
    }

    if (sns.textOnly || sns.autoImage === false) {
      if (!item.image) {
        item.imagePrompt = '';
        item.finalImagePrompt = '';
        item.imageCaption = '';
      }
      continue;
    }

    if (!item.imagePrompt) {
      item.imagePrompt = fallbackSnsImagePrompt(character, item.text || raw);
    }

    if (sns.nsfw && item.imagePrompt) {
      item.imagePrompt = ensureNsfwTag(item.imagePrompt, { nsfw: true });
    }

    if (!item.image && item.imagePrompt && imageGenerationEnabled()) {
      try {
        const imageItem = { imagePrompt: item.imagePrompt, imageCaption: item.imageCaption || item.text || '' };
        item.image = await imageService.generate(character, imageItem);
        item.finalImagePrompt = imageItem.finalImagePrompt || item.imagePrompt;
      } catch (error) {
        logger.warn('sns-image-error', error);
      }
    }
  }
}
```

---

# 12. 실제 수정 우선순위

## 12.1 1차: ChatEngine 분리

대상 파일 예시:

- `screens/ChatScreen.tsx`
- `services/chatEngine.ts`
- `stores/chatJobStore.ts`
- `services/messageDelivery.ts`

패치:

```diff
- ChatScreen에서 buildPrompt/callLLM/append를 직접 수행
+ ChatScreen은 chatEngine.sendUserMessage만 호출
+ chatEngine이 replyJobs/generatingRooms/roomTimers/pendingRoomStatus 관리
+ 모든 응답 append는 messageDelivery를 통해서만 수행
```

완료 조건:

- 유저가 3개 메시지를 연속으로 보내도 마지막 job만 살아남는다.
- 오래된 API 응답이 뒤늦게 와도 append되지 않는다.
- 이미지 생성이 늦게 끝나도 job이 stale이면 append되지 않는다.

---

## 12.2 2차: Automation busy/retry queue

대상 파일 예시:

- `services/automation.ts`
- `services/chatEngine.ts`

패치:

```diff
- automation.ts에서 직접 callLLM
+ automation.ts는 chatEngine.requestProactiveReply 또는 automationQueue.enqueue만 호출

- busy 판정 = generatingRooms only
+ busy 판정 = generatingRooms || replyJobs || pendingRoomStatus || roomTimers

- busy면 return
+ busy면 retryAt 갱신 또는 짧은 재스케줄
```

완료 조건:

- 여러 캐릭터가 동시에 due여도 큐에 모두 들어간다.
- 앞 캐릭터가 busy여도 뒤 캐릭터가 영구 대기하지 않는다.
- 유저 답장 예약 중 proactive가 끼어들어 기존 답장을 지우지 않는다.

---

## 12.3 3차: SNSPost `platforms[]` 모델 확장

대상 파일 예시:

- `types/sns.ts`
- `stores/snsStore.ts`
- `screens/SocialFeedScreen.tsx`
- `components/SnsPostCard.tsx`

패치:

```diff
- post.platform/post.content/post.comments 중심
+ post.platforms[]/post.dms[] 중심
+ post.text/post.image는 첫 platform cache로만 사용
+ hybrid는 post 1개 + platform item 2개
```

완료 조건:

- hybrid 생성 시 X와 Instagram이 같은 post 안에 표시된다.
- 플랫폼별 comments/stats/image가 독립적으로 표시된다.
- 기존 단일 post 데이터가 migration된다.

---

## 12.4 4차: SNS parser/normalizer 강화

대상 파일 예시:

- `services/snsParser.ts`
- `services/snsNormalizer.ts`

패치:

```diff
- JSON.parse(raw)만 시도
+ raw/codeFence/extractJson/repairJsonish 순서로 parse
+ platforms 없으면 text/post/tweet/caption/body/messages/replies/posts에서 복구
+ comments/hashtags/stats/imagePrompt 보정
```

완료 조건:

- LLM이 `{ text: '...' }`만 반환해도 SNS post가 생성된다.
- LLM이 `messages: [{content:'...'}]`로 반환해도 채팅으로 새지 않고 SNS post가 된다.
- hybrid에서 platform 하나만 반환해도 누락 platform이 보정된다.

---

## 12.5 5차: Prompt builder 분리/확장

대상 파일 예시:

- `services/prompt/chatPromptBuilder.ts`
- `services/prompt/snsPromptBuilder.ts`

패치:

```diff
- buildPrompt 하나로 chat/sns 처리
+ buildChatMessagesFinal와 buildSnsMessagesFinal 분리
+ PromptKind assert 추가
+ Chat parser와 SNS parser도 호출 경로 분리
```

완료 조건:

- 채팅 답장이 SNS schema를 따르지 않는다.
- SNS 생성이 채팅 message bubble로 들어가지 않는다.
- 로어북/메모리/전화 summary/관계 메모리가 chat/sns 각각 올바른 형식으로 들어간다.

---

# 13. 회귀 테스트 체크리스트

## ChatEngine

- [ ] 유저가 메시지를 연속 3번 보냈을 때 마지막 메시지에 대한 답장만 출력된다.
- [ ] 첫 번째 API 응답이 가장 늦게 와도 화면에 붙지 않는다.
- [ ] 답장 delay 중 새 메시지를 보내면 이전 `read/thinking` 상태가 사라진다.
- [ ] 이미지/스티커/텍스트가 한 응답에 섞여도 순서대로 출력된다.
- [ ] 이미지 생성 중 새 메시지를 보내면 이전 이미지가 붙지 않는다.

## Automation

- [ ] due 캐릭터가 3명일 때 3명 모두 queue에 들어간다.
- [ ] 한 방이 busy여도 다른 방 자동화는 막히지 않는다.
- [ ] 유저 답장 예약 중 proactive가 기존 답장 timer를 지우지 않는다.
- [ ] 캘린더 선톡은 실제 deliver 성공 후에만 triggered 처리된다.
- [ ] randomFirstMessage는 랜덤채팅 생성 기능과 분리되어 있다.

## SNS

- [ ] 수동 SNS 생성은 `manual: true`로 저장되어 `auto: false`가 된다.
- [ ] 자동 SNS 생성은 캐릭터 답장 성공 후에만 검사된다.
- [ ] `isPosting` 중 들어온 자동 SNS가 유실되지 않고 queue에 남는다.
- [ ] `platform: hybrid`면 post 1개 안에 `platforms.length === 2`가 된다.
- [ ] `textOnly`면 imagePrompt와 이미지 호출이 발생하지 않는다.
- [ ] `autoImage: false`면 fallback imagePrompt도 만들지 않는다.
- [ ] 첨부 이미지는 첫 platform item에만 들어간다.
- [ ] 이미지 생성 실패해도 텍스트 SNS post는 저장된다.
- [ ] `noDM`이면 `post.dms`가 빈 배열이다.
- [ ] LLM이 `{messages:[...]}`로 SNS를 반환해도 채팅으로 출력되지 않는다.

---

# 14. 요약 diff

```diff
+ ChatEngine을 화면에서 분리한다.
+ room별 replyJobs/generatingRooms/roomTimers/pendingRoomStatus를 둔다.
+ 모든 API 응답/말풍선 출력/이미지 출력 전에 stale job check를 한다.
+ Automation은 직접 LLM 호출하지 않고 ChatEngine/AutomationQueue를 통해 실행한다.
+ busy room 판정은 generatingRooms뿐 아니라 replyJobs/pendingRoomStatus/roomTimers까지 본다.
+ AutoSNS는 isPosting boolean return이 아니라 queue로 처리한다.
+ SNSPost 타입을 platforms[]/dms[] 중심으로 확장한다.
+ Chat parser와 SNS parser를 분리한다.
+ SNS parser는 broken JSON과 platforms 누락을 복구한다.
+ buildChatPrompt와 buildSnsPrompt를 완전히 분리한다.
+ SNS image policy는 textOnly/autoImage/attached-first-platform/nsfw/failure-log 순서를 지킨다.
```

이 문서 기준으로 RN을 고치면, 바이브 채팅이 지적한 문제 중 특히 아래 세 가지를 직접적으로 해결할 수 있다.

1. 채팅 응답이 SNS처럼 나오거나 SNS 결과가 채팅으로 새는 문제  
2. 여러 캐릭터/자동화/유저 입력이 겹칠 때 오래된 응답이 붙거나 일부 생성이 유실되는 문제  
3. SNS가 원본 Lightboard 구조가 아니라 단일 text post처럼 저장되어 hybrid/댓글/DM/이미지가 꼬이는 문제
