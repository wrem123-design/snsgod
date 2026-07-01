# ETC 메뉴: 블라인드 데이트 / AI 캐릭터 발견 시스템 구현 가이드

## 0. 기능 한 줄 정의

**블라인드 데이트**는 사용자가 직접 캐릭터를 처음부터 만드는 대신, AI가 만든 후보 3~5명 또는 월드컵용 8명을 비교하고, 질문·답변·프로필 이미지·짧은 데이트 이벤트를 통해 마음에 드는 인물을 고른 뒤, 그 인물을 정식 캐릭터로 가져오는 ETC 메뉴용 미니게임 기능이다.

핵심은 단순 랜덤 캐릭터 생성이 아니라 아래 흐름이다.

```text
AI 후보 생성
→ 프로필/첫 DM/답변/이미지 비교
→ 사용자가 취향에 맞는 후보 선택
→ 최종 후보와 1:1 짧은 데이트 이벤트
→ 마음에 들면 정식 캐릭터로 가져오기
→ 이후 메신저/SNS/통화/만남 이벤트에서 이어짐
```

---

## 1. ETC 메뉴 내 위치와 기능 구조

### 메뉴명 추천

```text
ETC > 블라인드 데이트
```

### 서브 카피 추천

```text
AI가 만든 후보들 중 마음에 드는 사람을 골라보세요.
```

### ETC 메뉴 카드 문구

```text
블라인드 데이트
AI 후보를 비교하고, 최종 선택한 사람을 캐릭터로 가져와요.
```

### 기능 모드

1. **프로필 소개팅**
   - AI가 후보 3~5명을 생성
   - 이름, 나이, 직업, 성격, 말투, 취향, 프로필 사진 공개
   - 마음에 드는 후보를 골라 짧은 1:1 데이트 후 캐릭터로 저장

2. **블라인드 질문 소개팅**
   - 후보 3~5명을 생성하지만 처음에는 정체/이미지 숨김
   - 사용자가 질문을 하면 후보들이 익명으로 답변
   - 5~10라운드 후 가장 많이 선택된 후보 공개
   - 최종 후보를 캐릭터로 저장

3. **이상형 월드컵**
   - 후보 8명 생성
   - 1:1 대결 방식으로 선택
   - 라운드별 비교 기준을 바꿈
   - 최종 우승자와 짧은 데이트 이벤트 후 저장

4. **로테이션 데이트**
   - 후보 3~5명과 각각 3턴씩 짧게 대화
   - 대화 후 호감도/궁합 점수 산출
   - 마음에 드는 후보 저장

### MVP 추천

1차 구현은 아래 2개만 추천한다.

```text
1. 프로필 소개팅
2. 블라인드 질문 소개팅
```

이상형 월드컵과 로테이션 데이트는 2차 기능으로 빼도 된다.

---

## 2. 전체 플로우

### A. 프로필 소개팅 플로우

```text
ETC > 블라인드 데이트 진입
→ 모드 선택: 프로필 소개팅
→ 후보 수 선택: 3명 / 5명
→ AI 후보 생성
→ 후보 카드 목록 표시
→ 후보 상세 보기
→ 마음에 드는 후보 선택
→ 짧은 1:1 데이트 이벤트
→ 캐릭터로 가져오기
→ 채팅방 생성 또는 캐릭터 보관함 저장
```

### B. 블라인드 질문 소개팅 플로우

```text
ETC > 블라인드 데이트 진입
→ 모드 선택: 블라인드 질문 소개팅
→ 후보 5명 생성
→ 후보는 A/B/C/D/E로 익명 표시
→ 사용자가 질문 입력 또는 추천 질문 선택
→ 후보들이 모두 답변
→ 사용자가 가장 마음에 드는 답변 선택
→ 5~10라운드 반복
→ 점수 순위 공개
→ 1위 후보 정체 공개
→ 1:1 짧은 데이트 이벤트
→ 캐릭터로 가져오기
```

### C. 이상형 월드컵 플로우

```text
후보 8명 생성
→ 8강: 프로필 이미지/첫인상
→ 4강: 첫 DM/성격 문구
→ 결승: 연애관 답변
→ 우승자와 첫 데이트 이벤트
→ 캐릭터로 가져오기
```

---

## 3. 핵심 데이터 구조

```ts
type BlindDateMode = 'profile' | 'question' | 'worldcup' | 'rotation';

type BlindDateSession = {
  id: string;
  mode: BlindDateMode;
  status: 'setup' | 'generating' | 'active' | 'revealing' | 'dating' | 'completed';
  candidateCount: number;
  candidates: BlindDateCandidate[];
  rounds: BlindDateRound[];
  selectedCandidateId?: string;
  finalRanking?: BlindDateRanking[];
  createdAt: number;
  completedAt?: number;
};

type BlindDateCandidate = {
  id: string;
  anonymousLabel?: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';
  name: string;
  age: number;
  nationality: 'Korean' | 'Japanese' | 'Chinese';
  koreanFluency: 'native' | 'fluent';
  job: string;
  locationBase: string;
  personalitySummary: string;
  speechStyle: string;
  relationshipStyle: string;
  likes: string[];
  dislikes: string[];
  hobbies: string[];
  firstDm: string;
  contactPresetId: string;
  snsStyle: string;
  appearance: CandidateAppearance;
  imagePrompt: string;
  profileImageUri?: string;
  answers: BlindDateAnswer[];
  score: number;
  selectedCount: number;
  createdAt: number;
};

type CandidateAppearance = {
  ethnicityDetail: string;
  faceShape: string;
  eyes: string;
  eyelids: string;
  eyebrows: string;
  nose: string;
  lips: string;
  cheeks: string;
  jawline: string;
  chin: string;
  skinTone: string;
  distinctiveMarks?: string[];
  hairStyle: string;
  hairColor: string;
  heightCm: number;
  bodyType: 'slender' | 'slim_glamorous' | 'petite_slim' | 'tall_slender' | 'soft_slim' | 'athletic_slim';
  makeupStyle: string;
  outfitStyle: string;
};

type BlindDateRound = {
  id: string;
  roundIndex: number;
  question: string;
  answers: BlindDateAnswer[];
  selectedAnswerId?: string;
  createdAt: number;
};

type BlindDateAnswer = {
  id: string;
  candidateId: string;
  anonymousLabel?: string;
  text: string;
  toneTags: string[];
  scoreDelta?: number;
};

type BlindDateRanking = {
  candidateId: string;
  rank: number;
  score: number;
  selectedCount: number;
  reason: string;
};
```

---

## 4. 후보 생성 규칙

### 4-1. 인종/국적 규칙

사용자 요구 기준:

```text
- 후보는 전원 성인 아시아인
- 한국인일 확률 95%
- 일본인 또는 중국인일 확률 5%
- 일본인/중국인 후보도 한국어를 배웠고, 한국어로 자연스럽게 대화 가능하다는 설정
```

추천 분포:

```ts
function pickCandidateNationality() {
  const r = Math.random();
  if (r < 0.95) return 'Korean';
  if (r < 0.975) return 'Japanese';
  return 'Chinese';
}
```

설정 문구:

```text
모든 후보는 한국어로 대화할 수 있다.
일본인/중국인 후보는 한국 거주 경험, 유학, 직장, 콘텐츠 활동, 한국어 전공, 장기 체류 등의 이유로 한국어가 자연스럽다는 설정을 부여한다.
```

### 4-2. 안전 규칙

```text
- 모든 후보는 반드시 만 20세 이상 성인
- 미성년자, 학생 교복, 고등학생 느낌 금지
- 나이는 기본 20~34세 범위 추천
- 이미지 프롬프트에도 adult woman / adult character 명시
- 나이가 어려 보이는 표현 금지
```

추천 나이 분포:

```ts
const agePool = [
  [20, 24, 0.25],
  [25, 29, 0.45],
  [30, 34, 0.25],
  [35, 39, 0.05]
];
```

---

## 5. 후보 외모 다양화 가이드

### 5-1. 문제

AI 후보를 여러 명 만들면 외모가 비슷해질 수 있다. 특히 “한국인 미녀, 긴 머리, 자연 메이크업”만 반복하면 후보 간 구분이 약해진다.

### 5-2. 해결 방향

각 후보의 외모를 아래 항목으로 세밀하게 나눈다.

```text
얼굴형
눈 모양
쌍꺼풀/무쌍/속쌍
눈썹
코 모양
입술
볼/광대
턱선/턱끝
피부톤
점/보조개/눈 밑 점 같은 특징
헤어스타일
메이크업
체형
키
의상
```

### 5-3. 후보 간 차이 강제 규칙

후보를 5명 만들 때는 아래 조합이 겹치지 않게 한다.

```text
- faceShape + eyes + nose + lips 조합이 완전히 같으면 안 됨
- 헤어스타일은 최소 3종 이상 섞기
- 메이크업 스타일은 최소 3종 이상 섞기
- 체형은 모두 마른 편이되, slender / slim glamorous / petite slim / tall slender 등 차이 부여
- 의상은 직업/성격과 맞게 다르게 설정
- 모두 같은 긴 생머리, 같은 흰 블라우스, 같은 얼굴형 금지
```

### 5-4. 얼굴 디테일 옵션 예시

#### 얼굴형

```text
oval face, soft round face, slim V-line face, heart-shaped face, small angular face, long oval face, gentle square jaw with soft edges
```

#### 눈

```text
almond-shaped eyes, round eyes, slightly upturned eyes, soft downturned eyes, sharp cat-like eyes, calm narrow eyes, large gentle eyes
```

#### 쌍꺼풀/눈매

```text
natural double eyelids, monolids, inner double eyelids, soft hooded eyelids, clear eyelid crease, subtle aegyo-sal under eyes
```

#### 코

```text
small straight nose, softly rounded nose tip, high nose bridge, low delicate nose bridge, slightly upturned nose tip, slim nose, natural Korean nose shape
```

#### 입술

```text
small heart-shaped lips, full soft lips, thin delicate lips, slightly pouty lips, clear cupid's bow, natural pink lips
```

#### 특징점

```text
small mole under one eye, faint dimples, soft cheek volume, sharp jawline, gentle smile lines, clear skin texture, slightly flushed cheeks
```

---

## 6. 체형/키/분위기 규칙

### 기본 방향

후보들은 기본적으로 모두 마른 편으로 설정하되, 차이를 아래 정도로 둔다.

```text
- 슬렌더
- 키 큰 슬렌더
- 아담한 슬림
- 마른 글래머
- 부드러운 슬림 체형
- 운동한 듯한 슬림 체형
```

### 체형 프롬프트 예시

```text
slender figure
petite slim figure
tall slender figure
slim glamorous figure
soft slim figure
athletic slim figure
```

### 주의

```text
- 노골적인 신체 부위 강조 금지
- 프로필 사진에서는 상반신 중심이므로 체형은 분위기 정도만 반영
- 성인 캐릭터임을 명확히 하되, 과한 성적 묘사는 피함
```

### 키 범위 예시

```text
petite: 153~159cm
average: 160~166cm
tall: 167~174cm
```

---

## 7. 메이크업 가이드

메이크업은 캐릭터 개성을 크게 만든다. 후보별로 반드시 다르게 설정한다.

### 메이크업 스타일 목록

```text
1. natural Korean daily makeup
2. clean office makeup
3. soft pink romantic makeup
4. idol-inspired glossy makeup
5. chic cat-eye makeup
6. muted beige makeup
7. clear skin minimal makeup
8. smoky but subtle evening makeup
9. warm coral makeup
10. cool-toned elegant makeup
```

### 성격별 추천

```text
차분한 직장인: clean office makeup, muted beige makeup
수다쟁이/밝은 타입: warm coral makeup, glossy idol-inspired makeup
쿨한 타입: chic cat-eye makeup, cool-toned elegant makeup
새벽 감성/예술계: subtle smoky makeup, muted rose makeup
다정한 타입: soft pink romantic makeup, natural Korean daily makeup
공인/인플루언서: polished idol-inspired makeup, high-end beauty makeup
```

---

## 8. 의상 가이드

의상은 직업, 성격, SNS 스타일과 연결되어야 한다.

### 직업/성격별 의상 예시

```text
직장인: fitted blazer, blouse, knit top, clean office casual
카페/동네친구: cardigan, simple tee, denim, casual knit
인플루언서: trendy crop jacket, stylish blouse, statement accessories
예술계: oversized shirt, layered outfit, muted color palette
학생 느낌이 아닌 젊은 직장인: soft cardigan, pleated skirt, clean casual
쿨한 타입: black turtleneck, minimal jacket, silver accessories
다정한 타입: cream knit, soft cardigan, warm-toned outfit
새벽 감성: dark cardigan, loose shirt, simple necklace
```

### 금지/주의

```text
- 교복 느낌 금지
- 미성년자로 보이는 의상 금지
- 지나치게 노출적인 프로필 사진 금지
- 직업과 맞지 않는 과장된 의상 금지
```

---

## 9. 프로필 이미지 생성 가이드

### 9-1. 기본 구도

사용자가 말한 것처럼 프로필은 **반명함 사진 구도**가 가장 안정적이다.

추천 구도:

```text
upper-body portrait, half-ID photo composition, chest-up framing, centered face, looking at camera, clean background, soft studio lighting, realistic social profile photo
```

### 왜 반명함 구도가 좋은가

```text
- 캐릭터 얼굴 인식이 잘 됨
- 후보 비교가 쉬움
- 이후 SNS/메신저 프로필로 쓰기 좋음
- 과한 상황 이미지보다 캐릭터 고유 얼굴이 안정적으로 보존됨
```

### 9-2. 프로필 이미지 프롬프트 템플릿

```text
adult Asian woman, {nationalityDetail}, age {age}, {faceShape}, {eyes}, {eyelids}, {eyebrows}, {nose}, {lips}, {cheeks}, {jawline}, {chin}, {distinctiveMarks}, {hairStyle}, {hairColor}, {makeupStyle}, {bodyType}, wearing {outfitStyle}, upper-body portrait, half-ID photo composition, chest-up framing, centered face, looking at camera, clean modern background, soft studio lighting, realistic Korean social profile photo, natural skin texture, high quality, distinct facial features, not similar to other candidates
```

### 9-3. 한국형 프로필 프롬프트 예시

```text
adult Korean woman, age 27, soft oval face, calm almond-shaped eyes, natural inner double eyelids, straight soft eyebrows, small straight nose with a softly rounded tip, small heart-shaped lips, gentle cheek volume, slim V-line jaw, tiny mole under the left eye, long dark brown layered hair, natural Korean daily makeup, slender figure, wearing a cream knit cardigan and simple earrings, upper-body portrait, half-ID photo composition, chest-up framing, centered face, looking at camera, clean modern background, soft studio lighting, realistic Korean social profile photo, natural skin texture, high quality, distinct facial features, not similar to other candidates
```

### 9-4. 네거티브 프롬프트

```text
minor, child, teen, underage, school uniform, identical face, same face, clone, duplicate character, western face, non-Asian, unrealistic doll face, overly large anime eyes, distorted face, bad anatomy, extra fingers, low quality, blurry, overexposed, nude, explicit sexual content, lingerie, see-through clothing
```

---

## 10. 후보 생성용 JSON 스키마

AI에게 후보를 생성시킬 때는 자유문장보다 JSON을 강제하는 것이 좋다.

```json
{
  "candidates": [
    {
      "name": "한서윤",
      "age": 27,
      "nationality": "Korean",
      "koreanFluency": "native",
      "job": "브랜드 마케터",
      "locationBase": "서울 성수동",
      "personalitySummary": "차분하지만 가까운 사람에게는 장난기가 있는 타입",
      "speechStyle": "짧고 담백하지만 가끔 다정하게 찌르는 말투",
      "relationshipStyle": "처음엔 조심스럽지만 신뢰가 쌓이면 꾸준히 챙김",
      "likes": ["조용한 카페", "전시회", "늦은 산책"],
      "dislikes": ["재촉", "가벼운 허세"],
      "hobbies": ["사진 찍기", "브랜드 팝업 구경", "필름 카메라"],
      "firstDm": "안녕. 이런 식으로 말 거는 거 조금 어색한데, 네 답변이 묘하게 기억에 남아서.",
      "contactPresetId": "dry_caring",
      "snsStyle": "감성적인 일상 사진과 짧은 문장 위주",
      "appearance": {
        "ethnicityDetail": "Korean",
        "faceShape": "soft oval face",
        "eyes": "calm almond-shaped eyes",
        "eyelids": "inner double eyelids",
        "eyebrows": "straight soft eyebrows",
        "nose": "small straight nose with softly rounded tip",
        "lips": "small heart-shaped lips",
        "cheeks": "gentle cheek volume",
        "jawline": "slim V-line jaw",
        "chin": "small rounded chin",
        "skinTone": "fair neutral Korean skin tone",
        "distinctiveMarks": ["tiny mole under the left eye"],
        "hairStyle": "long dark brown layered hair",
        "hairColor": "dark brown",
        "heightCm": 164,
        "bodyType": "slender",
        "makeupStyle": "natural Korean daily makeup",
        "outfitStyle": "cream knit cardigan and simple earrings"
      },
      "profileImagePrompt": "..."
    }
  ]
}
```

---

## 11. 후보 생성 프롬프트 가이드

### 시스템 지시문

```text
You generate fictional adult AI dating candidates for a Korean SNS messenger app.
All candidates must be adults age 20 or older.
All candidates must be Asian.
Nationality distribution: about 95% Korean, about 5% Japanese or Chinese.
Japanese or Chinese candidates must be fluent in Korean due to studying, working, or living in Korea.
Do not create minors, teenagers, school-uniform characters, or ambiguous underage appearances.
Create candidates that feel like realistic people who could exist in modern Korea.
Each candidate must have a distinct face, job, personality, speech style, SNS style, and contact pattern.
Avoid making every candidate look like the same generic Korean beauty.
For each candidate, describe detailed facial differences: face shape, eyes, eyelids, eyebrows, nose, lips, cheeks, jawline, chin, skin tone, hair, makeup, and distinctive marks.
Body type should generally be slim, but vary between slender, petite slim, tall slender, slim glamorous, soft slim, and athletic slim.
Profile images should use upper-body half-ID photo composition suitable for messenger/SNS profile photos.
Return only valid JSON.
```

### 유저 프롬프트 예시

```text
Create 5 blind date candidates.
They should be adult Asian women, mostly Korean.
Make them all fluent Korean speakers.
Make their faces visibly different from each other.
Give each candidate a unique job, personality, speech style, contact preset, SNS style, and profile image prompt.
Use realistic modern Korean social/dating app style.
```

---

## 12. 후보 아키타입 풀

완전 랜덤보다 아키타입을 먼저 뽑고 세부를 랜덤화하는 것이 좋다.

```ts
const CANDIDATE_ARCHETYPES = [
  '차분한 브랜드 마케터',
  '밝은 카페 매니저',
  '무심한 직장인',
  '감성적인 사진작가',
  '바쁜 인플루언서',
  '조용한 연구원',
  '수다스러운 뷰티샵 직원',
  '깔끔한 간호사',
  '새벽 감성의 작사가 지망생',
  '운동 좋아하는 필라테스 강사',
  '공연 보는 걸 좋아하는 디자이너',
  '도도한 프리랜서 모델',
  '집순이 개발자',
  '책 좋아하는 출판 편집자',
  '외국계 회사 직장인'
];
```

### 아키타입별 추천 요소

| 아키타입 | 말투 | 외모/의상 | 연락 패턴 |
|---|---|---|---|
| 브랜드 마케터 | 센스 있고 짧음 | 블레이저, 세련된 메이크업 | 무심한데 챙김 |
| 카페 매니저 | 밝고 생활감 있음 | 니트, 앞치마 느낌 소품 가능 | 수다쟁이 친구 |
| 직장인 | 담백하고 현실적 | 셔츠, 가디건 | 바쁜 현실친구 |
| 사진작가 | 감성적, 관찰 많음 | 레이어드룩, 필름 감성 | 새벽 감성 타입 |
| 인플루언서 | 세련되고 조심스러움 | 트렌디 의상, 완성도 높은 메이크업 | 아이돌/공인 느낌 |
| 연구원 | 조용하고 신중 | 미니멀룩, 차분한 메이크업 | 조심스러운 사람 |
| 필라테스 강사 | 밝고 건강함 | 애슬레저/깔끔한 니트 | 칼답 친구 |

---

## 13. 블라인드 질문 소개팅 구현

### 기본 설정

```text
후보 수: 5명
질문 라운드: 5~10회
각 라운드마다 후보 전원이 답변
사용자는 가장 마음에 드는 답변 하나 선택
선택된 후보 점수 증가
마지막에 순위 공개
```

### 점수 규칙 추천

```ts
selected answer: +3
same candidate selected twice in a row: +1 bonus
answer matched user preference tag: +1
low consistency penalty: -1
```

### 질문 예시

```text
연인이 힘들다고 하면 어떻게 해줄 거야?
첫 데이트에서 제일 중요하게 보는 건 뭐야?
싸웠을 때 먼저 사과하는 편이야?
연락이 늦는 사람을 어떻게 생각해?
질투가 나는 순간은 언제야?
상대가 우울해 보이면 어떻게 할 거야?
쉬는 날 같이 뭐 하고 싶어?
연애할 때 절대 못 참는 건 뭐야?
좋아하는 사람 앞에서 너는 어떤 타입이야?
나랑 가까워지면 어떤 모습이 제일 달라질 것 같아?
```

### 답변 생성 프롬프트

```text
Generate answers from each blind date candidate to the user's question.
Each candidate must answer in their own speech style and personality.
Do not reveal hidden identity if the mode is blind.
Keep each answer 1-3 short messenger-style bubbles or one concise paragraph.
Answers must be natural Korean.
Do not make all candidates equally kind or similar.
Return JSON with candidateId, anonymousLabel, answerText, toneTags.
```

### 익명 답변 UI

```text
Q. 연인이 힘들다고 하면 어떻게 해줄 거야?

A번
일단 말 안 시키고 옆에 있어줄 것 같아. 네가 말하고 싶을 때까지 기다리는 편이야.

B번
바로 전화할 거야. 목소리만 들어도 대충 알잖아, 괜찮은지 아닌지.

C번
맛있는 거 사 들고 찾아갈래. 말보다 행동이 먼저 나오는 편이라.

[이 답변 선택]
```

---

## 14. 프로필 소개팅 구현

### 후보 카드 구성

```text
프로필 이미지
이름 / 나이
직업
한 줄 성격
첫 DM
태그 3개
[상세 보기]
[이 사람 선택]
```

### 상세 보기 구성

```text
- 프로필 이미지 크게 보기
- 이름, 나이, 직업
- 성격
- 말투
- 취향
- 싫어하는 것
- 연락 스타일
- SNS 스타일
- 첫 DM
- 예상 궁합 포인트
```

### 카드 예시

```text
한서윤 · 27
브랜드 마케터
차분하지만 가까워지면 장난기가 있는 타입

“이런 식으로 처음 말 거는 거 조금 어색한데, 네 답변이 묘하게 기억에 남아서.”

#무심한데챙김 #전시회 #성수동
```

---

## 15. 이상형 월드컵 구현

### 라운드 구성

```text
8강: 프로필 이미지 + 짧은 소개
4강: 첫 DM + 말투
결승: 연애관 답변
우승 후: 1:1 짧은 데이트 이벤트
```

### 대결 카드 구성

```text
왼쪽 후보 vs 오른쪽 후보
프로필 이미지
이름/나이/직업
비교 기준 문구
[왼쪽 선택] [오른쪽 선택]
```

### 비교 기준 예시

```text
첫인상이 더 끌리는 사람은?
첫 DM이 더 마음에 드는 사람은?
연애관이 더 맞는 사람은?
오래 대화해보고 싶은 사람은?
```

---

## 16. 최종 선택 후 1:1 데이트 이벤트

최종 후보가 정해지면 바로 캐릭터 저장으로 끝내지 말고, 짧은 데이트 이벤트를 넣는 것이 좋다.

### 흐름

```text
최종 매칭되었습니다.
정선과 첫 1:1 데이트를 시작할까요?
→ AI 스틸샷 생성
→ 비주얼 노벨형 만남 이벤트 3~5턴
→ 저장 여부 확인
```

### 데이트 이벤트 UI

기존에 설계한 **만남 이벤트 UI**를 재사용한다.

```text
상단: AI 생성 상황 스틸샷
중단: 대사/상황 묘사 텍스트 박스
하단: 선택지 2~4개 + 직접 답하기
```

### 데이트 스틸샷 프롬프트 템플릿

```text
cinematic Korean drama-style still shot, first blind date meeting, {candidateAppearance}, {userPresenceDescription}, {location}, {timeOfDay}, {mood}, two adults sitting or standing together, emotional but realistic atmosphere, soft cinematic lighting, modern Korean setting, visual novel event still, wide rectangular composition, no text, no watermark
```

---

## 17. 캐릭터 가져오기

### 가져오기 시 저장할 필드

```ts
type ImportedCharacterFromBlindDate = {
  name: string;
  age: number;
  job: string;
  nationality: string;
  profileImageUri: string;
  appearancePrompt: string;
  personality: string;
  speechStyle: string;
  relationshipStyle: string;
  likes: string[];
  dislikes: string[];
  hobbies: string[];
  contactPresetId: string;
  snsStyle: string;
  firstDm: string;
  source: 'blind_date';
  blindDateMemory: BlindDateMemory;
};

type BlindDateMemory = {
  mode: BlindDateMode;
  selectedAt: number;
  selectedReason: string;
  winningAnswers: string[];
  userPreferenceTags: string[];
  compatibilityScore: number;
  firstDateSummary?: string;
};
```

### 초기 메모리 예시

```text
사용자는 블라인드 질문 소개팅에서 한서윤을 최종 선택했다.
서윤은 “힘들 때 말없이 옆에 있어주는 편”이라는 답변으로 높은 호감을 얻었다.
첫 데이트 이벤트에서 사용자는 서윤의 차분하고 담백한 위로를 좋게 받아들였다.
서윤은 사용자를 처음부터 무리하게 몰아붙이지 않고 천천히 알아가고 싶어한다.
```

### 이후 대화 반영

이 메모리는 이후 아래 기능에 주입한다.

```text
- 1:1 메신저
- SNS 자동 생성
- SNS DM
- 통화하기
- 만남 이벤트
- SumGod 같은 미니게임
```

예시 후속 대화:

```text
“그때 소개팅에서 네가 내 답변 골라준 거 아직 기억나. 말없이 옆에 있어주는 게 좋다 했잖아.”
```

---

## 18. 프롬프트에 넣을 성격/말투 가이드

후보가 정식 캐릭터로 들어올 때 아래 문장을 캐릭터 기본 프롬프트에 포함한다.

```text
This character was selected by the user through the Blind Date feature.
They should remember the first blind date context, the answers the user liked, and the reason the user selected them.
Their speech style, personality, contact rhythm, SNS style, and first impression must remain consistent with their generated profile.
Do not mention that they were randomly generated by AI.
Treat the blind date as the first meaningful encounter with the user.
```

한국어 지시문:

```text
이 캐릭터는 블라인드 데이트 기능에서 사용자가 최종 선택한 인물이다.
첫 소개팅에서 사용자가 어떤 답변을 좋아했는지, 왜 자신을 선택했는지 기억한다.
말투, 성격, 연락 패턴, SNS 스타일은 생성된 프로필과 일관되게 유지한다.
AI가 랜덤으로 생성되었다는 메타 발언은 하지 않는다.
블라인드 데이트를 사용자와의 첫 의미 있는 만남으로 취급한다.
```

---

## 19. UI 설계 상세

### 블라인드 데이트 홈

```text
[블라인드 데이트]
AI가 만든 후보 중 마음에 드는 사람을 찾아보세요.

[프로필 소개팅]
사진과 프로필을 보고 고르는 빠른 소개팅

[블라인드 질문 소개팅]
외모를 숨기고 답변만 보고 고르는 소개팅

[이상형 월드컵]
후보들을 1:1로 비교해 최종 우승자 선택

[로테이션 데이트]
여러 후보와 짧게 대화해보고 선택
```

### 후보 생성 로딩

```text
후보를 준비하고 있어요...
외모, 말투, 성격, 첫 DM을 만들고 있습니다.
```

### 정체 공개 연출

```text
당신이 가장 많이 선택한 사람은...

B번 후보, 한서윤입니다.
```

### 캐릭터 저장 화면

```text
한서윤을 캐릭터로 가져올까요?

저장하면 메신저, SNS, 통화, 만남 이벤트에서 계속 대화할 수 있어요.

[캐릭터로 가져오기]
[후보 보관함에 저장]
[취소]
```

---

## 20. 후보 보관함

최종 1명만 저장하면 아쉬울 수 있다.

### 추천 기능

```text
- 최종 우승자: 바로 캐릭터 가져오기
- 탈락 후보: 후보 보관함에 저장 가능
- 후보 보관함에서 나중에 프로필/이미지/답변 확인 가능
- 원하면 나중에 캐릭터로 가져오기 가능
```

### 보관함 데이터

```ts
type BlindDateCandidateArchive = {
  id: string;
  candidate: BlindDateCandidate;
  sessionId: string;
  archivedAt: number;
  canImport: boolean;
};
```

---

## 21. 중복 얼굴 방지 코드 레벨 체크

AI 프롬프트만으로는 후보 외모가 비슷해질 수 있다. 생성 후 JSON을 검사해서 특징 조합 중복을 줄인다.

```ts
function buildFaceSignature(candidate: BlindDateCandidate) {
  const a = candidate.appearance;
  return [
    a.faceShape,
    a.eyes,
    a.eyelids,
    a.nose,
    a.lips,
    a.hairStyle,
    a.makeupStyle
  ].join('|').toLowerCase();
}

function hasTooSimilarFaces(candidates: BlindDateCandidate[]) {
  const signatures = new Set<string>();
  for (const c of candidates) {
    const sig = buildFaceSignature(c);
    if (signatures.has(sig)) return true;
    signatures.add(sig);
  }
  return false;
}
```

### 재생성 조건

```text
- 후보 5명 중 3명 이상이 같은 헤어스타일
- 후보 5명 중 3명 이상이 같은 메이크업
- faceShape + eyes + nose + lips 조합 중복
- 전부 같은 직업군
- 전부 같은 말투/성격
```

---

## 22. 이미지 생성 실패 대응

### 실패 시 fallback

```text
1. 프로필 이미지 재시도 1회
2. 실패하면 기본 실루엣 + 텍스트 프로필 표시
3. 캐릭터 가져오기 전 이미지 재생성 버튼 제공
```

### UI 문구

```text
프로필 이미지를 다시 생성할 수 있어요.
```

---

## 23. 안전/현실성 규칙

```text
- 후보는 모두 성인
- 미성년자/학생 설정 금지
- 노골적 성적 설정 금지
- 인종/국적은 캐릭터 다양성을 위한 설정으로만 사용
- 일본인/중국인 후보도 한국어 가능 설정 필수
- 시간/직업/생활 패턴이 현실적이어야 함
- 첫 만남 이벤트에서 비현실적인 장소 이동 금지
```

---

## 24. 1차 구현 우선순위

```text
1. ETC 메뉴에 블라인드 데이트 카드 추가
2. BlindDateSession 상태 추가
3. 후보 5명 JSON 생성
4. 프로필 이미지 생성 프롬프트 생성
5. 프로필 소개팅 UI 구현
6. 블라인드 질문 소개팅 5~10라운드 구현
7. 최종 순위/정체 공개
8. 캐릭터 가져오기
9. 가져온 캐릭터에 blindDateMemory 저장
10. 이후 채팅 프롬프트에 blindDateMemory 반영
```

---

## 25. 2차 구현 우선순위

```text
1. 이상형 월드컵
2. 로테이션 데이트
3. 후보 보관함
4. 첫 데이트 이벤트 자동 연결
5. 후보별 SNS 미리보기
6. 후보별 첫 통화 미리보기
7. 사용자 취향 분석 리포트
8. 외모/성격 믹스 기능
```

---

## 26. 테스트 체크리스트

### 후보 생성 테스트

```text
- 후보가 모두 성인인가?
- 95% 정도 한국인 중심인가?
- 일본/중국 후보도 한국어 가능 설정이 있는가?
- 후보 얼굴 묘사가 서로 다른가?
- 헤어/메이크업/의상이 겹치지 않는가?
- 직업/성격/말투가 서로 다른가?
```

### 이미지 테스트

```text
- 프로필 사진이 반명함/상반신 구도인가?
- 얼굴이 잘 보이는가?
- 후보 간 얼굴이 너무 비슷하지 않은가?
- 의상이 캐릭터 설정과 맞는가?
- 미성년자처럼 보이지 않는가?
```

### 질문 소개팅 테스트

```text
- 후보 답변이 서로 다른가?
- 익명 모드에서 정체가 노출되지 않는가?
- 10라운드 후 순위가 제대로 계산되는가?
- 선택 이유가 저장되는가?
```

### 캐릭터 가져오기 테스트

```text
- 정식 캐릭터로 저장되는가?
- 프로필 이미지가 유지되는가?
- 말투/성격/직업/연락 패턴이 저장되는가?
- blindDateMemory가 이후 채팅에 반영되는가?
```

---

## 27. 바이브 코딩툴용 짧은 작업 지시문

```text
ETC 메뉴에 “블라인드 데이트” 기능을 구현해줘.

목표:
- 사용자가 직접 캐릭터를 만드는 대신, AI가 후보 3~5명 또는 월드컵용 8명을 생성한다.
- 후보는 이름, 나이, 직업, 성격, 말투, 취향, 연락 패턴, SNS 스타일, 외모 묘사, 프로필 이미지 프롬프트를 가진다.
- 사용자는 프로필 소개팅, 블라인드 질문 소개팅, 이상형 월드컵 중 하나로 후보를 비교한다.
- 최종 선택한 후보는 정식 캐릭터로 가져올 수 있다.
- 가져온 캐릭터는 blindDateMemory를 가지고 이후 메신저/SNS/통화/만남 이벤트에서 첫 소개팅 맥락을 기억한다.

후보 생성 규칙:
- 모든 후보는 성인 아시아인이다.
- 한국인일 확률은 95%, 일본인/중국인은 합쳐서 5% 정도다.
- 일본인/중국인 후보도 한국어를 배웠고 한국어로 자연스럽게 대화 가능하다는 설정을 가진다.
- 모든 후보는 만 20세 이상이다.
- 미성년자, 교복, 학생처럼 보이는 설정은 금지한다.
- 후보 얼굴이 비슷해지지 않게 얼굴형, 눈, 쌍꺼풀/무쌍, 눈썹, 코, 입술, 볼, 턱선, 피부톤, 점/보조개, 헤어스타일, 메이크업을 자세히 다르게 묘사한다.
- 체형은 기본적으로 마른 편이되 slender, petite slim, tall slender, slim glamorous, soft slim, athletic slim 등으로 차이를 둔다.
- 프로필 이미지는 반명함 사진처럼 상반신/가슴 위 구도, 얼굴 중앙, 깔끔한 배경으로 생성한다.
- 메이크업과 의상은 캐릭터 직업/성격/SNS 스타일에 맞춰 다르게 설정한다.

구현 범위 1차:
1. ETC 메뉴 카드 추가
2. BlindDateSession / BlindDateCandidate 타입 추가
3. AI 후보 5명 JSON 생성
4. 후보 프로필 이미지 생성
5. 프로필 소개팅 UI
6. 블라인드 질문 소개팅 5~10라운드
7. 최종 순위 공개
8. 캐릭터 가져오기
9. blindDateMemory를 이후 대화 프롬프트에 반영
```

---

## 28. 최종 결론

이 기능은 단순한 랜덤 캐릭터 생성기가 아니라, **사용자가 자신의 취향에 맞는 캐릭터를 발견하는 미니게임**이어야 한다.

가장 중요한 차별점은 아래 세 가지다.

```text
1. 후보를 AI가 생성한다.
2. 사용자는 프로필/답변/월드컵/데이트 이벤트를 통해 고른다.
3. 최종 선택된 후보는 첫 만남 기억을 가진 정식 캐릭터가 된다.
```

외모 생성에서는 특히 아래를 강제해야 한다.

```text
- 성인 아시아인
- 한국인 중심
- 얼굴 디테일 세분화
- 후보 간 얼굴 중복 방지
- 반명함 프로필 구도
- 메이크업/의상/직업/성격 일치
```

이 기준으로 구현하면 ETC 메뉴에 들어가는 단순 부가기능이 아니라, 앱의 캐릭터 생성 경험 자체를 훨씬 재미있게 만드는 핵심 기능이 될 수 있다.
