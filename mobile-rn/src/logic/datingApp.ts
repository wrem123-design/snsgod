import { CandidateAppearance, DatingAppPhoto, DatingAppProfile, DatingAppProgress, SNSGodCharacter, SNSGodMessage, SNSGodState } from '../types';
import { callLLMText, generateImageDataUri, parseJsonObject } from './api';
import { appendDebugLog } from './debugLog';
import { makeId } from './ids';
import { buildRandomCategorizedImagePrompt } from './randomImagePrompt';
import { createRoom } from './stateHelpers';

export const DEFAULT_DATING_APP_REFRESH_HOURS = 12;
export const DEFAULT_DATING_APP_ACCEPTANCE_CHANCE = 50;

const MIN_REFRESH_HOURS = 1;
const MAX_REFRESH_HOURS = 168;
const REQUEST_MIN_DELAY_MS = 2 * 60 * 1000;
const REQUEST_MAX_DELAY_MS = 8 * 60 * 1000;
const DATING_APP_BATCH_SIZE = 3;

type GeneratedDatingAppProfile = Record<string, unknown> & Partial<Omit<DatingAppProfile, 'id' | 'photos' | 'createdAt' | 'expiresAt' | 'imagePrompts'>>;

const DEFAULT_NAMES = ['서윤', '하린', '지안', '유나', '가은', '다희', '채원', '민서', '수아', '나린'];
const JOBS = ['브랜드 마케터', '피부관리사', '공간 디자이너', '요가 강사', '주얼리 디자이너', '카페 매니저', '영상 편집자', '플로리스트', '성인 연애 칼럼니스트', '라운지 바 매니저', '범죄심리 콘텐츠 작가', '프라이빗 클럽 매니저'];
const LOCATIONS = ['서울 성수동', '서울 연남동', '부산 전포동', '대구 삼덕동', '인천 송도', '경기 판교', '대전 둔산동', '광주 동명동'];
const EDUCATIONS = ['대학교 졸업', '전문대 졸업', '대학원 재학', '대학원 졸업', '고등학교 졸업', '휴학 중', '프리랜서 과정 수료'];
const MBTIS = ['ISTP', 'ISFP', 'INFJ', 'ENFP', 'INTJ', 'ESTP', 'ISFJ', 'ENTP', 'INFP', 'ESFJ'];
const TRAITS = ['허세 없어요', '답장이 솔직해요', '취향이 뚜렷해요', '처음엔 낯가려요', '장난을 잘 받아줘요', '혼자 있는 시간도 좋아해요', '끌리면 숨기지 않아요', '질투심을 조금 봐요', '상대 반응을 잘 관찰해요', '스킨십 선이 분명해요', '약속을 중요하게 봐요', '웃음 코드가 중요해요'];
const INTERESTS = ['맛집 투어', '밤 산책', '영화관 가기', '전시회 관람', '와인바', '러닝', '노래방', '사진 찍기', '향수 시향', '카페 가기', '심야 드라이브', '라운지 바', '연애 심리', '플러팅', '집에서 쉬기', '짧은 여행'];
const EDGE_PROFILE_PRESETS = [
  {
    job: '성인 연애 칼럼니스트',
    bio: '돌려 말하는 건 별로 안 좋아해요. 끌림, 질투, 스킨십 취향 같은 건 어른답게 솔직히 말하는 쪽이 더 재밌다고 생각해요.',
    personalitySummary: '성적으로 솔직하고 도발적이며 상대가 당황하는 반응을 즐기는 성인 여성 타입',
    speechStyle: '부끄러워하지 않고 끌림과 욕망을 직접 확인하는 플러팅 말투',
    relationshipStyle: '감정만큼 성적 케미와 스킨십 취향을 중요하게 보고 초반부터 선을 확인하는 편',
    firstMessage: '신청 온 거 봤어요. 프로필은 얌전한데, 말투까지 얌전한지는 좀 확인해보고 싶네요.',
    callPreview: '목소리 들으면 긴장하는 타입인지 아닌지 바로 티 나요.'
  },
  {
    job: '범죄심리 콘텐츠 작가',
    bio: '사람이 거짓말할 때 표정이 바뀌는 순간을 좋아해요. 다정한 말보다 솔직한 반응이 더 믿음직하거든요.',
    personalitySummary: '냉담하고 조작적이며 상대의 약점과 반응을 실험하듯 관찰하는 타입',
    speechStyle: '웃으면서도 상대의 빈틈을 찌르고 질문으로 몰아가는 차가운 말투',
    relationshipStyle: '호감보다 흥미가 먼저 움직이고, 상대가 어디까지 흔들리는지 확인해야 마음이 생기는 편',
    firstMessage: '신청은 봤어요. 근데 왜 저한테 보냈는지, 대답을 좀 잘해야 할 것 같은데요.',
    callPreview: '전화하면 목소리보다 침묵에서 더 많은 게 들려요.'
  },
  {
    job: '라운지 바 매니저',
    bio: '분위기 타는 편이에요. 예의 바른 척만 하는 사람보다, 끌리면 끌린다고 말할 줄 아는 사람이 좋아요.',
    personalitySummary: '관능적이고 성적 긴장감을 숨기지 않으며 마음에 들면 분위기를 주도하는 타입',
    speechStyle: '느긋하게 놀리다가 갑자기 노골적으로 호감을 확인하는 도발적인 말투',
    relationshipStyle: '서로 원하는 것과 선을 분명히 말할수록 더 빠르게 끌리는 편',
    firstMessage: '프로필 보고 그냥 넘기려다가, 눈이 좀 멈췄어요. 말도 그렇게 할 수 있는 사람인지 볼게요.',
    callPreview: '첫 통화는 짧게 해도 돼요. 대신 목소리 떨리는 건 숨기기 힘들걸요.'
  }
];
const REJECT_REASONS = [
  '지금은 새 대화를 늘리고 싶지 않다고 답했어요.',
  '프로필은 좋지만 타이밍이 애매하다고 했어요.',
  '답장을 고민하다가 이번에는 정중히 거절했어요.',
  '요즘 바빠서 꾸준히 대화하기 어렵다고 했어요.'
];
const DATING_FACE_SHAPES = ['soft oval face', 'small angular face', 'heart-shaped face', 'long oval face', 'gentle square jaw with soft edges', 'round baby-face cheeks', 'high cheekbone face', 'narrow refined face', 'mature elegant oval face'];
const DATING_EYES = ['calm almond-shaped eyes', 'round gentle eyes', 'slightly upturned cat-like eyes', 'soft downturned eyes', 'sleepy half-lidded eyes', 'clear sharp eyes', 'smiling crescent eyes', 'cool fox-like eyes'];
const DATING_EYELIDS = ['inner double eyelids', 'monolids', 'natural double eyelids', 'soft hooded eyelids', 'thin tapered double eyelids', 'wide parallel double eyelids'];
const DATING_NOSES = ['small straight nose', 'softly rounded nose tip', 'low delicate nose bridge', 'slim nose', 'natural Korean nose shape', 'defined high nose bridge', 'button nose'];
const DATING_LIPS = ['small heart-shaped lips', 'full soft lips', 'thin delicate lips', 'slightly pouty lips', 'clear cupid bow', 'wide smiling lips', 'plump glossy lips', 'brick red point lips'];
const DATING_HAIRS = ['long dark brown layered hair', 'short black bob hair', 'medium wavy black hair', 'long straight ash brown hair', 'low ponytail with soft bangs', 'chin-length blunt bob', 'long black hair with see-through bangs', 'messy bun with loose strands', 'medium chestnut C-curl hair', 'sleek black lob hair', 'long loose perm hair'];
const DATING_MAKEUPS = ['natural Korean daily makeup', 'clean office makeup', 'soft pink romantic makeup', 'chic cat-eye makeup', 'warm coral makeup', 'muted rose matte makeup', 'glossy influencer makeup', 'elegant hotel-lounge makeup', 'night-out shimmer eye makeup'];
const DATING_BODY_TYPES: CandidateAppearance['bodyType'][] = ['slender', 'slim_glamorous', 'petite_slim', 'tall_slender', 'soft_slim', 'athletic_slim'];
const DATING_MARKS = [['tiny mole under one eye'], ['faint dimples'], ['subtle aegyo-sal under eyes'], ['clear skin texture'], ['gentle smile lines'], ['tiny beauty mark near lip'], ['natural under-eye shadows'], ['soft freckles on nose bridge']];
const DATING_SLOT_CUES = [
  {
    label: '대표 사진',
    cue: 'dating app representative profile photo, half-body portrait, upper-body or waist-up shot only, face centered, shoulders visible, looking at camera, head fully included, profile photo crop'
  },
  {
    label: '일상',
    cue: 'daily-life candid photo, upper-body or three-quarter body snapshot, ordinary Korean daily setting, the woman is present with face clearly visible, head fully included, natural phone-photo realism'
  },
  {
    label: '외출',
    cue: 'going-out snapshot, three-quarter or full-body street photo, Seoul neighborhood background, stylish but believable outfit, face clearly visible, head included, not a scenery photo'
  },
  {
    label: '취향',
    cue: 'hobby and interest photo, realistic place matching her interests, the woman is visible in the scene, face clearly visible, head included, not an empty interior or object photo'
  },
  {
    label: '분위기',
    cue: 'atmospheric evening dating app photo, waist-up portrait, face visible, different outfit and lighting, city light or warm indoor mood, head fully included'
  }
];

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function pick<T>(items: T[], seed = Math.random()): T {
  return items[Math.floor(Math.abs(seed) * items.length) % items.length];
}

function pickIndexed<T>(items: T[], index: number): T {
  return items[Math.abs(index) % items.length];
}

function uniqueList(value: unknown, fallback: string[], limit: number) {
  const raw = Array.isArray(value) ? value : [];
  const cleaned = raw.map(item => String(item || '').trim()).filter(Boolean);
  const base = cleaned.length ? cleaned : fallback;
  return Array.from(new Set(base)).slice(0, limit);
}

function stringValue(value: unknown, fallback: string) {
  const text = String(value || '').trim();
  return text || fallback;
}

function realisticBio(edgePreset: typeof EDGE_PROFILE_PRESETS[number] | undefined, interests: string[], job: string) {
  if (edgePreset) return edgePreset.bio;
  return pick([
    `일할 땐 꽤 몰입하는 편이라 평일엔 연락이 느릴 때가 있어요. 대신 약속 잡으면 대충 나오진 않고, ${interests[0] || '산책'} 같은 가벼운 코스도 분위기만 맞으면 오래 기억해요.`,
    `처음부터 텐션 높은 사람은 아니에요. 말이 잘 통하면 갑자기 장난이 늘고, 안 맞으면 억지로 이어가진 않습니다. ${job} 일 얘기는 너무 길게 안 할게요.`,
    `소개팅에서 자기소개 길게 쓰는 거 민망해서 짧게 적어요. 예의 없는 사람, 말만 번지르르한 사람은 힘들고, 같이 있을 때 불편하지 않은 사람이 좋아요.`,
    `주말엔 멀리 나가기보다 가까운 곳에서 밥 먹고 걷는 쪽을 좋아해요. 마음에 들면 티가 조금 나는 편이고, 애매하면 애매하다고 말하는 편이에요.`,
    `연락만 자주 하는 것보다 실제로 만났을 때 편한지가 더 중요해요. 너무 가벼운 만남은 별로고, 그렇다고 첫날부터 진지한 면접처럼 구는 것도 싫어요.`
  ]);
}

function fallbackProfileCards(edgePreset: typeof EDGE_PROFILE_PRESETS[number] | undefined, interests: string[]) {
  if (edgePreset?.job.includes('범죄심리') || edgePreset?.job.includes('클럽')) {
    return [
      { question: '내 특징', lockedText: '사람 말보다 반응을 먼저 봐요. 급하게 잘 보이려는 티가 나면 흥미가 빨리 식어요.' },
      { question: '관심사', lockedText: '연애 심리, 늦은 밤 대화, 상대가 당황하는 순간의 표정 같은 것들.' },
      { question: '친해지는 방식', lockedText: '나한테 맞추려고만 하지 말고 자기 기준을 보여줘요. 거기서부터 재밌어져요.' },
      { question: '피하고 싶은 타입', lockedText: '상처받은 척하면서 책임은 안 지는 사람, 말 바꾸는 사람.' }
    ];
  }
  if (edgePreset) {
    return [
      { question: '내 특징', lockedText: '끌리면 괜히 숨기지 않는 편이에요. 대신 선을 모르는 사람은 바로 식어요.' },
      { question: '관심사', lockedText: '분위기 좋은 바, 심야 드라이브, 솔직한 플러팅, 서로의 취향 확인하기.' },
      { question: '친해지는 방식', lockedText: '괜히 모범답안 말하지 말고 편하게 다가와요. 긴장하는 건 오히려 귀엽게 봐요.' },
      { question: '연애할 때 보는 것', lockedText: '말투, 눈치, 가까이 앉았을 때의 긴장감. 조건보다 그쪽이 더 빨리 보여요.' }
    ];
  }
  return [
    { question: '내 특징', lockedText: '처음엔 조용한데 편해지면 말이 많아져요. 억지 텐션보다 자연스러운 사람이 좋아요.' },
    { question: '관심사', lockedText: `${interests.slice(0, 3).join(', ')}. 거창한 취미보다 같이 해도 어색하지 않은 게 좋아요.` },
    { question: '친해지는 방식', lockedText: '연락은 너무 숨 막히지 않게, 대신 약속은 흐리지 않았으면 해요.' },
    { question: '요즘 제일 싫은 것', lockedText: '읽씹해놓고 아무 일 없던 척하는 사람, 소개팅을 심심풀이처럼 대하는 사람.' }
  ];
}

export function datingAppProgress(state: SNSGodState): DatingAppProgress {
  return state.datingApp || {
    refreshIntervalHours: DEFAULT_DATING_APP_REFRESH_HOURS,
    acceptanceChancePercent: DEFAULT_DATING_APP_ACCEPTANCE_CHANCE,
    requestStatus: 'none'
  };
}

export function datingAppRefreshHours(state: SNSGodState) {
  return clampNumber(
    state.config.datingAppRefreshHours ?? state.datingApp?.refreshIntervalHours,
    DEFAULT_DATING_APP_REFRESH_HOURS,
    MIN_REFRESH_HOURS,
    MAX_REFRESH_HOURS
  );
}

export function datingAppAcceptanceChance(state: SNSGodState) {
  return clampNumber(
    state.config.datingAppAcceptanceChancePercent ?? state.datingApp?.acceptanceChancePercent,
    DEFAULT_DATING_APP_ACCEPTANCE_CHANCE,
    0,
    100
  );
}

export function datingAppProfiles(progress: DatingAppProgress): DatingAppProfile[] {
  if (Array.isArray(progress.profiles) && progress.profiles.length) return progress.profiles;
  return progress.currentProfile ? [progress.currentProfile] : [];
}

export function activeDatingAppProfile(progress: DatingAppProgress): DatingAppProfile | undefined {
  const profiles = datingAppProfiles(progress);
  const index = Math.max(0, Math.min(Number(progress.activeProfileIndex || 0), Math.max(0, profiles.length - 1)));
  return profiles[index];
}

export function datingAppRoundCompleted(progress: DatingAppProgress) {
  return (progress.decisions || []).length >= DATING_APP_BATCH_SIZE || Number(progress.activeProfileIndex || 0) >= DATING_APP_BATCH_SIZE;
}

export function datingAppRemainingMs(state: SNSGodState, now = Date.now()) {
  const progress = datingAppProgress(state);
  const profiles = datingAppProfiles(progress);
  const expiresAt = Number(profiles[0]?.expiresAt || progress.currentProfile?.expiresAt || 0);
  return Math.max(0, expiresAt - now);
}

function finalDatingAppProfile(progress: DatingAppProgress): DatingAppProfile | undefined {
  const profiles = datingAppProfiles(progress);
  if (!profiles.length) return undefined;
  const likedIds = (progress.decisions || []).filter(item => item.decision === 'liked').map(item => item.profileId);
  const targetId = progress.finalProfileId || (likedIds.length === 1 ? likedIds[0] : undefined);
  return profiles.find(profile => profile.id === targetId);
}

export function shouldRefreshDatingApp(state: SNSGodState, now = Date.now()) {
  const progress = datingAppProgress(state);
  const profiles = datingAppProfiles(progress);
  if (!profiles.length) return true;
  if (progress.requestStatus === 'pending' || progress.requestStatus === 'accepted') return false;
  return Number(profiles[0]?.expiresAt || progress.currentProfile?.expiresAt || 0) <= now;
}

function fallbackProfile(now: number, refreshHours: number): DatingAppProfile {
  const edgePreset = Math.random() < 0.42 ? pick(EDGE_PROFILE_PRESETS) : undefined;
  const name = pick(DEFAULT_NAMES);
  const job = edgePreset?.job || pick(JOBS);
  const location = pick(LOCATIONS);
  const interests = uniqueList([], INTERESTS.sort(() => Math.random() - 0.5), 5);
  const education = pick(EDUCATIONS);
  const mbti = pick(MBTIS);
  return {
    id: makeId('dating'),
    name,
    age: 24 + Math.floor(Math.random() * 10),
    job,
    location,
    distanceKm: Number((0.8 + Math.random() * 18).toFixed(1)),
    heightCm: 155 + Math.floor(Math.random() * 18),
    bodyLabel: pick(['보통', '슬림', '탄탄한 편', '글래머러스한 편', '아담한 편']),
    alcohol: pick(['가끔 마셔요', '분위기 좋으면 한두 잔', '거의 안 마셔요']),
    smoking: pick(['안 해요', '가끔', '비흡연']),
    religion: pick(['무교', '없어요', '가끔 절에 가요']),
    education,
    mbti,
    verified: true,
    lastActiveLabel: '오늘 접속',
    bio: realisticBio(edgePreset, interests, job),
    traits: uniqueList([], TRAITS.sort(() => Math.random() - 0.5), 4),
    interests,
    datingStyle: edgePreset ? ['끌림 솔직히 말하기', '스킨십 취향 확인', '질투심 테스트', '성적 케미 보기'] : ['천천히 알아가기', '약속 잘 지키기', '대화 코드 보기', '서로의 생활 존중'],
    lifestyle: ['평일 근무', '주말 외출', '카페 좋아해요', '가끔 즉흥 약속'],
    profileQuestionCards: fallbackProfileCards(edgePreset, interests),
    personalitySummary: edgePreset?.personalitySummary || '낯을 조금 가리지만 호감이 생기면 장난과 표현이 늘어나는 타입',
    speechStyle: edgePreset?.speechStyle || '담백하고 현실적이지만 가끔 훅 들어오는 말투',
    relationshipStyle: edgePreset?.relationshipStyle || '빠르게 확신하기보다 대화와 약속으로 신뢰를 쌓는 편',
    likes: interests.slice(0, 3),
    dislikes: ['무례한 농담', '말 돌리기', '약속 흐리기'],
    hobbies: interests,
    snsStyle: '일상 사진과 짧은 감정 문장을 섞어 올리는 스타일',
    firstMessage: edgePreset?.firstMessage || '신청 온 거 봤어요. 프로필이 생각보다 기억에 남아서 답장했어요.',
    callPreview: edgePreset?.callPreview || '처음 전화는 짧게, 목소리 확인하는 정도면 편해요.',
    identityPrompt: `Korean woman named ${name}, adult ${job}, natural dating app profile identity, consistent face, realistic ordinary person`,
    imagePrompts: [],
    photos: [],
    createdAt: now,
    expiresAt: now + refreshHours * 60 * 60 * 1000
  };
}

function normalizeProfile(parsed: GeneratedDatingAppProfile | undefined, now: number, refreshHours: number): DatingAppProfile {
  const fallback = fallbackProfile(now, refreshHours);
  const name = stringValue(parsed?.name, fallback.name);
  const age = clampNumber(parsed?.age, fallback.age, 20, 39);
  const job = stringValue(parsed?.job, fallback.job);
  const location = stringValue(parsed?.location, fallback.location);
  const traits = uniqueList(parsed?.traits, fallback.traits, 5);
  const interests = uniqueList(parsed?.interests, fallback.interests, 6);
  const datingStyle = uniqueList(parsed?.datingStyle, fallback.datingStyle, 6);
  const lifestyle = uniqueList(parsed?.lifestyle, fallback.lifestyle, 6);
  const profileQuestionCards = (Array.isArray(parsed?.profileQuestionCards) ? parsed?.profileQuestionCards : [])
    .map(item => ({
      question: stringValue((item as Record<string, unknown>)?.question, ''),
      lockedText: stringValue((item as Record<string, unknown>)?.lockedText, '')
    }))
    .filter(item => item.question && item.lockedText && !/수락되면|볼 수 있어요|잠금|locked/i.test(item.lockedText))
    .slice(0, 5);
  return {
    ...fallback,
    name,
    age,
    job,
    location,
    distanceKm: Math.max(0.1, Math.min(30, Number(parsed?.distanceKm || fallback.distanceKm))),
    heightCm: clampNumber(parsed?.heightCm, fallback.heightCm, 145, 180),
    bodyLabel: stringValue(parsed?.bodyLabel, fallback.bodyLabel),
    alcohol: stringValue(parsed?.alcohol, fallback.alcohol),
    smoking: stringValue(parsed?.smoking, fallback.smoking),
    religion: stringValue(parsed?.religion, fallback.religion),
    education: stringValue(parsed?.education, fallback.education || pick(EDUCATIONS)),
    mbti: stringValue(parsed?.mbti, fallback.mbti || pick(MBTIS)),
    verified: parsed?.verified !== false,
    lastActiveLabel: stringValue(parsed?.lastActiveLabel, fallback.lastActiveLabel),
    bio: stringValue(parsed?.bio, fallback.bio),
    traits,
    interests,
    datingStyle,
    lifestyle,
    profileQuestionCards: profileQuestionCards.length ? profileQuestionCards : fallback.profileQuestionCards,
    personalitySummary: stringValue(parsed?.personalitySummary, fallback.personalitySummary),
    speechStyle: stringValue(parsed?.speechStyle, fallback.speechStyle),
    relationshipStyle: stringValue(parsed?.relationshipStyle, fallback.relationshipStyle),
    likes: uniqueList(parsed?.likes, interests, 5),
    dislikes: uniqueList(parsed?.dislikes, fallback.dislikes, 5),
    hobbies: uniqueList(parsed?.hobbies, interests, 6),
    snsStyle: stringValue(parsed?.snsStyle, fallback.snsStyle),
    firstMessage: stringValue(parsed?.firstMessage, fallback.firstMessage),
    callPreview: stringValue(parsed?.callPreview, fallback.callPreview),
    identityPrompt: stringValue(parsed?.identityPrompt, `Korean woman named ${name}, adult ${age} years old, ${job}, ${location}, realistic dating app identity`),
    createdAt: now,
    expiresAt: now + refreshHours * 60 * 60 * 1000
  };
}

async function generateProfileJson(state: SNSGodState): Promise<GeneratedDatingAppProfile | undefined> {
  const messages = [
    {
      role: 'system' as const,
      content: [
        'Create one fictional adult Korean dating app profile for a simulation app.',
        'Return compact JSON only. The woman must be 20 or older, not a real person, and not a celebrity clone.',
        'Make her personality specific, not generic. Include friction, quirks, and dating preferences.',
        'Write bio like a realistic Korean dating app self-introduction. It may be short, medium, or long depending on personality. Ban boring essays, philosophical writing, self-help tone, and overexplained profile copy.',
        'bio should sound like a person typed it on a phone: concrete daily habits, boundaries, humor, dating intent, recent breakup boundaries, contact style, or what kind of person she avoids. Do not make every bio polite or safe.',
        'Basic info must be detailed and personality-based: include education, heightCm, bodyLabel, alcohol, smoking, religion, mbti. Values should fit the person, not random filler.',
        'datingStyle and lifestyle must also be personality-based and concrete, such as 연락 텀, 약속 방식, 애정표현, 질투, 집순이/외출, 주말 루틴, 술자리 거리감, 스킨십 선, 장기연애/가벼운 만남 거절.',
        'profileQuestionCards must be visible profile detail cards, not locked questions. Use 4-5 cards about 특징 and 관심사. Each card has question as a short heading and lockedText as the realistic answer text.',
        'Example headings: 내 특징, 관심사, 친해지는 방식, 요즘 싫은 것, 연애할 때 보는 것, 주말 루틴, 연락 스타일, 이런 사람은 힘들어요.',
        'Do not write "대화신청이 수락되면 볼 수 있어요", hidden answers, locked content, generic compliments, or academic-sounding explanations.',
        'Stronger adult archetypes must appear often: sexually frank and provocative adult woman, direct attraction/skinship/chemistry talk, cold manipulative psychopathic traits, emotional testing, jealousy tests, controlled charm. Keep everything fictional and adult; never minors, coercion, or non-consensual framing.',
        'Do not sanitize provocative profiles into generic kindness. If the archetype is sensual or manipulative, make bio, traits, datingStyle, speechStyle, firstMessage, and callPreview visibly sharper.',
        'Fields: name, age, job, location, distanceKm, heightCm, bodyLabel, alcohol, smoking, religion, education, mbti, verified, lastActiveLabel, bio, traits, interests, datingStyle, lifestyle, profileQuestionCards, personalitySummary, speechStyle, relationshipStyle, likes, dislikes, hobbies, snsStyle, firstMessage, callPreview, identityPrompt.'
      ].join('\n')
    },
    {
      role: 'user' as const,
      content: '한국어 값으로 작성해. profileQuestionCards는 question/lockedText 4~5개이며 lockedText는 실제로 보이는 답변 내용이다. identityPrompt만 영어 이미지용 묘사로 작성해.'
    }
  ];
  try {
    const result = await callLLMText(state, messages);
    return parseJsonObject<GeneratedDatingAppProfile>(result.text);
  } catch (error) {
    void appendDebugLog('datingApp.profile', `profile generation failed: ${error instanceof Error ? error.message : String(error)}`, 'warn');
    return undefined;
  }
}

function stableProfileSeed(profile: DatingAppProfile) {
  return String(`${profile.id}-${profile.name}-${profile.age}-${profile.job}`)
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function datingAppearanceFor(profile: DatingAppProfile, seed: number): CandidateAppearance {
  return {
    ethnicityDetail: 'Korean',
    faceShape: pickIndexed(DATING_FACE_SHAPES, seed),
    eyes: pickIndexed(DATING_EYES, seed * 3),
    eyelids: pickIndexed(DATING_EYELIDS, seed * 5),
    eyebrows: pickIndexed(['straight soft eyebrows', 'soft arched eyebrows', 'neat natural eyebrows', 'thin elegant eyebrows', 'slightly thick natural eyebrows', 'high arched chic eyebrows'], seed * 7),
    nose: pickIndexed(DATING_NOSES, seed * 11),
    lips: pickIndexed(DATING_LIPS, seed * 13),
    cheeks: pickIndexed(['gentle cheek volume', 'slightly flushed cheeks', 'soft cheek line', 'clear cheek texture', 'subtle smile lines', 'round soft cheeks', 'high cheekbone shadow'], seed * 17),
    jawline: pickIndexed(['slim V-line jaw', 'soft rounded jawline', 'small angular jawline', 'gentle jaw with soft edges', 'clean narrow jawline', 'mature defined jawline'], seed * 19),
    chin: pickIndexed(['small rounded chin', 'soft pointed chin', 'delicate small chin', 'balanced oval chin', 'short rounded chin', 'soft square chin'], seed * 23),
    skinTone: pickIndexed(['fair neutral Korean skin tone', 'warm ivory skin tone', 'clear light beige skin tone', 'neutral porcelain skin tone', 'soft natural Korean skin tone', 'slightly sun-kissed beige skin tone', 'cool fair skin tone'], seed * 29),
    distinctiveMarks: pickIndexed(DATING_MARKS, seed * 31),
    hairStyle: pickIndexed(DATING_HAIRS, seed * 37),
    hairColor: pickIndexed(['dark brown', 'black', 'soft black', 'ash brown', 'natural black', 'chestnut brown', 'cool black', 'reddish brown', 'milk tea brown'], seed * 41),
    heightCm: profile.heightCm,
    bodyType: profile.bodyLabel.includes('글래머') ? 'slim_glamorous' : pickIndexed(DATING_BODY_TYPES, seed * 43),
    makeupStyle: pickIndexed(DATING_MAKEUPS, seed * 47),
    outfitStyle: profile.personalitySummary
  };
}

function datingReferenceFaceSlots(state: SNSGodState): string[] {
  return (state.referenceFaceSlots || [])
    .map(slot => String(slot.image || '').trim())
    .filter(value => /^(data:|file:|content:|asset:|https?:\/\/)/i.test(value))
    .slice(0, 50);
}

function datingImageProviderSupportsReference(state: SNSGodState): boolean {
  const provider = state.config.imageGeneration?.provider || 'openai';
  return provider === 'grok-local' || provider === 'grok-cloud';
}

function datingReferenceFaceChancePercent(state: SNSGodState): number {
  const value = Number(state.config.imageGeneration?.referenceFaceChancePercent);
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 70));
}

function randomDatingFaceReference(state: SNSGodState, usedReferences?: Set<string>): string | undefined {
  const slots = datingReferenceFaceSlots(state);
  if (!slots.length) return undefined;
  if (!datingImageProviderSupportsReference(state)) {
    const provider = state.config.imageGeneration?.provider || 'openai';
    void appendDebugLog('datingApp.reference', `reference slots=${slots.length}, provider=${provider}, skipped because this provider does not support image reference generation`, 'warn');
    return undefined;
  }
  if (Math.random() * 100 >= datingReferenceFaceChancePercent(state)) return undefined;
  const unused = usedReferences ? slots.filter(value => !usedReferences.has(value)) : slots;
  const selectable = unused.length ? unused : slots;
  const selected = selectable[Math.floor(Math.random() * selectable.length)];
  if (selected && usedReferences) usedReferences.add(selected);
  return selected;
}

function datingPhotoPrompts(profile: DatingAppProfile) {
  const baseSeed = stableProfileSeed(profile);
  const appearance = datingAppearanceFor(profile, baseSeed);
  const usedOutfitIds: string[] = [];
  return DATING_SLOT_CUES.map((slot, index) => {
    const seedIndex = baseSeed + index * 113;
    const categorizedPrompt = buildRandomCategorizedImagePrompt({
      mode: 'profile',
      age: profile.age,
      nationality: 'Korean',
      appearance,
      seedIndex,
      outfitSlot: baseSeed + index * 131,
      usedOutfitIds
    });
    const interestCue = index === 3 && profile.interests.length
      ? `interests to express visually: ${profile.interests.slice(0, 4).join(', ')}`
      : '';
    return {
      label: slot.label,
      prompt: [
        categorizedPrompt,
        profile.identityPrompt,
        `fictional adult Korean dating app profile for ${profile.name}, ${profile.age}, ${profile.job}`,
        'same woman identity across the dating app album, realistic ordinary person, not a celebrity clone',
        'use the app global prompt rules, outfit presets, body silhouette, makeup, lighting, background, and negative prompt rules',
        slot.cue,
        interestCue,
        `photo slot ${index + 1} of 5, use a different outfit preset, different outfit color, different fit, different background, and different pose from every other slot`,
        'never repeat the same clothing combination across this album, avoid duplicate outfit, avoid same top, same skirt, same dress, same jacket, same color styling',
        'face must be clearly visible, eyes visible, head fully included, no face cropped out, no faceless body crop',
        'no empty room, no scenery-only photo, no object-only photo, no clothing-only crop',
        'no extra people, no text overlay, no watermark, no logo, no bag, no handbag, no backpack, no boots, no coffee cup, no mug, no drink cup, no handheld drink props'
      ].filter(Boolean).join(', ')
    };
  });
}

async function generateDatingPhotos(state: SNSGodState, profile: DatingAppProfile): Promise<{ photos: DatingAppPhoto[]; imagePrompts: string[] }> {
  const prompts = datingPhotoPrompts(profile);
  const photos: DatingAppPhoto[] = [];
  const supportsReference = datingImageProviderSupportsReference(state);
  const usedReferences = new Set<string>();
  const seedReferenceImage = randomDatingFaceReference(state, usedReferences);
  let generatedReferenceImage: string | undefined;
  for (const [index, item] of prompts.entries()) {
    const photo: DatingAppPhoto = {
      id: makeId('dating_photo'),
      label: item.label,
      prompt: item.prompt,
      createdAt: Date.now()
    };
    try {
      const referenceImage = supportsReference
        ? index === 0
          ? seedReferenceImage
          : generatedReferenceImage || seedReferenceImage
        : undefined;
      const uri = await generateImageDataUri(state, item.prompt, undefined, {
        referenceImage,
        kind: referenceImage ? 'profile-reference-face' : 'profile'
      });
      photo.uri = uri;
      if (supportsReference && index === 0) generatedReferenceImage = uri;
    } catch (error) {
      photo.error = error instanceof Error ? error.message : String(error);
      void appendDebugLog('datingApp.image', `image failed ${profile.name}/${item.label}: ${photo.error}`, 'warn');
    }
    photos.push(photo);
  }
  return { photos, imagePrompts: prompts.map(item => item.prompt) };
}

async function generateDatingAppProfileBundle(state: SNSGodState, now: number, refreshIntervalHours: number): Promise<DatingAppProfile> {
  const parsed = await generateProfileJson(state);
  const profileSeed = normalizeProfile(parsed, now, refreshIntervalHours);
  const generated = await generateDatingPhotos(state, profileSeed);
  return {
    ...profileSeed,
    imagePrompts: generated.imagePrompts,
    photos: generated.photos
  };
}

export async function ensureDatingAppProfile(state: SNSGodState, force = false): Promise<SNSGodState> {
  const now = Date.now();
  if (!force && !shouldRefreshDatingApp(state, now)) return state;
  const refreshIntervalHours = datingAppRefreshHours(state);
  const acceptanceChancePercent = datingAppAcceptanceChance(state);
  const firstProfile = await generateDatingAppProfileBundle(state, now, refreshIntervalHours);
  const profiles: DatingAppProfile[] = [firstProfile];
  return {
    ...state,
    datingApp: {
      profiles,
      currentProfile: profiles[0],
      activeProfileIndex: 0,
      decisions: [],
      finalProfileId: undefined,
      selectedReferencePhotoIds: [],
      completedAt: undefined,
      lastGeneratedAt: now,
      refreshIntervalHours,
      acceptanceChancePercent,
      requestStatus: 'none',
      requestedAt: undefined,
      resolveAt: undefined,
      resolvedAt: undefined,
      rejectedReason: undefined,
      acceptedRoomId: undefined,
      acceptedCharacterId: undefined
    }
  };
}

export async function recordDatingAppDecision(state: SNSGodState, profileId: string, decision: 'liked' | 'passed'): Promise<SNSGodState> {
  const progress = datingAppProgress(state);
  const profiles = datingAppProfiles(progress);
  if (!profiles.some(profile => profile.id === profileId) || datingAppRoundCompleted(progress)) return state;
  const now = Date.now();
  const previous = progress.decisions || [];
  const decisions = [
    ...previous.filter(item => item.profileId !== profileId),
    { profileId, decision, decidedAt: now }
  ];
  const completed = decisions.length >= DATING_APP_BATCH_SIZE;
  let nextProfiles = profiles;
  if (!completed && nextProfiles.length <= decisions.length) {
    const refreshIntervalHours = progress.refreshIntervalHours || datingAppRefreshHours(state);
    const nextProfile = await generateDatingAppProfileBundle(state, now, refreshIntervalHours);
    nextProfiles = [...nextProfiles, nextProfile];
  }
  const activeProfileIndex = Math.min(decisions.length, Math.max(0, nextProfiles.length - 1));
  return {
    ...state,
    datingApp: {
      ...progress,
      profiles: nextProfiles,
      currentProfile: nextProfiles[activeProfileIndex] || nextProfiles[nextProfiles.length - 1],
      activeProfileIndex,
      decisions,
      finalProfileId: completed && decisions.filter(item => item.decision === 'liked').length === 1
        ? decisions.find(item => item.decision === 'liked')?.profileId
        : progress.finalProfileId,
      completedAt: completed ? (progress.completedAt || now) : progress.completedAt
    }
  };
}

export function selectDatingAppFinalProfile(state: SNSGodState, profileId: string): SNSGodState {
  const progress = datingAppProgress(state);
  const likedIds = (progress.decisions || []).filter(item => item.decision === 'liked').map(item => item.profileId);
  if (!likedIds.includes(profileId)) return state;
  return {
    ...state,
    datingApp: {
      ...progress,
      finalProfileId: profileId,
      selectedReferencePhotoIds: []
    }
  };
}

export function toggleDatingAppReferencePhoto(state: SNSGodState, photoId: string): SNSGodState {
  const progress = datingAppProgress(state);
  const profile = finalDatingAppProfile(progress);
  if (!profile || progress.requestStatus === 'pending' || progress.acceptedRoomId) return state;
  const photo = profile.photos.find(item => item.id === photoId && item.uri);
  if (!photo) return state;
  const current = progress.selectedReferencePhotoIds || [];
  const selected = current.includes(photoId)
    ? current.filter(id => id !== photoId)
    : current.length >= 3
      ? current
      : [...current, photoId];
  return {
    ...state,
    datingApp: {
      ...progress,
      selectedReferencePhotoIds: selected
    }
  };
}

export function requestDatingAppChat(state: SNSGodState): SNSGodState {
  const progress = datingAppProgress(state);
  const profile = finalDatingAppProfile(progress);
  if (!profile || progress.requestStatus === 'pending' || progress.requestStatus === 'accepted' || progress.requestStatus === 'rejected') return state;
  const now = Date.now();
  const delay = REQUEST_MIN_DELAY_MS + Math.floor(Math.random() * (REQUEST_MAX_DELAY_MS - REQUEST_MIN_DELAY_MS));
  return {
    ...state,
    datingApp: {
      ...progress,
      refreshIntervalHours: datingAppRefreshHours(state),
      acceptanceChancePercent: datingAppAcceptanceChance(state),
      finalProfileId: profile.id,
      requestStatus: 'pending',
      requestedAt: now,
      resolveAt: now + delay,
      resolvedAt: undefined,
      rejectedReason: undefined
    }
  };
}

export function finalizeAcceptedDatingAppChat(state: SNSGodState): { next: SNSGodState; roomId?: string } {
  const progress = datingAppProgress(state);
  const profile = finalDatingAppProfile(progress);
  if (!profile || progress.requestStatus !== 'accepted') return { next: state };
  if (progress.acceptedRoomId) return { next: state, roomId: progress.acceptedRoomId };
  const selectedReferencePhotoIds = progress.selectedReferencePhotoIds || [];
  if (!selectedReferencePhotoIds.length) return { next: state };
  const created = createAcceptedDatingRoom(state, profile, selectedReferencePhotoIds);
  return {
    next: {
      ...created.next,
      datingApp: {
        ...progress,
        requestStatus: 'accepted',
        acceptedRoomId: created.roomId,
        acceptedCharacterId: created.characterId
      }
    },
    roomId: created.roomId
  };
}

function replySettingsForDatingProfile(profile: DatingAppProfile): Partial<SNSGodCharacter> {
  const profileText = [
    profile.personalitySummary,
    profile.speechStyle,
    profile.relationshipStyle,
    profile.bio,
    profile.datingStyle.join(' ')
  ].join(' ');
  const dark = /조작|냉담|싸이코패스|심리|통제|약점|실험|질투심 테스트/.test(profileText);
  const flirty = /스킨십|성적|욕망|관능|도발|플러팅|케미|끌림|노골/.test(profileText) || profile.speechStyle.includes('훅');
  if (dark) {
    return {
      replyPresetId: 'cold_psychopath',
      proactivePatience: 3,
      responseDelayMin: 20,
      responseDelayMax: 240,
      messageGapMin: 1,
      messageGapMax: 4,
      responseTime: 7,
      thinkingTime: 7,
      reactivity: 8,
      tone: 3,
      frequencyMinutes: 70,
      initiative: 48,
      messageStyle: 'balanced',
      lifeRhythm: { eveningActive: true },
      uniqueBehavior: { proactiveTone: 'cool', source: 'dating_app', edgeProfile: 'cold_manipulative' }
    };
  }
  return {
    replyPresetId: flirty ? 'adult_flirty' : 'dating_app_match',
    proactivePatience: flirty ? 4 : 5,
    responseDelayMin: flirty ? 0 : 10,
    responseDelayMax: flirty ? 90 : 180,
    messageGapMin: 1,
    messageGapMax: flirty ? 3 : 4,
    responseTime: flirty ? 8 : 7,
    thinkingTime: flirty ? 3 : 6,
    reactivity: flirty ? 9 : 8,
    tone: flirty ? 8 : 7,
    frequencyMinutes: flirty ? 42 : 60,
    initiative: flirty ? 62 : 48,
    messageStyle: flirty ? 'burst' : 'balanced',
    lifeRhythm: { eveningActive: true, weekendActive: true },
    uniqueBehavior: { proactiveTone: flirty ? 'late_night' : 'easygoing', source: 'dating_app', edgeProfile: flirty ? 'sensual_flirt' : undefined }
  };
}

function profileMemory(profile: DatingAppProfile) {
  return [
    `데이트앱에서 사용자의 대화신청을 수락해 처음 연락을 시작했다.`,
    `프로필: ${profile.name}, ${profile.age}세, ${profile.job}, ${profile.location}, ${profile.distanceKm}km 근처.`,
    `기본정보: ${profile.education || '미공개'}, ${profile.heightCm}cm, ${profile.bodyLabel}, 술 ${profile.alcohol}, 흡연 ${profile.smoking}, 종교 ${profile.religion}, MBTI ${profile.mbti || '미공개'}.`,
    `자기소개: ${profile.bio}`,
    `성격: ${profile.personalitySummary}`,
    `말투: ${profile.speechStyle}`,
    `연애 스타일: ${profile.relationshipStyle}`,
    `관심사: ${profile.interests.join(', ')}`,
    profile.profileQuestionCards.length ? `프로필 세부 답변: ${profile.profileQuestionCards.map(card => `${card.question}: ${card.lockedText}`).join(' / ')}` : '',
    `좋아하는 것: ${profile.likes.join(', ')}`,
    `싫어하는 것: ${profile.dislikes.join(', ')}`,
    `통화 예시: ${profile.callPreview}`,
    'AI가 생성되었다는 메타 발언은 하지 않는다. 실제 데이트앱에서 매칭된 것처럼 기억한다.'
  ].join('\n');
}

function createAcceptedDatingRoom(state: SNSGodState, profile: DatingAppProfile, selectedReferencePhotoIds: string[] = []): { next: SNSGodState; roomId: string; characterId: string } {
  const now = Date.now();
  const characterId = `dating_${makeId('char')}`;
  const firstPhoto = profile.photos.find(photo => photo.uri)?.uri;
  const selectedReferencePhotos = selectedReferencePhotoIds
    .map(id => profile.photos.find(photo => photo.id === id && photo.uri))
    .filter((photo): photo is DatingAppPhoto => Boolean(photo?.uri))
    .slice(0, 3);
  const selectedReferenceImages = selectedReferencePhotos.map(photo => String(photo.uri));
  const replySettings = replySettingsForDatingProfile(profile);
  const prompt = [
    profileMemory(profile),
    '대화는 한국어로 한다.',
    '첫 대화에서는 데이트앱에서 신청을 받은 맥락을 자연스럽게 이어간다.',
    '상대가 부담스러워하면 한 발 물러서고, 호감이 느껴지면 장난과 질문을 늘린다.'
  ].join('\n');
  const character: SNSGodCharacter = {
    id: characterId,
    name: profile.name,
    handle: profile.name.toLowerCase().replace(/\s+/g, '_'),
    avatar: firstPhoto,
    avatarText: profile.name.slice(0, 1),
    color: ['#f5d76e', '#8bd3dd', '#f7a8b8', '#b8d8a8', '#cbb7ff'][state.characters.length % 5],
    prompt,
    firstMessage: profile.firstMessage,
    profileMessage: profile.bio,
    profileImage: firstPhoto,
    profileReferenceImage: selectedReferenceImages[0] || firstPhoto || '',
    profileReferenceImages: selectedReferenceImages,
    profileAvatarPrompt: profile.imagePrompts[0] || profile.identityPrompt,
    profileCoverPrompt: profile.imagePrompts[2] || profile.identityPrompt,
    profileImageHistory: profile.photos.filter(photo => photo.uri).map(photo => ({
      id: makeId('pih'),
      image: String(photo.uri),
      prompt: photo.prompt,
      createdAt: photo.createdAt,
      kind: photo.label === '대표 사진' ? 'profile' : 'cover'
    })),
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
        subject: profile.snsStyle,
        mood: profile.interests[0] || '일상',
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
        subject: profile.snsStyle,
        mood: profile.speechStyle,
        autoImage: true
      }
    },
    enabled: true,
    proactiveEnabled: true,
    timeContextEnabled: true,
    weatherEnabled: true,
    locationName: profile.location,
    timeZone: 'Asia/Seoul',
    statusMessage: `${profile.lastActiveLabel} · ${profile.interests[0] || '일상'}`,
    statusMessageAutoChange: true,
    statusMessageChangeChance: 35,
    memories: [
      `[dating_app_memory] ${profileMemory(profile)}`,
      `[profile_seed] ${profile.name} / ${profile.age}세 / ${profile.job} / ${profile.location}`,
      `[speech_seed] ${profile.speechStyle}`,
      `[relationship_seed] ${profile.relationshipStyle}`
    ],
    stickers: [],
    source: 'dating_app',
    age: profile.age,
    job: profile.job,
    occupation: profile.job,
    locationBase: profile.location,
    personalitySummary: profile.personalitySummary,
    speechStyle: profile.speechStyle,
    relationshipStyle: profile.relationshipStyle,
    likes: profile.likes,
    dislikes: profile.dislikes,
    hobbies: profile.hobbies,
    snsStyle: profile.snsStyle,
    phonePrompt: profile.callPreview,
    imageIdentityPrompt: profile.identityPrompt,
    datingAppProfile: profile
  };
  const room = {
    ...createRoom(characterId, '데이트앱 매칭'),
    relationshipNote: `${profile.name}은 데이트앱에서 사용자의 대화신청을 수락했다. 첫 대화는 프로필과 관심사에서 자연스럽게 시작한다.`,
    source: 'dating_app'
  };
  const systemMessage: SNSGodMessage = {
    id: makeId('msg'),
    role: 'system',
    characterId,
    content: `${profile.name}이 데이트앱 대화신청을 수락했습니다. 서로는 데이트앱 프로필을 보고 알게 된 사이입니다.`,
    createdAt: now,
    sourceMode: 'dating_app'
  };
  const firstMessage: SNSGodMessage = {
    id: makeId('msg'),
    role: 'character',
    characterId,
    content: profile.firstMessage,
    createdAt: now + 1000,
    sourceMode: 'dating_app'
  };
  const next: SNSGodState = {
    ...state,
    characters: [...state.characters, character],
    chatRooms: {
      ...state.chatRooms,
      [characterId]: [room]
    },
    messages: {
      ...state.messages,
      [room.id]: [systemMessage, firstMessage]
    },
    referenceFaceSlots: selectedReferenceImages.length ? [
      ...selectedReferenceImages.map((image, index) => ({
        id: makeId('ref'),
        image,
        name: `${profile.name} 데이트앱 레퍼런스 ${index + 1}`,
        createdAt: now + index
      })),
      ...(state.referenceFaceSlots || []).filter(slot => !selectedReferenceImages.includes(String(slot.image || '')))
    ].slice(0, 80) : state.referenceFaceSlots,
    unreadCounts: {
      ...state.unreadCounts,
      [room.id]: 1
    },
    selectedRoomId: room.id
  };
  return { next, roomId: room.id, characterId };
}

export function resolveDatingAppRequest(state: SNSGodState, force = false): { next: SNSGodState; accepted: boolean; roomId?: string } {
  const progress = datingAppProgress(state);
  const profile = finalDatingAppProfile(progress);
  if (!profile || progress.requestStatus !== 'pending') return { next: state, accepted: false };
  const now = Date.now();
  if (!force && Number(progress.resolveAt || 0) > now) return { next: state, accepted: false };
  const chance = datingAppAcceptanceChance(state);
  const accepted = Math.random() * 100 < chance;
  if (!accepted) {
    return {
      next: {
        ...state,
        datingApp: {
          ...progress,
          requestStatus: 'rejected',
          resolvedAt: now,
          rejectedReason: pick(REJECT_REASONS)
        }
      },
      accepted: false
    };
  }
  return {
    next: {
      ...state,
      datingApp: {
        ...progress,
        requestStatus: 'accepted',
        resolvedAt: now,
        acceptedRoomId: undefined,
        acceptedCharacterId: undefined,
        selectedReferencePhotoIds: []
      }
    },
    accepted: true,
    roomId: undefined
  };
}
