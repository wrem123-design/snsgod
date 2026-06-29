# SNSGod RN 코드 리뷰 보고서

검토 대상: `mobile-rn/src/**` 중심.  
검토 기준: 원본 `SNSGod.js`의 핵심 기능을 가능한 한 UI까지 복각하되, 사용자가 명시한 변경 사항은 문제 없으면 변경 대상으로 보지 않음.

## 제외/존중한 변경 사항

다음 항목은 의도된 확장으로 보고, 문제 없으면 수정 대상으로 보지 않았다.

- 이미지 생성: Grok API + 폰 서버 사용
- 기본 AI API: Vertex service account JSON 기반 사용
- 테마: 카카오톡 테마/채팅목록 새 테마
- 캐릭터 설정별 이미지 reference 입력 옵션
- 채팅방별 roomPrompt/추가 프롬프트 입력창

---

# 0. 빠른 결론

현재 RN 구현은 **파일 구조와 큰 엔진 분리는 꽤 잘 되어 있고 TypeScript 체크도 통과**한다.

확인 결과:

```bash
npm run check
# tsc --noEmit 통과
```

하지만 원본 핵심 기능 복각 관점에서는 아직 아래 6개가 중요하다.

1. **ChatRoom의 사진/스티커 전송이 AI 답장을 트리거하지 않는다.**
2. **자동화가 수동 채팅/전화/SNS와 state race를 일으킬 수 있다.**
3. **자동 선톡/랜덤 첫 메시지/폰 초대 자동화가 `isRoomBusy`를 충분히 보지 않는다.**
4. **SNS 전역 옵션이 실제 SNS 생성에 거의 반영되지 않는다.**
5. **SNS DM의 기본 전송 UX가 원본과 다르게 `보내기`와 `AI`로 분리되어 있어 사용자가 답장을 못 받는 것처럼 느낄 수 있다.**
6. **CallScreen은 많이 개선됐지만, 캐릭터 이름 중복 렌더링과 통화 종료 반응 누락, 타이핑/reveal 연출 부족이 있다.**

---

# 1. 좋은 점

## 1-1. 구조 분리는 좋아짐

현재 구조는 원본 단일 파일보다 RN에 맞게 나뉘어 있다.

```text
src/logic/api.ts
src/logic/chatJobs.ts
src/logic/prompts.ts
src/logic/sns.ts
src/logic/phone.ts
src/logic/automation.ts
src/storage/persist.ts
src/screens/ChatRoomScreen.tsx
src/screens/CallScreen.tsx
src/screens/SNSScreen.tsx
```

특히 `chatJobs.ts`로 `activeJobs`, `generatingRooms`, `isRoomBusy`를 분리한 것은 원본의 조기 return/겹침 문제를 해결하려는 방향으로 맞다.

## 1-2. 프롬프트 복각은 이전보다 훨씬 가까움

`buildChatPrompt`에 들어간 항목은 원본 최종 buildMessages에 꽤 가까워졌다.

- main prompt placeholders
- proactiveInstruction
- roomPrompt / relationshipNote
- lore
- memories
- sticker list
- real-time context
- phone call marker contract
- SNS와 채팅 분리 지시

좋은 방향이다.

## 1-3. CallScreen은 이미 transcript형으로 개선되어 있음

`CallScreen.tsx`는 이미 다음을 갖고 있다.

- `CallLine[]` transcript
- user/character/system 라인 구분
- 선택지 모드 / 직접 입력 모드
- 하단 끊기 버튼
- 통화 기록 저장

이전 캡처의 문제를 해결하는 방향은 이미 일부 반영되어 있다.

---

# 2. 최우선 수정 항목

## 2-1. 사진/스티커 전송 후 AI 답장이 생성되지 않음

### 위치

- `src/screens/ChatRoomScreen.tsx:196-221`

### 현재 동작

`attachImage()`는 사용자 이미지 메시지를 추가하고 읽음 처리만 한다.

```ts
await commit(next);
void markReadLater(room.id, character);
```

`sendSticker()`도 마찬가지로 사용자 스티커 메시지만 추가하고, AI 답장 생성으로 이어지지 않는다.

### 원본 대비 문제

원본 `sendUserMessage`는 첨부가 있든 텍스트가 있든 메시지를 push한 뒤 `generateCharacterReply(...)`를 호출한다. 즉 사진만 보내도 캐릭터가 반응해야 한다.

현재 RN에서는:

```text
사진 전송
-> 채팅방에 사진 표시
-> 읽음 처리
-> AI 답장 없음
```

이건 사용자가 보기에는 “사진 보냈는데 캐릭터가 씹음”처럼 보인다.

### 수정 방향

`send()` 내부의 답장 생성 흐름을 함수로 분리해야 한다.

```diff
+ async function requestCharacterReply(baseState, latestUserText, source = 'reply')
```

그리고 텍스트/사진/스티커 모두 이 함수를 호출한다.

### pseudo diff

```diff
async function attachImage() {
  ...
  const userMessage = { role:'user', content, mediaData:image, ... };
  let next = appendMessage(...);
  await commit(next);
- void markReadLater(room.id, character);
+ await requestCharacterReply(next, content || '[사진]', 'reply');
}

async function sendSticker(sticker) {
  ...
  let next = appendMessage(...sticker...);
  await commit(next);
- void markReadLater(room.id, character);
+ await requestCharacterReply(next, `[스티커: ${sticker.name}]`, 'reply');
}
```

### 추가 주의

현재 `buildChatPrompt`는 메시지 timeline에서 `message.content`만 사용한다. 스티커/사진은 transcript에 잘 표현되지 않는다. 최소한 다음이 필요하다.

```ts
function timelineText(message) {
  if (message.mediaData) return message.content || '[사진]';
  if (message.sticker) return message.content || `[스티커: ${message.sticker}]`;
  if (message.phoneLog) return '';
  return message.content || '';
}
```

---

## 2-2. 자동화가 최신 state를 덮어쓸 수 있음

### 위치

- `src/App.tsx:151-167`
- `src/logic/automation.ts:350-369`

### 현재 구조

`setInterval`에서 `stateRef.current`를 snapshot으로 잡고 `runAutomationQueueTick(current)`를 실행한다. 자동화 내부에서 LLM 호출이 오래 걸리면 그 사이 사용자가 채팅을 보낼 수 있다.

그런데 자동화가 끝난 뒤 `commit(next)`를 호출하면, 오래된 snapshot을 기반으로 만든 `next`가 최신 사용자 메시지를 덮어쓸 수 있다.

### 발생 가능한 시나리오

```text
1. 12:00 자동화 tick 시작, current = 메시지 10개
2. 12:00:05 사용자가 메시지 전송, state = 메시지 11개
3. 12:00:20 자동화 LLM 응답 완료, next = 메시지 10개 + 자동 메시지 1개
4. commit(next)
5. 사용자가 보낸 메시지가 사라질 수 있음
```

### 수정 방향

자동화 commit은 snapshot replace가 아니라 **현재 state 위에 patch merge**해야 한다.

최소 수정:

```diff
- const next = await runAutomationQueueTick(current);
- if (next !== current) await commit(next);
+ const baseVersion = current.__savedAt || 0;
+ const next = await runAutomationQueueTick(current);
+ const latest = stateRef.current;
+ if (next !== current && latest) {
+   await commit(mergeAutomationResult(latest, current, next));
+ }
```

권장 구조:

```ts
function mergeAutomationResult(latest, base, next) {
  return {
    ...latest,
    messages: mergeAppendedMessages(latest.messages, base.messages, next.messages),
    chatRooms: mergeRoomActivity(latest.chatRooms, next.chatRooms),
    groupRooms: mergeGroupActivity(latest.groupRooms, next.groupRooms),
    characters: mergeCharacterCounters(latest.characters, next.characters),
    notifications: mergeNotifications(latest.notifications, base.notifications, next.notifications),
    snsPosts: mergeNewPosts(latest.snsPosts, base.snsPosts, next.snsPosts),
  };
}
```

---

## 2-3. 자동 선톡/랜덤 첫 메시지가 busy room을 충분히 보지 않음

### 위치

- `src/logic/automation.ts:16-38`
- `src/logic/automation.ts:244-298`

### 현재 문제

`runCalendarEvent`는 `isRoomBusy(room.id)`를 확인한다. 하지만 `eligiblePrivateRooms`와 `runPrivateFirstMessage` 경로는 `isRoomBusy(room.id)`를 확인하지 않는다.

현재:

```ts
function eligiblePrivateRooms(...) {
  ...
  // isRoomBusy(room.id) 없음
  pairs.push({ character, room });
}
```

### 왜 문제인가

유저가 메시지를 보내고 AI 답장 대기 중일 때 자동화가 들어오면, 같은 방에 자동 선톡이 append될 수 있다.

원본에서 이미 문제로 지적했던 “유저 답장 예약과 선톡 충돌”이 RN에서도 일부 남아 있다.

### 수정 방향

```diff
function eligiblePrivateRooms(state, firstMessageOnly) {
  ...
+ if (isRoomBusy(room.id)) continue;
  ...
}
```

그리고 `runPhoneInvite`도 roomId를 정한 뒤 busy를 확인해야 한다.

```diff
const roomId = ...;
+ if (!roomId || isRoomBusy(roomId)) return undefined;
```

### 더 좋은 방향

자동화가 바로 state를 바꾸지 말고 `AutomationJobQueue`에 넣어 직렬 처리해야 한다.

---

## 2-4. ChatRoom이 사용자의 연속 입력을 막음

### 위치

- `src/screens/ChatRoomScreen.tsx:104-193`

### 현재 구조

`sending`이 true면 `send()` 자체가 return한다.

```ts
if (!content || !room || !character || sending) return;
```

원본은 사용자가 새 메시지를 보내면 이전 pending reply를 취소하고 최신 메시지 기준으로 다시 예약한다.

현재 RN은:

```text
사용자 메시지 전송
-> AI 답장 끝날 때까지 입력 전송 불가
```

이건 카카오톡/메신저 느낌과 다르고, 원본의 “연속 입력 후 최신 맥락 답장” 구조와도 다르다.

### 수정 방향

```diff
- if (!content || !room || !character || sending) return;
+ if (!content || !room || !character) return;
+ cancelChatJob(room.id);
```

단, `sending`을 완전히 제거하면 UI 중복 처리 문제가 생기므로 다음처럼 분리해야 한다.

```ts
const [composingLocked, setComposingLocked] = useState(false); // 이미지 선택 등에서만 사용
const [replyPending, setReplyPending] = useState(false);       // 상태바 표시용
```

---

# 3. 전화 통화 쪽 문제

## 3-1. 캐릭터 이름이 두 번 렌더링됨

### 위치

- `src/screens/CallScreen.tsx:237-240`

현재:

```tsx
<Text style={styles.name}>{character.name}</Text>
<Text style={styles.name}>{character.name}</Text>
<Text style={styles.status}>{status}</Text>
```

### 수정

```diff
- <Text style={styles.name}>{character.name}</Text>
  <Text style={styles.name}>{character.name}</Text>
```

혹은 하나만 남긴다.

---

## 3-2. 통화 종료 시 캐릭터 마지막 반응이 없음

### 위치

- `src/screens/CallScreen.tsx:173-226`

현재 `endCall()`은 바로 통화 기록을 저장하고 `onBack()`한다.

원본은 `mgEndPhoneCallWithReaction()`에서 종료 전 캐릭터의 짧은 마지막 한 마디를 LLM으로 생성한다.

### 현재 체감

```text
사용자: 끊기
-> 바로 화면 닫힘
```

원본 느낌:

```text
사용자: 끊기
정선: 알겠어. 이따 다시 연락할게.
-> 0.8~1.2초 후 종료
```

### 수정 방향

```diff
async function endCall(...) {
  setPhase('ending');
+ const goodbye = await requestPhoneGoodbye(linesRef.current);
+ if (goodbye) appendUiLine('character', goodbye);
+ await sleep(900);
  saveLog();
  onBack();
}
```

### 주의
실패하면 fallback 한 줄 사용.

```ts
catch { appendUiLine('character', '알겠어. 나중에 다시 전화할게.'); }
```

---

## 3-3. 타이핑/reveal 애니메이션이 실제로는 거의 없음

### 위치

- `src/screens/CallScreen.tsx:129-158`

현재는 LLM이 반환한 lines를 다음처럼 통째로 append한다.

```ts
for (const text of turn.lines) {
  await sleep(...);
  appendUiLine('character', text);
}
```

이건 문장 단위 딜레이는 있지만, “말하는 중” 애니메이션은 아니다.

### 수정 방향

마지막 character bubble을 빈 상태로 만들고, 글자 단위 또는 문장 단위로 업데이트한다.

```ts
const id = appendUiLine('character', '', { phase: 'typing' });
await revealText(id, text);
markLineDone(id);
```

현재 타입에는 `phase`가 없으니 추가.

```diff
type CallLine = {
  id: string;
  speaker: 'user' | 'character' | 'system';
  text: string;
  createdAt: number;
+ phase?: 'typing' | 'done';
};
```

---

## 3-4. CallScreen의 사용자 이름이 캐릭터별 userName/방 alias를 무시함

### 위치

- `src/screens/CallScreen.tsx:24`

현재:

```ts
const userName = character ? (state.config.userName || '나') : '나';
```

채팅 프롬프트에서는 `userNameFor(state, character, room)`를 쓰는데 전화는 전역 이름만 쓴다.

### 수정 방향

```diff
+ const room = roomId ? findRoom(state, roomId) : undefined;
- const userName = character ? (state.config.userName || '나') : '나';
+ const userName = character ? userNameFor(state, character, room) : '나';
```

---

## 3-5. 전화 프롬프트에 최근 채팅 context가 없음

### 위치

- `src/screens/CallScreen.tsx:104-128`

현재 전화 프롬프트는 character/user profile과 call transcript만 넣는다. 원본 phone prompt는 `Recent chat before the call`을 넣는다.

### 수정 방향

```diff
+ const recentChat = roomId ? phoneRecentChatTranscript(state, roomId, character) : '';
...
+ `Recent chat before the call:\n${recentChat || '(empty)'}`
```

---

# 4. SNS/SNS DM 쪽 문제

## 4-1. 전역 SNS 옵션이 SNS 생성에 반영되지 않음

### 위치

- `src/logic/sns.ts:59-74`
- `src/storage/persist.ts:177-205`

`normalizeSnsOptions()`는 `state.config.sns.platformOptions`를 만들고 SettingsScreen도 전역 SNS 옵션을 저장한다. 그런데 실제 생성에 쓰이는 `snsOptionsFor()`는 character options만 본다.

현재:

```ts
export function snsOptionsFor(state, platform, character) {
  const characterOptions = character?.snsOptions?.[platform] || {};
  return {
    anonymous: false,
    ...characterOptions,
    platform
  };
}
```

### 결과

Settings에서 저장한 전역 SNS 옵션이 자동 SNS/수동 SNS 생성에 거의 반영되지 않는다.

### 수정 방향

```diff
export function snsOptionsFor(state, platform, character) {
+ const globalBase = state.config.sns || {};
+ const globalPlatform = globalBase.platformOptions?.[platform] || {};
  const characterOptions = character?.snsOptions?.[platform] || {};
  return {
-   anonymous: false,
+   anonymous: globalBase.anonymous === true,
+   nsfw: globalBase.nsfw === true,
+   textOnly: globalBase.textOnly === true,
+   noDM: globalBase.noDM === true,
+   thirdPartyDM: globalBase.thirdPartyDM === true,
+   autoComments: globalBase.autoComments !== false,
+   commentQty: globalBase.commentQty || '2-4',
+   subject: globalBase.subject || '',
+   mood: globalBase.mood || '',
+   autoImage: globalBase.autoImage !== false,
+   ...globalPlatform,
    ...characterOptions,
    platform
  };
}
```

---

## 4-2. 원본의 `platforms[]`/hybrid 모델은 아직 빠져 있음

### 위치

- `src/types.ts:231-249`
- `src/logic/sns.ts:156-169`

현재 `SNSPost`는 단일 platform post다.

```ts
export type SNSPost = {
  platform: 'instagram' | 'twitter';
  content: string;
  ...
}
```

그리고 `normalizeGeneratedPlatforms(...).slice(0, 1)`로 한 platform만 남긴다.

원본 최종형은 post 하나 안에 `platforms[]`를 두고 hybrid 시 X/Instagram을 sibling post로 생성한다.

### 판단

앱 UI를 Instagram/X 탭으로 분리한 것은 변경으로 이해할 수 있다. 다만 사용자가 “원본 핵심기능 최대 복각”을 요구했기 때문에 **hybrid 동시 생성/플랫폼별 sibling post**가 필요한 경우에는 이 구조로는 어렵다.

### 선택지

#### 지금 구조 유지
- Instagram/X 탭별 별도 post 생성
- 구현 단순
- 원본 hybrid는 포기

#### 원본 호환 확장
- `SNSPost`에 `platforms?: SNSPlatformItem[]` 추가
- 현재 단일 post는 `platforms[0]` cache로 유지
- 화면에서는 platform 탭별로 `post.platforms` 중 해당 platform item만 렌더

권장:

```ts
type SNSPost = {
  id: string;
  characterId: string;
  platforms?: SNSPlatformItem[];
  platform?: 'instagram' | 'twitter'; // legacy cache
  content?: string;                   // first platform cache
}
```

---

## 4-3. 제3자 DM fallback이 없음

### 위치

- `src/logic/sns.ts:368-369`
- `src/screens/SNSScreen.tsx:226-235`

프롬프트는 `thirdPartyDM`을 지시하지만, LLM이 `dms`를 안 주면 제3자 DM이 생성되지 않는다. 원본 후반 wrapper에는 `mgEnsurePostThirdPartyDms`가 있어서 옵션이 켜졌을 때 fallback DM을 보강한다.

### 수정 방향

```diff
const postDms = sns.noDM ? [] : toPostDms(parsed);
+ const ensuredDms = sns.noDM ? [] : ensureThirdPartyDms(postDms, postsWithImages[0], character, sns);
- if (postDms.length && postsWithImages[0]) postsWithImages[0] = { ...postsWithImages[0], dms: postDms };
+ if (ensuredDms.length && postsWithImages[0]) postsWithImages[0] = { ...postsWithImages[0], dms: ensuredDms };
```

---

## 4-4. SNS DM 기본 전송이 원본과 다름

### 위치

- `src/screens/SNSScreen.tsx:416-448`
- `src/screens/SNSScreen.tsx:160-183`

현재 DM 모달에는 `보내기`와 `AI` 버튼이 따로 있다.

```tsx
<Pressable onPress={onSend}>보내기</Pressable>
<Pressable onPress={onAiSend}>AI</Pressable>
```

원본은 사용자가 DM을 보내면 기본적으로 캐릭터가 바로 답장한다.

현재 사용자는 `보내기`만 누르면 상대 답장이 없어서 “DM 답장이 안 온다”고 느낄 가능성이 크다.

### 수정 방향

```diff
- 보내기: 유저 메시지만 저장
- AI: 유저 메시지 + AI 답장
+ 보내기: 유저 메시지 + AI 답장
+ 보조 버튼: '저장만' 또는 제거
```

권장 UI:

```tsx
<Pressable onPress={() => sendDmReply(true)}>
  <Text>보내기</Text>
</Pressable>
```

저장만 필요하면 long press나 더보기 메뉴로 빼라.

---

# 5. 자동 SNS queue 문제

## 5-1. autoPostingRooms는 room 단위 lock이지만 queue는 아님

### 위치

- `src/logic/sns.ts:48`
- `src/logic/sns.ts:396-419`

현재 자동 SNS가 이미 생성 중이면 같은 room은 return한다.

```ts
if (autoPostingRooms.has(roomId)) return state;
```

원본의 `isPosting return`보다는 낫지만, 여전히 queue는 아니다.

### 문제

```text
A room 자동 SNS 생성 중
A room에서 새 답장 완료
-> maybeCreateAutoSNSPost return
-> 이 후보는 유실
```

### 권장

auto SNS는 queue화하는 것이 좋다.

```ts
const autoSnsQueue = new Map<string, AutoSnsJob>();
```

최소 보완:

```diff
- if (autoPostingRooms.has(roomId)) return state;
+ if (autoPostingRooms.has(roomId)) {
+   markAutoSnsPending(roomId, character.id);
+   return state;
+ }
```

---

# 6. 원본 대비 UI/기능 복각 체크

## 완료 또는 양호

- Chat prompt에 roomPrompt 반영됨
- Lorebook prompt 반영됨
- 전화 marker/callInvite 구조 있음
- 전화 수신 overlay 있음
- 전화 transcript 화면 있음
- SNS DM hub 구조 있음
- 제3자 DM 읽기 modal 있음
- 저장 debounce 있음
- media externalize 있음
- random chat 임시 캐릭터 분리 있음
- TypeScript check 통과

## 미흡 또는 위험

- 사진/스티커 답장 없음
- 자동화 state race
- 자동화 busy check 미흡
- SNS 전역 옵션 무시
- SNS DM 전송 UX가 원본과 다름
- CallScreen 이름 중복
- CallScreen 종료 반응 없음
- CallScreen 최근 채팅 context 없음
- SNS hybrid/platforms[] 미지원
- auto SNS queue 없음

---

# 7. 빌드/배포 패키징 주의

업로드한 zip에 다음이 포함되어 있었다.

- `mobile-rn/node_modules/`
- `mobile-rn/android/.gradle/`
- `mobile-rn/android/app/build/`
- `mobile-rn/android/app/debug.keystore`

리뷰용으로는 괜찮지만, 앞으로 공유할 때는 제외하는 것이 좋다.

특히 `debug.keystore`는 공개 배포 키는 아니지만, 습관적으로 zip에서 제외하는 편이 안전하다.

---

# 8. 수정 우선순위

## P0 - 즉시 수정 권장

1. `CallScreen` 이름 중복 제거
2. 사진/스티커 전송 후 AI 답장 트리거 추가
3. 자동화 busy check 추가
4. 자동화 state merge 처리
5. SNS 전역 옵션 반영
6. SNS DM `보내기`가 기본 AI 답장까지 하도록 변경

## P1 - 원본 감각 복각 강화

7. 통화 종료 전 캐릭터 마지막 대사 생성
8. 전화 프롬프트에 최근 채팅 context 추가
9. CallScreen에 실제 typing/reveal 애니메이션 추가
10. auto SNS queue 도입

## P2 - 원본 고급 기능

11. SNS `platforms[]`/hybrid compatibility 추가
12. 제3자 DM fallback 생성
13. 이미지 첨부를 LLM multimodal 입력으로 연결
14. 사용자 연속 입력 시 기존 job cancel + latest reply 구조로 전환

---

# 9. 바로 적용 가능한 최소 패치 요약

## 9-1. CallScreen 이름 중복

```diff
- <Text style={styles.name}>{character.name}</Text>
  <Text style={styles.name}>{character.name}</Text>
```

## 9-2. SNS 옵션 병합

```diff
export function snsOptionsFor(state, platform, character) {
+ const global = state.config.sns || {};
+ const platformGlobal = global.platformOptions?.[platform] || {};
  const characterOptions = character?.snsOptions?.[platform] || {};
  return {
-   anonymous: false,
+   anonymous: global.anonymous === true,
+   nsfw: global.nsfw === true,
+   textOnly: global.textOnly === true,
+   noDM: global.noDM === true,
+   thirdPartyDM: global.thirdPartyDM === true,
+   autoComments: global.autoComments !== false,
+   commentQty: global.commentQty || '2-4',
+   subject: global.subject || '',
+   mood: global.mood || '',
+   autoImage: global.autoImage !== false,
+   ...platformGlobal,
    ...characterOptions,
    platform
  };
}
```

## 9-3. 자동화 busy check

```diff
for (const room of rooms) {
+ if (isRoomBusy(room.id)) continue;
  ...
}
```

## 9-4. SNS DM 보내기 기본 동작

```diff
- onSend={() => sendDmReply(false)}
- onAiSend={() => sendDmReply(true)}
+ onSend={() => sendDmReply(true)}
```

UI에서 `AI` 버튼은 제거하거나 `저장만`으로 이름을 바꿔라.

## 9-5. 사진/스티커 전송 답장

```diff
await commit(next);
- void markReadLater(room.id, character);
+ await requestCharacterReply(next, content || '[사진]', 'reply');
```

---

# 10. 최종 판단

지금 코드는 “완전히 엉킨 상태”는 아니다. 오히려 구조를 나누고 많은 핵심 요소를 이미 옮겨온 상태다.

다만 현재 문제가 나는 지점은 대부분 **기능이 없어서가 아니라 연결부가 끊겨서** 발생한다.

- 사진/스티커 → ChatEngine 연결 끊김
- 자동화 → busy/merge 연결 약함
- SNS 옵션 저장 → generation 옵션 병합 누락
- SNS DM 전송 → 기본 AI 답장 흐름 분리됨
- 전화 화면 → UI는 좋아졌지만 종료/애니메이션/중복 표시 polish 필요

따라서 다음 작업은 새 기능 추가보다 **연결부 안정화**가 우선이다.
