# SNSGod 전화 통화 UI/연출 Diff 가이드

대상: 현재 구현된 전화 화면(사용자 캡처 기준) + `SNSGod.js`의 phone-call 관련 로직을 바탕으로, **React Native / 앱 UI 기준으로 제대로 보이는 전화 경험**을 재설계하기 위한 상세 가이드.

이 문서는 단순 아이디어 메모가 아니라, **현재 무엇이 잘못되었는지 → 어떤 상태를 추가해야 하는지 → 어떤 컴포넌트 구조로 바꿔야 하는지 → 어떤 애니메이션과 폰트 크기를 써야 하는지 → 프롬프트 계약은 어떻게 해야 하는지**를 diff 수준으로 정리한 문서다.

---

## 0. 한 줄 결론

현재 구현은 **“통화형 비주얼 노벨”과 “메신저형 통화 UI”가 중간에서 섞여서** 이상해졌다.

핵심 문제는 다음 3개다.

1. **캐릭터 발화와 사용자 발화가 transcript 형태로 누적되지 않는다.**  
   그래서 화면상 “누가 무슨 말을 했는지”가 보이지 않고, 매 턴마다 한 칸의 텍스트만 바뀌는 느낌이 된다.

2. **선택지/직접입력/말하기 버튼의 역할이 분리되지 않았다.**  
   `말 걸기`는 라벨 의미가 모호하고, 통화 맥락에서는 `보내기` 혹은 `전송`이어야 한다.

3. **현재 화면 레이아웃이 ‘전화 통화’처럼 보이지 않는다.**  
   상단 인물, 중앙 대사, 하단 선택지/입력/종료의 우선순위가 섞여 있고, 통화 중 대화 흐름이 시각적으로 남지 않는다.

즉, 지금 필요한 것은 단순 CSS 수정이 아니라 **상태 모델 + transcript 렌더링 + 입력 방식 재정의 + 애니메이션 체계 정리**다.

---

## 1. 현재 구현에서 보이는 구조적 문제

### 1-1. 현재 오버레이가 transcript를 렌더링하지 않음

현재 기본 오버레이는 아래 요소만 렌더링한다.

- 닫기 버튼
- 아바타
- 이름 / 상태
- 단일 발화 박스 `mg-phone-line`
- 선택지 영역 `mg-phone-choices`

즉 **통화 내역 리스트가 없다.**  
코드상으로는 `mgPhoneCall.transcript`에 사용자/캐릭터 발화를 계속 push하고 있지만, 오버레이는 그 배열을 화면에 그리지 않는다.

```js
mgPhoneCall = { open: true, roomId, characterId, initiator, transcript: [], line: '', displayLine: '', options: [], loading: true, typing: false };
```

그리고 실제 렌더링은 아래처럼 단일 라인 영역 하나만 쓴다.

```js
<div class="mg-phone-line" id="mg-phone-line">...</div>
<div class="mg-phone-choices">...</div>
```

즉 **데이터는 누적되는데 UI는 누적 표시를 안 한다**는 게 가장 큰 문제다.

---

### 1-2. 사용자 발화가 화면에 “보이는 메시지”로 남지 않음

현재 턴 생성 로직에서는 사용자가 선택지를 누르면 transcript에는 들어간다.

```js
if (userChoice) mgPhoneCall.transcript.push({ role: 'user', text: userChoice });
```

하지만 그 직후 UI에는 사용자 메시지 버블이 생성되지 않고, 곧바로 `loading` 상태가 되면서 선택지가 사라진 뒤 캐릭터 대사 생성으로 넘어간다.

그 결과 사용자는 다음처럼 느낀다.

- 내가 무엇을 말했는지 화면에 없음
- 선택지를 눌렀는데 “내 말”이 보이지 않음
- 바로 상대 대사로 넘어가서 흐름이 끊김

이건 체감상 매우 어색하다.

---

### 1-3. 캐릭터 대사가 ‘대화’가 아니라 ‘상태 문구’처럼 보임

현재 `mgStartPhoneTypewriter()`는 단일 텍스트 박스에 타이핑만 한다.  
후반부 패치에서는 여러 줄을 순차 재생하지만, 여전히 **단일 텍스트 박스 안에만 재생**된다.

즉 화면상:

- 캐릭터의 여러 문장이 **대화 로그**처럼 쌓이지 않고
- “현재 발화 중인 대사 1개”만 보인다.

이 방식은 **비주얼 노벨식 단문 낭독 UI**에는 맞아도, 사용자가 기대하는 **‘전화 대화 UI’**에는 맞지 않는다.

---

### 1-4. `말 걸기` 버튼 라벨이 기능과 맞지 않음

사용자 캡처 기준 하단에:

- `직접 답변` 입력창
- `말 걸기` 버튼
- `끊기` 버튼

이렇게 보이는데, 여기서 `말 걸기`는 의미가 불명확하다.

통화 중 직접 입력을 전송하는 행위라면 버튼 라벨은 아래 중 하나여야 한다.

- `보내기`
- `전송`
- 종이비행기 아이콘만 사용
- 또는 음성 컨셉이면 `말하기`, `응답하기`

하지만 현재 `말 걸기`는:

- 이미 통화가 연결된 상태에서 어색하고
- 시스템 액션인지, 직접 입력 전송인지 불명확하며
- 선택지 UI와도 역할이 겹친다.

**결론: `말 걸기`는 제거하거나 `보내기`로 교체해야 한다.**

---

### 1-5. 현재 화면은 통화 UI와 채팅 UI가 섞여 있음

캡처 화면을 보면:

- 상단은 전화 오버레이처럼 보이는데
- 중앙은 비주얼 노벨처럼 한 덩어리 텍스트를 보여주고
- 하단은 메신저 입력창처럼 생겼고
- 선택지는 회색 대사풍 버튼처럼 떠 있음

즉 한 화면에 **전화 화면 / 채팅 화면 / 인터랙티브 소설 화면**이 섞여 있다.

따라서 먼저 아래 중 하나를 선택해야 한다.

### 권장 방향

**“전화 통화 기반 인터랙티브 챗 UI”**로 정리할 것.

즉:

- 상단: 통화 중인 상대 정보
- 중단: 통화 transcript (상대/내 말이 누적)
- 하단: 선택지 또는 직접 입력
- 최하단: 끊기

이 구조로 통일하는 게 가장 자연스럽다.

---

## 2. 목표 UX: 통화 화면을 어떻게 정의할 것인가

전화 화면은 아래 4단계로 나눠야 한다.

1. **수신 전/발신 전 단계**
2. **연결 중 단계**
3. **실시간 통화 대화 단계**
4. **종료 단계**

---

## 3. 반드시 바꿔야 하는 핵심 Diff

## Diff A. 단일 발화 박스 → transcript 리스트 구조로 변경

```diff
- 중앙에 단일 텍스트 박스 1개만 둔다
+ 중앙에 ScrollView 기반 transcript 리스트를 둔다
+ 캐릭터 발화 / 사용자 발화를 각각 버블 또는 카드로 누적 표시한다
+ 현재 타이핑 중인 캐릭터 발화는 마지막 item에서 애니메이션으로 보여준다
```

### 이유

통화는 “말이 오간 기록”이 핵심이다.  
지금처럼 마지막 대사만 보이면 사용자는 맥락을 잃는다.

### 권장 transcript item 타입

```ts
type PhoneTranscriptItem = {
  id: string;
  role: 'character' | 'user' | 'system';
  text: string;
  phase?: 'sent' | 'typing' | 'done';
  createdAt: number;
};
```

### 시각적 표현

- `character`: 왼쪽 정렬, 어두운 반투명 버블
- `user`: 오른쪽 정렬, 밝은 강조 버블
- `system`: 가운데 정렬, 작은 상태 라벨 (`연결 중...`, `통화 종료 중`)

---

## Diff B. 선택지 선택 직후 사용자 메시지를 즉시 화면에 보여주기

```diff
- 선택지 누름 → 바로 loading → 상대 답변 생성
+ 선택지 누름 → 내 메시지 버블 즉시 추가 → 120~180ms 후 상대 응답 생성 시작
```

### 이유

사용자는 자신이 방금 한 말을 “시각적으로 확인”해야 한다.  
이게 없으면 입력 반응이 없는 것처럼 느낀다.

### 권장 흐름

```text
선택지 버튼 탭
-> 버튼 눌림 애니메이션 80ms
-> 해당 문구를 user transcript로 push
-> 선택지 fade out
-> 상태 라벨: "상대가 듣는 중..."
-> 150ms 뒤 LLM 호출
-> 캐릭터 답변 타이핑 시작
```

---

## Diff C. 직접 입력은 보조 입력으로 분리

```diff
- 기본 화면에서 큰 입력창 + 큰 '말 걸기' 버튼 노출
+ 기본은 선택지 중심
+ 직접 입력은 '직접 답하기' 토글 또는 입력창 펼침 방식으로 보조 제공
+ 직접 입력 전송 버튼 라벨은 '보내기'
```

### 권장 이유

전화형 인터랙션에서는 선택지가 핵심 UX고, 직접 입력은 “원할 때만” 쓰는 보조 수단이 더 깔끔하다.

### 권장 UI 2안

#### A안 (가장 추천)
- 기본: 선택지 2~3개만 보임
- 선택지 아래 작은 텍스트 버튼: `직접 답하기`
- 누르면 입력창 확장
- 전송 후 다시 입력창 접힘

#### B안
- 입력창은 항상 보이되 높이를 작게
- placeholder는 `직접 답변 입력...`
- 오른쪽 작은 보내기 버튼만 제공

### 비추천
- 흰색 큰 버튼에 `말 걸기`
- 선택지와 직접입력 액션을 동시에 강한 CTA로 노출

---

## Diff D. 캐릭터 대사는 “한 박스 교체형”이 아니라 “마지막 발화 item 타이핑형”으로 바꾸기

```diff
- mg-phone-line 단일 영역에 문자열 전체를 타이핑
+ transcript의 마지막 character item에 타이핑 애니메이션을 적용
+ 문장이 2~4줄이면 한 item 안에서 줄 단위 또는 문장 단위로 노출
```

### 권장 표현 방식

#### 방식 1: 한 bubble 안에서 문자 타이핑
- 마지막 character bubble 생성
- 빈 텍스트로 시작
- 24~34ms 간격으로 한 글자씩 채움
- 완료 후 다음 선택지 등장

#### 방식 2: 문장 단위 reveal
- 캐릭터 lines 2~4개를 배열로 받음
- 한 bubble 안에서 첫 줄 출력
- 500~800ms 후 다음 줄 append
- 모든 줄 출력 완료 후 선택지 등장

### 추천
**문장 단위 reveal**이 전화 통화 느낌에 더 잘 맞음.

예시:

```text
정선:
“당연히 정선이 생각하고 있었지.”
(0.7초)
“무슨 일 있었어?”
(0.6초)
“목소리 들으니까 좋다.”
```

이 방식이 지금처럼 텍스트 박스가 통째로 바뀌는 것보다 훨씬 자연스럽다.

---

## Diff E. 하단 액션 우선순위 재정리

```diff
- 선택지 / 직접입력 / 말 걸기 / 끊기 모두 같은 레벨에서 경쟁
+ 1순위: 상대/내 대화 흐름
+ 2순위: 사용자 응답 방식(선택지 or 직접입력)
+ 3순위: 통화 종료
```

### 권장 하단 계층

1. transcript
2. 선택지 or 입력영역
3. 하단 고정 끊기 버튼

### 중요
`끊기`는 항상 쉽게 보여야 하지만, **화면에서 가장 시끄러운 요소가 되어서는 안 된다.**

즉:

- `끊기`는 fixed bottom button or bottom pill
- 선택지보다 시각적 강조를 약간 낮추거나 같은 수준
- 빨강 계열은 유지하되 너무 과도하게 튀지 않게 조정

---

## 4. 권장 화면 구조 (RN 기준)

```tsx
<PhoneCallScreen>
  <BlurredBackground />
  <SafeAreaView>
    <PhoneHeader />
    <CallHero />
    <CallStatusBar />
    <PhoneTranscriptList />
    <PhoneReplyArea />
    <HangupButton />
  </SafeAreaView>
</PhoneCallScreen>
```

---

## 5. 컴포넌트별 상세 연출 가이드

## 5-1. PhoneHeader

### 구성
- 좌측: 뒤로/최소화(선택)
- 중앙: `SNSGod 통화` 또는 `통화 중`
- 우측: 더보기 또는 닫기

### 추천 폰트/크기
- 타이틀: 15~16sp, semi-bold
- 보조 상태: 11~12sp

### 권장 스타일
- 높이: 44~48dp
- 배경: 투명 또는 아주 얕은 블러
- 상단 마진: safe area 반영

### 주의
현재 캡처처럼 제목이 너무 중간에 떠 보이면 안 된다.  
Header는 **명시적인 상단 bar**여야 한다.

---

## 5-2. CallHero (상단 인물 영역)

### 구성
- 원형 프로필 이미지
- 캐릭터 이름
- 상태 문구 (`연결 중`, `통화 중`, `듣는 중`, `통화 종료 중`)

### 추천 크기
- 프로필: 96dp ~ 120dp
- 이름: 28~34sp, bold
- 상태: 14~16sp, medium

### 추천 간격
- 프로필 아래 이름: 16dp
- 이름 아래 상태: 6dp
- Hero 전체 세로 여백: 20~28dp

### 애니메이션
- idle 상태: 3.5~5초 주기 아주 미세한 float
- speaking 상태: 외곽 링 pulse
- listening 상태: pulse 약화

### speaking ring 예시
- scale 1.0 → 1.06 → 1.0
- opacity 0.20 → 0.05 → 0.20
- duration 1800ms loop

---

## 5-3. CallStatusBar

Hero 아래 작은 상태 바를 추가하는 것을 권장.

예시 문구:
- `통화 연결됨 · 00:13`
- `상대가 말하는 중...`
- `내 응답을 기다리는 중`
- `직접 입력 모드`

### 폰트
- 12~13sp
- medium

### 색상
- 흰색 70~78% opacity

---

## 5-4. PhoneTranscriptList (핵심)

이 영역이 가장 중요하다.

### 레이아웃
- Hero 아래에서 하단 입력영역 위까지 차지
- `FlatList` 또는 `ScrollView`
- 새 메시지 추가 시 자동 스크롤

### 버블 스타일

#### 캐릭터 버블
- 정렬: left
- 최대 너비: 화면의 76%
- 배경: `rgba(57, 71, 89, 0.86)` 또는 유사 톤
- radius: 20dp
- padding: 14dp vertical / 16dp horizontal
- 본문 폰트: 16~18sp
- line-height: 24~28sp

#### 사용자 버블
- 정렬: right
- 최대 너비: 72%
- 배경: 노랑/크림 계열 강조 (`#F3DD72` 계열)
- radius: 20dp
- padding: 14dp / 16dp
- 본문 폰트: 16~18sp
- line-height: 24~28sp
- 글자색: 거의 검정

#### 시스템 라벨
- 가운데 정렬
- 작고 반투명
- 예: `정선이 말하는 중...`
- 폰트 12~13sp

### 메시지 사이 간격
- 같은 화자 연속: 8dp
- 화자 변경: 12~14dp
- 섹션 여백(연결 시작/종료): 18dp

### 반드시 들어가야 할 메타 정보
작게라도 아래 중 하나는 권장.
- 최근 메시지 옆 `방금`
- 혹은 하단에 매우 작게 시간 `오후 7:13`
- 또는 통화 duration만 상단에 노출하고 개별 시각은 생략

**전화 UI에서는 개별 시각 생략도 가능**하다. 대신 duration이 중요하다.

---

## 5-5. 사용자 응답 영역

사용자 응답은 **선택지 모드**와 **직접 입력 모드**로 나눠야 한다.

### 모드 1: 선택지 모드 (기본)

#### 구성
- 선택지 2~3개
- 세로 스택
- 각 버튼 48~56dp 높이

#### 폰트
- 15~16sp
- semi-bold or medium

#### 스타일
- 배경: 밝은 회색 / 흰색
- 글자색: 진회색
- radius: 18~22dp
- 좌우 padding: 16dp
- 버튼 간 gap: 10dp

#### 인터랙션
- tap down: scale 0.98, 70ms
- tap up: scale 1.0, 100ms
- 선택 후 버튼 전체 fade out 120ms

#### 중요
선택지를 **말풍선처럼 보이게 할지**, **버튼처럼 보이게 할지**는 하나로 통일해야 한다.  
권장은 **버튼으로 보이게** 하는 것이다.

---

### 모드 2: 직접 입력 모드

#### 구성
- 입력창 1줄~최대 3줄 자동확장
- 우측 `보내기` 아이콘 버튼
- 좌측/하단 `선택지로 돌아가기` 텍스트 버튼

#### placeholder
- `직접 답변 입력...`
- `하고 싶은 말을 직접 입력...`

#### 폰트
- 입력 본문: 15~16sp
- placeholder: 15sp

#### 입력창 스타일
- min-height: 44~48dp
- max-height: 96dp
- border-radius: 18~20dp
- 좌우 padding: 14~16dp
- 배경: `rgba(255,255,255,0.12)` 또는 밝은 카드

#### 전송 버튼
- 라벨: `보내기`
- 또는 종이비행기 아이콘
- 크기: 40~44dp 정사각

### 강한 권장
```diff
- '말 걸기'
+ '보내기'
```

---

## 5-6. HangupButton

### 배치
- 하단 가장 아래 고정
- safe area 포함
- transcript/입력영역과 시각적으로 분리

### 크기
- 높이: 52~58dp
- radius: 24~28dp
- 좌우 여백: 20~24dp

### 색상
- 배경: `#FF6B6B` 계열
- 텍스트: 흰색
- 폰트: 17sp, bold

### 라벨
- `끊기`
- `통화 종료`

### 애니메이션
- 탭 시 scale 0.98 → 1.0
- 종료 시 화면 전체 brightness 100% → 92% → fade out

---

## 6. 상태 머신 설계

전화 UI는 상태가 명확해야 한다.

```ts
type PhoneUiPhase =
  | 'incoming'
  | 'connecting'
  | 'connected_idle'
  | 'character_typing'
  | 'awaiting_user'
  | 'user_sending'
  | 'ending'
  | 'ended';
```

### 권장 전이

```text
incoming
 -> accept
connecting
 -> first line requested
character_typing
 -> last character line done
awaiting_user
 -> user taps choice / sends input
user_sending
 -> llm call
character_typing
 -> user ends call
ending
 -> ended
```

### 왜 필요한가
현재 구현은 `loading`, `typing`, `ending` 정도만 있어 UI 분기가 부족하다.  
직접입력/선택지/연결중/캐릭터 발화중/사용자 응답대기 상태를 분리해야 연출이 깨끗해진다.

---

## 7. 데이터 모델 Diff

```diff
 type PhoneCallSession = {
   open: boolean;
   roomId: string;
   characterId: string;
   initiator: 'user' | 'character';
   transcript: Array<{ role: 'user' | 'character'; text: string }>;
   line: string;
   displayLine: string;
   options: string[];
   loading: boolean;
   typing: boolean;
+  phase: 'connecting' | 'character_typing' | 'awaiting_user' | 'user_sending' | 'ending';
+  transcriptItems: PhoneTranscriptItem[];
+  inputMode: 'choices' | 'text';
+  draftText: string;
+  speakingCharacterMessageId?: string;
+  callStartedAt?: number;
+  connectedAt?: number;
+  durationSec?: number;
 }
```

### 핵심
`transcript`는 LLM 컨텍스트용으로 두고,  
실제 UI용은 `transcriptItems`를 별도로 두는 편이 안전하다.

이유:
- typewriter 중간 상태를 표시해야 함
- phase를 각 item에 붙여야 함
- UI item에는 id, time, animation state 등이 더 필요함

---

## 8. 실제 상호작용 플로우 상세

## 8-1. 통화 시작

### 사용자가 발신

```text
프로필 > 통화 탭
-> call screen 진입
-> phase = connecting
-> 시스템 라벨 "연결 중..."
-> 450~900ms 랜덤 딜레이
-> 시스템 라벨 "통화 연결됨"
-> character first turn request
```

### 수신 전화

별도 incoming UI를 두는 것이 가장 좋다.

#### incoming screen 구성
- 프로필 이미지 크게
- 이름
- `수신 전화`
- 작은 설명 line (`문자로는 애매해서, 잠깐 받을래?`)
- 하단 `받기` / `거절`

#### 부재중 처리
- 12~15초 무응답 → `부재중 전화`
- 채팅에 phoneLog message 삽입

---

## 8-2. 캐릭터 첫 대사 표시

권장 흐름:

```text
연결됨
-> transcript에 system item 추가: "통화 연결됨"
-> character 빈 bubble 생성
-> 첫 문장 타이핑/reveal
-> 문장 사이 450~800ms pause
-> 전체 완료
-> 선택지 등장
```

### 매우 중요
선택지는 **캐릭터 발화가 끝난 뒤** 등장해야 한다.  
지금처럼 통화중/듣는중 문구만 보여주고 선택지가 갑자기 뜨는 것은 완성도가 떨어진다.

---

## 8-3. 사용자 선택지 탭

권장 흐름:

```text
사용자 탭
-> tapped choice 강조
-> 나머지 choice 100ms fade
-> user bubble 생성
-> bubble slide-in-right 160ms
-> phase = user_sending
-> 상태 라벨: "정선이 듣는 중..."
-> 120~180ms 후 LLM 호출
-> phase = character_typing
```

---

## 8-4. 직접 입력 전송

직접 입력도 선택지와 동일한 흐름으로 처리한다.

```text
send
-> draft trim
-> empty면 무시
-> user bubble append
-> 입력창 clear
-> inputMode 유지 또는 choices 복귀
-> 상태 라벨: "정선이 답하는 중..."
-> LLM 호출
```

### 권장 UX
직접 입력 전송 후에는:
- 기본적으로 `choices` 모드로 자동 복귀 or
- 계속 text mode 유지

둘 다 가능하지만, **기본은 choices 복귀**가 더 정돈된 UX다.

---

## 8-5. 통화 종료

### 사용자가 끊기

```text
끊기 버튼 탭
-> phase = ending
-> 상태 라벨: "통화 종료 중..."
-> 캐릭터 마지막 한 마디 생성 (선택)
-> 마지막 character bubble append
-> 800~1200ms 후 overlay dismiss
-> 채팅에 통화 기록 로그 저장
```

### 추천 마지막 마디 예시
- `알겠어. 이따 다시 연락할게.`
- `응, 조심히 들어가.`

### 종료 후 로그
- `통화 기록 03:21`
- 선택적으로 요약 저장

---

## 9. 프롬프트 계약 가이드

현재 전화 턴 생성 프롬프트는 JSON `line` 또는 `lines` + `choices`를 요구하는 방향이 이미 맞다.  
다만 UI를 제대로 살리려면 프롬프트 계약을 좀 더 명확히 해야 한다.

---

## 9-1. 추천 초기 턴 계약

```text
Return JSON only.
Schema:
{
  "lines": ["character spoken line 1", "character spoken line 2", "character spoken line 3"],
  "choices": ["user reply option 1", "user reply option 2", "user reply option 3"]
}

Rules:
- lines must contain 2-4 short spoken lines.
- Each line must sound natural for live phone speech.
- No narration.
- No action descriptions.
- Do not include speaker labels.
- choices must be concise, varied, and directly reply to the spoken lines.
- Keep emotional continuity with prior chat and call history.
```

---

## 9-2. 추천 후속 턴 계약

```text
The user selected or said: "..."
Continue the live phone call.
Return JSON only.
Schema:
{
  "lines": ["...", "..."],
  "choices": ["...", "...", "..."]
}

Rules:
- The character should speak for 2-4 short lines before waiting.
- Use specific callbacks to the previous message.
- Avoid generic filler.
- Do not end the call unless the user clearly chooses to end it.
```

---

## 9-3. 직접 입력 대응 계약

직접 입력이 선택지보다 자유도가 높기 때문에 아래를 추가하라.

```text
If the user's input is emotionally ambiguous, infer the most natural conversational intent.
Do not treat the input as narration.
Treat it as spoken phone dialogue.
```

---

## 9-4. 종료 시 마지막 대사 계약

```text
Return JSON only.
Schema: {"line": "one brief in-character goodbye line"}
Rules:
- One short spoken line only.
- No narration.
- No choices.
- Emotionally consistent with the call tone.
```

---

## 10. 구체적인 RN 화면 수치 제안

## 전체 레이아웃
- 좌우 화면 padding: 20dp
- 상단 safe area 이후 header: 8dp
- hero와 transcript 사이: 18dp
- transcript 하단과 reply area 사이: 14dp
- reply area와 hangup 사이: 12dp
- 하단 safe area 포함 여백: 12~16dp

---

## 폰트 스케일 요약

| 요소 | 권장 크기 |
|---|---:|
| 상단 헤더 타이틀 | 15~16sp |
| 캐릭터 이름 | 28~34sp |
| 상태 문구 | 14~16sp |
| transcript 본문 | 16~18sp |
| transcript 줄간격 | 24~28sp |
| 선택지 버튼 텍스트 | 15~16sp |
| 입력창 텍스트 | 15~16sp |
| 입력 placeholder | 15sp |
| 끊기 버튼 텍스트 | 17sp |
| 시스템 라벨 | 12~13sp |

---

## 버블/버튼 크기

| 요소 | 권장 값 |
|---|---:|
| 선택지 버튼 최소 높이 | 48dp |
| 입력창 최소 높이 | 46dp |
| 끊기 버튼 높이 | 54dp |
| 버블 radius | 20dp |
| 선택지 radius | 18~22dp |
| 프로필 이미지 | 96~120dp |

---

## 11. 애니메이션 상세 가이드

## 11-1. 화면 진입
- overlay fade in: 180ms
- background blur/parallax: 220ms
- hero scale: 0.96 → 1.0, 220ms

## 11-2. 메시지 등장

### 캐릭터 메시지
- bubble opacity 0 → 1, 120ms
- translateY 8 → 0, 160ms
- 이후 typewriter or sentence reveal

### 사용자 메시지
- bubble opacity 0 → 1, 90ms
- translateX 12 → 0, 150ms

## 11-3. 선택지 등장
- 캐릭터 마지막 대사 완료 후 150ms delay
- 각 버튼 stagger 40ms
- opacity 0 → 1
- translateY 10 → 0

## 11-4. 입력 전환
- `직접 답하기` 탭 시 입력창 expand 180ms
- 키보드 대응 시 reply area safe reposition

## 11-5. 종료
- 상태 라벨 `통화 종료 중...`
- 마지막 대사 표시
- 0.8~1.2초 유지
- overlay fade out 220ms

---

## 12. 구현 우선순위

가장 먼저 해야 할 것부터 순서대로 정리하면:

### 1순위
1. transcript 리스트 추가
2. 사용자 메시지 즉시 반영
3. 캐릭터 메시지 누적 표시
4. `말 걸기` 제거/교체

### 2순위
5. 선택지 모드 / 직접입력 모드 분리
6. phase 상태 추가
7. 하단 고정 `끊기` 버튼 정리

### 3순위
8. 문장 단위 reveal 애니메이션
9. 통화 duration / status bar
10. 수신 전화 전용 화면

---

## 13. 추천 최종 UI 시나리오

### 연결 직후
- 상단: `SNSGod 통화`
- 중앙: 정선 프로필 / 이름 / `통화 연결됨`
- transcript 첫 줄: `통화 연결됨`
- 캐릭터 버블이 2~3문장 말함
- 이후 선택지 3개 등장

### 사용자가 선택지 탭
- 선택지 누른 문구가 오른쪽 노란 버블로 들어감
- 상태: `정선이 답하는 중...`
- 정선 새 버블이 왼쪽에 생성되고 대사가 순차 표시됨

### 직접 답변 사용
- `직접 답하기` 눌러 입력창 펼침
- 텍스트 입력 후 `보내기`
- 오른쪽 버블 생성
- 다시 캐릭터 응답

### 종료
- `통화 종료`
- 정선 마지막 한마디
- fade out
- 채팅방에 `통화 기록 02:41`

---

## 14. RN 구현용 pseudo-code

```ts
function onPressChoice(choice: string) {
  if (!session || session.phase !== 'awaiting_user') return;

  appendTranscriptItem({
    id: uuid(),
    role: 'user',
    text: choice,
    phase: 'done',
    createdAt: Date.now(),
  });

  session.transcript.push({ role: 'user', text: choice });
  session.phase = 'user_sending';
  session.options = [];
  render();

  setTimeout(() => {
    requestCharacterTurn(choice);
  }, 140);
}
```

```ts
async function requestCharacterTurn(userText: string) {
  session.phase = 'character_typing';

  const charItemId = uuid();
  appendTranscriptItem({
    id: charItemId,
    role: 'character',
    text: '',
    phase: 'typing',
    createdAt: Date.now(),
  });

  const turn = await getPhoneTurnFromLLM(userText);

  await revealCharacterLines(charItemId, turn.lines);

  session.transcript.push({ role: 'character', text: turn.lines.join('\n') });
  session.options = turn.choices;
  session.phase = 'awaiting_user';
  markTranscriptDone(charItemId);
  render();
}
```

---

## 15. 지금 화면을 기준으로 한 직접 수정 요약

```diff
- '말 걸기' 큰 버튼 유지
+ 삭제 또는 '보내기'로 교체

- 캐릭터 대사를 단일 중앙 박스에서만 노출
+ transcript 리스트에서 character bubble로 누적 노출

- 사용자 선택지 클릭 후 시각적 반영 없음
+ 클릭 즉시 user bubble 추가

- 선택지/직접입력/종료 버튼이 모두 경쟁
+ 선택지 중심 + 직접입력 보조 + 종료는 하단 고정

- 화면이 전화/채팅/VN UI가 섞여 있음
+ 전화형 인터랙티브 transcript 구조로 통일
```

---

## 16. 최종 권장안

가장 추천하는 최종 형태는 아래다.

### 추천 최종 구조
- 상단 Hero는 유지
- 중앙은 **반드시 transcript 스크롤 리스트**
- 기본 응답은 **선택지 2~3개**
- 직접 입력은 **보조 모드**
- `말 걸기`는 없애고 `보내기`로 통일
- 캐릭터/유저 발화는 모두 버블로 누적
- 캐릭터 대사는 문장 단위 reveal
- 종료는 하단 고정 `끊기`

이렇게 바꾸면 사용자가 느끼는 인상도 완전히 달라진다.

지금 화면은 “데모 같은 느낌”이 강하지만, 위 구조로 가면 **정식 앱 통화 인터랙션처럼 보이기 시작한다.**

---

## 17. 아주 짧은 실행 체크리스트

- [ ] transcript 리스트 추가
- [ ] `transcriptItems` 상태 분리
- [ ] choice 탭 즉시 user bubble append
- [ ] character typing을 마지막 bubble에 적용
- [ ] `말 걸기` → `보내기`
- [ ] direct input은 접기/펼치기 보조 모드로 변경
- [ ] phase 상태 추가
- [ ] 연결/응답대기/종료 상태 라벨 정리
- [ ] 하단 `끊기` 버튼 고정
- [ ] 통화 종료 후 log 저장

---

필요하면 다음 단계로 이어서 작성 가능:

1. **이 가이드를 바탕으로 한 React Native 컴포넌트 구조/코드 스켈레톤**  
2. **현재 SNSGod.js 전화 파트를 RN 상태관리(Zustand/Redux)용으로 재설계한 설계서**  
3. **직접 적용 가능한 CSS/StyleSheet 값 샘플**  
4. **선택지/직접입력/수신전화까지 포함한 전체 플로우 다이어그램**
