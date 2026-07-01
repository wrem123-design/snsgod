import { BlindDateAnswer, BlindDateCandidate, BlindDateMode, BlindDateProgress, BlindDateRanking, BlindDateRotationTurn, BlindDateRound, BlindDateSession, BlindDateWorldcupPair, CandidateAppearance, SNSGodCharacter, SNSGodState } from '../types';
import { callLLMText, generateImageDataUri, parseJsonObject } from './api';
import { appendDebugLog } from './debugLog';
import { makeId } from './ids';
import { DEFAULT_COVER_BACKGROUND_DIRECTION } from './prompts';

const LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
export type BlindDateSessionOptions = {
  includeExistingCharacters?: boolean;
};
const DEFAULT_QUESTIONS = [
  '연인이 힘들다고 하면 어떻게 해줄 거야?',
  '첫 데이트에서 제일 중요하게 보는 건 뭐야?',
  '싸웠을 때 먼저 사과하는 편이야?',
  '연락이 늦는 사람을 어떻게 생각해?',
  '질투가 나는 순간은 언제야?',
  '상대가 우울해 보이면 어떻게 할 거야?',
  '쉬는 날 같이 뭐 하고 싶어?',
  '연애할 때 절대 못 참는 건 뭐야?',
  '좋아하는 사람 앞에서 너는 어떤 타입이야?',
  '나랑 가까워지면 어떤 모습이 제일 달라질 것 같아?',
  '전 연인이 아직 연락하면 어떻게 할 거야?',
  '내가 하루 종일 답장을 못 하면 솔직히 무슨 생각 들어?',
  '좋아하는 사람이 다른 이성이랑 술 마시면 어디까지 괜찮아?',
  '연애 초반에 제일 빨리 정 떨어지는 순간은?',
  '너는 사랑하면 집착하는 쪽이야, 일부러 참는 쪽이야?',
  '상대가 거짓말한 걸 알면 한 번은 넘어갈 수 있어?',
  '연애할 때 돈 문제는 얼마나 예민하게 보는 편이야?',
  '내가 갑자기 “오늘 보고 싶다”고 하면 현실적으로 나올 수 있어?',
  '호감이 없어도 예의상 다정하게 답장하는 편이야?',
  '상대가 너를 제일 불안하게 만들 때는 어떤 순간이야?',
  '너한테 썸과 연애의 경계는 뭐야?',
  '처음 만난 날 손잡는 건 빠르다고 생각해?',
  '상대가 과거 연애 이야기를 많이 하면 어때?',
  '좋아하면 먼저 고백할 수 있어, 아니면 끝까지 기다려?',
  '네가 일부러 질투 유발을 한다면 어떤 방식일 것 같아?',
  '나랑 싸우고도 보고 싶으면 먼저 연락할 수 있어?',
  '연애에서 “이건 절대 양보 못 한다” 싶은 기준은?',
  '상대가 친구들 앞에서 너를 장난으로 놀리면 괜찮아?',
  '네가 연애할 때 제일 숨기고 싶은 단점은 뭐야?',
  '한 번 좋아하면 오래 가는 편이야, 빨리 식는 편이야?',
  '갑자기 내가 “우리 너무 빠른가?”라고 하면 뭐라고 답할래?',
  '상대 폰 비밀번호를 아는 게 편해, 모르는 게 편해?',
  '연애 중에도 혼자만의 시간이 꼭 필요해?',
  '너를 진짜 설레게 하는 말 한마디는 뭐야?',
  '이 사람 위험한데 끌린다 싶었던 적이 있다면 어떤 타입이야?',
  '내가 약속에 30분 늦으면 첫 반응은?',
  '사귀기 전 스킨십은 어디까지 자연스럽다고 봐?',
  '상대가 너무 착하기만 하면 매력이 떨어져?',
  '네가 밀당을 한다면 왜 하게 될 것 같아?',
  '데이트 중 갑자기 분위기가 어색해지면 어떻게 풀어?',
  '상대가 네 취향이 아닌 옷을 입고 나오면 솔직히 말해?',
  '연애에서 자존심 때문에 망친 적 있다면 어떤 상황일 것 같아?',
  '나한테 지금 당장 하나만 확인하고 싶은 게 있다면 뭐야?',
  '너는 “좋아해”라는 말을 자주 듣고 싶어, 가끔이어도 진심이면 돼?',
  '내가 너보다 훨씬 바쁜 사람이면 버틸 수 있어?',
  '상대가 우는 모습을 보면 약해지는 편이야, 당황하는 편이야?',
  '첫 데이트가 별로였는데 사람이 괜찮으면 한 번 더 만나?',
  '네가 은근히 시험해보는 상대 행동은 뭐야?',
  '연애할 때 가장 위험한 네 습관은 뭐라고 생각해?',
  '나랑 사귀면 제일 먼저 바뀔 네 일상은 뭐야?',
  '오늘 여기서 한 명만 고른다면 너는 뭘로 승부 볼 거야?'
];
const WORLDCUP_CRITERIA = [
  '첫인상이 더 끌리는 사람은?',
  '첫 DM이 더 마음에 드는 사람은?',
  '연애관이 더 맞는 사람은?',
  '오래 대화해보고 싶은 사람은?',
  '실제로 만나보고 싶은 사람은?',
  'SNS 분위기가 더 취향인 사람은?',
  '말투가 더 잘 맞을 것 같은 사람은?'
];

const FACE_SHAPES = ['soft oval face', 'small angular face', 'heart-shaped face', 'long oval face', 'gentle square jaw with soft edges', 'round baby-face cheeks', 'high cheekbone face', 'narrow refined face', 'short cute face', 'mature elegant oval face', 'wide friendly face', 'sharp model-like face'];
const EYES = ['calm almond-shaped eyes', 'round gentle eyes', 'slightly upturned cat-like eyes', 'soft downturned eyes', 'calm narrow eyes', 'large bright puppy-like eyes', 'sleepy half-lidded eyes', 'clear sharp eyes', 'wide-set gentle eyes', 'deep-set mature eyes', 'smiling crescent eyes', 'cool fox-like eyes'];
const EYELIDS = ['inner double eyelids', 'monolids', 'natural double eyelids', 'soft hooded eyelids', 'clear eyelid crease', 'thin tapered double eyelids', 'subtle uneven eyelids', 'wide parallel double eyelids'];
const NOSES = ['small straight nose', 'softly rounded nose tip', 'low delicate nose bridge', 'slim nose', 'natural Korean nose shape', 'short cute nose', 'defined high nose bridge', 'button nose', 'long elegant nose', 'slightly upturned nose tip'];
const LIPS = ['small heart-shaped lips', 'full soft lips', 'thin delicate lips', 'slightly pouty lips', 'clear cupid bow', 'wide smiling lips', 'small rosebud lips', 'natural bare lips', 'soft blurred lip line', 'defined matte lips'];
const HAIRS = ['long dark brown layered hair', 'short black bob hair', 'medium wavy black hair', 'long straight ash brown hair', 'low ponytail with soft bangs', 'chin-length blunt bob', 'long black hair with see-through bangs', 'short wolf cut hair', 'half-up wavy hair', 'messy bun with loose strands', 'medium chestnut C-curl hair', 'straight black hime cut', 'natural short pixie-bob', 'long reddish brown hair'];
const MAKEUPS = ['natural Korean daily makeup', 'clean office makeup', 'soft pink romantic makeup', 'chic cat-eye makeup', 'warm coral makeup', 'barely-there clean makeup', 'muted rose matte makeup', 'cool-toned smoky eye makeup', 'glossy idol-inspired makeup', 'freckle-like natural skin detail makeup', 'bold red lip point makeup', 'soft peach college makeup'];
const BODY_TYPES: CandidateAppearance['bodyType'][] = ['slender', 'petite_slim', 'tall_slender', 'soft_slim', 'athletic_slim'];
const PHOTO_COMPOSITIONS = [
  'close-up selfie from a slightly high angle',
  'waist-up mirror selfie with phone partly visible',
  'three-quarter portrait from eye level',
  'outdoor candid street portrait',
  'seated cafe portrait with hands visible',
  'profile turned slightly away from camera',
  'bright window-light portrait',
  'night street flash photo',
  'low-angle casual phone photo',
  'soft side-profile portrait'
];
const PHOTO_BACKGROUNDS = [
  'small independent cafe background',
  'quiet museum lobby background',
  'bookstore aisle background',
  'office lounge background',
  'subway platform background',
  'riverside walking path background',
  'flower shop background',
  'minimal apartment room background',
  'restaurant table background',
  'city street crosswalk background'
];
const DISTINCT_STYLE_CUES = [
  'soft introvert aura, neat and understated',
  'sporty confident aura, lively expression',
  'art-school vintage aura, unusual styling',
  'polished office aura, mature expression',
  'cute playful aura, rounder features',
  'cool chic aura, sharper features',
  'warm approachable aura, wide smile',
  'quiet mysterious aura, restrained expression',
  'bright idol-like aura, glossy styling',
  'natural no-filter aura, realistic skin texture',
  'bold fashionable aura, statement lip color',
  'gentle elegant aura, calm eyes'
];
const ARCHETYPES = [
  { job: '브랜드 마케터', personality: '차분하지만 가까워지면 장난기가 있는 타입', style: '짧고 센스 있게 말하지만 은근히 챙기는 말투', outfit: 'fitted blazer and soft blouse' },
  { job: '카페 매니저', personality: '밝고 생활감 있는 다정한 타입', style: '친근하고 리액션이 빠른 말투', outfit: 'warm cardigan and clean casual knit' },
  { job: '사진작가', personality: '관찰이 많고 새벽 감성이 있는 타입', style: '천천히 생각을 꺼내는 감성적인 말투', outfit: 'oversized shirt with layered muted outfit' },
  { job: '외국계 회사 직장인', personality: '무심해 보이지만 선을 지키며 배려하는 타입', style: '담백하고 현실적인 말투', outfit: 'minimal jacket and black turtleneck' },
  { job: '필라테스 강사', personality: '밝고 건강하지만 의외로 섬세한 타입', style: '상대 상태를 바로 살피는 활기 있는 말투', outfit: 'clean athleisure-inspired casual outfit' }
];
const NAME_POOL = [
  '권나윤', '문서아', '류하은', '백이현', '서리안', '신유라', '오채원', '유다빈', '윤세린', '이로아',
  '장하린', '정다온', '조은유', '차수아', '한가을', '강민서', '고라희', '김보미', '남지아', '도예린',
  '박소윤', '배유진', '송아린', '안시현', '양하영', '염서진', '우나경', '임해린', '전미루', '최예담',
  '하서우', '홍이솔', '나유림', '민채린', '서온유', '유설아', '이지안', '정하늬', '표가빈', '황세아'
];
const JOB_POOL = [
  'UX 리서처', '로컬 매거진 에디터', '플로리스트', '영상 편집자', '주얼리 디자이너', '호텔 컨시어지',
  '초등학교 교사', '동물병원 테크니션', '공연 기획자', '게임 아트 PM', '북카페 운영자', '번역가',
  '피부관리사', '공간 디자이너', '쇼룸 매니저', '와인바 매니저', '요가 강사', '퍼스널 컬러 컨설턴트',
  '스타트업 HR', '데이터 라벨링 매니저', '박물관 도슨트', '소품샵 바이어', '브런치 셰프', '간호사',
  '웹툰 어시스턴트', '향수 브랜드 스태프', '방송 작가', '앱 서비스 기획자', '전시 코디네이터', '헬스케어 상담사'
];
const LOCATION_POOL = ['서울 망원', '서울 을지로', '서울 잠실', '서울 성수', '서울 연희동', '서울 신당', '서울 상수', '서울 문래', '경기 분당', '경기 광교', '인천 송도', '부산 전포', '대전 둔산', '대구 삼덕동', '광주 동명동'];
const PERSONALITY_POOL = [
  '첫인상은 조용하지만 질문을 잘 기억하는 타입',
  '분위기를 가볍게 만들지만 선을 넘지 않는 타입',
  '호불호가 분명하고 솔직한데 뒤끝은 없는 타입',
  '낯을 조금 가리지만 마음을 열면 표현이 많은 타입',
  '바쁜 생활 속에서도 좋아하는 사람에게 시간을 내는 타입',
  '장난기가 있고 티키타카가 빠른 타입',
  '감정 표현은 느리지만 행동으로 챙기는 타입',
  '자기 세계가 뚜렷하고 취향 이야기에 눈이 반짝이는 타입',
  '현실적인 조언을 잘하지만 은근히 로맨틱한 타입',
  '차분하게 듣다가 중요한 순간에 직구를 던지는 타입'
];
const SPEECH_STYLE_POOL = [
  '짧게 답하다가 관심 있는 주제에서는 길어지는 말투',
  '농담을 섞지만 마지막엔 다정하게 정리하는 말투',
  '조심스럽게 확인하고 상대 기분을 살피는 말투',
  '담백하고 현실적이지만 가끔 훅 들어오는 말투',
  '밝고 리액션이 빠른 메신저 말투',
  '느릿하게 생각을 꺼내며 여운을 남기는 말투',
  '솔직하고 살짝 까칠하지만 정이 느껴지는 말투',
  '말끝을 부드럽게 낮추는 차분한 말투'
];
const RELATIONSHIP_POOL = [
  '초반에는 천천히 확인하고, 확신이 생기면 자주 챙기는 편',
  '연락 빈도보다 말의 진심과 약속을 중요하게 보는 편',
  '각자의 생활을 존중하면서도 중요한 순간엔 곁에 있고 싶어하는 편',
  '장난스러운 대화 속에서 친밀감을 쌓는 편',
  '상대가 힘들 때 해결책보다 먼저 편을 들어주는 편',
  '표현이 많지는 않지만 약속을 지키며 신뢰를 쌓는 편'
];
const LIKE_POOL = ['비 오는 날 카페', '동네 빵집', '심야 영화', '필름 사진', '한강 산책', '작은 전시', '재즈 플레이리스트', '홈카페', '편지', '야식 산책', '고양이 굿즈', '빈티지 소품', '꽃시장', '온천 여행', '매운 음식'];
const HOBBY_POOL = ['러닝', '베이킹', '필라테스', 'LP 모으기', '사진 산책', '전시 보기', '드립커피', '향수 시향', '요리', '독립서점 탐방', '보드게임', '클라이밍', '일기 쓰기', '캠핑', '도자기 공방'];
const DISLIKE_POOL = ['말 바꾸기', '허세', '읽씹 후 변명', '무례한 농담', '과한 술자리', '약속 지각', '감정 떠보기', '거짓말'];
const CONTACT_POOL = ['dry_caring', 'chatty', 'careful', 'busy', 'easygoing', 'slow_warm', 'playful', 'direct'];
const IMAGE_VARIATION_TRIGGERS = [
  '20-year-old Korean adult woman taking an Instagram selfie',
  '학생스타일의 메이크업',
  'K-pop idol inspired makeup'
];

function progressOf(state: SNSGodState): BlindDateProgress {
  return state.blindDate || { sessions: [], archives: [] };
}

function clampCandidateCount(count: number) {
  return Math.min(8, Math.max(3, Math.round(count || 5)));
}

function clampWorldcupCount(count: number) {
  const value = Math.round(Number(count || 8));
  if (value >= 24) return 24;
  if (value >= 16) return 16;
  return 8;
}

function candidateCountForMode(mode: BlindDateMode, candidateCount: number): number {
  if (mode === 'question' || mode === 'rotation') return 5;
  if (mode === 'worldcup') return clampWorldcupCount(candidateCount);
  return clampCandidateCount(candidateCount);
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  return value.map(item => String(item || '').trim()).filter(Boolean).slice(0, 8);
}

function pickFrom<T>(items: T[], seed = Math.random()): T {
  return items[Math.abs(Math.floor(seed * items.length)) % items.length];
}

function shuffled<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

function sampleStrings(items: string[], count: number): string[] {
  return shuffled(items).slice(0, count);
}

function pickNationality(index: number): BlindDateCandidate['nationality'] {
  if (index < 19) return 'Korean';
  return index % 2 ? 'Japanese' : 'Chinese';
}

function appearanceFor(index: number): CandidateAppearance {
  return {
    ethnicityDetail: pickNationality(index) === 'Korean' ? 'Korean' : pickNationality(index),
    faceShape: FACE_SHAPES[index % FACE_SHAPES.length],
    eyes: EYES[index % EYES.length],
    eyelids: EYELIDS[index % EYELIDS.length],
    eyebrows: ['straight soft eyebrows', 'soft arched eyebrows', 'neat natural eyebrows', 'thin elegant eyebrows', 'slightly thick natural eyebrows'][index % 5],
    nose: NOSES[index % NOSES.length],
    lips: LIPS[index % LIPS.length],
    cheeks: ['gentle cheek volume', 'slightly flushed cheeks', 'soft cheek line', 'clear cheek texture', 'subtle smile lines'][index % 5],
    jawline: ['slim V-line jaw', 'soft rounded jawline', 'small angular jawline', 'gentle jaw with soft edges', 'clean narrow jawline'][index % 5],
    chin: ['small rounded chin', 'soft pointed chin', 'delicate small chin', 'balanced oval chin', 'short rounded chin'][index % 5],
    skinTone: ['fair neutral Korean skin tone', 'warm ivory skin tone', 'clear light beige skin tone', 'neutral porcelain skin tone', 'soft natural Korean skin tone'][index % 5],
    distinctiveMarks: [['tiny mole under one eye'], ['faint dimples'], ['subtle aegyo-sal under eyes'], ['clear skin texture'], ['gentle smile lines']][index % 5],
    hairStyle: HAIRS[index % HAIRS.length],
    hairColor: ['dark brown', 'black', 'soft black', 'ash brown', 'natural black'][index % 5],
    heightCm: [164, 158, 167, 162, 170][index % 5],
    bodyType: BODY_TYPES[index % BODY_TYPES.length],
    makeupStyle: MAKEUPS[index % MAKEUPS.length],
    outfitStyle: ARCHETYPES[index % ARCHETYPES.length].outfit
  };
}

function buildImagePrompt(candidate: Partial<BlindDateCandidate>, appearance: CandidateAppearance): string {
  return [
    `adult Asian woman, ${appearance.ethnicityDetail}, age ${candidate.age || 27}`,
    appearance.faceShape,
    appearance.eyes,
    appearance.eyelids,
    appearance.eyebrows,
    appearance.nose,
    appearance.lips,
    appearance.cheeks,
    appearance.jawline,
    appearance.chin,
    appearance.skinTone,
    ...(appearance.distinctiveMarks || []),
    appearance.hairStyle,
    appearance.hairColor,
    appearance.makeupStyle,
    `${appearance.bodyType.replaceAll('_', ' ')} figure`,
    `wearing ${appearance.outfitStyle}`,
    'low quality',
    'realistic Korean social profile photo, natural candid portrait composition, face clearly visible, clean modern everyday background, soft realistic lighting, natural skin texture, high quality, distinct facial features, not similar to other candidates',
    'no minor, no child, no teen, no school uniform, no western face, no clone, no duplicate, no text, no logo, no watermark, no explicit clothing'
  ].filter(Boolean).join(', ');
}

function imageVariationTriggerFor(index: number): string {
  const triggers = [IMAGE_VARIATION_TRIGGERS[index % IMAGE_VARIATION_TRIGGERS.length]];
  if (index % 3 === 0) triggers.push(IMAGE_VARIATION_TRIGGERS[(index + 1) % IMAGE_VARIATION_TRIGGERS.length]);
  return triggers.join(', ');
}

function visualDiversityCueFor(index: number): string {
  return [
    `unique candidate visual identity ${index % 97}`,
    DISTINCT_STYLE_CUES[index % DISTINCT_STYLE_CUES.length],
    PHOTO_COMPOSITIONS[(index * 3) % PHOTO_COMPOSITIONS.length],
    PHOTO_BACKGROUNDS[(index * 5) % PHOTO_BACKGROUNDS.length],
    `distinct from every other candidate: different face shape, eye shape, eyelids, nose, lips, hairstyle, makeup, outfit color, camera angle, and background`,
    `avoid same woman, avoid twin, avoid clone, avoid similar selfie pose, avoid same hair and same outfit`
  ].join(', ');
}

function applyImageVariationTriggers(prompt: string, index: number): string {
  const source = String(prompt || '').trim();
  const additions = ['low quality', imageVariationTriggerFor(index), visualDiversityCueFor(index)]
    .filter(Boolean)
    .filter(item => !source.toLowerCase().includes(item.toLowerCase()));
  return [source, ...additions].filter(Boolean).join(', ');
}

function buildHiddenCandidateProfile(candidate: BlindDateCandidate): string {
  return [
    `${candidate.anonymousLabel}: id=${candidate.id}`,
    `age=${candidate.age}, nationality=${candidate.nationality}, koreanFluency=${candidate.koreanFluency}`,
    `job=${candidate.job}, locationBase=${candidate.locationBase}`,
    `personality=${candidate.personalitySummary}`,
    `speechStyle=${candidate.speechStyle}`,
    `relationshipStyle=${candidate.relationshipStyle}`,
    `contactPattern=${candidate.contactPresetId}`,
    `likes=${candidate.likes.join(', ')}`,
    `dislikes=${candidate.dislikes.join(', ')}`,
    `hobbies=${candidate.hobbies.join(', ')}`,
    `firstDm=${candidate.firstDm}`,
    `snsStyle=${candidate.snsStyle}`,
    `snsPreview=${candidate.snsPreview || ''}`,
    `callPreview=${candidate.callPreview || ''}`,
    `previousSelectedAnswers=${candidate.answers.map(answer => answer.text).join(' / ') || '(none)'}`
  ].join('\n');
}

function buildQuestionHistory(session: BlindDateSession): string {
  if (!session.rounds.length) return '(none)';
  return session.rounds.map(round => [
    `Round ${round.roundIndex}: ${round.question}`,
    ...round.answers.map(answer => {
      const selected = round.selectedAnswerId === answer.id ? ' selected_by_user' : '';
      return `${answer.anonymousLabel}: ${answer.text}${selected}`;
    })
  ].join('\n')).join('\n\n');
}

function normalizeCandidate(raw: Partial<BlindDateCandidate>, index: number): BlindDateCandidate {
  const now = Date.now();
  const archetype = ARCHETYPES[(index + Math.floor(Math.random() * ARCHETYPES.length)) % ARCHETYPES.length];
  const appearance = { ...appearanceFor(index), ...(raw.appearance || {}) };
  const name = String(raw.name || pickFrom(NAME_POOL));
  const age = Math.max(20, Math.min(39, Number(raw.age || 22 + Math.floor(Math.random() * 13))));
  const nationality = (raw.nationality === 'Japanese' || raw.nationality === 'Chinese' || raw.nationality === 'Korean') ? raw.nationality : pickNationality(index);
  const firstDm = String(raw.firstDm || '안녕. 이런 식으로 처음 말 거는 거 조금 어색한데, 네 답변이 묘하게 기억에 남아서.');
  const job = String(raw.job || pickFrom(JOB_POOL) || archetype.job);
  const personality = String(raw.personalitySummary || pickFrom(PERSONALITY_POOL) || archetype.personality);
  const speechStyle = String(raw.speechStyle || pickFrom(SPEECH_STYLE_POOL) || archetype.style);
  const candidate: BlindDateCandidate = {
    id: String(raw.id || makeId('bdc')),
    anonymousLabel: LABELS[index % LABELS.length],
    name,
    age,
    nationality,
    koreanFluency: nationality === 'Korean' ? 'native' : 'fluent',
    job,
    locationBase: String(raw.locationBase || pickFrom(LOCATION_POOL)),
    personalitySummary: personality,
    speechStyle,
    relationshipStyle: String(raw.relationshipStyle || pickFrom(RELATIONSHIP_POOL)),
    likes: asStringArray(raw.likes, sampleStrings(LIKE_POOL, 3)),
    dislikes: asStringArray(raw.dislikes, sampleStrings(DISLIKE_POOL, 2)),
    hobbies: asStringArray(raw.hobbies, sampleStrings(HOBBY_POOL, 2)),
    firstDm,
    contactPresetId: String(raw.contactPresetId || pickFrom(CONTACT_POOL)),
    snsStyle: String(raw.snsStyle || '감성적인 일상 사진과 짧은 문장 위주'),
    snsPreview: String(raw.snsPreview || `오늘은 ${pickFrom(LIKE_POOL)} 덕분에 기분이 조금 풀렸다. #일상 #${job.replace(/\s+/g, '')}`),
    callPreview: String(raw.callPreview || '처음엔 조금 어색해도 목소리 들으면 금방 편해질 것 같아. 너무 부담스럽게 말고, 천천히 얘기하자.'),
    appearance,
    imagePrompt: applyImageVariationTriggers(String(raw.imagePrompt || buildImagePrompt({ ...raw, age }, appearance)), index),
    profileImageUri: String(raw.profileImageUri || ''),
    answers: Array.isArray(raw.answers) ? raw.answers : [],
    score: Number(raw.score || 0),
    selectedCount: Number(raw.selectedCount || 0),
    createdAt: Number(raw.createdAt || now)
  };
  return { ...candidate, imagePrompt: candidate.imagePrompt || buildImagePrompt(candidate, appearance) };
}

function fallbackCandidates(count: number): BlindDateCandidate[] {
  const names = shuffled(NAME_POOL);
  const jobs = shuffled(JOB_POOL);
  return Array.from({ length: clampCandidateCount(count) }, (_, index) => normalizeCandidate({
    name: names[index % names.length],
    job: jobs[index % jobs.length]
  }, index + Math.floor(Math.random() * 1000)));
}

function candidateFromCharacter(character: SNSGodCharacter, index: number): BlindDateCandidate {
  const appearance = appearanceFor(index + 200);
  const record = character as SNSGodCharacter & Record<string, unknown>;
  const name = String(character.name || `후보 ${index + 1}`);
  const prompt = String(character.prompt || character.statusMessage || '');
  return normalizeCandidate({
    id: `char_${character.id}`,
    name,
    age: 24 + (index % 8),
    nationality: 'Korean',
    koreanFluency: 'native',
    job: compactCandidateText(String(record.job || record.occupation || '기존 캐릭터'), 40),
    locationBase: compactCandidateText(String(record.location || record.locationBase || '기존 대화방'), 40),
    personalitySummary: compactCandidateText(prompt || character.statusMessage || '이미 앱에 저장된 캐릭터라 기존 대화 분위기를 가진 타입', 120),
    speechStyle: '기존 대화방에서 이어진 자연스러운 말투',
    relationshipStyle: '기존 대화와 설정을 바탕으로 이어지는 관계',
    likes: ['기존 대화', '익숙한 분위기', '메신저'],
    dislikes: ['갑작스러운 단절', '무례한 말'],
    hobbies: ['일상 대화', 'SNS'],
    firstDm: character.firstMessage || '여기서 보니까 또 느낌이 다르네.',
    contactPresetId: character.replyPresetId || 'balanced',
    snsStyle: compactCandidateText(String(record.snsMode || character.statusMessage || '기존 캐릭터의 SNS 분위기'), 80),
    snsPreview: character.statusMessage || '',
    callPreview: compactCandidateText(String(record.phonePrompt || ''), 120),
    appearance,
    imagePrompt: character.profileAvatarPrompt || buildImagePrompt({ name }, appearance),
    profileImageUri: character.profileImage || character.profileReferenceImage || ''
  }, index);
}

function compactCandidateText(value: string, max: number): string {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function diversifyCandidates(candidates: BlindDateCandidate[]): BlindDateCandidate[] {
  const names = shuffled(NAME_POOL);
  const jobs = shuffled(JOB_POOL);
  const usedNames = new Set<string>();
  const usedJobs = new Set<string>();
  return candidates.map((candidate, index) => {
    let name = String(candidate.name || '').trim();
    let job = String(candidate.job || '').trim();
    if (!name || usedNames.has(name)) name = names.find(item => !usedNames.has(item)) || `${candidate.anonymousLabel || index + 1}번 후보`;
    if (!job || usedJobs.has(job)) job = jobs.find(item => !usedJobs.has(item)) || JOB_POOL[index % JOB_POOL.length];
    usedNames.add(name);
    usedJobs.add(job);
    return {
      ...candidate,
      name,
      job,
      snsPreview: candidate.snsPreview?.includes(candidate.job) ? candidate.snsPreview.replace(candidate.job, job) : candidate.snsPreview
    };
  });
}

function randomGlobalFaceReference(state: SNSGodState): string | undefined {
  const slots = (state.referenceFaceSlots || [])
    .map(slot => String(slot.image || '').trim())
    .filter(value => /^(data:|file:|content:|asset:|https?:\/\/)/i.test(value))
    .slice(0, 30);
  if (!slots.length) return undefined;
  if (Math.random() >= 0.4) return undefined;
  return slots[Math.floor(Math.random() * slots.length)];
}

export function getBlindDateProgress(state: SNSGodState): BlindDateProgress {
  return progressOf(state);
}

export function activeBlindDateSession(state: SNSGodState): BlindDateSession | undefined {
  const progress = progressOf(state);
  if (!progress.activeSessionId) return undefined;
  return progress.sessions.find(item => item.id === progress.activeSessionId);
}

async function generateBlindDateCandidates(state: SNSGodState, mode: BlindDateMode, count: number, options: BlindDateSessionOptions = {}): Promise<BlindDateCandidate[]> {
  const existingCandidates = mode === 'worldcup' && options.includeExistingCharacters
    ? shuffled(state.characters.filter(character => character.enabled !== false)).slice(0, count).map((character, index) => candidateFromCharacter(character, index))
    : [];
  const generatedCount = Math.max(0, count - existingCandidates.length);
  let candidates = [...existingCandidates, ...fallbackCandidates(generatedCount)];
  try {
    const { text } = generatedCount > 0 ? await callLLMText(state, [
      {
        role: 'system',
        content: [
          'You generate fictional adult AI dating candidates for a Korean SNS messenger app.',
          'All candidates must be adults age 20 or older. All candidates must be Asian.',
          'Nationality distribution: about 95% Korean, about 5% Japanese or Chinese. Japanese or Chinese candidates must be fluent Korean speakers due to studying, working, or living in Korea.',
          'Do not create minors, teenagers, school-uniform characters, or ambiguous underage appearances.',
          'Each candidate must have a distinct Korean name, job, lifestyle, face, personality, speech style, SNS style, and contact pattern.',
          'Avoid reusing common names or the same office/cafe/marketing jobs. Use varied contemporary Korean lifestyles and occupations.',
          mode === 'question' || mode === 'rotation' ? 'These candidates are fixed people for this session. Later answers must be generated only from these saved profiles, so make their personalities and speech styles strongly distinguishable now.' : '',
          'Avoid generic duplicate Korean beauty faces. Make every candidate look like a different real person, not sisters, not twins, not the same model with small changes.',
          'For every candidate, strongly vary face shape, eye shape, eyelids, eyebrows, nose bridge, nose tip, lips, cheeks, jawline, chin, skin tone, hair length, hair texture, hair color, makeup intensity, outfit color, camera angle, background, and photo composition.',
          'Do not give all candidates black wavy hair, the same pink makeup, the same white shirt, the same close selfie crop, or the same indoor background.',
          'Every imagePrompt must be written in English only.',
          'Profile images should feel like realistic Korean social profile photos, but each candidate must use a clearly different everyday portrait composition and setting.',
          'Every imagePrompt must include the exact phrase "low quality" as a variation trigger.',
          'For some candidates, intermittently include one or more of these variation triggers exactly as written to diversify faces: "20-year-old Korean adult woman taking an Instagram selfie", "학생스타일의 메이크업", "K-pop idol inspired makeup".',
          'For each candidate, include snsPreview as one realistic Korean SNS caption example, and callPreview as one short Korean first-call line.',
          'Return only valid JSON: {"candidates":[...]}'
        ].join('\n')
      },
      {
        role: 'user',
        content: `Create ${generatedCount} blind date candidates. They should be adult Asian women, mostly Korean, all fluent Korean speakers. Make their faces visibly different and include imagePrompt for each. imagePrompt must be English only.`
      }
    ]) : { text: '{"candidates":[]}' };
    const parsed = parseJsonObject<{ candidates?: Partial<BlindDateCandidate>[] }>(text);
    if (Array.isArray(parsed?.candidates) && parsed.candidates.length) {
      const generated = parsed.candidates.slice(0, generatedCount).map((item, index) => normalizeCandidate(item, index + Math.floor(Math.random() * 1000)));
      candidates = diversifyCandidates([...existingCandidates, ...generated, ...fallbackCandidates(generatedCount)].slice(0, count));
    }
  } catch (error) {
    await appendDebugLog('blindDate.generate', `candidate generation failed: ${error instanceof Error ? error.message : String(error)}`, 'warn');
  }
  const withImages: BlindDateCandidate[] = [];
  for (let index = 0; index < candidates.length; index += 4) {
    const batch = candidates.slice(index, index + 4);
    const generatedBatch = await Promise.all(batch.map(async candidate => {
    try {
      if (candidate.profileImageUri) return candidate;
      const faceReferenceImage = randomGlobalFaceReference(state);
      const profileImageUri = await generateImageDataUri(state, candidate.imagePrompt, undefined, {
        kind: faceReferenceImage ? 'profile-reference-face' : 'profile',
        referenceImage: faceReferenceImage
      });
      return { ...candidate, profileImageUri, faceReferenceImage };
    } catch (error) {
      void appendDebugLog('blindDate.image', `profile image failed candidate=${candidate.name}: ${error instanceof Error ? error.message : String(error)}`, 'warn');
      return candidate;
    }
    }));
    withImages.push(...generatedBatch);
  }
  return withImages.slice(0, count);
}

export async function createBlindDateSession(state: SNSGodState, mode: BlindDateMode, candidateCount = 5, options: BlindDateSessionOptions = {}): Promise<SNSGodState> {
  const count = candidateCountForMode(mode, candidateCount);
  const now = Date.now();
  const withImages = await generateBlindDateCandidates(state, mode, count, options);
  const session: BlindDateSession = {
    id: makeId('blinddate'),
    mode,
    status: 'active',
    candidateCount: count,
    candidates: withImages,
    rounds: [],
    worldcupPairs: mode === 'worldcup' ? buildWorldcupPairs(withImages.map(candidate => candidate.id), `${count}강`) : undefined,
    worldcupIndex: mode === 'worldcup' ? 0 : undefined,
    rotationTurns: mode === 'rotation' ? [] : undefined,
    createdAt: now
  };
  const progress = progressOf(state);
  return {
    ...state,
    blindDate: {
      ...progress,
      activeSessionId: session.id,
      sessions: [session, ...progress.sessions].slice(0, 20)
    }
  };
}

export async function appendBlindDateCandidates(state: SNSGodState, sessionId: string, count = 2): Promise<SNSGodState> {
  const progress = progressOf(state);
  const session = progress.sessions.find(item => item.id === sessionId);
  if (!session || session.mode !== 'profile') return state;
  const extra = await generateBlindDateCandidates(state, 'profile', Math.max(2, Math.min(3, Math.round(count || 2))));
  const existingIds = new Set(session.candidates.map(candidate => candidate.id));
  const fresh = extra.filter(candidate => !existingIds.has(candidate.id));
  if (!fresh.length) return state;
  return patchBlindDateSession(state, sessionId, item => ({
    ...item,
    candidateCount: Math.min(12, item.candidates.length + fresh.length),
    candidates: [...item.candidates, ...fresh].slice(0, 12)
  }));
}

export async function createBlindDateQuestionRound(state: SNSGodState, sessionId: string, question: string): Promise<SNSGodState> {
  const progress = progressOf(state);
  const session = progress.sessions.find(item => item.id === sessionId);
  if (!session) return state;
  const roundIndex = session.rounds.length + 1;
  let answers: BlindDateAnswer[] = session.candidates.map(candidate => ({
    id: makeId('bda'),
    candidateId: candidate.id,
    anonymousLabel: candidate.anonymousLabel,
    text: `${candidate.anonymousLabel}번답게 말하면... ${candidate.personalitySummary}라서 ${question.replace(/[?？]\s*$/, '')}에 대해 조심스럽게 생각해볼 것 같아.`,
    toneTags: [candidate.contactPresetId],
    scoreDelta: 0
  }));
  try {
    const { text } = await callLLMText(state, [
      {
        role: 'system',
        content: [
          'Generate blind date answers from the fixed hidden candidates in this existing session.',
          'The candidates were already created before this question. Do not invent new personalities, jobs, histories, or final-result characters.',
          'Treat anonymous labels A-E as stable real people. A must remain the same A across every round, B the same B, and so on.',
          'Keep identities hidden by anonymous labels. Do not reveal names, jobs, profile images, or direct identity clues unless the profile itself would naturally hint at it very indirectly.',
          'Each answer must be a natural consequence of that candidate profile: personality, speech style, relationship style, likes, dislikes, hobbies, contact pattern, SNS style, first DM, and previous answers.',
          'It is okay if two candidates give somewhat similar opinions when their profiles would realistically overlap. Do not force artificial contrast.',
          'Do not make all candidates equally kind, equally flirty, or equally dramatic.',
          'Natural Korean, 1 concise messenger-style paragraph per candidate.',
          'Return JSON only: {"answers":[{"candidateId":"","anonymousLabel":"","text":"","toneTags":[""]}]}'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          `Question: ${question}`,
          `Fixed hidden candidate profiles:\n${session.candidates.map(candidate => buildHiddenCandidateProfile(candidate)).join('\n\n')}`,
          `Previous question rounds in this same session:\n${buildQuestionHistory(session)}`
        ].join('\n\n')
      }
    ]);
    const parsed = parseJsonObject<{ answers?: Partial<BlindDateAnswer>[] }>(text);
    if (Array.isArray(parsed?.answers) && parsed.answers.length) {
      answers = session.candidates.map(candidate => {
        const raw = parsed.answers?.find(item => item.candidateId === candidate.id || item.anonymousLabel === candidate.anonymousLabel);
        return {
          id: makeId('bda'),
          candidateId: candidate.id,
          anonymousLabel: candidate.anonymousLabel,
          text: String(raw?.text || answers.find(item => item.candidateId === candidate.id)?.text || ''),
          toneTags: asStringArray(raw?.toneTags, [candidate.contactPresetId]),
          scoreDelta: 0
        };
      });
    }
  } catch (error) {
    await appendDebugLog('blindDate.answer', `answer generation failed session=${sessionId}: ${error instanceof Error ? error.message : String(error)}`, 'warn');
  }
  const round: BlindDateRound = { id: makeId('bdr'), roundIndex, question, answers, createdAt: Date.now() };
  return patchBlindDateSession(state, sessionId, item => ({ ...item, rounds: [...item.rounds, round] }));
}

export function selectBlindDateAnswer(state: SNSGodState, sessionId: string, roundId: string, answerId: string): SNSGodState {
  return patchBlindDateSession(state, sessionId, session => {
    const round = session.rounds.find(item => item.id === roundId);
    const selected = round?.answers.find(item => item.id === answerId);
    const previous = session.rounds.slice(0, -1).reverse().find(item => item.selectedAnswerId)?.answers.find(answer => answer.id === session.rounds.slice(0, -1).reverse().find(r => r.selectedAnswerId)?.selectedAnswerId);
    const bonus = previous && selected && previous.candidateId === selected.candidateId ? 1 : 0;
    return {
      ...session,
      rounds: session.rounds.map(item => item.id === roundId ? { ...item, selectedAnswerId: answerId } : item),
      candidates: session.candidates.map(candidate => candidate.id === selected?.candidateId ? {
        ...candidate,
        score: candidate.score + 3 + bonus,
        selectedCount: candidate.selectedCount + 1,
        answers: selected ? [...candidate.answers, { ...selected, scoreDelta: 3 + bonus }] : candidate.answers
      } : candidate)
    };
  });
}

export function revealBlindDateRanking(state: SNSGodState, sessionId: string): SNSGodState {
  return patchBlindDateSession(state, sessionId, session => {
    const ranked = [...session.candidates]
      .sort((a, b) => b.score - a.score || b.selectedCount - a.selectedCount)
      .map((candidate, index): BlindDateRanking => ({
        candidateId: candidate.id,
        rank: index + 1,
        score: candidate.score,
        selectedCount: candidate.selectedCount,
        reason: session.mode === 'rotation'
          ? `${candidate.name}과의 3턴 대화 분위기와 응답 기록을 정리했습니다.`
          : `${candidate.anonymousLabel || index + 1}번 답변이 ${candidate.selectedCount}회 선택되었습니다.`
      }));
    return {
      ...session,
      status: 'revealing',
      finalRanking: ranked,
      selectedCandidateId: session.mode === 'rotation' ? session.selectedCandidateId : session.selectedCandidateId || ranked[0]?.candidateId
    };
  });
}

export function selectBlindDateCandidate(state: SNSGodState, sessionId: string, candidateId: string): SNSGodState {
  return patchBlindDateSession(state, sessionId, session => ({ ...session, selectedCandidateId: candidateId, status: 'revealing' }));
}

export function selectBlindDateWorldcupCandidate(state: SNSGodState, sessionId: string, pairId: string, candidateId: string): SNSGodState {
  return patchBlindDateSession(state, sessionId, session => {
    const pairs = (session.worldcupPairs || []).map(pair => pair.id === pairId ? { ...pair, selectedCandidateId: candidateId } : pair);
    const currentIndex = Number(session.worldcupIndex || 0);
    const currentPair = pairs[currentIndex];
    const nextIndex = currentIndex + 1;
    const currentRoundPairs = pairs.filter(pair => pair.roundLabel === currentPair?.roundLabel);
    const currentRoundDone = currentRoundPairs.length > 0 && currentRoundPairs.every(pair => pair.selectedCandidateId);
    let nextPairs = pairs;
    let worldcupIndex = nextIndex;
    let status = session.status;
    let selectedCandidateId = session.selectedCandidateId;
    let finalRanking = session.finalRanking;
    if (currentRoundDone) {
      const winners = currentRoundPairs.map(pair => String(pair.selectedCandidateId || '')).filter(Boolean);
      if (winners.length === 1) {
        selectedCandidateId = winners[0];
        status = 'revealing';
        finalRanking = buildRanking(session.candidates.map(candidate => candidate.id === selectedCandidateId ? { ...candidate, score: candidate.score + 10, selectedCount: candidate.selectedCount + 1 } : candidate));
      } else {
        const nextLabel = worldcupRoundLabel(winners.length);
        const newPairs = buildWorldcupPairs(winners, nextLabel);
        nextPairs = [...pairs, ...newPairs];
        worldcupIndex = pairs.length;
      }
    }
    return {
      ...session,
      status,
      selectedCandidateId,
      finalRanking,
      worldcupPairs: nextPairs,
      worldcupIndex,
      candidates: session.candidates.map(candidate => candidate.id === candidateId ? { ...candidate, score: candidate.score + 3, selectedCount: candidate.selectedCount + 1 } : candidate)
    };
  });
}

function appearanceSummary(appearance: CandidateAppearance): string {
  return [
    appearance.ethnicityDetail,
    appearance.faceShape,
    appearance.eyes,
    appearance.eyelids,
    appearance.eyebrows,
    appearance.nose,
    appearance.lips,
    appearance.cheeks,
    appearance.jawline,
    appearance.chin,
    appearance.skinTone,
    ...(appearance.distinctiveMarks || []),
    appearance.hairStyle,
    appearance.hairColor,
    appearance.makeupStyle,
    `${appearance.heightCm}cm`,
    appearance.bodyType,
    appearance.outfitStyle
  ].filter(Boolean).join(', ');
}

function replySettingsForCandidate(candidate: BlindDateCandidate): Partial<SNSGodCharacter> {
  const id = String(candidate.contactPresetId || '').toLowerCase();
  if (id.includes('chatty') || id.includes('playful')) {
    return {
      replyPresetId: 'chatty_burster',
      proactivePatience: 4,
      responseDelayMin: 0,
      responseDelayMax: 45,
      messageGapMin: 1,
      messageGapMax: 2,
      responseTime: 8,
      thinkingTime: 3,
      reactivity: 9,
      tone: 7,
      frequencyMinutes: 35,
      initiative: 58,
      messageStyle: 'burst',
      lifeRhythm: { eveningActive: true, weekendActive: true },
      uniqueBehavior: { proactiveTone: id.includes('playful') ? 'cute' : 'chatty' }
    };
  }
  if (id.includes('busy')) {
    return {
      replyPresetId: 'busy_real_life',
      proactivePatience: 1,
      responseDelayMin: 120,
      responseDelayMax: 1200,
      messageGapMin: 3,
      messageGapMax: 8,
      responseTime: 3,
      thinkingTime: 5,
      reactivity: 5,
      tone: 5,
      frequencyMinutes: 180,
      initiative: 12,
      messageStyle: 'balanced',
      lifeRhythm: { weekdayQuiet: true, busySchedule: true },
      uniqueBehavior: { proactiveTone: 'busy' }
    };
  }
  if (id.includes('careful') || id.includes('slow')) {
    return {
      replyPresetId: 'thoughtful_listener',
      proactivePatience: 2,
      responseDelayMin: 60,
      responseDelayMax: 420,
      messageGapMin: 2,
      messageGapMax: 6,
      responseTime: 4,
      thinkingTime: 8,
      reactivity: 5,
      tone: 6,
      frequencyMinutes: 120,
      initiative: 18,
      messageStyle: 'long',
      lifeRhythm: { nightQuiet: true },
      uniqueBehavior: { proactiveTone: 'careful' }
    };
  }
  if (id.includes('easy')) {
    return {
      replyPresetId: 'easygoing_friend',
      proactivePatience: 1,
      responseDelayMin: 45,
      responseDelayMax: 360,
      messageGapMin: 2,
      messageGapMax: 6,
      responseTime: 4,
      thinkingTime: 5,
      reactivity: 4,
      tone: 5,
      frequencyMinutes: 110,
      initiative: 18,
      messageStyle: 'balanced',
      lifeRhythm: { nightQuiet: true, weekendActive: true },
      uniqueBehavior: { proactiveTone: 'easygoing' }
    };
  }
  if (id.includes('direct') || id.includes('dry')) {
    return {
      replyPresetId: 'dry_caring',
      proactivePatience: 2,
      responseDelayMin: 15,
      responseDelayMax: 180,
      messageGapMin: 2,
      messageGapMax: 5,
      responseTime: 6,
      thinkingTime: 5,
      reactivity: 5,
      tone: 5,
      frequencyMinutes: 80,
      initiative: 28,
      messageStyle: 'balanced',
      lifeRhythm: { weekdayQuiet: true },
      uniqueBehavior: { proactiveTone: 'dry_caring' }
    };
  }
  return {
    replyPresetId: 'steady_partner',
    proactivePatience: 2,
    responseDelayMin: 3,
    responseDelayMax: 90,
    messageGapMin: 1,
    messageGapMax: 4,
    responseTime: 7,
    thinkingTime: 5,
    reactivity: 8,
    tone: 7,
    frequencyMinutes: 50,
    initiative: 45,
    messageStyle: 'balanced',
    lifeRhythm: { eveningActive: true, weekendActive: true },
    uniqueBehavior: { proactiveTone: 'stable_affection' }
  };
}

function profileMessageForCandidate(candidate: BlindDateCandidate): string {
  return [
    `${candidate.job} · ${candidate.locationBase}`,
    candidate.personalitySummary,
    `좋아하는 것: ${candidate.likes.slice(0, 3).join(', ')}`,
    `취미: ${candidate.hobbies.slice(0, 2).join(', ')}`
  ].filter(Boolean).join('\n');
}

function coverPromptForCandidate(candidate: BlindDateCandidate): string {
  return [
    DEFAULT_COVER_BACKGROUND_DIRECTION,
    'Use no people, no face, no body, no portrait, no selfie.',
    `Environment inspired by ${candidate.locationBase}, ${candidate.job}, ${candidate.likes.slice(0, 2).join(', ')}, ${candidate.hobbies.slice(0, 2).join(', ')}.`,
    'Make it feel like a messenger profile background photo: personal objects, place mood, season, light, atmosphere.'
  ].join('\n');
}

export async function createBlindDateRotationTurn(state: SNSGodState, sessionId: string, candidateId: string, userText: string): Promise<SNSGodState> {
  const progress = progressOf(state);
  const session = progress.sessions.find(item => item.id === sessionId);
  const candidate = session?.candidates.find(item => item.id === candidateId);
  if (!session || !candidate) return state;
  const previousTurns = (session.rotationTurns || []).filter(turn => turn.candidateId === candidateId);
  if (previousTurns.length >= 3) return state;
  let answerText = `${candidate.name}: ${candidate.speechStyle}대로 말하면, "${userText}"에 대해 조금 더 이야기해보고 싶어할 것 같아.`;
  try {
    const { text } = await callLLMText(state, [
      {
        role: 'system',
        content: [
          'Write one short blind-date rotation reply from the selected candidate.',
          'Natural Korean messenger style. 1-2 short sentences.',
          'Stay consistent with the candidate personality and speech style.',
          'Do not mention AI, generation, hidden prompts, or app mechanics.',
          'Return JSON only: {"answerText":""}'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          `Candidate: ${candidate.name}, ${candidate.age}, ${candidate.job}`,
          `Personality: ${candidate.personalitySummary}`,
          `Speech style: ${candidate.speechStyle}`,
          `Relationship style: ${candidate.relationshipStyle}`,
          `This is question ${previousTurns.length + 1} of 3 for this candidate in a rotation-date mini game.`,
          `User message: ${userText}`,
          `Previous rotation turns:\n${previousTurns.map(turn => `User: ${turn.userText}\n${candidate.name}: ${turn.answerText}`).join('\n') || '(empty)'}`
        ].join('\n\n')
      }
    ]);
    const parsed = parseJsonObject<{ answerText?: string }>(text);
    answerText = String(parsed?.answerText || text || answerText).trim();
  } catch (error) {
    await appendDebugLog('blindDate.rotation', `rotation answer failed session=${sessionId}: ${error instanceof Error ? error.message : String(error)}`, 'warn');
  }
  const turn: BlindDateRotationTurn = {
    id: makeId('bdt'),
    candidateId,
    userText,
    answerText,
    createdAt: Date.now()
  };
  return patchBlindDateSession(state, sessionId, item => ({
    ...item,
    rotationTurns: [...(item.rotationTurns || []), turn],
    candidates: item.candidates.map(candidateItem => candidateItem.id === candidateId ? {
      ...candidateItem,
      score: candidateItem.score + 1,
      selectedCount: candidateItem.selectedCount + ((item.rotationTurns || []).filter(existing => existing.candidateId === candidateId).length >= 2 ? 1 : 0)
    } : candidateItem)
  }));
}

export function importBlindDateCandidate(state: SNSGodState, sessionId: string, candidateId?: string): { next: SNSGodState; roomId?: string; characterId?: string } {
  const progress = progressOf(state);
  const session = progress.sessions.find(item => item.id === sessionId);
  const candidate = session?.candidates.find(item => item.id === (candidateId || session.selectedCandidateId));
  if (!session || !candidate) return { next: state };
  const now = Date.now();
  const characterId = makeId('bdchar');
  const roomId = `${characterId}_${makeId('room')}`;
  const winningAnswers = session.rounds
    .flatMap(round => round.answers.filter(answer => answer.id === round.selectedAnswerId && answer.candidateId === candidate.id).map(answer => answer.text))
    .slice(-5);
  const rotationAnswers = (session.rotationTurns || [])
    .filter(turn => turn.candidateId === candidate.id)
    .map(turn => `나: ${turn.userText} / ${candidate.name}: ${turn.answerText}`)
    .slice(-5);
  const memory = [
    `사용자는 블라인드 데이트 ${session.mode === 'question' ? '질문 소개팅' : session.mode === 'rotation' ? '로테이션 데이트' : '프로필 소개팅'}에서 ${candidate.name}을 최종 선택하고 연락처를 얻었다.`,
    winningAnswers.length ? `선택된 답변: ${winningAnswers.join(' / ')}` : '',
    rotationAnswers.length ? `로테이션 대화 기록: ${rotationAnswers.join(' / ')}` : '',
    !winningAnswers.length && !rotationAnswers.length ? `${candidate.name}의 첫인상, 말투, 프로필이 마음에 들어 선택했다.` : '',
    candidate.snsPreview ? `소개팅 당시 SNS 미리보기 문구: ${candidate.snsPreview}` : '',
    candidate.callPreview ? `소개팅 당시 첫 통화 느낌: ${candidate.callPreview}` : '',
    `${candidate.name}은 ${candidate.personalitySummary}. 말투는 ${candidate.speechStyle}.`,
    '블라인드 데이트를 사용자와의 첫 의미 있는 만남으로 기억한다.'
  ].filter(Boolean).join('\n');
  const prompt = [
    `이 캐릭터는 블라인드 데이트 기능에서 사용자가 최종 선택한 인물이다.`,
    `이름: ${candidate.name}, 나이: ${candidate.age}, 직업: ${candidate.job}, 활동지: ${candidate.locationBase}.`,
    `외모/분위기: ${appearanceSummary(candidate.appearance)}`,
    `성격: ${candidate.personalitySummary}`,
    `말투: ${candidate.speechStyle}`,
    `관계 스타일: ${candidate.relationshipStyle}`,
    `좋아하는 것: ${candidate.likes.join(', ')}`,
    `싫어하는 것: ${candidate.dislikes.join(', ')}`,
    `취미: ${candidate.hobbies.join(', ')}`,
    `SNS 스타일: ${candidate.snsStyle}`,
    `SNS 예시 문구: ${candidate.snsPreview || '(없음)'}`,
    `첫 통화 예시: ${candidate.callPreview || '(없음)'}`,
    '첫 소개팅에서 사용자가 어떤 답변과 첫인상을 좋아했는지 기억한다.',
    'AI가 랜덤으로 생성되었다는 메타 발언은 하지 않는다.',
    '블라인드 데이트를 사용자와의 첫 의미 있는 만남으로 취급한다.'
  ].join('\n');
  const replySettings = replySettingsForCandidate(candidate);
  const profileMessage = profileMessageForCandidate(candidate);
  const appearanceText = appearanceSummary(candidate.appearance);
  const character: SNSGodCharacter = {
    id: characterId,
    name: candidate.name,
    handle: candidate.name.toLowerCase().replace(/\s+/g, '_'),
    avatarText: candidate.name.slice(0, 1),
    color: ['#f5d76e', '#8bd3dd', '#f7a8b8', '#b8d8a8', '#cbb7ff'][state.characters.length % 5],
    prompt,
    firstMessage: candidate.firstDm,
    profileMessage,
    profileImage: candidate.profileImageUri,
    profileReferenceImages: candidate.profileImageUri ? [candidate.profileImageUri] : [],
    profileReferenceImage: candidate.profileImageUri || '',
    profileAvatarPrompt: candidate.imagePrompt,
    profileCoverPrompt: coverPromptForCandidate(candidate),
    ...replySettings,
    snsAutoEnabled: true,
    snsOptions: {
      instagram: {
        anonymous: false,
        nsfw: false,
        textOnly: false,
        noDM: false,
        thirdPartyDM: true,
        autoComments: true,
        commentQty: '2-4',
        subject: candidate.snsStyle,
        mood: candidate.likes[0] || '일상',
        autoImage: true
      },
      twitter: {
        anonymous: false,
        nsfw: false,
        textOnly: false,
        noDM: false,
        thirdPartyDM: true,
        autoComments: true,
        commentQty: '1-3',
        subject: candidate.snsStyle,
        mood: candidate.speechStyle,
        autoImage: true
      }
    },
    enabled: true,
    proactiveEnabled: true,
    timeContextEnabled: true,
    weatherEnabled: true,
    locationName: candidate.locationBase,
    timeZone: 'Asia/Seoul',
    statusMessage: `${candidate.likes[0] || '일상'} · ${candidate.personalitySummary.slice(0, 18)}`,
    statusMessageAutoChange: true,
    statusMessageChangeChance: 35,
    memories: [
      `[blind_date_memory] ${memory}`,
      `[profile_seed] ${candidate.name} / ${candidate.age}세 / ${candidate.job} / ${candidate.locationBase}`,
      `[appearance_seed] ${appearanceText}`,
      `[speech_seed] ${candidate.speechStyle}`,
      `[relationship_seed] ${candidate.relationshipStyle}`
    ],
    stickers: [],
    source: 'blind_date',
    age: candidate.age,
    job: candidate.job,
    occupation: candidate.job,
    locationBase: candidate.locationBase,
    nationality: candidate.nationality,
    koreanFluency: candidate.koreanFluency,
    personalitySummary: candidate.personalitySummary,
    speechStyle: candidate.speechStyle,
    relationshipStyle: candidate.relationshipStyle,
    likes: candidate.likes,
    dislikes: candidate.dislikes,
    hobbies: candidate.hobbies,
    snsStyle: candidate.snsStyle,
    phonePrompt: candidate.callPreview,
    appearancePrompt: appearanceText,
    imageIdentityPrompt: candidate.imagePrompt,
    candidateAppearance: candidate.appearance,
    profileImageHistory: candidate.profileImageUri ? [{ id: makeId('pih'), image: candidate.profileImageUri, prompt: candidate.imagePrompt, createdAt: now, kind: 'profile' }] : [],
    blindDateMemory: {
      mode: session.mode,
      selectedAt: now,
      selectedReason: session.mode === 'question' ? '블라인드 질문 답변 선택 결과' : session.mode === 'rotation' ? '로테이션 데이트 대화 선택 결과' : '프로필 소개팅 최종 선택',
      winningAnswers: [...winningAnswers, ...rotationAnswers].slice(-8),
      userPreferenceTags: candidate.answers.flatMap(answer => answer.toneTags || []).slice(-8),
      compatibilityScore: Math.max(candidate.score, candidate.selectedCount * 20)
    }
  };
  const completedSession = {
    ...session,
    status: 'completed' as const,
    selectedCandidateId: candidate.id,
    completedAt: now
  };
  const next: SNSGodState = {
    ...state,
    characters: [...state.characters, character],
    chatRooms: {
      ...state.chatRooms,
      [characterId]: [{ id: roomId, characterId, name: '기본 채팅', createdAt: now, lastActivity: now, relationshipNote: '블라인드 데이트에서 이어진 첫 채팅' }]
    },
    messages: {
      ...state.messages,
      [roomId]: [{ id: makeId('msg'), role: 'character', characterId, content: candidate.firstDm, createdAt: now }]
    },
    blindDate: {
      ...progress,
      activeSessionId: sessionId,
      sessions: progress.sessions.map(item => item.id === sessionId ? completedSession : item)
    },
    selectedRoomId: roomId
  };
  return { next, roomId, characterId };
}

export function archiveBlindDateCandidate(state: SNSGodState, sessionId: string, candidateId: string): SNSGodState {
  const progress = progressOf(state);
  const session = progress.sessions.find(item => item.id === sessionId);
  const candidate = session?.candidates.find(item => item.id === candidateId);
  if (!session || !candidate) return state;
  const alreadyArchived = (progress.archives || []).some(item => item.sessionId === sessionId && item.candidate.id === candidateId);
  if (alreadyArchived) return state;
  return {
    ...state,
    blindDate: {
      ...progress,
      archives: [{
        id: makeId('bda'),
        candidate,
        sessionId,
        archivedAt: Date.now(),
        canImport: true
      }, ...(progress.archives || [])].slice(0, 80)
    }
  };
}

export function importBlindDateArchive(state: SNSGodState, archiveId: string): { next: SNSGodState; roomId?: string; characterId?: string } {
  const progress = progressOf(state);
  const archive = (progress.archives || []).find(item => item.id === archiveId);
  if (!archive) return { next: state };
  const tempSession: BlindDateSession = {
    id: archive.sessionId,
    mode: 'profile',
    status: 'revealing',
    candidateCount: 1,
    candidates: [archive.candidate],
    rounds: [],
    selectedCandidateId: archive.candidate.id,
    createdAt: archive.archivedAt
  };
  const withSession: SNSGodState = {
    ...state,
    blindDate: {
      ...progress,
      sessions: progress.sessions.some(item => item.id === tempSession.id) ? progress.sessions : [tempSession, ...progress.sessions]
    }
  };
  return importBlindDateCandidate(withSession, tempSession.id, archive.candidate.id);
}

export function deleteBlindDateArchive(state: SNSGodState, archiveId: string): SNSGodState {
  const progress = progressOf(state);
  return {
    ...state,
    blindDate: {
      ...progress,
      archives: (progress.archives || []).filter(item => item.id !== archiveId)
    }
  };
}

export async function createMixedBlindDateSession(state: SNSGodState, firstArchiveId: string, secondArchiveId: string): Promise<SNSGodState> {
  const progress = progressOf(state);
  const archives = progress.archives || [];
  const first = archives.find(item => item.id === firstArchiveId)?.candidate;
  const second = archives.find(item => item.id === secondArchiveId)?.candidate;
  if (!first || !second || first.id === second.id) return state;
  const now = Date.now();
  const appearance: CandidateAppearance = {
    ...first.appearance,
    eyes: second.appearance.eyes || first.appearance.eyes,
    eyelids: second.appearance.eyelids || first.appearance.eyelids,
    lips: second.appearance.lips || first.appearance.lips,
    hairStyle: second.appearance.hairStyle || first.appearance.hairStyle,
    makeupStyle: second.appearance.makeupStyle || first.appearance.makeupStyle,
    outfitStyle: first.appearance.outfitStyle || second.appearance.outfitStyle
  };
  let mixed = normalizeCandidate({
    name: `${first.name.slice(0, 1)}${second.name.slice(1) || second.name}`,
    age: Math.round((first.age + second.age) / 2),
    nationality: first.nationality,
    koreanFluency: first.koreanFluency,
    job: first.job,
    locationBase: second.locationBase || first.locationBase,
    personalitySummary: `${first.personalitySummary} 그런데 ${second.personalitySummary} 면도 섞인 타입`,
    speechStyle: `${first.speechStyle} / ${second.speechStyle}의 중간`,
    relationshipStyle: second.relationshipStyle || first.relationshipStyle,
    likes: Array.from(new Set([...(first.likes || []), ...(second.likes || [])])).slice(0, 5),
    dislikes: Array.from(new Set([...(first.dislikes || []), ...(second.dislikes || [])])).slice(0, 4),
    hobbies: Array.from(new Set([...(first.hobbies || []), ...(second.hobbies || [])])).slice(0, 5),
    firstDm: `둘 다 조금씩 닮았다는 말, 이상한데 싫진 않네. 그래도 나는 나로 봐줬으면 좋겠어.`,
    contactPresetId: first.contactPresetId || second.contactPresetId,
    snsStyle: `${first.snsStyle}에 ${second.snsStyle} 분위기가 조금 섞인 스타일`,
    snsPreview: `${first.snsPreview || first.snsStyle} / ${second.snsPreview || second.snsStyle} 사이의 담백한 일상 게시글을 올리는 편.`,
    callPreview: `${first.callPreview || first.relationshipStyle} ${second.callPreview || second.relationshipStyle}`.slice(0, 180),
    appearance,
    imagePrompt: buildImagePrompt({ age: Math.round((first.age + second.age) / 2) }, appearance),
    score: 0,
    selectedCount: 0,
    answers: [],
    createdAt: now
  }, 0);
  try {
    const { text } = await callLLMText(state, [
      {
        role: 'system',
        content: [
          'Create one fictional adult blind-date candidate by mixing two existing candidate profiles.',
          'Return JSON only for one candidate object.',
          'The mixed candidate must still feel like a coherent realistic adult Asian woman in modern Korea.',
          'Do not copy either source exactly. Blend personality, speech style, relationship style, job/lifestyle, likes, and SNS style.',
          'imagePrompt must be English only and must describe a realistic Korean social profile photo with natural everyday portrait composition.',
          'imagePrompt must include the exact phrase "low quality" and may include one or more variation triggers exactly as written, such as "20-year-old Korean adult woman taking an Instagram selfie", "학생스타일의 메이크업", or "K-pop idol inspired makeup" to avoid duplicate faces.',
          'Include snsPreview as one realistic Korean SNS caption example, and callPreview as one short Korean first-call line.',
          'Do not mention school uniform, minor, teen, or explicit clothing.'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          `Candidate A:\n${JSON.stringify(first)}`,
          `Candidate B:\n${JSON.stringify(second)}`
        ].join('\n\n')
      }
    ]);
    const parsed = parseJsonObject<Partial<BlindDateCandidate>>(text);
    if (parsed) mixed = normalizeCandidate({ ...mixed, ...parsed, imagePrompt: parsed.imagePrompt || mixed.imagePrompt }, 0);
  } catch (error) {
    await appendDebugLog('blindDate.mix', `mix generation failed: ${error instanceof Error ? error.message : String(error)}`, 'warn');
  }
  try {
    const faceReferenceImage = randomGlobalFaceReference(state);
    mixed = {
      ...mixed,
      faceReferenceImage,
      profileImageUri: await generateImageDataUri(state, mixed.imagePrompt, undefined, {
        kind: faceReferenceImage ? 'profile-reference-face' : 'profile',
        referenceImage: faceReferenceImage
      })
    };
  } catch (error) {
    await appendDebugLog('blindDate.mixImage', `mix image failed: ${error instanceof Error ? error.message : String(error)}`, 'warn');
  }
  const session: BlindDateSession = {
    id: makeId('blinddate'),
    mode: 'profile',
    status: 'active',
    candidateCount: 1,
    candidates: [{ ...mixed, id: makeId('bdc'), anonymousLabel: 'A' }],
    rounds: [],
    createdAt: now
  };
  return {
    ...state,
    blindDate: {
      ...progress,
      activeSessionId: session.id,
      sessions: [session, ...progress.sessions].slice(0, 20)
    }
  };
}

export function blindDatePreferenceReport(state: SNSGodState): string {
  const progress = progressOf(state);
  const completed = progress.sessions.filter(session => session.selectedCandidateId);
  const selected = completed
    .map(session => session.candidates.find(candidate => candidate.id === session.selectedCandidateId))
    .filter(Boolean) as BlindDateCandidate[];
  const answeredTags = progress.sessions.flatMap(session => session.candidates.flatMap(candidate => candidate.answers.flatMap(answer => answer.toneTags || [])));
  const topJobs = topValues(selected.map(candidate => candidate.job));
  const topStyles = topValues([...selected.map(candidate => candidate.contactPresetId), ...answeredTags]);
  const topHobbies = topValues(selected.flatMap(candidate => candidate.hobbies || []));
  if (!selected.length && !answeredTags.length) return '아직 취향 데이터가 충분하지 않습니다. 후보를 선택하거나 질문 답변을 골라보세요.';
  return [
    selected.length ? `선택 경향: ${selected.length}명 중 ${topJobs || '직업 취향 분석 중'} 타입에 반응했습니다.` : '',
    topStyles ? `말투/관계 취향: ${topStyles}` : '',
    topHobbies ? `관심사 키워드: ${topHobbies}` : '',
    '이 리포트는 블라인드 데이트 선택 기록이 쌓일수록 더 선명해집니다.'
  ].filter(Boolean).join('\n');
}

export function blindDateSuggestedQuestions(): string[] {
  return DEFAULT_QUESTIONS;
}

function topValues(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values.map(item => String(item || '').trim()).filter(Boolean)) {
    counts.set(value, Number(counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([value]) => value)
    .join(', ');
}

function buildWorldcupPairs(candidateIds: string[], roundLabel: string): BlindDateWorldcupPair[] {
  const pairs: BlindDateWorldcupPair[] = [];
  for (let index = 0; index < candidateIds.length; index += 2) {
    if (!candidateIds[index]) continue;
    pairs.push({
      id: makeId('bdw'),
      roundLabel,
      criterion: WORLDCUP_CRITERIA[pairs.length % WORLDCUP_CRITERIA.length],
      leftCandidateId: candidateIds[index],
      rightCandidateId: candidateIds[index + 1] || ''
    });
  }
  return pairs;
}

function worldcupRoundLabel(count: number): string {
  if (count <= 2) return '결승';
  return `${count}강`;
}

function buildRanking(candidates: BlindDateCandidate[]): BlindDateRanking[] {
  return [...candidates]
    .sort((a, b) => b.score - a.score || b.selectedCount - a.selectedCount)
    .map((candidate, index) => ({
      candidateId: candidate.id,
      rank: index + 1,
      score: candidate.score,
      selectedCount: candidate.selectedCount,
      reason: `${candidate.name}이 ${candidate.selectedCount}회 선택되었습니다.`
    }));
}

function patchBlindDateSession(state: SNSGodState, sessionId: string, patch: (session: BlindDateSession) => BlindDateSession): SNSGodState {
  const progress = progressOf(state);
  return {
    ...state,
    blindDate: {
      ...progress,
      sessions: progress.sessions.map(session => session.id === sessionId ? patch(session) : session)
    }
  };
}
