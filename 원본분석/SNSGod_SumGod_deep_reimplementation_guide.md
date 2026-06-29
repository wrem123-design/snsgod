# SNSGod SumGod 커플 질문 다이어리 최종 복각 가이드

대상:
- 원본: `SNSGod.js`의 **SumGod Couple Q&A App** 최종 동작
- 현재 RN 구현: `mobile-rn/src/screens/SumGodScreen.tsx`

목표:
- 현재의 “질문 카드 + 답변 저장 흉내” 수준을 원본의 **SumGod 커플 질문 다이어리 앱**에 가깝게 복각한다.
- 단순 질문/답변 저장이 아니라, **밤 10시 질문 개방, 달걀 UI, 캐릭터별 진행도, 블라인드 답변, 공개 후 코멘트, 후속 대화, 아카이브, 재생성, 편집, 이미지 내보내기, 알림/배지**까지 포함한 하나의 서브앱으로 만든다.

---

# 0. 결론 요약

현재 RN `SumGodScreen.tsx`는 원본의 핵심 구조를 거의 구현하지 못하고 있다. 현재 구현은:

```text
- 질문 4개만 있음
- 오늘 날짜 기준 질문 하나 표시
- 유저 답변 저장
- characterAnswer는 LLM이 아니라 local stub 문자열
- 추가 대화도 고정 문장
- 캐릭터 선택 없음
- 블라인드 답변 없음
- 공개 후 코멘트 없음
- 밤 10시 cycle이 원본과 다름
- 달걀 클릭으로 질문을 여는 흐름 없음
- 질문 진행 번호 없음
- 아카이브는 단순 리스트
- 재생성/편집/백업/이미지 내보내기/알림 없음
```

원본 SumGod는 다음 구조다.

```text
Phone Home의 SumGod 앱 아이콘
  -> SumGod Today / Archive 화면
  -> 캐릭터와 유저 이름이 들어간 커플 타이틀
  -> 달걀을 눌러 오늘 질문 열기
  -> 첫 질문은 바로 가능, 이후 질문은 밤 10시 이후 가능
  -> 질문 번호 Q.n과 100개 질문 진행도
  -> 유저가 답변 저장
  -> 캐릭터도 같은 질문에 “유저 답변을 보지 못한 상태로” 자기 답변 생성
  -> 두 답변이 공개됨
  -> 이후 캐릭터가 유저 답변과 두 답변의 겹침/차이를 짧게 코멘트할 수 있음
  -> 사용자가 그 답변에 대해 후속 대화 가능
  -> 후속 캐릭터 답변 개별 재생성 가능
  -> 오늘 답변 편집 가능
  -> 아카이브에서 지난 문답 확인/수정 가능
  -> 문답 이미지 export 가능
  -> 진행 기록 백업/복원
  -> 알림센터/배지와 연결
```

가장 중요한 철학은 이것이다.

> SumGod는 “AI가 내 답변을 읽고 반응하는 Q&A”가 아니라, **두 사람이 같은 질문에 각자 먼저 답하고, 이후 답변을 공개해서 이야기하는 커플 다이어리**다.

현재 구현에서 가장 크게 틀어진 부분도 바로 이 지점이다. 현재 `generateCharacterAnswer(answer)`는 유저 답변을 읽고 바로 반응한다. 원본 최종형은 캐릭터가 **유저 답변을 볼 수 없다는 전제**로 먼저 자기 답을 만든다.

---

# 1. 원본 SumGod의 핵심 기능 구성

## 1.1 앱 위치와 진입

원본은 SumGod를 독립적인 폰 앱처럼 다룬다.

```text
Phone Home
  -> SumGod 아이콘
  -> badge: 오늘 열 수 있는 질문 또는 답변 대기 상태
  -> Today / Archive 화면
```

원본 초반 SumGod는 `mgPhoneAppIconSvg`와 `mgPhoneHomeHtml`을 래핑해서 Phone Home에 SumGod 아이콘을 추가한다.

```js
mgPhoneAppIconSvg = function(app) {
  if (app === 'sumgod') return mgSumGodIconSvg();
  return mgBasePhoneAppIconSvgSumGod(app);
};

mgPhoneHomeHtml = function() {
  let html = mgBasePhoneHomeHtmlSumGod();
  if (html.includes('data-app="sumgod"')) return html;
  const icon = mgPhoneAppIconHtml({
    app: 'sumgod',
    title: 'SumGod',
    subtitle: 'Q',
    badge: mgSumGodBadgeCount(),
    className: 'sumgod'
  });
  return html.replace('</main>', `${icon}</main>`);
};
```

RN에서는 하단 탭의 `etc` 내부 메뉴로 넣어도 되지만, 원본 UX를 살리려면 최소한:

```text
- 메뉴 카드에 badge 표시
- 오늘 질문 가능 상태 표시
- 답변 대기/코멘트 도착 표시
- SumGod 전용 화면 느낌 유지
```

이 필요하다.

---

## 1.2 원본 state 위치

원본은 SumGod 진행 상태를 `state.config.sumGod` 안에 둔다.

```js
function mgSumGodState() {
  state.config.sumGod = state.config.sumGod && typeof state.config.sumGod === 'object' ? state.config.sumGod : {};
  const sum = state.config.sumGod;
  sum.characterId = String(sum.characterId || '');
  sum.entries = Array.isArray(sum.entries) ? sum.entries : [];
  sum.view = sum.view || 'today';
  return sum;
}
```

현재 RN은 `state.sumGod`를 사용한다. 이건 반드시 원본과 똑같이 `config.sumGod`로 옮겨야 하는 것은 아니다. 하지만 아래 두 가지는 반드시 해야 한다.

```diff
- state.sumGod.entries만 사용
+ config.sumGod 또는 state.sumGod 둘 중 하나로 통일
+ 기존 state.sumGod와 config.sumGod 양쪽을 migration으로 합침
+ 진행도가 더 많은 쪽을 보존
```

권장 RN 구조:

```ts
type SumGodState = {
  characterId: string;
  view: 'today' | 'archive';
  questionOpen: boolean;
  entries: SumGodEntry[];
  backedUpAt?: number;
};

type SNSGodState = {
  config: SNSGodConfig & {
    sumGod?: SumGodState;
  };
  // migration compatibility only
  sumGod?: SumGodState;
};
```

앱 시작 시:

```ts
function normalizeSumGodState(state: SNSGodState): SNSGodState {
  const fromConfig = normalizeSumGodProgress(state.config?.sumGod);
  const fromRoot = normalizeSumGodProgress(state.sumGod);
  const merged = progressScore(fromRoot) > progressScore(fromConfig) ? fromRoot : fromConfig;

  return {
    ...state,
    config: {
      ...state.config,
      sumGod: merged,
    },
    sumGod: undefined, // optional: migration 후 제거
  };
}
```

---

# 2. 원본 Entry 모델

현재 RN 모델:

```ts
type SumGodEntry = {
  id: string;
  dateKey: string;
  question: string;
  answer: string;
  characterAnswer?: string;
  archived?: boolean;
  createdAt: number;
  updatedAt?: number;
  conversation?: SumGodLine[];
};
```

원본에 맞추려면 아래처럼 바꿔야 한다.

```ts
type SumGodEntry = {
  id: string;
  number: number;                    // Q 번호. date index가 아니라 진행 번호
  question: string;
  unlockedOn: string;                // yyyy-mm-dd, 질문 열린 날
  createdAt: number;

  userAnswer: string;                // 현재 RN의 answer를 rename/migrate
  characterAnswer: string;

  completedOn?: string;              // yyyy-mm-dd
  completedAt?: number;

  conversation: SumGodConversationItem[];

  generatingAnswer?: boolean;
  generatingTalk?: boolean;
  generatingTalkIndex?: number;

  debugUnlocked?: boolean;
  cheatUnlocked?: boolean;

  userAnswerEditedAt?: number;
  editingUserAnswer?: boolean;

  archiveEditing?: boolean;
  textEditedAt?: number;

  backedUpAt?: number;
};

type SumGodConversationItem = {
  role: 'user' | 'character';
  text: string;
  createdAt: number;
  kind?: 'reveal-comment' | 'talk';
};
```

중요한 차이:

```diff
- dateKey 기준 오늘 질문
+ number + unlockedOn + completedOn 기준 진행형 질문

- answer
+ userAnswer

- characterAnswer는 generateCharacterAnswer(answer) stub
+ LLM으로 캐릭터 private answer 생성

- conversation: from 'user' | 'sumgod'
+ conversation: role 'user' | 'character', kind optional
```

---

# 3. 질문 세트

현재 RN 질문은 4개뿐이다.

```ts
const QUESTIONS = [
  '두 사람이 처음 서로에게 마음이 기울었다고 느낀 순간은 언제일까?',
  '요즘 서로에게 가장 듣고 싶은 말은 무엇일까?',
  '둘만 아는 사소한 습관이 있다면?',
  '내일 단둘이 시간이 생긴다면 어디로 가고 싶을까?'
];
```

원본은 처음에는 100개 질문으로 시작하고, 이후 패치에서 성인/친밀 질문을 섞은 뒤, 최종적으로 **달걀이 양쪽 모두에게 묻는 중립 문장**으로 질문 세트를 교체한다.

최종 방향은 `MG_SUMGOD_EGG_NEUTRAL_QUESTIONS`다.

특징:

```text
- “나/너”보다 “두 사람 / 상대방 / 자신” 중심 표현
- 질문이 특정 화자에게만 맞지 않도록 중립화
- 순수한 관계 질문 + 은근한 성인 친밀 질문 포함
- 약 100개 진행형 질문
```

RN에서는 질문을 별도 파일로 분리한다.

```ts
// src/logic/sumgodQuestions.ts
export const SUMGOD_QUESTIONS = [
  '두 사람이 처음 서로에게 마음이 기울었다고 느낀 순간은 언제일까?',
  '상대방이 하루 속에 어떤 방식으로 스며들 때 가장 좋게 느껴질까?',
  '힘든 날, 상대방에게 가장 듣고 싶은 말은 무엇일까?',
  // ... 원본 최종 질문 세트 전체
];

export const SUMGOD_SOFT_NSFW_PATTERN = /(성인|스킨십|입맞춤|둘만 있는 밤|유혹|속삭|부끄러|둘만 남은 밤|더 원하게|처음 입맞춤|놀리는 말|목소리만 들리는 밤|천천히 가까워|손을 잡는 것만으로|눈이 오래 마주치면|은근한 신호|오늘 밤 조금 더 솔직)/;

export function isSoftNsfwSumGodQuestion(question: string) {
  return SUMGOD_SOFT_NSFW_PATTERN.test(question);
}
```

### Diff

```diff
- QUESTIONS 4개
+ SUMGOD_QUESTIONS 최종 원본 질문 세트로 교체
+ question index는 날짜가 아니라 entries.length + 1
+ question number를 entry.number로 저장
```

---

# 4. 질문 개방 규칙

## 4.1 원본 개방 규칙

최종 원본은 다음 정책이다.

```text
- 첫 질문은 바로 열 수 있음
- 두 번째 질문부터는 밤 10시 이후에 하루 1개 열 수 있음
- 하루 기준은 단순 00:00~23:59가 아니라 밤 10시 cycle
- 22:00~다음날 21:59를 하나의 SumGod cycle로 보는 구조
```

관련 함수 개념:

```js
mgSumGodAvailableNow = function() {
  return new Date().getHours() >= 22;
};

function mgSumGodCanCreateNextEntryNow() {
  const sum = mgSumGodState();
  if (mgSumGodActiveEntry()) return false;
  if (sum.entries.length === 0) return true;
  if (mgSumGodTodayDone()) return false;
  if (mgSumGodTodayEntry()) return false;
  return mgSumGodAvailableNow();
}
```

그리고 cycle 계산:

```js
function mgSumGodCycleStartMs(now = new Date()) {
  const start = new Date(now);
  if (start.getHours() < 22) start.setDate(start.getDate() - 1);
  start.setHours(22, 0, 0, 0);
  return start.getTime();
}
```

즉 `dateKey()`로 “오늘 날짜”만 보는 현재 RN 방식은 원본과 다르다.

## 4.2 RN 구현

```ts
export function sumGodCycleStartMs(now = new Date()): number {
  const start = new Date(now);
  if (start.getHours() < 22) start.setDate(start.getDate() - 1);
  start.setHours(22, 0, 0, 0);
  return start.getTime();
}

export function sumGodEntryTimeMs(entry: SumGodEntry): number {
  const finished = Boolean(entry.userAnswer && entry.characterAnswer);
  const direct = Number((finished ? entry.completedAt : entry.createdAt) || entry.completedAt || entry.createdAt || 0);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const key = (finished ? entry.completedOn : entry.unlockedOn) || entry.completedOn || entry.unlockedOn || '';
  const parsed = key ? new Date(`${key}T22:00:00`).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isEntryInCurrentCycle(entry: SumGodEntry, now = new Date()): boolean {
  const start = sumGodCycleStartMs(now);
  const end = start + 24 * 60 * 60 * 1000;
  const time = sumGodEntryTimeMs(entry);
  return time >= start && time < end;
}

export function todaySumGodEntry(sum: SumGodState, now = new Date()) {
  return [...sum.entries].reverse().find(entry => isEntryInCurrentCycle(entry, now)) || null;
}

export function isTodayDone(sum: SumGodState, now = new Date()) {
  const entry = todaySumGodEntry(sum, now);
  return Boolean(entry?.userAnswer && entry?.characterAnswer);
}

export function canCreateNextEntryNow(sum: SumGodState, now = new Date()) {
  if (activeSumGodEntry(sum)) return false;
  if (sum.entries.length === 0) return true;
  if (isTodayDone(sum, now)) return false;
  if (todaySumGodEntry(sum, now)) return false;
  return now.getHours() >= 22;
}
```

### Diff

```diff
- const today = dateKey()
- const todayEntry = entries.find(entry => entry.dateKey === today)
- const question = todayEntry?.question || QUESTIONS[new Date().getDate() % QUESTIONS.length]
+ const todayEntry = todaySumGodEntry(sum)
+ const active = activeSumGodEntry(sum)
+ const entry = sum.questionOpen ? active || todayEntry : null
+ 새 질문 생성은 canCreateNextEntryNow(sum)일 때만
```

---

# 5. 달걀 UI와 questionOpen

현재 RN은 화면에 바로 질문 카드가 뜬다. 원본은 **달걀을 눌러야 질문이 열린다.**

원본 핵심 상태:

```ts
sum.questionOpen: boolean
```

동작:

```text
SumGod 진입
  -> 커플 타이틀 + 달걀 표시
  -> 아직 questionOpen false면 질문 카드 없음
  -> 달걀 클릭
       -> questionOpen = true
       -> 필요 시 새 entry 생성
       -> 질문 카드 표시
```

원본의 달걀 메시지:

```text
active 있음: 작성 중인 질문이 있어요. 눌러서 이어보기
todayEntry 있음: 오늘의 답변을 다시 보려면 절 클릭하세요!
available/firstQuestion: 오늘의 질문을 받으려면 절 클릭하세요!
locked: 오늘 질문은 밤 10시에 도착해요.
```

RN 구현:

```ts
function openQuestion(state: SNSGodState): SNSGodState {
  return patchSumGod(state, sum => {
    if (!sum.characterId && state.characters[0]) sum.characterId = state.characters[0].id;
    sum.view = 'today';
    sum.questionOpen = true;

    if (canCreateNextEntryNow(sum)) {
      createNextEntry(sum);
    }
  });
}
```

UI는 반드시 아래 순서로 보인다.

```text
[Hero: 캐릭터 ♥ 유저]
[설명: 밤 10시에 하나씩 도착하는 미니 커플 문답]
[큰 달걀 버튼]
[questionOpen이면 질문 카드]
[locked이면 locked panel]
```

### Diff

```diff
- 질문 카드를 항상 표시
+ questionOpen이 true일 때만 질문 카드 표시
+ 달걀 버튼을 중심 UI로 배치
+ 22시 이전에는 locked panel 표시
```

---

# 6. 캐릭터 선택과 커플 타이틀

초기 원본에는 캐릭터 선택 드롭다운이 있다.

```text
함께 문답할 캐릭터
캐릭터를 바꾸면 Q.1부터 새로 시작합니다.
```

후반 최종 UI에서는 캐릭터 선택을 별도 카드가 아니라 제목 안의 picker처럼 만든다.

```text
[캐릭터 이름 ▼] ♥ [유저 이름]
```

현재 RN은 캐릭터 선택 자체가 없다. 이건 큰 누락이다.

권장 RN UX:

```text
상단 Hero
  캐릭터 이름  ♥  유저 이름
  캐릭터 이름을 누르면 picker bottom sheet
```

캐릭터 변경 정책:

```text
- characterId가 바뀌면 진행도 초기화
- 단, 기존 진행도는 백업 또는 archivedForCharacterChange로 보존
```

원본은 캐릭터 변경 시 기존 진행도를 별도 backup key로 저장한다.

```js
Risu.pluginStorage.setItem(`${STORAGE_SUMGOD_BACKUP}:character:${before.characterId || 'unknown'}:${Date.now()}`, JSON.stringify(before))
```

RN에서는 최소:

```ts
type SumGodState = {
  characterId: string;
  entries: SumGodEntry[];
  archivedProgressByCharacter?: Record<string, SumGodEntry[]>;
};
```

또는 더 단순하게:

```ts
function resetForCharacter(sum, nextCharacterId) {
  if (sum.characterId && sum.entries.length) {
    sum.characterArchives = {
      ...(sum.characterArchives || {}),
      [sum.characterId]: [
        ...(sum.characterArchives?.[sum.characterId] || []),
        { archivedAt: Date.now(), entries: sum.entries },
      ],
    };
  }
  sum.characterId = nextCharacterId;
  sum.entries = [];
  sum.view = 'today';
  sum.questionOpen = false;
}
```

---

# 7. 가장 중요한 프롬프트 차이: 블라인드 답변

현재 RN:

```ts
function generateCharacterAnswer(answer: string) {
  return `오늘 답변을 읽어보니 ... "${answer.slice(...)}" ...`;
}
```

이건 원본 최종형과 정반대다.

원본 최종형은 캐릭터 답변 생성 시 아래 규칙을 강하게 건다.

```text
Critical SumGod rule: both people answer the same question privately first.
You CANNOT see the user answer yet.
Do not react to it, quote it, agree with it, comfort it, or ask a follow-up about it.
Answer the question yourself from your own point of view as the character.
```

즉 캐릭터는 **사용자의 답을 보지 않은 상태**로 같은 질문에 답해야 한다.

## 7.1 RN 프롬프트 빌더

```ts
function buildSumGodPrivateAnswerPrompt(state: SNSGodState, entry: SumGodEntry, character: SNSGodCharacter) {
  const intimacyNote = isSoftNsfwSumGodQuestion(entry.question)
    ? 'Adult intimacy note: keep the answer consensual, emotionally intimate, and adult. If either participant is underage or age is unclear, answer romantically but non-sexually.'
    : '';

  const system = [
    `You are ${character.name}, writing in character for SumGod, a couple Q&A app.`,
    `User name: ${userNameFor(state, character)}.`,
    `User profile: ${userProfileFor(state, character) || state.config.userDescription || '(empty)'}`,
    `Character profile: ${character.prompt || '(empty)'}`,
    languageInstructionFor(state, character),
    intimacyNote,
    'Critical SumGod rule: both people answer the same question privately first.',
    'You CANNOT see the user answer yet. Do not react to it, quote it, agree with it, comfort it, or ask a follow-up about it.',
    'Answer the question yourself from your own point of view as the character.',
    'Write only the character answer as plain text. No JSON, labels, markdown, metadata, or arrays.',
    'Answer length must be 10-1000 characters. End with natural sentence-final punctuation.',
    'Append [[SUMGOD_DONE]] at the very end after final punctuation.',
    `Recent messenger context, for general relationship tone only:\n${sumGodRecentMessengerContext(state, character)}`,
    `Previous completed SumGod entries:\n${answeredEntriesContext(state, entry, character)}`,
  ].filter(Boolean).join('\n\n');

  const user = `Private question for ${character.name} only:\nQ.${entry.number}: ${entry.question}\n\nWrite ${character.name}'s private answer now. Remember: the user answer is hidden until after you finish.`;

  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}
```

### Diff

```diff
- generateCharacterAnswer(answer) local stub
+ callLLM(buildSumGodPrivateAnswerPrompt(...))

- 캐릭터가 user answer를 보고 반응
+ 캐릭터는 user answer를 보지 못함

- characterAnswer는 answer에서 slice한 문장
+ 캐릭터 프로필/최근 대화/이전 SumGod 맥락으로 직접 답변
```

---

# 8. 답변 완료 마커와 잘림 보정

원본은 `[[SUMGOD_DONE]]` 마커를 사용한다.

이유:

```text
- LLM 응답이 중간에 잘렸는지 판정
- 문장부호 없이 끝나면 이어쓰기 호출
- 최종 visible text에서는 marker 제거
```

원본 함수 개념:

```js
const MG_SUMGOD_DONE_MARKER = '[[SUMGOD_DONE]]';

function mgSumGodLooksIncomplete(text) {
  const value = stripDoneMarker(text);
  if (!value) return true;
  if (/\[\[SUMGOD_DONE\]\]/i.test(text)) return false;
  return !/[.!?。！？…~♡♥ㅋㅎㅠㅜ)”"']\s*$/.test(value);
}

async function finishIfNeeded(baseText, contextPrompt, userPrompt) {
  if (!looksIncomplete(baseText)) return clip(stripDoneMarker(baseText));
  const continuation = await callLLM([...], { maxTokens });
  return clip(base + continuation);
}
```

RN에도 반드시 넣는 게 좋다. 특히 Vertex/JSON API를 쓰더라도 SumGod는 **plain text** 응답이 자연스럽고, 길게 쓰다가 잘릴 수 있다.

```ts
const SUMGOD_DONE_MARKER = '[[SUMGOD_DONE]]';

function stripSumGodDoneMarker(text: string) {
  return String(text || '').replace(/\[\[SUMGOD_DONE\]\]/gi, '').trim();
}

function looksIncompleteSumGod(text: string) {
  const value = stripSumGodDoneMarker(text);
  if (!value) return true;
  if (/\[\[SUMGOD_DONE\]\]/i.test(text)) return false;
  return !/[.!?。！？…~♡♥ㅋㅎㅠㅜ)”"']\s*$/.test(value);
}

async function finishSumGodIfNeeded(baseText: string, contextPrompt: string, userPrompt: string) {
  let text = stripSumGodDoneMarker(baseText);
  if (!looksIncompleteSumGod(baseText)) return clipSumGodText(text, 1000);

  const continuation = await callLLMPlain([
    {
      role: 'system',
      content: [
        contextPrompt,
        'The previous answer was cut off. Continue from the exact unfinished sentence and finish naturally.',
        `Return only the missing continuation text, then append ${SUMGOD_DONE_MARKER}.`,
        'Do not restart the answer. Do not summarize. Do not use JSON.',
      ].join('\n'),
    },
    { role: 'user', content: `${userPrompt}\n\nAlready written text:\n${text}` },
  ]);

  text = `${text}${/\s$/.test(text) ? '' : ' '}${stripSumGodDoneMarker(continuation)}`.trim();
  return clipSumGodText(text, 1000);
}
```

---

# 9. 공개 후 코멘트

원본 최종형은 캐릭터 답변이 끝난 뒤, 확률적으로 또는 강제로 **공개 후 코멘트**를 만든다.

개념:

```text
1. 유저 답변 저장
2. 캐릭터 private answer 생성
3. 둘의 답변이 화면에 공개됨
4. 캐릭터가 “이제 두 답변을 보고” 짧은 코멘트 생성
5. conversation.unshift({ kind: 'reveal-comment' })로 맨 위에 삽입
```

중요: 이 코멘트는 main answer가 아니다.

프롬프트:

```text
You are {character.name} in SumGod after both answers have just been revealed.
Now you can see both answers.
Write a short comment/reply about the user answer and the difference or overlap between both answers.
This is not the main answer. It is a post-reveal comment, like a couple app comment thread.
Reply in plain text only, 1-3 natural sentences.
```

RN 구현:

```ts
async function generateRevealComment(state, entry, character) {
  const system = [
    `You are ${character.name} in SumGod after both answers have just been revealed.`,
    `Character profile: ${character.prompt || '(empty)'}`,
    languageInstructionFor(state, character),
    'Now you can see both answers. Write a short comment/reply about the user answer and the difference or overlap between both answers.',
    'This is not the main answer. It is a post-reveal comment, like a couple app comment thread.',
    'Reply in plain text only, 1-3 natural sentences, warm and specific. No JSON, labels, markdown, or metadata.',
    `Append ${SUMGOD_DONE_MARKER} at the very end after final punctuation.`,
  ].join('\n');

  const user = [
    `Q.${entry.number}: ${entry.question}`,
    `${userNameFor(state, character)} answer: ${entry.userAnswer}`,
    `${character.name} answer: ${entry.characterAnswer}`,
    'Write the first post-reveal comment now.',
  ].join('\n\n');

  const raw = await callLLMPlain([{ role: 'system', content: system }, { role: 'user', content: user }]);
  return finishSumGodIfNeeded(raw, system, user);
}

async function ensureRevealComment(state, entryId, force = false) {
  return commitCurrent(async current => {
    const { sum, entry, character } = findSumGodEntry(current, entryId);
    if (!entry?.userAnswer || !entry?.characterAnswer) return current;

    entry.conversation = Array.isArray(entry.conversation) ? entry.conversation : [];
    if (force) entry.conversation = entry.conversation.filter(item => item.kind !== 'reveal-comment');
    if (entry.conversation.some(item => item.kind === 'reveal-comment')) return current;

    const comment = await generateRevealComment(current, entry, character);
    entry.conversation.unshift({
      role: 'character',
      kind: 'reveal-comment',
      text: clipSumGodText(comment, 1000),
      createdAt: Date.now(),
    });

    return replaceEntry(current, entry);
  });
}
```

### Diff

```diff
- 저장 후 characterAnswer만 표시
+ 저장 후 characterAnswer 표시
+ 공개 후 코멘트 conversation[0]에 추가 가능
+ 코멘트 라벨: '답변 공개 후 코멘트'
```

---

# 10. 후속 대화

현재 RN의 추가 대화:

```ts
const replyLine = { from: 'sumgod', body: '그 답변은 오늘 기록 옆에 같이 남겨둘게.' }
```

원본은 LLM으로 생성한다.

프롬프트 핵심:

```text
You are {character.name} continuing a sweet private conversation inside SumGod.
Character profile: ...
Question: ...
User answer: ...
{character.name} answer: ...
Conversation so far: ...
User says: ...
Reply in 2-5 natural complete sentences.
React specifically to the user message and the couple question.
```

RN 구현:

```ts
async function generateSumGodTalkReply(state, entry, character, userText) {
  const history = (entry.conversation || [])
    .slice(-12)
    .map(item => `${item.role === 'user' ? userNameFor(state, character) : character.name}: ${item.text}`)
    .join('\n') || '(none)';

  const system = [
    `You are ${character.name} continuing a sweet private conversation inside SumGod.`,
    `Character profile: ${character.prompt || '(empty)'}`,
    languageInstructionFor(state, character),
    'Reply in plain text only. No JSON, labels, markdown, metadata, or arrays.',
    'Reply in 2-5 natural complete sentences, between 60 and 1000 characters unless the character is intentionally extremely terse.',
    'Never stop mid-sentence. End with natural sentence-final punctuation.',
    `Append ${SUMGOD_DONE_MARKER} at the very end after the final punctuation.`,
    'React specifically to the user message and the couple question. Keep it intimate, conversational, and in character.',
  ].join('\n');

  const user = [
    `Question: ${entry.question}`,
    `User answer: ${entry.userAnswer}`,
    `${character.name} answer: ${entry.characterAnswer}`,
    `Conversation so far:\n${history}`,
    `User says: ${userText}`,
  ].join('\n\n');

  const raw = await callLLMPlain([{ role: 'system', content: system }, { role: 'user', content: user }]);
  return finishSumGodIfNeeded(raw, system, user);
}
```

## UI

후속 대화는 채팅방처럼 보이되, 일반 메신저와는 다른 **일기 카드 내부 대화**로 보여준다.

```text
[답변 공개 후 코멘트]
캐릭터: ...
나: ...
캐릭터: ...
[이 답변에 대해 더 이야기하기 textarea]
[보내기]
```

### 재생성

원본은 캐릭터 대화 bubble을 누르면 해당 답변만 재생성 가능하다.

```text
캐릭터 후속 코멘트 bubble tap
  -> generatingTalkIndex = index
  -> 해당 bubble에 '사랑이 배달되는 중...'
  -> 이전 user 발화를 기준으로 재생성
```

RN에서도 구현한다.

```ts
async function regenerateTalkBubble(entryId: string, index: number) {
  await commitCurrent(current => markTalkGenerating(current, entryId, index));

  const state = getState();
  const { entry, character } = findSumGodEntry(state, entryId);
  const previousUser = [...entry.conversation.slice(0, index)].reverse().find(item => item.role === 'user')?.text || entry.userAnswer || '';
  const reply = await generateSumGodTalkReply(state, entry, character, previousUser);

  await commitCurrent(current => replaceTalkBubble(current, entryId, index, reply));
}
```

---

# 11. 답변 저장 흐름

현재 RN save 흐름:

```text
사용자 answer 저장
-> local generateCharacterAnswer(answer)
-> commitEntries
```

원본 최종 흐름:

```text
사용자 answer 저장
-> entry.userAnswer = answer
-> entry.characterAnswer = ''
-> entry.generatingAnswer = true
-> save/render
-> 캐릭터 private answer LLM 호출
-> entry.characterAnswer = answer
-> entry.generatingAnswer = false
-> completedOn/completedAt 저장
-> reveal comment 생성 가능
-> save/render
```

RN diff:

```diff
async function save() {
- const entry = { ..., answer, characterAnswer: generateCharacterAnswer(answer) };
- await commitEntries([...]);
+ await submitSumGodUserAnswer(entryId, answer);
}
```

```ts
async function submitSumGodUserAnswer(entryId: string, answer: string) {
  const clean = clipSumGodText(answer, 1000);
  if (!clean) return;

  await commitCurrent(current => updateEntry(current, entryId, entry => ({
    ...entry,
    userAnswer: clean,
    characterAnswer: '',
    conversation: (entry.conversation || []).filter(item => item.kind !== 'reveal-comment'),
    generatingAnswer: true,
  })));

  const snapshot = getState();
  const { entry, character } = findSumGodEntry(snapshot, entryId);
  const characterAnswer = await generateSumGodPrivateAnswer(snapshot, entry, character).catch(error => {
    console.warn(error);
    return '지금 내 답변을 제대로 정리하지 못했어. 다시 생성 버튼을 눌러서 내 답변만 다시 받아줘.';
  });

  await commitCurrent(current => updateEntry(current, entryId, entry => ({
    ...entry,
    characterAnswer,
    generatingAnswer: false,
    completedOn: sumGodTodayKey(),
    completedAt: Date.now(),
  })));

  // 선택: 원본처럼 40% 확률 or force 정책
  await maybeCreateRevealComment(entryId, false);
}
```

---

# 12. 캐릭터 답변 재생성

원본에는 `캐릭터 답변만 재생성` 버튼이 있다.

정책:

```text
- userAnswer는 유지
- characterAnswer만 비움
- reveal-comment 제거
- generatingAnswer true
- 새 private answer 생성
- completedOn/completedAt 유지 또는 보정
- reveal comment 다시 생성 가능
```

RN 구현:

```ts
async function regenerateCharacterAnswer(entryId: string) {
  await commitCurrent(current => updateEntry(current, entryId, entry => ({
    ...entry,
    characterAnswer: '',
    conversation: (entry.conversation || []).filter(item => item.kind !== 'reveal-comment'),
    generatingAnswer: true,
  })));

  const snapshot = getState();
  const { entry, character } = findSumGodEntry(snapshot, entryId);
  const answer = await generateSumGodPrivateAnswer(snapshot, entry, character);

  await commitCurrent(current => updateEntry(current, entryId, entry => ({
    ...entry,
    characterAnswer: answer,
    generatingAnswer: false,
    completedOn: entry.completedOn || sumGodTodayKey(),
    completedAt: entry.completedAt || Date.now(),
  })));

  await maybeCreateRevealComment(entryId, false);
}
```

---

# 13. 유저 답변 편집

원본 후반에는 오늘 문답의 유저 답변 편집이 있다.

정책:

```text
- 오늘 문답만 수정 가능
- 수정하면 reveal-comment 제거
- characterAnswer가 없으면 새로 생성
- characterAnswer가 이미 있으면 원본은 reveal comment를 force 재생성
- userAnswerEditedAt 기록
```

RN UX:

```text
내 답변 카드 아래 [답변 수정]
  -> textarea form으로 교체
  -> [수정 저장] [취소]
```

수정 저장:

```ts
async function saveEditedUserAnswer(entryId: string, nextText: string) {
  const clean = clipSumGodText(nextText, 1000);
  if (!clean) return;

  await commitCurrent(current => updateEntry(current, entryId, entry => ({
    ...entry,
    userAnswer: clean,
    userAnswerEditedAt: Date.now(),
    editingUserAnswer: false,
    conversation: (entry.conversation || []).filter(item => item.kind !== 'reveal-comment'),
  })));

  const snapshot = getState();
  const { entry } = findSumGodEntry(snapshot, entryId);

  if (!entry.characterAnswer) {
    await regenerateCharacterAnswer(entryId);
  } else {
    await ensureRevealComment(entryId, true);
  }
}
```

---

# 14. 아카이브

현재 RN 아카이브는 `entries.map`으로 카드 나열 + 보관 상태 정도다. 원본 아카이브는:

```text
- 완료한 문답 목록
- Q 번호
- 질문
- 내 답변
- 캐릭터 답변
- reveal/comment 대화 read-only 삽입
- 문답 이미지 버튼
- 답변 수정 버튼
- 테스트/치트로 다음 문답 열기 버튼
```

RN 추천:

```tsx
<SumGodArchiveScreen>
  <ArchiveHeader />
  <ArchiveActions>
    <Button>오늘로</Button>
    {devMode && <Button>치트: 다음 문답 열기</Button>}
  </ArchiveActions>
  <FlatList
    data={completedEntries}
    renderItem={<SumGodArchiveCard />}
  />
</SumGodArchiveScreen>
```

아카이브 카드는:

```text
Q.12
질문
나: ...
캐릭터: ...
답변 공개 후 코멘트 / 후속대화 read-only
[문답 이미지] [답변 수정]
```

## 아카이브 수정

원본은 아카이브에서 텍스트만 수정한다. 캐릭터 답변을 새로 생성하지 않는다.

```text
저장된 문장만 수정합니다. 캐릭터 답변을 새로 생성하지 않아요.
```

RN에서도 동일하게:

```ts
async function saveArchiveTextEdit(entryId, userAnswer, characterAnswer) {
  await commitCurrent(current => updateEntry(current, entryId, entry => ({
    ...entry,
    userAnswer: clipSumGodText(userAnswer, 1000),
    characterAnswer: clipSumGodText(characterAnswer, 1000),
    archiveEditing: false,
    textEditedAt: Date.now(),
  })));
}
```

---

# 15. 치트 / 테스트 다음 질문 열기

원본에는 배포용에서 debug 버튼을 숨겼지만, 아카이브에는 최종적으로 `치트: 다음 문답 열기`가 남는다.

목적:

```text
- 테스트 중 밤 10시 제한을 기다리지 않음
- 진행 중 문답이 있으면 그 문답으로 이동
- 없으면 다음 질문 강제 생성
```

RN에서는 개발 옵션으로 넣는 것을 추천한다.

```ts
type SumGodConfig = {
  allowCheatNextQuestion?: boolean;
};
```

```ts
async function cheatOpenNextQuestion() {
  await commitCurrent(current => patchSumGod(current, sum => {
    sum.view = 'today';
    sum.questionOpen = true;

    let entry = activeSumGodEntry(sum);
    if (!entry && sum.entries.length < SUMGOD_QUESTIONS.length) {
      entry = createNextEntry(sum, { cheatUnlocked: true });
    }
  }));
}
```

---

# 16. 진행 백업/복원

원본은 SumGod 진행도를 별도 backup storage에 저장한다.

핵심:

```text
- backup score 계산
- 더 진행된 backup이 있으면 복원
- saveState / flushSaveState 시 backup도 저장
- 캐릭터 변경 시 기존 진행도 별도 키에 archive
```

RN에서는 AsyncStorage/MMKV에 별도 key를 둔다.

```ts
const SUMGOD_BACKUP_KEY = 'snsgod_sumgod_backup_v1';

function progressScore(sum: SumGodState) {
  const entries = Array.isArray(sum.entries) ? sum.entries : [];
  const completed = entries.filter(entry => entry.userAnswer || entry.characterAnswer).length;
  const maxNumber = entries.reduce((max, entry, index) => Math.max(max, Number(entry.number) || index + 1), 0);
  return entries.length * 10000 + completed * 100 + maxNumber;
}
```

앱 load:

```ts
async function restoreSumGodProgressIfNeeded(state) {
  const backup = await loadBackup();
  const current = normalizeSumGodProgress(state.config.sumGod || state.sumGod || {});
  if (backup && progressScore(backup) > progressScore(current)) {
    state.config.sumGod = { ...current, ...backup };
  }
  return state;
}
```

저장:

```ts
async function saveSumGodBackup(sum) {
  const snapshot = normalizeSumGodProgress(sum);
  if (!snapshot.entries.length && !snapshot.characterId) return;

  const existing = await loadBackup();
  if (existing && progressScore(existing) > progressScore(snapshot)) return;

  await AsyncStorage.setItem(SUMGOD_BACKUP_KEY, JSON.stringify(snapshot));
}
```

---

# 17. 알림 / 배지

원본 SumGod 배지:

```text
- 활성 entry가 있고 characterAnswer가 없으면 1
- 새 질문을 만들 수 있으면 1
- 아니면 0
```

RN:

```ts
function sumGodBadgeCount(sum: SumGodState, now = new Date()) {
  const active = activeSumGodEntry(sum);
  if (active && !active.characterAnswer) return 1;
  if (canCreateNextEntryNow(sum, now) && questionNumber(sum) <= SUMGOD_QUESTIONS.length) return 1;
  return 0;
}
```

알림:

원본은 reveal comment가 새로 추가되면, SumGod 화면이 보이지 않을 때 알림을 생성한다.

```text
app: 'sumgod'
title: '{character.name} 코멘트'
body: latest comment
collapseKey: 'sumgod:{entry.id}'
```

RN에서도 notifications에 추가한다.

```ts
function pushSumGodNotification(state, entry, character, text) {
  return pushNotification(state, {
    type: 'sumgod',
    app: 'sumgod',
    title: `${character.name || 'SumGod'} 코멘트`,
    body: clipNotification(text, 120),
    target: { app: 'sumgod', entryId: entry.id },
    collapseKey: `sumgod:${entry.id || 'today'}`,
    createdAt: Date.now(),
  });
}
```

---

# 18. 문답 이미지 Export

원본은 문답 하나를 PNG로 렌더링한다.

기능:

```text
[문답 이미지]
  -> Canvas로 Q / 내 답변 / 캐릭터 답변을 카드형 PNG로 그림
  -> image modal preview
  -> 다운로드
```

RN에서는 `react-native-view-shot` 또는 `react-native-skia`를 쓸 수 있다.

권장 간단 구현:

```tsx
<ViewShot ref={shotRef} options={{ format: 'png', quality: 1 }}>
  <SumGodExportCard entry={entry} character={character} userName={userName} />
</ViewShot>
```

```ts
async function exportSumGodEntryImage(entryId: string) {
  const uri = await shotRef.current.capture();
  await Share.open({ url: uri, type: 'image/png' });
}
```

UI 카드 스타일:

```text
- 크림/핑크 종이 배경
- Q 번호 pill
- 질문 큰 글씨
- 내 답변 카드
- 캐릭터 답변 카드
- 아래 작은 SumGod 워터마크
```

---

# 19. 화면 디자인 복각

원본 SumGod는 일반 카카오톡 테마가 아니라 별도의 부드러운 종이/달걀/핑크톤 UI다. 현재 RN의 카드 UI는 너무 단순하다.

## 19.1 색상

```ts
const sumGodColors = {
  bg: '#fff8ee',
  bg2: '#f8e7df',
  paper: '#fffaf0',
  paper2: '#fff4e7',
  pink: '#f6a6b8',
  pink2: '#ffe8ef',
  ink: '#4a3435',
  muted: '#9b7b76',
  border: '#ead1c8',
  border2: '#e8c7c2',
  accent: '#9b4c62',
};
```

## 19.2 메인 레이아웃

```tsx
<SumGodScreen>
  <SumGodHeader />
  <ScrollView>
    <SumGodHeroTitlePicker />
    <SumGodEggButton />
    {entry ? <SumGodQuestionCard /> : <SumGodLockedPanel />}
  </ScrollView>
</SumGodScreen>
```

## 19.3 Hero

```text
[캐릭터 이름 ▼] ♥ [유저 이름]
밤 10시에 하나씩 도착하는 미니 커플 문답
```

모바일:

```text
font-size 34~40
heart 0.82em
underline on character name
```

## 19.4 Egg Button

원본은 달걀 SVG를 쓴다. RN에서는 SVG 라이브러리 또는 이미지 asset으로 구현한다.

```tsx
<Pressable style={styles.eggButton} onPress={openQuestion}>
  <SumGodEggIcon width={150} height={175} />
  <Text style={styles.eggLabel}>{eggLine}</Text>
</Pressable>
```

스타일:

```ts
eggLabel: {
  paddingHorizontal: 16,
  paddingVertical: 12,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: '#edc9d0',
  backgroundColor: '#fffdf7',
  color: '#7b4b55',
  fontWeight: '900',
}
```

## 19.5 Question Card

```text
Q.12 pill
질문 h2
내 답변 textarea 또는 내 답변 카드
캐릭터 답변 loading / 카드
버튼: 캐릭터 답변 재생성, 문답 이미지
후속 대화
```

권장 RN 스타일:

```ts
questionCard: {
  marginHorizontal: 16,
  padding: 22,
  borderRadius: 26,
  borderWidth: 1,
  borderColor: '#ead1c8',
  backgroundColor: 'rgba(255,250,240,0.9)',
  shadowColor: '#a8636c',
  shadowOpacity: 0.13,
  shadowRadius: 24,
  elevation: 3,
}
```

---

# 20. current RN에서 고쳐야 하는 파일별 작업

## 20.1 `src/screens/SumGodScreen.tsx`

현재 이 파일에 너무 많은 로직이 들어있고, 원본 기능과 맞지 않는다.

### 제거/교체

```diff
- const QUESTIONS = [4개]
+ import { SUMGOD_QUESTIONS } from '../logic/sumgodQuestions'

- type SumGodLine = { from: 'user' | 'sumgod' }
+ type SumGodConversationItem = { role: 'user' | 'character'; kind?: 'reveal-comment' | 'talk' }

- answer
+ userAnswer

- generateCharacterAnswer(answer) local stub
+ await sumGodEngine.generatePrivateAnswer(...)

- todayEntry = entries.find(entry => entry.dateKey === today)
+ todayEntry = todaySumGodEntry(sum)

- question = todayEntry?.question || QUESTIONS[new Date().getDate() % QUESTIONS.length]
+ question은 entry가 열린 뒤 entry.question으로만 표시
```

### 화면 분리

```diff
- SumGodScreen 하나에 모든 UI
+ SumGodScreen
+ SumGodTodayView
+ SumGodArchiveView
+ SumGodQuestionCard
+ SumGodConversation
+ SumGodHeroTitlePicker
+ SumGodEggButton
+ SumGodCharacterPickerModal
+ SumGodExportCard
```

---

## 20.2 새 파일: `src/logic/sumgod.ts`

여기에 원본 동작의 핵심 로직을 넣는다.

```ts
export function normalizeSumGodProgress(...)
export function progressScore(...)
export function sumGodTodayKey(...)
export function sumGodCycleStartMs(...)
export function activeSumGodEntry(...)
export function todaySumGodEntry(...)
export function canCreateNextEntryNow(...)
export function createNextEntry(...)
export function openSumGodQuestion(...)
export function submitUserAnswer(...)
export function regenerateCharacterAnswer(...)
export function sendSumGodTalk(...)
export function regenerateSumGodTalk(...)
export function saveEditedUserAnswer(...)
export function archiveEditSave(...)
export function sumGodBadgeCount(...)
```

---

## 20.3 새 파일: `src/logic/sumgodPrompts.ts`

```ts
export function buildPrivateAnswerPrompt(...)
export function buildRevealCommentPrompt(...)
export function buildTalkPrompt(...)
export function buildContinuationPrompt(...)
```

---

## 20.4 새 파일: `src/logic/sumgodQuestions.ts`

```ts
export const SUMGOD_QUESTIONS = [...];
export function isSoftNsfwSumGodQuestion(question: string): boolean;
```

---

## 20.5 `src/types.ts`

추가:

```ts
export type SumGodConversationItem = {
  role: 'user' | 'character';
  text: string;
  createdAt: number;
  kind?: 'reveal-comment' | 'talk';
};

export type SumGodEntry = {
  id: string;
  number: number;
  question: string;
  unlockedOn: string;
  createdAt: number;
  userAnswer: string;
  characterAnswer: string;
  completedOn?: string;
  completedAt?: number;
  conversation: SumGodConversationItem[];
  generatingAnswer?: boolean;
  generatingTalk?: boolean;
  generatingTalkIndex?: number;
  userAnswerEditedAt?: number;
  editingUserAnswer?: boolean;
  archiveEditing?: boolean;
  textEditedAt?: number;
  debugUnlocked?: boolean;
  cheatUnlocked?: boolean;
};

export type SumGodProgress = {
  characterId: string;
  view: 'today' | 'archive';
  questionOpen: boolean;
  entries: SumGodEntry[];
  backedUpAt?: number;
};
```

---

# 21. 반드시 지켜야 할 비동기 state 규칙

이전 채팅 race 문제와 마찬가지로 SumGod도 LLM 호출 중 오래된 state snapshot을 들고 있으면 안 된다.

금지:

```ts
const next = { ...state, sumGod: ... };
await callLLM(...);
await onChange(next); // 오래된 state commit 위험
```

권장:

```ts
await commitCurrent(current => updateEntry(current, entryId, patch));
const snapshot = getState();
const answer = await callLLM(...snapshot...);
await commitCurrent(current => updateEntry(current, entryId, finalPatch));
```

SumGod 답변 생성/후속대화도 background job이므로:

```text
- 화면이 다른 곳으로 이동해도 결과는 entry에 저장
- 갑자기 화면 이동하지 않음
- SumGod 화면이 아니면 알림/배지만 증가
```

---

# 22. 구현 우선순위

## 1차: 원본 핵심 의미 복구

```text
1. 질문 세트 100개로 교체
2. Entry 모델 userAnswer/characterAnswer/number/unlockedOn/completedOn으로 변경
3. 밤 10시 cycle + 첫 질문 즉시 개방 구현
4. 달걀 클릭 questionOpen 흐름 구현
5. 캐릭터 선택 characterId 구현
6. local generateCharacterAnswer 제거
7. private blind answer LLM 구현
8. loading 상태 구현
```

## 2차: 다이어리 앱 느낌 복구

```text
9. 공개 후 코멘트 구현
10. 후속 대화 LLM 구현
11. 후속 캐릭터 말풍선 개별 재생성
12. 아카이브 카드 구현
13. 오늘 답변 편집 구현
14. 아카이브 텍스트 수정 구현
```

## 3차: polish

```text
15. SumGod 아이콘 badge
16. 알림센터 연동
17. 진행 백업/복원
18. 문답 이미지 export
19. 캐릭터 변경 시 기존 진행도 archive
20. 치트 다음 질문은 dev/debug 옵션으로
```

---

# 23. 바이브코딩툴에 넣을 핵심 지시문

아래를 그대로 적용 지시로 던져도 된다.

```text
현재 SumGodScreen은 원본 SumGod 기능을 흉내만 낸 상태다. 원본 복각 기준으로 다음 구조로 전면 재구성한다.

1. SumGod 상태를 SumGodProgress로 정규화한다.
   - characterId, view, questionOpen, entries를 가진다.
   - Entry는 number, question, unlockedOn, userAnswer, characterAnswer, conversation, completedOn, completedAt, generatingAnswer, generatingTalk 등을 가진다.
   - 기존 state.sumGod.entries의 answer는 userAnswer로 migration한다.

2. 질문은 4개가 아니라 원본 최종 SumGod 중립 질문 세트 약 100개를 사용한다.
   - 날짜로 질문을 고르지 말고 entries.length + 1로 다음 질문 번호를 정한다.

3. 질문 개방은 원본처럼 달걀 클릭 기반으로 한다.
   - questionOpen false면 질문 카드를 보여주지 않는다.
   - 첫 질문은 바로 생성 가능하다.
   - 이후 질문은 밤 10시 이후, 22:00~다음날 21:59 cycle 기준 하루 1개만 생성 가능하다.

4. 캐릭터 선택을 구현한다.
   - SumGod characterId가 없으면 첫 캐릭터를 기본 지정한다.
   - 캐릭터 변경 시 기존 진행도를 archive/backup하고 Q.1부터 새로 시작한다.

5. characterAnswer 생성은 local stub을 제거하고 LLM을 호출한다.
   - 중요: 캐릭터는 userAnswer를 볼 수 없는 상태로 같은 질문에 먼저 답해야 한다.
   - prompt에 “You CANNOT see the user answer yet” 규칙을 넣는다.
   - plain text only, no JSON, [[SUMGOD_DONE]] marker, 잘림 보정 구현.

6. 유저 답변 저장 시 흐름:
   - userAnswer 저장
   - generatingAnswer true
   - 화면에 loading 표시
   - LLM으로 characterAnswer 생성
   - completedOn/completedAt 저장
   - 공개 후 코멘트는 확률 또는 force로 생성

7. 공개 후 코멘트를 구현한다.
   - characterAnswer 생성 후 두 답변을 보고 짧은 코멘트를 conversation[0] kind='reveal-comment'로 넣는다.
   - 이 코멘트는 main answer가 아니다.

8. 후속 대화를 구현한다.
   - 사용자가 추가 메시지를 보내면 LLM으로 캐릭터가 답장한다.
   - 고정 문장 사용 금지.
   - 캐릭터 후속 답변 bubble을 누르면 해당 답변만 재생성할 수 있다.

9. UI는 원본 느낌으로 구성한다.
   - Hero: 캐릭터 이름 ♥ 유저 이름
   - 큰 달걀 버튼
   - 크림/핑크 종이 카드
   - Q 번호 pill
   - 내 답변 카드, 캐릭터 답변 카드
   - 답변 공개 후 코멘트 라벨
   - 아카이브 카드

10. 아카이브를 구현한다.
    - 완료 문답 목록
    - 내 답변/캐릭터 답변/후속 코멘트 표시
    - 아카이브 텍스트 수정
    - 문답 이미지 export 버튼

11. 알림/배지
    - 새 질문 가능 또는 캐릭터 답변 대기 시 SumGod badge 1
    - reveal comment가 생기고 SumGod 화면이 아니면 notification 추가

12. 모든 LLM 작업은 오래된 state snapshot commit을 금지한다.
    - commitCurrent(current => patch(current)) 방식으로 최신 state에 patch한다.
    - SumGod 답변 생성 중 다른 채팅/화면 이동이 있어도 state rollback이 없어야 한다.
```

---

# 24. 회귀 테스트 시나리오

## 기본 흐름

```text
1. SumGod 첫 진입
   기대: 캐릭터 ♥ 유저 타이틀, 달걀, 첫 질문 가능 문구.

2. 달걀 클릭
   기대: Q.1 생성, 질문 카드 표시.

3. 답변 작성 후 저장
   기대: 내 답변 카드 표시, 캐릭터 답변 loading 표시.

4. 캐릭터 답변 생성 완료
   기대: 캐릭터 답변 표시, completedAt 저장, 가능하면 공개 후 코멘트 생성.

5. 같은 날 다시 새 질문 시도
   기대: 새 질문 생성 안 됨. 오늘 문답 다시보기만 가능.

6. 다음날 21:59
   기대: 새 질문 잠김.

7. 다음날 22:00
   기대: 새 질문 가능 badge 표시.
```

## 블라인드 답변 테스트

```text
유저 답변: "나는 네가 아침에 연락해줄 때 제일 설레"

잘못된 캐릭터 답변:
  "네가 아침 연락이라고 해줘서..."

정상 캐릭터 답변:
  "나는 하루가 시작되기 전에 서로의 존재를 확인하는 순간이 제일 좋을 것 같아..."

이후 공개 후 코멘트:
  "너도 아침 얘기를 했다는 게 좀 신기하다. 나도 비슷한 쪽을 떠올렸거든."
```

## 후속 대화 테스트

```text
유저: "너는 왜 그 순간이 떠올랐어?"
기대: 캐릭터가 질문/자기 답변/유저 메시지에 맞춰 2~5문장으로 답함.
고정 문장 금지.
```

## state race 테스트

```text
1. SumGod 답변 생성 중 채팅방 이동
2. 다른 캐릭터에게 메시지 전송
3. SumGod 답변 완료

기대:
- 채팅 메시지 사라지지 않음
- 화면 강제 이동 없음
- SumGod entry만 조용히 업데이트
- 필요하면 알림/배지만 증가
```

---

# 25. 최종 체크리스트

- [ ] 질문 100개 세트 적용
- [ ] SumGodProgress 타입 추가
- [ ] 기존 answer -> userAnswer migration
- [ ] characterId 저장/캐릭터 picker
- [ ] 22시 cycle 구현
- [ ] first question immediate, 이후 22시
- [ ] questionOpen + egg UI
- [ ] active/today/locked 상태 분리
- [ ] local stub 답변 제거
- [ ] private blind answer prompt 구현
- [ ] `[[SUMGOD_DONE]]` + continuation 구현
- [ ] generatingAnswer loading UI
- [ ] reveal comment 생성
- [ ] follow-up talk LLM 생성
- [ ] talk bubble 개별 재생성
- [ ] 오늘 답변 편집
- [ ] 아카이브 목록
- [ ] 아카이브 텍스트 수정
- [ ] 이미지 export
- [ ] SumGod badge
- [ ] SumGod notification
- [ ] 진행 backup/restore
- [ ] 캐릭터 변경 시 기존 진행 archive
- [ ] commitCurrent 기반 비동기 안전성

---

# 26. 가장 먼저 고쳐야 할 5개

당장 “흉내” 느낌을 없애려면 다음 5개부터 한다.

```text
1. 4개 질문을 원본 최종 질문 세트로 교체
2. generateCharacterAnswer stub 제거 + LLM private answer 구현
3. 유저 답변을 캐릭터 prompt에 넣지 않는 블라인드 답변 규칙 적용
4. 달걀 클릭 + 밤 10시 cycle 구현
5. 공개 후 코멘트 + 후속 대화 LLM 구현
```

이 5개만 해도 SumGod는 단순 메모장이 아니라 원본처럼 **커플 질문 다이어리 앱**으로 느껴지기 시작한다.
