# SNSGod.js 나머지 기능 분석 및 React Native 복각 가이드

> 대상 파일: `SNSGod.js` 31,520 lines  
> 범위: 이전 정리에서 이미 다룬 **AI 채팅 답장 출력 핵심**, **SNS 생성 핵심**, **자동 SNS**, **일반 먼저 말하기 스케줄러**, **API provider 옵션**, **이미지 생성 provider 구현**은 중복하지 않는다.  
> 포함: 랜덤채팅, 단톡방, 로어북, 일기형 메모리, 캘린더/기념일, 전화 통화 모드, 스티커/기프티콘, 미디어 저장, 알림 센터, Phone 홈/앱 라우팅, SumGod, 백업/복원, 저장 안정화, RN 복각 구조.

---

## 0. 이 파일을 복각할 때의 큰 원칙

`SNSGod.js`는 하나의 긴 파일 안에서 기능을 계속 덧씌우는 방식으로 작성되어 있다. 같은 이름의 함수가 초반에 정의되고, 중반 이후 `const mgBase... = original; original = function(...) { ... }` 형태로 다시 래핑된다. React Native에서는 이 패치 체인을 그대로 옮기면 유지보수가 어렵고, 중복 호출/상태 꼬임이 더 심해진다.

RN에서는 아래처럼 **서비스/스토어 단위로 최종 동작을 재구성**하는 방식이 좋다.

```text
AppStateStore
 ├─ CharacterStore
 ├─ RoomStore
 │   ├─ DirectRoomStore
 │   ├─ GroupRoomStore
 │   └─ RandomChatStore
 ├─ ChatEngine              // 이전 문서에서 다룬 답장 생성 본체
 ├─ LoreEngine
 ├─ DailyDiaryMemoryEngine
 ├─ CalendarScheduler
 ├─ PhoneCallStore
 ├─ SumGodStore
 ├─ NotificationStore
 ├─ MediaStore
 ├─ BackupStore
 └─ NavigationStore
```

핵심 원칙은 다음이다.

```diff
- 웹 플러그인의 함수 재정의 순서를 그대로 복사
+ 최종적으로 관찰되는 상태 모델과 입출력만 모듈별로 재구성

- activeTab, selectedRoomId, mgPhoneApp 같은 전역 문자열에 의존
+ RN Navigation state + domain store state로 분리

- DOM id에서 현재 값을 읽고 저장
+ controlled component form state를 store action으로 commit

- setTimeout/setInterval scattered timers
+ scheduler service에서 job queue, retry, cancellation을 한곳에서 관리
```

---

## 1. 소스 라인 맵

아래 라인 범위가 이번 문서의 주 대상이다.

| 기능군 | 주요 라인 |
|---|---:|
| 초기 state/config/storage/media ref | `SNSGod.js:1~620` |
| 로어북 core | `SNSGod.js:3407~3835` |
| 단톡방 core | `SNSGod.js:5705~5955` |
| 일기형 메모리 / 캘린더 preset | `SNSGod.js:14163~14929` |
| 랜덤채팅 base | `SNSGod.js:15949~16140` |
| 랜덤채팅 final gender/variety/fixes | `SNSGod.js:17649~18003` |
| 전화 통화 visual novel mode | `SNSGod.js:18004~18173`, `19190~20344`, `23029~23078` |
| SumGod | `SNSGod.js:25001~25550` 이후 여러 patch |
| 미디어 ref 정리/cleanup | `SNSGod.js:424~501`, `28139~28285` |
| 알림 센터 | `SNSGod.js:28721~28900` 이후 |
| 백업/복원 | `SNSGod.js:3140~3164`, `31020~31470` 부근 |

---

## 2. 전체 상태 모델

원본은 `state` 하나에 모든 것을 넣는다. RN에서는 DB/AsyncStorage/SQLite에 저장하더라도 아래 구조를 유지하면 복각이 쉽다.

```ts
type AppState = {
  config: AppConfig;
  characters: Character[];
  chatRooms: Record<CharacterId, DirectRoom[]>;
  groupRooms: GroupRoom[];
  randomChats: RandomChatRoom[];
  messages: Record<RoomId, ChatMessage[]>;
  unreadCounts: Record<RoomId, number>;

  userStickers: Sticker[];
  loreEntries: LoreEntry[];
  loreFolders: LoreFolder[];

  snsPosts: SnsPost[];
  snsDmThreads: SnsDmThread[];

  notifications: NotificationItem[];

  selectedRoomId: string;
};
```

`messages`는 일반 DM, 단톡방, 랜덤채팅 방을 모두 같은 map에 저장한다. 차이는 room id와 room metadata에서 구분한다.

```ts
type DirectRoom = {
  id: string;
  characterId: string;
  name: string;
  createdAt: number;
  lastActivity: number;
};

type GroupRoom = {
  id: `group_${string}`;
  type: 'group';
  name: string;
  memberIds: string[];
  createdAt: number;
  lastActivity: number;
};

type RandomChatRoom = {
  id: `random_room_${string}`;
  type: 'random';
  characterId: string;
  character: Character;
  name: string;
  createdAt: number;
  lastActivity: number;
  promoted: boolean;
};
```

원본은 `getRoomById`를 여러 번 래핑해 일반 DM, 단톡방, 랜덤채팅을 모두 찾게 만든다. RN에서는 처음부터 통합 selector를 만들면 된다.

```ts
function getAnyRoom(roomId: string): DirectRoom | GroupRoom | RandomChatRoom | null {
  return getDirectRoom(roomId) ?? getGroupRoom(roomId) ?? getRandomRoom(roomId) ?? null;
}
```

---

# 3. 랜덤채팅

## 3.1 일반 “랜덤 첫 메시지”와 다른 기능

이 문서의 랜덤채팅은 `randomFirstMessageEnabled`로 기존 캐릭터가 가끔 먼저 말하는 기능이 아니다. 원본의 랜덤채팅은 **새로운 임시 캐릭터를 LLM으로 생성하고, 기존 캐릭터 목록과 분리된 임시 방에서 대화하는 기능**이다.

구분은 다음과 같다.

| 항목 | 랜덤 첫 메시지 | 랜덤채팅 |
|---|---|---|
| 대상 | 기존 `state.characters` | 새로 생성한 임시 캐릭터 |
| 저장 위치 | 일반 `chatRooms` | `state.randomChats` |
| 캐릭터 승격 | 없음 | “기존 캐릭터로 옮기기” 가능 |
| 선톡 자동화 | 기존 proactive 엔진 사용 | 기본적으로 proactive 꺼짐 |
| 화면 | 일반 채팅방 | `activeTab === 'randomchat'` / phone app |

---

## 3.2 랜덤채팅 상태 초기화

원본 함수 `mgEnsureRandomChatState`는 다음을 보장한다.

```ts
state.randomChats = Array.isArray(state.randomChats) ? state.randomChats : [];
state.randomChats = state.randomChats
  .filter(room => room && room.id && room.character)
  .map(room => ({
    type: 'random',
    createdAt: Date.now(),
    lastActivity: Date.now(),
    promoted: false,
    ...room,
  }));

for (const room of state.randomChats) {
  if (!Array.isArray(state.messages[room.id])) state.messages[room.id] = [];
}

if (!state.config.prompts.random_character) {
  state.config.prompts.random_character = MG_RANDOM_CHARACTER_PROMPT;
}
```

RN 구현에서는 app boot/load 직후 migration으로 한 번만 정규화해도 된다.

```ts
function normalizeRandomChats(state: AppState) {
  state.randomChats = (state.randomChats ?? [])
    .filter(room => room?.id && room?.character)
    .map(room => ({
      type: 'random',
      promoted: false,
      createdAt: room.createdAt || Date.now(),
      lastActivity: room.lastActivity || room.createdAt || Date.now(),
      ...room,
    }));

  for (const room of state.randomChats) {
    state.messages[room.id] ??= [];
  }
}
```

### 복각 포인트

```diff
- randomChat character를 state.characters에 바로 push
+ state.randomChats[].character에만 보관

- random room을 일반 chatRooms에 저장
+ messages map만 공유하고 room metadata는 randomChats에 둔다

- currentCharacter()가 selectedCharacterId만 본다
+ selectedRoomId가 random room이면 room.character를 반환한다
```

---

## 3.3 랜덤 캐릭터 생성 프롬프트

원본의 랜덤 캐릭터 생성 프롬프트는 고정 JSON schema를 요구한다.

```json
{
  "name": "",
  "handle": "",
  "avatarText": "",
  "color": "#88ccdd",
  "language": "Korean|Japanese|English|Chinese|French|Spanish|German",
  "prompt": "",
  "firstMessage": "",
  "illustrationTags": "",
  "profileAvatarPrompt": "",
  "profileCoverPrompt": "",
  "statusMessage": ""
}
```

요구사항은 대략 다음이다.

- 랜덤채팅에서 우연히 만날 법한 인물
- 정서적으로 플레이 가능한 결점/습관/갈등/훅 포함
- early chat / trust grows 이후의 행동 차이 포함
- firstMessage는 자연스러운 첫 랜덤채팅 메시지
- 시스템/AI 언급 금지

RN에서는 이 prompt를 `config.prompts.random_character`로 노출하되, 기본값을 앱 내부 constant로 유지한다.

```ts
const RANDOM_CHARACTER_SCHEMA_KEYS = [
  'name', 'handle', 'avatarText', 'color', 'language', 'prompt',
  'firstMessage', 'illustrationTags', 'profileAvatarPrompt',
  'profileCoverPrompt', 'statusMessage',
];
```

---

## 3.4 성별 옵션과 다양성 seed

후반 패치에서 랜덤채팅에 `randomChatGender`가 추가된다.

```ts
type RandomChatGender = 'any' | 'male' | 'female';

state.config.randomChatGender = ['any','male','female'].includes(value)
  ? value
  : 'any';
```

UI 라벨은 다음이다.

```ts
'any'    -> '전체'
'male'   -> '남자만'
'female' -> '여자만'
```

생성할 때 성별 옵션만 전달하는 것이 아니라, `mgRandomCharacterTraitBundle(gender)`가 매번 다음 seed를 조합한다.

- archetype seed
- temperament seed
- first-chat hook
- scene/life seed
- naming direction
- 이미 사용한 랜덤채팅 이름 목록
- 기존 랜덤 캐릭터와 직업/말투/감정 문제/시각 태그가 다르게 만들라는 지시

RN에서는 LLM 호출 전에 다음처럼 prompt를 구성하면 된다.

```ts
function buildRandomCharacterPrompt(gender: RandomChatGender, user: UserProfile) {
  return [
    config.prompts.random_character || DEFAULT_RANDOM_CHARACTER_PROMPT,
    '',
    'Randomization seed for this one generation:',
    randomCharacterTraitBundle(gender),
    '',
    'User context:',
    `- User name: ${user.name}`,
    `- User profile: ${user.description || '(empty)'}`,
    `- Current app language: ${config.language}`,
  ].join('\n');
}
```

### 성별 처리 주의

LLM 결과에 `gender`가 없으면 원본은 현재 선호값을 캐릭터에 저장한다.

```ts
character.gender = parsed.gender || parsed.genderPresentation || (gender === 'any' ? '' : gender);
character.genderPreferenceLabel = label(gender);
```

즉 “남자만”으로 생성했는데 결과 JSON에 gender가 빠져도, 앱 metadata에는 male로 저장된다. RN에서도 생성 결과를 후처리로 보정하는 것이 좋다.

---

## 3.5 랜덤 캐릭터 객체 변환

원본은 parsed JSON을 `makeDefaultCharacter` 기반으로 변환한다.

```ts
const id = `random_${makeId()}`;
const character = makeDefaultCharacter(
  id,
  parsed.name || 'Random Stranger',
  parsed.avatarText || name.slice(0, 2),
  parsed.color || '#8bd3dd',
  parsed.prompt || '',
  parsed.firstMessage || '',
  60,
  0
);

character.handle = parsed.handle || generatedHandle;
character.language = parsed.language || config.language;
character.illustrationTags = parsed.illustrationTags || '';
character.profileAvatarPrompt = parsed.profileAvatarPrompt || '';
character.profileCoverPrompt = parsed.profileCoverPrompt || '';
character.statusMessage = parsed.statusMessage || '';

character.dynamicStatusEnabled = true;
character.dynamicAvatarEnabled = false;
character.dynamicCoverEnabled = false;
character.dynamicStatusChance = 40;
character.dynamicAvatarChance = 5;
character.dynamicCoverChance = 5;

character.enabled = true;
character.proactiveEnabled = false;
```

### RN 복각 포인트

```diff
- 랜덤 캐릭터도 일반 proactive 대상에 포함
+ promoted 전까지는 proactiveEnabled=false, initiative=0

- 랜덤 캐릭터 id를 일반 id와 같은 namespace 사용
+ random_${makeId()} prefix를 유지하거나 별도 namespace 사용

- handle 미입력 시 name 그대로 사용
+ lowercase + non-alnum -> '_' 보정
```

---

## 3.6 생성 flow

최종 flow는 다음이다.

```ts
async function createRandomChat() {
  ensureRandomChatState();
  config.randomChatGender = readGenderFromUI();

  const gender = config.randomChatGender;
  const traitBundle = randomCharacterTraitBundle(gender);
  const prompt = buildRandomCharacterPrompt(gender, userProfile);

  const payload = await callLLM([
    { role: 'system', content: prompt },
    { role: 'user', content: 'Create one random-chat character now. Follow the gender target and randomization seed. Return JSON only.' },
  ], { maxTokens: 1600 });

  const raw = payload.rawText || payload.messages.map(m => m.content).join('\n');
  const parsed = tryJsonThenRepair(raw);
  const character = randomCharacterFromParsed(parsed);

  const room: RandomChatRoom = {
    id: `random_room_${makeId()}`,
    type: 'random',
    characterId: character.id,
    character,
    name: `${character.name} 랜덤채팅`,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    promoted: false,
  };

  state.randomChats.unshift(room);
  state.messages[room.id] = character.firstMessage
    ? [{ id: makeId(), role: 'character', characterId: character.id, content: character.firstMessage, createdAt: Date.now(), sourceMode: 'randomchat' }]
    : [];

  selectedRoomId = room.id;
  navigate('RandomChatRoom', { roomId: room.id });
  persist();
}
```

### 동시 생성 방지

소스 중후반에는 생성 중 버튼/상태를 보정하는 patch가 있다. RN에서는 명시적으로 `creatingRandomChat` flag를 둬야 한다.

```ts
if (randomChatStore.creating) return;
randomChatStore.creating = true;
try { ... } finally { randomChatStore.creating = false; }
```

---

## 3.7 랜덤채팅 방 화면

랜덤채팅 방은 일반 채팅방과 같은 message renderer를 쓰지만, header와 상태바가 다르다.

원본 UI 요소:

- header: 캐릭터 아바타, 이름, `랜덤채팅 · 방이름 · @handle`
- 버튼: `프로필`, `기존 캐릭터로 옮기기`
- 메시지 리스트: 일반 `messageHtml`
- composer: 첨부/스티커 패널 + textarea + 전송 버튼
- pending thinking indicator는 표시하지만 일반 `replyStatusHtml`은 숨김

RN에서는 `ChatRoomScreen`을 재사용하고 `room.type === 'random'`일 때 header slot만 바꾸면 된다.

```tsx
<ChatRoomScreen
  roomId={room.id}
  character={room.character}
  mode="random"
  headerRight={<PromoteRandomChatButton roomId={room.id} />}
/>
```

---

## 3.8 랜덤채팅 승격

랜덤채팅의 핵심 기능은 임시 캐릭터를 정식 캐릭터로 옮기는 것이다.

원본 base flow는 다음 구조다.

```ts
const room = mgRandomChatById(selectedRoomId);
const character = clone(room.character);

if (getCharacter(character.id)) character.id = `char_${makeId()}`;
character.enabled = true;
character.proactiveEnabled = false;
state.characters.push(character);

const newRoom = makeRoom(character.id, room.name || '랜덤채팅');
state.chatRooms[character.id] = [newRoom];
state.messages[newRoom.id] = (state.messages[room.id] || []).map(message => ({
  ...message,
  characterId: message.role === 'character' ? character.id : message.characterId,
}));

room.promoted = true;
state.randomChats = state.randomChats.filter(item => item.id !== room.id);
delete state.messages[room.id];
selectedRoomId = newRoom.id;
activeTab = 'chat';
```

### RN 복각 포인트

```diff
- 랜덤 캐릭터를 그대로 characters에 넣고 기존 random room 유지
+ 새 정식 DM room을 만들고 메시지를 복사한 뒤 random room은 제거

- message.characterId를 그대로 둠
+ character message는 새 character.id로 remap

- promoted flag만 true로 두고 계속 보여줌
+ 원본 최종 흐름은 대체로 승격 후 random list에서 제거하는 방향
```

승격은 migration 성격이 강하므로 트랜잭션으로 처리해야 한다.

```ts
await db.transaction(async tx => {
  tx.insertCharacter(character);
  tx.insertDirectRoom(newRoom);
  tx.copyMessages(room.id, newRoom.id, remapCharacterId);
  tx.deleteRandomRoom(room.id);
});
```

---

## 3.9 랜덤채팅 prompt grounding

후반 패치에서 랜덤채팅 캐릭터가 “처음부터 연인처럼 과몰입”하거나 “실제로 같은 공간에 있는 것처럼” 말하는 문제를 줄이기 위해 grounding이 추가된다.

RN 구현 시 prompt에 아래 규칙을 넣는 것이 좋다.

```text
Random chat grounding:
- This is an anonymous/random messenger chat.
- The character has just met the user unless prior room messages establish otherwise.
- Do not assume romance, physical proximity, dating history, living together, or shared memories.
- Build intimacy gradually through text.
- The first message should be casual and plausible for a random chat room.
```

또한 LLM이 만든 `firstMessage`가 너무 강한 고백/연애/동거/기억을 암시하면 fallback 첫 메시지로 바꾸는 정제 layer를 두는 것이 안전하다.

```ts
function sanitizeRandomFirstMessage(text: string, character: Character) {
  if (looksTooIntimateForFirstRandomChat(text)) {
    return `${character.name || '상대'}입니다. 랜덤채팅 연결됐네요. 잠깐 얘기해도 돼요?`;
  }
  return cleanChatOutputText(text);
}
```

---

## 3.10 랜덤채팅 RN 테스트 항목

- 새 랜덤 캐릭터 생성 버튼을 빠르게 여러 번 눌러도 방이 중복 생성되지 않는다.
- `any/male/female` 옵션이 새 생성에만 적용되고 기존 랜덤 캐릭터는 바뀌지 않는다.
- 생성 실패 시 기존 randomChats/messages가 오염되지 않는다.
- 생성 결과 JSON이 조금 깨져도 repair 후 캐릭터를 만들거나 오류를 표시한다.
- 첫 메시지는 `sourceMode: 'randomchat'`로 저장된다.
- 랜덤 방에서 일반 메시지 전송/답장/스티커/전화카드가 기존 ChatEngine과 호환된다.
- 승격 후 메시지가 정식 DM 방으로 복사되고 캐릭터 id가 새 id로 remap된다.
- 승격 후 랜덤 방이 목록에서 사라지거나 promoted 처리된다.
- 알림 클릭 시 랜덤채팅 방으로 이동한다.

---

# 4. 단톡방 / 그룹 채팅

## 4.1 상태와 room 통합

원본은 `state.groupRooms`를 추가하고, `getRoomById`, `ensureRooms`, `prepareStateForSave`, `currentCharacter`를 래핑한다.

```ts
type GroupRoom = {
  id: `group_${string}`;
  type: 'group';
  name: string;
  memberIds: string[];
  createdAt: number;
  lastActivity: number;
};
```

정규화 규칙:

```ts
state.groupRooms = Array.isArray(state.groupRooms) ? state.groupRooms : [];
state.groupRooms = state.groupRooms
  .map(room => ({
    type: 'group',
    memberIds: [],
    createdAt: Date.now(),
    lastActivity: Date.now(),
    ...room,
    memberIds: Array.isArray(room.memberIds) ? room.memberIds.map(String) : [],
  }))
  .filter(room => room.id && room.memberIds.length);

for (const room of state.groupRooms) {
  state.messages[room.id] ??= [];
}
```

RN에서는 `RoomStore`에 type union을 만들고, message list는 동일하게 공유한다.

---

## 4.2 단톡방 생성

원본은 prompt dialog로 캐릭터 번호/ID/handle/name을 쉼표 입력받아 memberIds를 만든다. RN에서는 캐릭터 multi-select UI로 대체하면 된다.

```ts
async function createGroupRoom(memberIds: string[], name?: string) {
  if (memberIds.length < 2) throw new Error('단톡방은 캐릭터가 최소 2명 필요합니다.');

  const uniqueIds = unique(memberIds).filter(id => getCharacter(id));
  const defaultName = uniqueIds.map(id => getCharacter(id)?.name).filter(Boolean).join(', ');

  const room: GroupRoom = {
    id: `group_${makeId()}`,
    type: 'group',
    name: name?.trim() || `${defaultName} 단톡`,
    memberIds: uniqueIds,
    createdAt: Date.now(),
    lastActivity: Date.now(),
  };

  state.groupRooms.unshift(room);
  state.messages[room.id] = [];
  navigate('GroupRoom', { roomId: room.id });
}
```

---

## 4.3 그룹 답장 prompt

그룹 답장은 일반 1:1 답장 prompt와 다르다. LLM은 누가 말하는지까지 JSON으로 골라야 한다.

원본 schema:

```json
{
  "messages": [
    {
      "characterId": "one allowed id",
      "content": "visible chat message"
    }
  ]
}
```

원본 system rules:

- group chat room 작성
- room name 제공
- user profile 제공
- allowed character members 목록 제공
- output language 제공
- 1~4 messages, 보통 1~3개
- 모두가 매번 답하지 않아도 됨
- allowed member 외 캐릭터로 말하면 안 됨
- 모든 메시지에 characterId 필수
- visible content 안에 label/analysis/markdown/JSON 금지

RN 구현:

```ts
async function buildGroupMessages(room: GroupRoom, userText: string, mode: 'reply' | 'reroll', forcedSpeakerId = '') {
  const members = groupMembers(room);
  const memberGuide = members.map(member => [
    `- id: ${member.id}`,
    `  name: ${member.name}`,
    `  handle: @${member.handle || member.id}`,
    `  profile: ${member.prompt || '(empty)'}`,
    `  memories: ${(member.memories || []).join(' / ') || '(none)'}`,
  ].join('\n')).join('\n');

  return [
    { role: 'system', content: buildGroupSystemPrompt(room, memberGuide, forcedSpeakerId) },
    { role: 'user', content: `Recent group chat timeline:\n${groupTranscript(room)}\n\nLatest user message: ${userText || '(none)'}\nMode: ${mode}\n\nWrite the next group chat messages.` },
  ];
}
```

---

## 4.4 speaker alias resolution

LLM이 `characterId`를 정확히 쓰지 않을 수 있기 때문에 원본은 speaker alias를 normalize한다.

처리:

```ts
normalizeGroupSpeakerToken(value)
  -> 앞의 @/# 제거
  -> 따옴표/괄호 제거
  -> 님/씨 제거
  -> whitespace 제거
  -> 숫자/영문/한글 외 제거
  -> lowercase
```

alias 후보:

```ts
[member.id, member.name, member.handle, handleWithoutAt, nameWithoutStars]
```

RN에서도 LLM output 검증 시 이 alias resolver가 필요하다.

```ts
function resolveGroupSpeaker(value: string, room: GroupRoom) {
  const token = normalizeGroupSpeakerToken(value);
  return groupMembers(room).find(member => aliases(member).includes(token))?.id ?? '';
}
```

---

## 4.5 그룹 응답 파싱

원본 parser는 다음 순서로 source를 만든다.

1. `payload.rawText`에서 JSON parse 시도
2. `messages` 또는 `replies` 배열 사용
3. 실패하면 `payload.messages` 사용
4. 그래도 실패하면 broken JSON에서 visible text 추출
5. 마지막 fallback은 raw text 하나

그리고 각 item을 다음으로 정규화한다.

```ts
{
  characterId,
  content,
  sticker,
  imagePrompt,
  imageCaption
}
```

최대 4개만 허용한다.

RN에서는 그룹 parser를 일반 1:1 parser와 분리한다.

```diff
- 일반 normalizeReplyMessages로 group 응답도 처리
+ parseGroupReplyMessages(room, payload, forcedSpeakerId)를 별도 구현
```

---

## 4.6 그룹 메시지 출력

그룹 delivery는 각 item의 `characterId`를 speaker로 사용한다.

출력 순서:

```text
for each item:
  stale job check
  if index > 0: 0.6~2.4초 사이 gap
  sticker push
  image push, 실패해도 계속
  text push
  room.lastActivity update
  noteIncomingMessage
  saveState
  renderIncomingChange
```

RN에서는 기존 `deliverCharacterMessages`를 재사용하되 speaker를 item별로 다르게 받도록 설계하면 된다.

```ts
async function deliverGroupMessages(room, items, jobId) {
  for (const item of items) {
    const speaker = getCharacter(item.characterId);
    if (!speaker) continue;
    await deliverOneMessage({ roomId: room.id, character: speaker, item, sourceMode: 'group' });
  }
}
```

---

## 4.7 단톡방 RN 테스트 항목

- 멤버 2명 미만이면 생성 불가.
- 삭제된 캐릭터 id가 groupRooms에 남아 있어도 groupMembers가 null을 걸러낸다.
- LLM이 `name`, `speaker`, `displayName` 등으로 응답해도 올바른 characterId로 매핑된다.
- allowed member가 아닌 characterId는 버려진다.
- group reply는 한 번에 최대 4개만 출력된다.
- 사용자가 새 메시지를 보내면 해당 group room의 기존 job/timer가 취소된다.
- group room도 unread/notification/일기형 메모리에 포함된다.

---

# 5. 로어북

## 5.1 LoreEntry 모델

원본 로어북 entry는 Risu lore format과 호환되도록 많은 필드를 유지한다.

```ts
type LoreEntry = {
  id: string;
  title: string;
  key: string;
  keys: string[];
  secondkey: string;
  content: string;
  comment: string;
  mode: string;
  insertorder: number;
  alwaysActive: boolean;
  selective: boolean;
  useRegex: boolean;
  caseSensitive: boolean;
  enabled: boolean;
  scope: 'global' | 'character' | 'room' | string;
  characterId: string;
  roomId: string;
  source: 'manual' | 'memory' | string;
  createdAt: number;
  memoryDate?: string;
};
```

정규화 규칙:

- `keys`가 없으면 `key`를 `, ; newline`으로 split
- `insertorder` 기본값 100
- `caseSensitive`는 `entry.caseSensitive` 또는 Risu 확장 필드에서 읽음
- `scope` 기본값 `global`
- `source` 기본값 `manual`
- `enabled`는 false만 비활성

---

## 5.2 키 매칭 방식

로어북 활성화 텍스트 pool은 다음을 합친다.

```text
character.name
character.handle
character.prompt
config.userName
config.userDescription
options.userText
options.mode
최근 room messages 최대 MAX_ROOM_MESSAGES + mediaPrompt
```

매칭 방식:

```ts
if (entry.alwaysActive) return true;

primary = any key matches text
  - useRegex true면 RegExp(key, caseSensitive ? '' : 'i')
  - 아니면 includes

if (!primary) return false;
if (!entry.selective) return true;

secondaryKeys = split(secondkey)
if no secondary keys -> return true;
return any secondary key matches text;
```

scope filter:

```ts
if (entry.scope === 'room') return entry.roomId === roomId;
if (entry.scope === 'character') return !entry.characterId || entry.characterId === character.id;
return true; // global
```

정렬은 `insertorder` 내림차순이다.

---

## 5.3 prompt 삽입 형태

활성 entry가 없으면:

```text
Relevant MessengerGod Lorebook: (none)
```

있으면:

```text
Relevant MessengerGod Lorebook:
[1] title
content

[2] title
content
```

이 block은 일반 채팅뿐 아니라 SNS, SNS comment/DM, SumGod context 등 여러 prompt에서 재사용된다. RN에서는 `LoreEngine.resolveBlock(character, { roomId, userText, mode })` 형태로 통일한다.

```ts
class LoreEngine {
  activeEntries(character, options): LoreEntry[] { ... }
  promptBlock(character, options): string { ... }
}
```

---

## 5.4 로어북 UI/저장 기능

원본 기능:

- 전체 로어북 목록
- global/character/room scope 추가
- 선택 삭제
- 접기/펼치기
- Risu lorebook JSON import/export
- 현재 방 내용을 Risu localLore로 push
- 최신순 정렬 UI
- room/character별 entry filter

RN에서는 아래 화면으로 나누면 좋다.

```text
LorebookScreen
 ├─ GlobalLoreTab
 ├─ CharacterLoreTab(characterId)
 ├─ RoomLoreTab(roomId)
 └─ ImportExportPanel
```

저장 시에는 아래를 강제한다.

```ts
entry.keys = splitLoreKeys(entry.key);
entry.enabled = entry.enabled !== false;
entry.insertorder = Number(entry.insertorder) || 100;
```

---

## 5.5 RN 테스트 항목

- alwaysActive entry는 key가 없어도 항상 들어간다.
- regex가 잘못된 경우 앱이 죽지 않고 false 처리된다.
- selective=true이고 secondkey가 있으면 primary+secondary 둘 다 필요하다.
- room scope는 해당 roomId에서만 들어간다.
- character scope는 characterId가 비어 있으면 모든 캐릭터에 들어간다.
- insertorder가 높은 entry가 먼저 들어간다.
- import한 Risu lore entry가 normalize되어 앱 prompt에 들어간다.
- 삭제된 room/character id가 남아 있어도 렌더링 crash가 없어야 한다.

---

# 6. 일기형 메모리

## 6.1 normal newMemory와 다르게 동작

기본 프롬프트 자체가 “normal replies에서는 newMemory를 만들지 말고, 하루 끝 23:59에 일기형 메모리를 만든다”고 되어 있다. 즉 메모리는 답장마다 쌓는 방식이 아니라 **날짜별 diary lore entry**로 저장된다.

원본은 `mgDailyDiaryMemoryTimer`, `mgDailyDiaryMemoryInFlight`를 두고 캐릭터별/날짜별 중복 생성을 막는다.

```ts
const key = `${character.id}:${dateKey}`;
if (inFlight.has(key)) return false;
```

---

## 6.2 일기용 transcript 수집

`mgCollectDailyDiaryMessages(character, dateKey)`는 해당 날짜 00:00~24:00 사이 메시지를 수집한다.

포함 범위:

1. 해당 캐릭터의 모든 1:1 DM room
2. 해당 캐릭터가 member로 들어간 groupRooms

제외:

- system message
- createdAt이 없는 message
- content/mediaLabel이 비어 있는 message

라인 포맷:

```text
[HH:mm · roomLabel] speaker: content
```

정렬:

```ts
entries.sort((a, b) => a.createdAt - b.createdAt);
```

길이 제한:

```ts
if (transcript.length > 24000) {
  transcript = `[Earlier lines omitted for stability; this is the latter part of ${dateKey}.]\n` + transcript.slice(-24000);
}
```

---

## 6.3 일기 메모리 생성 prompt

prompt 핵심:

```text
It is 23:59 on YYYY-MM-DD.
Write ONE daily memory entry for character.name, like a private diary written at the end of the day.
Use the full chat timeline from today as the source.
Style: intimate diary / reflective recap.
Include what happened, emotional shifts, promises, unresolved tension, important user preferences, relationship changes.
Do not invent events.
Return JSON only: {"memory":"..."}
```

파싱은 `memory`, `diary`, `newMemory`, `content`, `text` 후보를 순서대로 확인하고, 10자 이상이면 최대 2400자까지 저장한다.

---

## 6.4 LoreEntry로 저장

성공 시 기존 같은 날짜 memory entry를 제거하고 새 entry를 넣는다.

```ts
const diaryTitle = `${character.name} diary ${dateKey}`;
const diaryHeader = `[${dateKey} 23:59 daily diary]`;

entry = normalizeLoreEntry({
  title: diaryTitle,
  key: `${character.name}, ${character.handle || character.id}, ${dateKey}, daily diary`,
  content: `${diaryHeader}\n${memory}`,
  comment: 'mgod_memory',
  scope: 'character',
  characterId: character.id,
  source: 'memory',
  insertorder: 120,
  createdAt: now,
});
entry.memoryDate = dateKey;
```

그리고:

```ts
character.lastDailyDiaryMemoryDay = dateKey;
character.lastMemorySavedDay = dateKey;
state.loreEntries = state.loreEntries.slice(-300);
```

---

## 6.5 스케줄링

due 조건:

```ts
now.getHours() === 23 && now.getMinutes() >= 59
```

startup에서:

```text
mgApplyDailyDiaryMemoryPrompt()
mgRunDailyDiaryMemoryIfDue()
mgScheduleDailyDiaryMemory()
```

RN에서는 실제 23:59 timer만 믿지 말고 app resume 시에도 검사해야 한다.

```ts
async function runDailyDiaryIfDue(now = new Date()) {
  if (!isDailyDiaryDue(now)) return;
  const dateKey = formatDateKey(now);
  await runDailyDiaryForDate(dateKey);
}
```

### RN 권장 보정

모바일에서는 앱이 background에 있으면 timer가 정확히 돌지 않는다. 아래 정책이 안전하다.

```text
- 앱 foreground 진입 시 현재 시간이 23:59 이후이면 오늘 diary 검사
- 다음 날 첫 실행 시 전날 diary가 없으면 전날 23:59 기준으로 생성 시도
- character별 inFlight와 lastDailyDiaryMemoryDay로 중복 방지
```

---

# 7. 캘린더 / 기념일 선톡

이 기능의 concurrency 이슈는 이전 답변에서 일부 언급했으므로, 여기서는 데이터 모델과 복각 흐름 위주로 정리한다.

## 7.1 Event 모델

캐릭터별 이벤트는 `character.calendarEvents`, 사용자 공통 이벤트는 `state.config.userCalendarEvents`에 들어간다.

```ts
type CalendarEvent = {
  id: string;
  title: string;
  date: string; // MM-DD yearly or YYYY-MM-DD one-time
  note: string;
  enabled: boolean;
  lastTriggeredDate?: string;
  lastTriggeredByCharacter?: Record<CharacterId, string>;
};
```

`date`는 다음을 허용한다.

```text
MM-DD       -> 매년 반복
YYYY-MM-DD  -> 특정 날짜 1회성처럼 사용
```

---

## 7.2 preset 종류

캐릭터별 preset:

- Birthday of [name]
- First day as lovers
- Wedding anniversary
- Anniversary of [what happened]
- Promise / appointment

사용자 공통 preset:

- User birthday
- First day as lovers
- Wedding anniversary
- Shared anniversary
- Shared promise / appointment

공통 이벤트는 모든 캐릭터가 개별적으로 반응할 수 있으므로 `lastTriggeredByCharacter[character.id] = today`로 캐릭터별 trigger 여부를 저장한다.

---

## 7.3 자동 검사 flow

```ts
async function checkCalendarEvents(now = new Date()) {
  const today = calendarTodayKey(now);
  const userEvents = normalizeConfigCalendarEvents();

  for (const character of state.characters) {
    character.calendarEvents = character.calendarEvents.map(normalizeCalendarEvent);

    const events = [
      ...character.calendarEvents.map(event => ({ ...event, scope: 'character' })),
      ...userEvents.map(event => ({ ...event, scope: 'user' })),
    ];

    for (const event of events) {
      const key = `${scope}:${character.id}:${event.id}:${today}`;
      if (!event.enabled) continue;
      if (alreadyTriggered(event, character, today)) continue;
      if (calendarInFlight.has(key)) continue;
      if (!calendarEventMatchesDate(event, now)) continue;

      calendarInFlight.add(key);
      markTriggered(event, character, today);
      await saveState();
      try { await sendCalendarEventMessage(character, event, today); }
      finally { calendarInFlight.delete(key); }
    }
  }
}
```

원본은 trigger 표시를 먼저 저장하고 메시지를 보낸다. RN에서는 이전 답변에서 말한 것처럼 **발송 성공 후 triggered 표시**가 더 안전하다.

```diff
- markTriggered -> save -> send
+ enqueue calendar job -> send success -> markTriggered -> save
```

---

## 7.4 기념일 메시지 생성

캘린더 메시지는 먼저 말하기가 꺼져도 허용된다.

Prompt 핵심:

```text
Act as character.name in a private DM with userName.
This is a calendar/anniversary message the character is allowed to send first, even if proactive first messages are disabled.
Today is: YYYY-MM-DD.
Event title: ...
Event scope: user-wide or this character only.
User editable event prompt: event.note.
Write a polished, in-character private message.
Return only JSON: {"reactionDelay":0,"messages":[{"content":"..."}],"newMemory":""}
```

출력은 기존 `deliverCharacterMessages(..., sourceMode='calendar')`로 처리된다.

---

## 7.5 RN 테스트 항목

- 캐릭터별 이벤트는 해당 캐릭터만 반응한다.
- 공통 이벤트는 모든 캐릭터가 하루 한 번씩 반응할 수 있다.
- proactiveChatEnabled가 false여도 캘린더 메시지는 발송된다.
- 같은 이벤트가 같은 날짜에 두 번 발송되지 않는다.
- 방이 busy이면 job queue에 남고 성공 후에만 triggered가 저장된다.
- YYYY-MM-DD event와 MM-DD yearly event가 모두 매칭된다.

---

# 8. 전화 통화 모드

## 8.1 전화 카드 message 모델

전화 초대는 일반 text가 아니라 message item으로 저장된다.

```ts
type PhoneCallMessage = {
  id: string;
  role: 'character';
  characterId: string;
  content: '';
  createdAt: number;
  mediaType: 'phone-call';
  mediaName: string;
  callTitle: string;
  callLine: string;
  sourceMode: 'reply' | 'calendar' | 'randomchat' | 'group' | string;
  callStatus?: 'missed' | 'rejected' | 'ended';
};
```

`mediaLabel`은 phone-call을 `[전화: title]`로 보여준다. message renderer는 `mediaType === 'phone-call'`이면 call card를 렌더한다.

---

## 8.2 LLM 응답에서 전화 초대 감지

원본은 여러 방식으로 전화 초대를 감지한다.

허용 입력:

```json
{ "callInvite": true, "callTitle": "밤 전화", "callLine": "문자로는 좀 애매해서. 잠깐 받을래?" }
```

또는:

```json
{ "phoneCall": true }
{ "call": { "title": "...", "line": "..." } }
```

후반 패치에서는 canonical marker도 사용한다.

```text
[[PHONE_CALL]]
```

정규화 결과:

```ts
{
  callInvite: true,
  callTitle: visibleTitle,
  callLine: visibleLine,
}
```

RN에서는 normalize 단계에서 `callInvite`를 만든 뒤, delivery 단계에서 phone-call message로 분리한다.

```ts
function normalizePhoneItem(item): PhoneCallPayload | null {
  const call = typeof item.call === 'object' ? item.call : {};
  const rawText = item.content || item.text || item.body || '';
  const explicit = item.callInvite === true || item.phoneCall === true || call.callInvite === true || hasPhoneMarker(rawText);
  if (!explicit && !item.callTitle && !item.callLine) return null;

  return {
    callInvite: true,
    callTitle: clean(item.callTitle || call.title || item.phoneTitle || '전화'),
    callLine: clean(stripPhoneMarker(item.callLine || call.line || item.phoneLine || rawText || '지금 통화할 수 있어?')),
  };
}
```

---

## 8.3 전화 초대 출력 순서

전화 초대가 들어오면 원본은 먼저 phone-call card를 push하고, content/sticker/image/gift가 있는 item은 normal delivery로 넘긴다.

```ts
for (const item of messages) {
  if (item.callInvite) pushPhoneCallCard(roomId, character, item);
  if (item.content || item.sticker || item.imagePrompt || item.giftType) normal.push(item);
}
return baseDeliver(normal);
```

후반 hard-bypass delivery에서는 content와 call card의 순서를 더 정교하게 처리한다. RN에서는 `expandPhoneMarkersToCallInvites` 후 순차 delivery에서 같은 순서를 지키면 된다.

---

## 8.4 전화 overlay 상태

원본 `mgPhoneCall`은 full-screen visual novel overlay용 상태다.

```ts
type PhoneCallState = {
  open: boolean;
  roomId: string;
  initiator: 'user' | 'character';
  loading: boolean;
  typing: boolean;
  line: string;
  displayLine: string;
  options: string[];
  transcript: PhoneCallTurn[];
  createdAt: number;
  connectedAt?: number;
  acceptedAt?: number;
  awaitingNextLine?: boolean;
  manualLineIndex?: number;
};
```

Overlay UI:

- 배경: 캐릭터 avatar/profile image blur
- 이름
- 연결 상태
- 현재 대사 line
- 선택지 최대 3개
- 듣는 중/타이핑 상태
- 닫기/통화 종료 버튼

RN에서는 `PhoneCallModal`을 app root에 띄우고, room screen과 독립적으로 유지한다.

```tsx
<Root>
  <Navigation />
  <PhoneCallModal visible={phoneCall.open} />
</Root>
```

---

## 8.5 typewriter 출력

원본은 line을 한 글자씩 `displayLine`에 채우는 typewriter를 사용한다.

RN에서는 interval 대신 animation frame 또는 timer를 사용할 수 있다.

```ts
async function typePhoneLine(line: string) {
  phone.typing = true;
  phone.line = line;
  phone.displayLine = '';

  for (let i = 1; i <= line.length; i++) {
    if (!phone.open) return;
    phone.displayLine = line.slice(0, i);
    await delay(24);
  }

  phone.typing = false;
}
```

---

## 8.6 통화 context

전화 모드는 별도 prompt를 사용하지만 최근 채팅 context를 읽는다.

`mgPhoneTranscript(roomId)`:

```text
최근 N개 메시지:
User/Character: content or mediaLabel
빈 줄 제외
```

후반 패치에서는 통화 transcript가 일반 채팅/SNS prompt에 그대로 새지 않도록 “summary만 context로 사용”하는 정리 로직이 추가된다.

RN에서는 통화 종료 후 다음 둘을 분리해 저장하는 것이 좋다.

```ts
type PhoneCallLog = {
  roomId: string;
  characterId: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  summary: string;      // prompt context용
  rawTranscript?: PhoneCallTurn[]; // 내부 보기용, SNS prompt에는 넣지 않음
};
```

---

## 8.7 캐릭터가 전화 걸 수 있는 조건

`characterPhoneCallEnabled`가 true이면 AI가 답장 중 전화 초대 marker/callInvite를 만들 수 있다. 꺼져 있으면 prompt에서 marker 사용을 금지하고, 혹시 응답에 marker가 섞여도 delivery에서 제거해야 한다.

수동으로 사용자가 전화를 거는 기능은 별도 action이므로, 이 설정과 분리하는 것이 원본 UX에 가깝다.

```diff
- characterPhoneCallEnabled false면 모든 전화 기능 비활성
+ 캐릭터 주도 callInvite만 비활성. 사용자가 직접 전화 버튼을 누르는 것은 허용 가능
```

---

## 8.8 RN 테스트 항목

- `callInvite:true` 응답이 phone-call card로 렌더된다.
- `[[PHONE_CALL]]` 마커는 visible text에서 제거되고 phone-call card가 생성된다.
- 전화 기능이 꺼져 있을 때 AI marker는 제거된다.
- phone-call card를 누르면 overlay가 열린다.
- 통화 중 선택지 버튼을 누르면 다음 line이 생성된다.
- 통화 종료 후 call log/summary가 저장된다.
- 통화 UI label, duration, marker가 SNS prompt나 일반 말풍선에 새지 않는다.
- random chat room에서도 전화가 해당 random character 기준으로 연결된다.

---

# 9. 스티커 / 기프티콘 / 첨부 미디어

## 9.1 스티커 모델

스티커는 캐릭터별 스티커와 전역 유저 스티커가 합쳐진다.

```ts
type Sticker = {
  id: string;
  name: string;
  description?: string;
  data?: string;      // data URL or mgmedia ref
  mediaData?: string;
  mediaType?: 'image' | 'video' | 'audio';
};
```

Prompt에는 사용 가능한 스티커 목록이 다음 형태로 들어간다.

```text
id: name — description, id2: name2 — description2
```

LLM 응답 item의 `sticker`가 id로 들어오면 delivery에서 sticker bubble을 추가한다.

RN 복각:

```ts
function availableStickerText(character: Character) {
  return [...character.stickers, ...state.userStickers]
    .map(sticker => `${sticker.id}: ${sticker.name}${sticker.description ? ` — ${sticker.description}` : ''}`)
    .join(', ') || 'none';
}
```

---

## 9.2 기프티콘 / gift message

중후반 patch에서 gift item이 추가된다. LLM은 message item에 아래 필드를 넣을 수 있다.

```json
{
  "content": "이거 너 생각나서.",
  "giftType": "coffee",
  "giftMessage": "따뜻한 거 마셔"
}
```

delivery는 이를 `mediaType:'gift'` message로 바꾼다.

```ts
type GiftMessage = {
  id: string;
  role: 'character';
  characterId: string;
  content: '';
  createdAt: number;
  mediaType: 'gift';
  mediaData: string;       // default gift image/card
  mediaName: string;
  giftType: string;
  giftMessage: string;
  sourceMode: string;
};
```

RN에서는 gift를 image와 구분해 전용 카드로 렌더하는 것이 좋다.

```tsx
if (message.mediaType === 'gift') return <GifticonCard message={message} />;
```

---

## 9.3 사용자 첨부 미디어

일반 채팅 첨부는 `inputAttachment`에 보관됐다가 유저 메시지 전송 시 먼저 push된다.

```ts
if (attachment) {
  state.messages[room.id].push({
    id: makeId(),
    role: 'user',
    characterId: character.id,
    content: '',
    createdAt: Date.now(),
    ...attachment,
  });
}
```

RN에서는 composer state에 attachment를 두고, send 시 message로 변환한다.

```ts
type ComposerAttachment = {
  mediaType: 'image' | 'video' | 'audio' | 'sticker';
  mediaData: string | MediaRef;
  mediaName?: string;
  stickerName?: string;
};
```

---

# 10. 미디어 저장 / mgmedia ref

## 10.1 외부화 기준

원본은 긴 data URL을 그대로 state JSON에 넣지 않고 pluginStorage에 따로 저장한다.

```ts
function shouldExternalizeMedia(value) {
  const text = String(value || '');
  return text.startsWith('data:') && text.length > 8192;
}
```

저장 시:

```ts
const id = `${hint}_${makeId()}`;
pluginStorage.setItem(STORAGE_MEDIA_PREFIX + id, dataUrl);
return `mgmedia:${id}`;
```

---

## 10.2 외부화 대상 필드

`externalizeStateMediaNow`가 순회하는 대상:

- 모든 `state.messages[roomId][].mediaData`
- `state.userStickers[].data`, `mediaData`
- `character.avatar`, `icon`, `profileImage`, `image`, `picture`, `thumbnail`
- `character.profile.image`
- `character.stickers[].data`, `mediaData`
- `state.snsPosts[].image`
- `state.snsPosts[].platforms[].image`
- `state.snsDmThreads[].messages[].mediaData`, `image`
- `state.config.userAvatar`, `phoneWallpaper`
- `inputAttachment`, `postAttachment`

RN에서는 이 정책을 그대로 가져가되 `pluginStorage` 대신 file system + DB ref를 쓰는 것이 낫다.

```ts
type MediaRef = `mgmedia:${string}`;
```

---

## 10.3 lazy resolve

원본 resolve flow:

```ts
if (!isMediaRef(value)) return value;
const id = mediaRefId(value);
if (mediaDataCache.has(id)) return mediaDataCache.get(id);
loadMediaRef(id);
return MEDIA_PLACEHOLDER;
```

RN에서는 placeholder를 즉시 렌더하고, 비동기 load 후 state/cache update를 하게 만들면 된다.

```ts
function useMediaUri(refOrData: string) {
  const [uri, setUri] = useState(isMediaRef(refOrData) ? PLACEHOLDER : refOrData);
  useEffect(() => {
    if (isMediaRef(refOrData)) mediaStore.resolve(refOrData).then(setUri);
  }, [refOrData]);
  return uri;
}
```

---

## 10.4 cleanup

후반 patch에는 사용 중인 media ref index를 재계산해 쓰지 않는 `mgmedia:` 항목을 지우는 cleanup이 들어간다. RN에서도 필요하다.

```ts
function collectUsedMediaRefs(state: AppState): Set<string> {
  // messages, stickers, characters, sns posts, sns dm, config, attachments 순회
}

async function cleanupUnusedMedia() {
  const used = collectUsedMediaRefs(state);
  const all = await mediaStore.listRefs();
  for (const ref of all) if (!used.has(ref)) await mediaStore.delete(ref);
}
```

### RN 테스트 항목

- 8192자보다 큰 data URL은 media ref로 바뀐다.
- media ref가 없는 경우 placeholder가 뜨고 앱이 crash 나지 않는다.
- 백업/복원 후 media ref가 정상 resolve된다.
- SNS post image와 SNS DM image도 externalize된다.
- 캐릭터 삭제/게시물 삭제 후 cleanup으로 orphan media가 줄어든다.

---

# 11. 알림 / unread

## 11.1 두 계층의 알림

원본에는 초반 `incomingToast` 기반 알림과 후반 `state.notifications` 기반 알림 센터가 모두 있다. RN에서는 후반 NotificationStore만 기준으로 만들고, toast/banner는 그 파생 UI로 두면 된다.

```ts
type NotificationItem = {
  id: string;
  app: 'messenger' | 'twitter' | 'instagram' | 'sumgod' | 'randomchat' | 'phone' | 'snsdm' | string;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  read: boolean;
  count: number;
  collapseKey?: string;
  target: Record<string, any>;
};
```

상수:

```ts
MG_NOTIFICATION_LIMIT = 50;
MG_NOTIFICATION_TTL_MS = 7 days;
MG_NOTIFICATION_COLLAPSE_MS = 45 seconds;
```

---

## 11.2 pushNotification 동작

원본 `mgPushNotification` 동작:

1. 기존 notifications normalize/prune/sort
2. `collapseKey`가 있고, 같은 key의 unread item이 있고, 최근 45초 이내면 기존 item update
3. 아니면 새 item unshift
4. count는 최대 99
5. 저장
6. show !== false이면 banner 표시

RN 구현:

```ts
function pushNotification(input, options = {}) {
  const now = Date.now();
  const list = normalizeNotifications(state.notifications);
  const collapseKey = input.collapseKey || '';

  let item = collapseKey
    ? list.find(n => n.collapseKey === collapseKey && !n.read && now - n.updatedAt < 45_000)
    : null;

  if (item) {
    item.title = clip(input.title || item.title, 48);
    item.body = clip(input.body || item.body, 140);
    item.updatedAt = now;
    item.count = Math.min(99, (item.count || 1) + 1);
    item.target = input.target || item.target;
    item.read = false;
  } else {
    item = makeNotification(input, now, collapseKey);
    list.unshift(item);
  }

  state.notifications = normalizeNotifications(list);
  if (options.show !== false) showBanner(item.id);
}
```

---

## 11.3 app label/icon

원본 label:

```text
twitter   -> Twitter/X
instagram -> Instagram
sumgod    -> SumGod
randomchat -> Random Chat
phone     -> 전화
snsdm     -> SNS DM
else      -> Messenger
```

icon:

```text
twitter -> X
instagram -> IG
sumgod -> Q
randomchat -> ?
phone -> TEL
snsdm -> DM
messenger -> MSG
```

RN에서는 app icon/text는 UI component에서 매핑한다.

---

## 11.4 target visible suppress

원본은 사용자가 이미 해당 화면을 보고 있으면 알림을 덜 띄우려고 한다.

대략 규칙:

```ts
if app messenger/phone and target.roomId:
  visible if current app is messenger, active chat, selectedRoomId same, near bottom
if app twitter/instagram and target.postId:
  visible if current phone app is same social app
if app snsdm and target.threadId:
  visible if SNS DM thread open
if app sumgod:
  visible if phone app is sumgod
```

RN에서는 notification push 전에 현재 route를 확인해 banner 표시 여부만 suppress하고, notification record 자체는 저장하는 편이 좋다.

---

## 11.5 unread count 통합

원본은 `state.unreadCounts[roomId]`와 notification unread를 둘 다 사용한다. 후반 patch에서 “안 읽음이 중복 증가하지 않도록” 여러 wrapper가 붙는다.

RN 권장 구조:

```ts
function getRoomUnread(roomId) {
  return state.unreadCounts[roomId] || 0;
}

function getAppBadgeCount() {
  return Object.values(state.unreadCounts).sum() + notifications.filter(n => !n.read).length + sumGodBadgeCount();
}
```

중복 증가 방지:

```diff
- message push마다 unread++
+ 현재 route가 해당 room이고 list near bottom이면 unread 증가하지 않음
+ 같은 생성 batch에서는 room당 최대 1 증가
```

---

## 11.6 RN 테스트 항목

- 같은 collapseKey 알림이 45초 안에 들어오면 count가 증가한다.
- 50개 초과 알림은 잘린다.
- 7일 지난 알림은 사라진다.
- banner는 4.2초 후 사라진다.
- 알림 클릭 시 messenger/randomchat/social/snsdm/sumgod target으로 이동한다.
- 이미 보고 있는 room의 메시지는 unread가 증가하지 않는다.
- random chat 알림 클릭 시 `RandomChatRoom`으로 이동한다.

---

# 12. Phone Home / 앱 라우팅

## 12.1 원본의 라우팅 방식

원본 웹 플러그인은 `activeTab`, `selectedRoomId`, `mgPhoneApp` 같은 전역 상태로 화면을 전환한다.

주요 화면 개념:

```text
home / chat / settings / characters / lorebook / stickers / sns / snsdm / randomchat / social / phone app shell
```

후반에는 실제 스마트폰 홈처럼 앱 아이콘을 띄우는 `mgPhoneApp` 계층이 생기고, Twitter/Instagram/Messenger/RandomChat/SumGod 등이 phone app으로 들어간다.

RN에서는 이 구조를 그대로 전역 문자열로 구현하지 말고 navigation stack으로 나누는 것이 좋다.

```text
RootStack
 ├─ PhoneHome
 ├─ MessengerStack
 │   ├─ RoomList
 │   ├─ DirectChatRoom
 │   ├─ GroupChatRoom
 │   ├─ RandomChatList
 │   └─ RandomChatRoom
 ├─ SocialStack
 │   ├─ TwitterFeed
 │   ├─ InstagramFeed
 │   └─ SnsDmThread
 ├─ SumGodStack
 ├─ SettingsStack
 └─ CharacterProfileModal
```

---

## 12.2 Messenger/Kakao list

중후반 patch에는 Kakao/Phone 스타일 메신저 리스트가 들어간다.

리스트에는 다음이 섞인다.

- 일반 1:1 DM room
- group room
- random chat room 또는 random app entry
- unread count
- last message preview
- avatar stack

정렬 기준은 기본적으로 `lastActivity` 또는 마지막 메시지 timestamp 내림차순이다.

RN 구현:

```ts
function buildMessengerRows(): MessengerRow[] {
  return [
    ...directRooms.map(toDirectRow),
    ...groupRooms.map(toGroupRow),
    ...randomChats.map(toRandomRow),
  ].sort((a, b) => b.updatedAt - a.updatedAt);
}
```

---

## 12.3 Android back/home flow

원본에는 phone app에서 뒤로가기/홈으로 가기/overlay 닫기 관련 patch가 많다. RN에서는 hardware back handler로 명시한다.

```ts
BackHandler.addEventListener('hardwareBackPress', () => {
  if (phoneCall.open) { endOrMinimizePhoneCall(); return true; }
  if (notificationCenter.open) { closeNotificationCenter(); return true; }
  if (navigation.canGoBack()) { navigation.goBack(); return true; }
  if (currentRoute !== 'PhoneHome') { navigation.navigate('PhoneHome'); return true; }
  return false;
});
```

---

# 13. SumGod

## 13.1 기능 개요

SumGod는 별도 phone app이다. 100개의 관계 질문을 하루에 하나씩 열고, 사용자가 답하면 선택한 캐릭터가 답변한다. 이후 해당 문답에 대해 추가 대화를 이어갈 수 있고, 완료한 문답은 archive에서 본다.

원본 질문 배열은 100개이며, 예시는 다음 성격이다.

- 서로에게 마음이 기울었다고 느낀 순간
- 둘만의 암호 같은 말
- 상대가 가장 귀여워 보이는 순간
- 상대와 함께하고 싶은 일
- 상대에게 가장 듣고 싶은 고백
- 둘의 관계를 색/날씨/향/책 제목으로 표현

---

## 13.2 상태 모델

```ts
type SumGodState = {
  characterId: string;
  entries: SumGodEntry[];
  view: 'today' | 'archive';
};

type SumGodEntry = {
  id: string;
  number: number;
  question: string;
  unlockedOn: string;
  completedOn?: string;
  userAnswer: string;
  characterAnswer: string;
  conversation: Array<{
    id: string;
    role: 'user' | 'character';
    content: string;
    createdAt: number;
  }>;
  createdAt: number;
};
```

원본은 `state.config.sumGod` 안에 저장한다. RN에서는 독립 `sumGod` table/store로 빼는 것이 낫다.

---

## 13.3 질문 오픈 조건

```ts
function availableNow() {
  const now = new Date();
  return now.getHours() >= 22 || entries.length === 0;
}
```

즉 첫 질문은 시간 제한 없이 열 수 있고, 이후 질문은 22시 이후 가능하다.

오늘 완료 여부:

```ts
entries.some(entry => entry.completedOn === todayKey)
```

badge 조건:

```ts
if active entry exists and no characterAnswer -> 1
if today not done and availableNow and next question exists -> 1
else 0
```

---

## 13.4 entry 생성

```ts
function currentEntry(create = false) {
  const active = entries.find(entry => !entry.userAnswer || !entry.characterAnswer);
  if (active || !create) return active;

  const number = entries.length + 1;
  if (number > QUESTIONS.length) return null;

  const entry = {
    id: makeId(),
    number,
    question: QUESTIONS[number - 1],
    unlockedOn: todayKey(),
    userAnswer: '',
    characterAnswer: '',
    conversation: [],
    createdAt: Date.now(),
  };
  entries.push(entry);
  return entry;
}
```

캐릭터를 바꾸면 원본은 reset한다.

```ts
function resetForCharacter(characterId) {
  sum.characterId = characterId;
  sum.entries = [];
  sum.view = 'today';
}
```

---

## 13.5 캐릭터 답변 생성

원본 patch는 SumGod 전용 plain text 호출을 사용한다. 답변 prompt에는 다음이 들어간다.

- SumGod라는 romantic couple Q&A app이라는 맥락
- 캐릭터 프로필
- 유저 이름/프로필
- 질문
- 유저 답변
- 최근 messenger context
- 이전 SumGod entries

출력은 JSON보다 plain text에 가깝게 정리하고 1000자 내로 자른다.

RN에서는 ChatEngine과 분리된 `SumGodEngine`을 두는 것이 좋다.

```ts
async function generateCharacterAnswer(entry: SumGodEntry) {
  const character = getCharacter(sum.characterId);
  const text = await llm.callPlain(buildSumGodAnswerPrompt(character, entry));
  return clip(cleanAssistantText(text), 1000);
}
```

---

## 13.6 추가 대화

완료된 entry에는 `conversation` 배열이 있고, 사용자가 추가로 메시지를 보내면 캐릭터가 해당 문답 맥락에서 답한다.

```ts
entry.conversation.push({ role: 'user', content: text, createdAt: now });
const reply = await generateSumGodTalk(entry, text);
entry.conversation.push({ role: 'character', content: reply, createdAt: Date.now() });
```

---

## 13.7 후반 patch 기능

소스 후반에는 SumGod에 여러 보정이 붙는다.

복각 시 포함할 항목:

- 오늘 답변 다시 생성
- 답변/대화 생성 중 버튼 busy 처리
- archive text-only edit
- 오늘 user answer 수정
- archive card 편집
- PNG export
- backup/restore protection
- notification badge
- phone home icon badge

RN에서 처음부터 넣을 필요는 없지만, 데이터 모델은 수정 가능하게 만들어야 한다.

```ts
function updateEntry(entryId, patch) {
  Object.assign(findEntry(entryId), patch);
  persist();
}
```

---

## 13.8 RN 테스트 항목

- 첫 질문은 22시 전에도 열 수 있다.
- 두 번째 질문부터는 22시 전이면 잠김 메시지가 뜬다.
- 같은 날짜에 완료된 entry가 있으면 새 질문이 열리지 않는다.
- 캐릭터를 바꾸면 entries가 reset된다.
- 답변 생성 실패 시 fallback 문구가 들어가거나 오류가 표시된다.
- 추가 대화가 entry.conversation에 누적된다.
- archive에서 완료 문답을 볼 수 있다.
- 오늘 user answer 수정 후 characterAnswer 재생성이 가능하다.
- 백업/복원에 SumGod entries가 포함된다.

---

# 14. SNS 상호작용 계층: 댓글 / SNS DM

SNS 생성 본체는 이전 문서에서 다뤘지만, 생성 이후 상호작용 계층은 별도다.

## 14.1 댓글

SNS platform item에는 `comments[]`가 있고, 사용자가 댓글을 추가할 수 있다.

```ts
type SnsComment = {
  id: string;
  name: string;
  handle: string;
  body: string;
  likes: number;
  isUser?: boolean;
  isCharacter?: boolean;
  createdAt: number;
};
```

댓글 입력 action은 postId + platformIndex로 target platform item을 찾고 comments에 push한다. 후반 patch에서는 댓글 수/stats.replies를 맞추는 보정이 많다.

RN에서는 반드시 `post.platforms[index].comments`를 source of truth로 둔다.

```diff
- post.comments에만 추가
+ post.platforms[platformIndex].comments에 추가
+ stats.replies = comments.length로 동기화
```

---

## 14.2 SNS DM thread

SNS DM은 일반 채팅방과 분리된 `state.snsDmThreads`에 저장된다.

```ts
type SnsDmThread = {
  id: string;
  postId: string;
  platformIndex: number;
  characterId: string;
  title: string;
  context: string;
  messages: Array<{
    id: string;
    from: 'user' | 'character' | string;
    name?: string;
    body: string;
    createdAt: number;
    mediaData?: string;
    image?: string;
  }>;
};
```

SNS DM 답장은 SNS post context를 넣고, 일반 room과 분리된 DM thread history를 prompt로 보낸다.

복각 포인트:

```diff
- SNS DM을 일반 ChatRoom에 저장
+ snsdmThreads에 별도로 저장

- DM thread가 post/platform과 연결되지 않음
+ postId + platformIndex + characterId로 thread key 생성
```

---

# 15. 백업 / 복원 / 저장 안정화

## 15.1 saveState debounce

원본은 `SAVE_STATE_DEBOUNCE_MS = 1200`으로 저장을 debounce한다.

```ts
async function saveState() {
  prepareStateForSave();
  clearTimeout(saveStateTimer);
  saveStateTimer = setTimeout(async () => {
    prepareStateForSave();
    await externalizeStateMedia();
    prepareStateForSave();
    writeStateSnapshot(JSON.stringify(state));
  }, 1200);
}
```

즉 `saveState()`는 즉시 저장이 아니라 예약 저장이다. 강제 저장은 `flushSaveState()`가 한다.

RN에서는 다음 둘을 분리한다.

```ts
saveDebounced();
flushSaveNow();
```

앱이 background로 갈 때는 반드시 flush한다.

```ts
AppState.addEventListener('change', state => {
  if (state !== 'active') flushSaveNow();
});
```

---

## 15.2 백업

기본 backup은 state clone에서 API key를 지우고 JSON export한다.

```ts
const copy = clone(state);
for (const profile of Object.values(copy.config.apiProfiles)) profile.apiKey = '';
if (copy.config.imageGeneration) copy.config.imageGeneration.apiKey = '';
exportJson('messengergod-backup.json', copy);
```

사용자 요청상 API 옵션은 제외하지만, 백업에서는 민감키 제거 정책을 유지해야 한다.

RN 백업 format:

```ts
type BackupFile = {
  version: string;
  exportedAt: number;
  state: AppStateWithoutSecrets;
  media?: Array<{ id: string; data: string }>;
};
```

원본은 media ref를 pluginStorage에 별도로 저장하므로, 단순 state JSON만 백업하면 media가 빠질 수 있다. RN에서는 media를 포함한 full backup과 state-only backup을 구분하는 것이 안전하다.

---

## 15.3 복원

원본 restore는 JSON을 읽고:

```ts
state = { ...createDefaultState(), ...data, config: mergeConfig(data.config), characters: data.characters.map(normalizeCharacter) };
ensureRooms();
selectedRoomId = state.selectedRoomId || getFirstAvailableRoomId();
selectedCharacterId = getCurrentRoom()?.characterId || '';
saveState();
render();
```

RN에서는 복원 후 반드시 모든 normalize/migration을 통과시킨다.

```ts
function restoreState(raw) {
  const restored = mergeWithDefaultState(raw);
  restored.config = mergeConfig(raw.config);
  restored.characters = restored.characters.map(normalizeCharacter);
  normalizeRooms(restored);
  normalizeGroupRooms(restored);
  normalizeRandomChats(restored);
  normalizeLore(restored);
  normalizeNotifications(restored);
  normalizeMediaRefs(restored);
  return restored;
}
```

---

## 15.4 강제 종료 저장 안정화

후반 patch에는 character editor target id, form snapshot, force-close persistence hardening이 들어간다. 웹에서는 DOM form이 열린 채 창이 닫히면 state에 반영되지 않는 문제가 있어서, 닫기 직전 form 값을 읽어 저장한다.

RN에서는 controlled form state를 사용하면 이 문제는 줄어든다. 그래도 다음은 필요하다.

```text
- 화면 leave 전 dirty form 자동 저장 또는 discard confirm
- 앱 background 전 pending form state commit
- debounced save가 남아 있으면 flush
```

---

# 16. 추천 RN 모듈 설계

## 16.1 RandomChatStore

```ts
class RandomChatStore {
  rooms: RandomChatRoom[];
  creating: boolean;
  gender: 'any' | 'male' | 'female';

  normalize(): void;
  createRandomChat(gender: RandomChatGender): Promise<RandomChatRoom>;
  promote(roomId: string): Promise<{ character: Character; room: DirectRoom }>;
  delete(roomId: string): Promise<void>;
  getCharacterForRoom(roomId: string): Character | null;
}
```

## 16.2 GroupChatStore

```ts
class GroupChatStore {
  rooms: GroupRoom[];

  create(memberIds: string[], name?: string): GroupRoom;
  delete(roomId: string): void;
  members(roomId: string): Character[];
  buildPrompt(roomId: string, userText: string, forcedSpeakerId?: string): LlmMessage[];
  parseReply(roomId: string, payload: AssistantPayload, forcedSpeakerId?: string): GroupReplyItem[];
  deliver(roomId: string, items: GroupReplyItem[], jobId: string): Promise<void>;
}
```

## 16.3 LoreEngine

```ts
class LoreEngine {
  normalize(entry: Partial<LoreEntry>): LoreEntry;
  activeEntries(character: Character, options: LoreResolveOptions): LoreEntry[];
  promptBlock(character: Character, options: LoreResolveOptions): string;
  importRisuLore(json: unknown): LoreEntry[];
  exportRisuLore(): unknown;
}
```

## 16.4 CalendarScheduler

```ts
class CalendarScheduler {
  inFlight = new Set<string>();

  check(now = new Date()): Promise<void>;
  enqueueDueEvent(character: Character, event: CalendarEvent, scope: 'user' | 'character'): void;
  sendEventMessage(job: CalendarJob): Promise<void>;
  markTriggeredAfterSuccess(job: CalendarJob): Promise<void>;
}
```

## 16.5 PhoneCallStore

```ts
class PhoneCallStore {
  current: PhoneCallState | null;

  normalizeInvite(item: unknown): PhoneInvite | null;
  createCard(roomId: string, character: Character, invite: PhoneInvite, sourceMode: string): ChatMessage;
  start(roomId: string, initiator: 'user' | 'character', sourceMessageId?: string): Promise<void>;
  choose(option: string): Promise<void>;
  sendCustomReply(text: string): Promise<void>;
  end(status?: 'ended' | 'rejected' | 'missed'): Promise<void>;
}
```

## 16.6 SumGodStore

```ts
class SumGodStore {
  state: SumGodState;

  availableNow(date = new Date()): boolean;
  todayDone(date = new Date()): boolean;
  badgeCount(): number;
  openQuestion(): SumGodEntry | null;
  submitAnswer(entryId: string, answer: string): Promise<void>;
  regenerateAnswer(entryId: string): Promise<void>;
  sendTalk(entryId: string, text: string): Promise<void>;
  editEntry(entryId: string, patch: Partial<SumGodEntry>): void;
}
```

## 16.7 NotificationStore

```ts
class NotificationStore {
  push(input: PushNotificationInput, options?: { show?: boolean }): NotificationItem;
  markRead(id: string): void;
  markTargetRead(target: NotificationTarget): void;
  clear(): void;
  unreadCount(): number;
  normalize(): void;
}
```

## 16.8 MediaStore

```ts
class MediaStore {
  cache = new Map<string, string>();

  shouldExternalize(data: string): boolean;
  externalize(data: string, hint: string): Promise<MediaRef>;
  resolve(refOrData: string): Promise<string>;
  collectUsedRefs(state: AppState): Set<string>;
  cleanupUnused(state: AppState): Promise<void>;
}
```

---

# 17. 주요 데이터 흐름 pseudo-code

## 17.1 랜덤채팅 생성

```ts
async function createRandomChatFlow(gender) {
  if (randomChat.creating) return;
  randomChat.creating = true;

  try {
    const prompt = randomChat.buildPrompt(gender, userProfile, randomChat.rooms);
    const raw = await llm.callRaw(prompt, { maxTokens: 1600 });
    const parsed = parseRandomCharacterJson(raw);
    const character = randomChat.characterFromParsed(parsed, gender);
    character.firstMessage = sanitizeRandomFirstMessage(character.firstMessage, character);

    const room = randomChat.createRoom(character);
    messageStore.initRoom(room.id, firstMessage(character));
    notification.push({ app: 'randomchat', title: '랜덤채팅', body: `${character.name} 연결됨`, target: { app: 'randomchat', roomId: room.id } });
    navigation.navigate('RandomChatRoom', { roomId: room.id });
    await persistence.flush();
  } finally {
    randomChat.creating = false;
  }
}
```

## 17.2 랜덤채팅 승격

```ts
async function promoteRandomChat(roomId) {
  const randomRoom = randomChat.get(roomId);
  if (!randomRoom) return;

  await persistence.transaction(async () => {
    const character = clone(randomRoom.character);
    if (characterStore.exists(character.id)) character.id = `char_${makeId()}`;

    character.enabled = true;
    character.proactiveEnabled = false;

    characterStore.add(character);
    const directRoom = roomStore.createDirectRoom(character.id, randomRoom.name);

    messageStore.copyMessages(randomRoom.id, directRoom.id, msg => ({
      ...msg,
      characterId: msg.role === 'character' ? character.id : msg.characterId,
    }));

    randomChat.delete(randomRoom.id);
    navigation.replace('DirectChatRoom', { roomId: directRoom.id });
  });
}
```

## 17.3 단톡방 메시지 전송

```ts
async function sendGroupUserMessage(roomId, text) {
  chatEngine.cancelPendingReply(roomId);
  messageStore.push(roomId, userMessage(text));
  roomStore.touch(roomId);
  await persistence.saveDebounced();

  const jobId = chatEngine.createJob(roomId);
  chatEngine.scheduleReply(roomId, jobId, async () => {
    const messages = await groupChat.buildPrompt(roomId, text);
    const payload = await llm.call(messages);
    if (!chatEngine.isCurrentJob(roomId, jobId)) return;
    const items = groupChat.parseReply(roomId, payload);
    await groupChat.deliver(roomId, items, jobId);
  });
}
```

## 17.4 일기형 메모리

```ts
async function runDailyDiaryForDate(dateKey) {
  for (const character of characters) {
    if (character.lastDailyDiaryMemoryDay === dateKey) continue;

    const daily = dailyDiary.collectMessages(character, dateKey);
    if (!daily) continue;

    const payload = await llm.call([
      { role: 'system', content: dailyDiary.prompt(character, dateKey, daily.count) },
      { role: 'user', content: `Today's full chat timeline:\n${daily.transcript}\n\nWrite the diary memory now.` },
    ], { maxTokens: 900 });

    const memory = dailyDiary.parseMemory(payload);
    if (!memory) continue;

    lore.replaceDailyMemory(character.id, dateKey, memory);
    character.lastDailyDiaryMemoryDay = dateKey;
  }

  await persistence.flush();
}
```

## 17.5 알림 push

```ts
function notifyRoomMessage(roomId, message) {
  if (navigation.isRoomVisible(roomId) && chatView.isNearBottom(roomId)) return;

  unread.incrementOncePerBatch(roomId);

  notification.push({
    app: getRoomType(roomId) === 'random' ? 'randomchat' : 'messenger',
    title: roomDisplayName(roomId),
    body: previewMessage(message),
    collapseKey: `room:${roomId}`,
    target: { app: 'messenger', roomId },
  });
}
```

---

# 18. 회귀 테스트 체크리스트

## 18.1 랜덤채팅

- [ ] 생성 중 버튼 연타해도 하나만 생성된다.
- [ ] 성별 `male/female/any`가 prompt와 metadata에 반영된다.
- [ ] LLM JSON이 약간 깨져도 repair 후 생성되거나 안전하게 실패한다.
- [ ] 첫 메시지가 너무 친밀하면 fallback으로 교체된다.
- [ ] 랜덤 방은 일반 캐릭터 목록에 보이지 않는다.
- [ ] 승격하면 일반 캐릭터 목록에 생기고 메시지가 복사된다.
- [ ] 승격 후 기존 random room message가 남아 orphan이 되지 않는다.
- [ ] 랜덤채팅 알림 클릭 시 해당 방으로 이동한다.

## 18.2 단톡방

- [ ] 2명 미만 생성 불가.
- [ ] 멤버 삭제 후에도 목록/렌더 crash 없음.
- [ ] LLM speaker가 name/handle/id 중 무엇을 써도 매칭된다.
- [ ] allowed member 밖 speaker는 버려진다.
- [ ] 그룹 답장은 최대 4개다.
- [ ] forcedSpeaker reroll이 해당 캐릭터로 출력된다.
- [ ] 그룹 메시지가 일기형 메모리에 포함된다.

## 18.3 로어북

- [ ] alwaysActive는 항상 주입된다.
- [ ] regex 오류가 throw되지 않는다.
- [ ] selective secondkey가 동작한다.
- [ ] room scope/character scope/global scope가 구분된다.
- [ ] insertorder 내림차순으로 prompt에 들어간다.
- [ ] Risu lorebook import/export가 round-trip된다.

## 18.4 일기형 메모리

- [ ] 23:59 이후 한 번만 생성된다.
- [ ] app resume에서 누락된 diary를 생성할 수 있다.
- [ ] 캐릭터별 DM + 참여한 group room이 포함된다.
- [ ] system message는 제외된다.
- [ ] 같은 날짜 memory lore가 중복되지 않는다.
- [ ] loreEntries가 300개 cap을 넘지 않는다.

## 18.5 캘린더

- [ ] 캐릭터 이벤트와 사용자 공통 이벤트가 모두 검사된다.
- [ ] 공통 이벤트는 캐릭터별로 하루 한 번씩 반응한다.
- [ ] proactiveChatEnabled가 false여도 기념일 메시지는 가능하다.
- [ ] busy room이면 발송 성공 전 triggered 저장을 하지 않는다.
- [ ] MM-DD와 YYYY-MM-DD가 모두 동작한다.

## 18.6 전화

- [ ] `callInvite:true`가 phone-call card로 렌더된다.
- [ ] `[[PHONE_CALL]]`이 visible bubble에서 사라진다.
- [ ] characterPhoneCallEnabled false면 캐릭터 주도 call invite가 제거된다.
- [ ] 전화 overlay에서 선택지/직접 답변/종료가 동작한다.
- [ ] 통화 log가 SNS/채팅 prompt에 UI artifact로 새지 않는다.
- [ ] random room에서도 올바른 character로 전화가 연결된다.

## 18.7 스티커/기프티콘/미디어

- [ ] 캐릭터 스티커와 전역 스티커가 모두 prompt에 들어간다.
- [ ] gift item은 text가 아니라 gift card로 렌더된다.
- [ ] 큰 data URL은 media ref로 externalize된다.
- [ ] media ref가 누락되면 placeholder로 안전하게 렌더된다.
- [ ] backup/restore 후 media가 resolve된다.
- [ ] cleanup이 사용 중인 ref를 삭제하지 않는다.

## 18.8 알림

- [ ] collapseKey가 같은 알림은 45초 안에 count 증가.
- [ ] 50개 초과 알림 prune.
- [ ] 7일 지난 알림 prune.
- [ ] banner 4.2초 후 사라짐.
- [ ] target 화면이 이미 visible이면 banner 중복 표시를 피함.
- [ ] 알림 클릭으로 messenger/randomchat/social/snsdm/sumgod 이동.

## 18.9 SumGod

- [ ] 첫 질문은 22시 전에도 열림.
- [ ] 두 번째 이후는 22시 전 잠김.
- [ ] 하루에 하나만 완료.
- [ ] 캐릭터 변경 시 entries reset.
- [ ] 답변 생성 실패 시 fallback 또는 오류 표시.
- [ ] 추가 대화가 entry에 누적.
- [ ] archive/edit/export가 기존 entry를 망가뜨리지 않음.

## 18.10 저장/복원

- [ ] debounced save 중 앱 종료 시 flush.
- [ ] restore 후 normalize가 모든 신규 필드에 적용된다.
- [ ] 백업에 민감키가 포함되지 않는다.
- [ ] media 포함 backup과 state-only backup을 구분한다.
- [ ] force close 직전 dirty form이 저장된다.

---

# 19. 구현 우선순위

1. **State normalization부터 구현**  
   randomChats, groupRooms, loreEntries, notifications, media refs가 restore 후 항상 정상 형태가 되게 한다.

2. **RandomChatStore 구현**  
   사용자가 이번에 특히 요청한 랜덤채팅은 일반 캐릭터와 섞으면 나중에 승격/삭제/알림이 꼬인다. 반드시 별도 store로 둔다.

3. **GroupChatStore 구현**  
   일반 ChatEngine 재사용 전에 group prompt/parser/speaker resolver를 먼저 만든다.

4. **LoreEngine 구현**  
   로어북은 채팅/SNS/SumGod/일기 메모리 전체 prompt 품질에 영향을 준다.

5. **DailyDiaryMemoryEngine + CalendarScheduler 구현**  
   둘 다 background/timer 특성이 있으므로 RN에서는 app resume 기반 보정이 필요하다.

6. **PhoneCallStore 구현**  
   callInvite/marker 정규화와 overlay 상태를 분리해야 메시지 출력이 안정된다.

7. **NotificationStore와 MediaStore 구현**  
   나중에 붙이면 unread/media missing 문제가 반복되므로 초기에 공통 infrastructure로 둔다.

8. **SumGod는 독립 앱으로 구현**  
   ChatEngine과 겹치지 않는 별도 Q&A flow로 만든다.

---

# 20. 최종 복각 구조 요약

```text
React Native App
 ├─ stores/
 │   ├─ appStateStore.ts
 │   ├─ characterStore.ts
 │   ├─ roomStore.ts
 │   ├─ randomChatStore.ts
 │   ├─ groupChatStore.ts
 │   ├─ loreStore.ts
 │   ├─ notificationStore.ts
 │   ├─ mediaStore.ts
 │   ├─ phoneCallStore.ts
 │   └─ sumGodStore.ts
 ├─ engines/
 │   ├─ chatEngine.ts
 │   ├─ groupChatEngine.ts
 │   ├─ randomCharacterEngine.ts
 │   ├─ loreEngine.ts
 │   ├─ calendarScheduler.ts
 │   ├─ dailyDiaryMemoryEngine.ts
 │   └─ backupEngine.ts
 ├─ screens/
 │   ├─ PhoneHomeScreen.tsx
 │   ├─ MessengerListScreen.tsx
 │   ├─ ChatRoomScreen.tsx
 │   ├─ GroupRoomScreen.tsx
 │   ├─ RandomChatListScreen.tsx
 │   ├─ RandomChatRoomScreen.tsx
 │   ├─ SumGodScreen.tsx
 │   ├─ NotificationCenterScreen.tsx
 │   └─ SettingsScreens/*
 └─ components/
     ├─ MessageBubble.tsx
     ├─ MediaBubble.tsx
     ├─ GifticonCard.tsx
     ├─ PhoneCallCard.tsx
     ├─ PhoneCallModal.tsx
     ├─ NotificationBanner.tsx
     └─ CharacterAvatar.tsx
```

복각의 핵심은 “웹 DOM 패치 체인”을 그대로 따라가는 것이 아니라, **원본의 최종 상태 모델과 최종 사용자-visible 동작을 기준으로 모듈을 나누는 것**이다. 특히 랜덤채팅과 단톡방은 일반 DM과 messages map은 공유하지만 room metadata와 character resolution이 다르므로, RN에서 초기에 분리해두지 않으면 나중에 승격, 알림, 전화, 일기 메모리, 로어북 scope가 계속 꼬인다.
