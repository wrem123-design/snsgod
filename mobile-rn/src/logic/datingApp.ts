import { CandidateAppearance, DatingAppPhoto, DatingAppProfile, DatingAppProgress, SNSGodCharacter, SNSGodMessage, SNSGodState } from '../types';
import { callLLMText, generateImageDataUri, parseJsonObject } from './api';
import { completeGeneratedCharacter } from './characterCompletion';
import { appendDebugLog } from './debugLog';
import { makeId } from './ids';
import { buildRandomCategorizedImagePrompt } from './randomImagePrompt';
import { createRoom } from './stateHelpers';

export const DEFAULT_DATING_APP_REFRESH_HOURS = 12;
export const DEFAULT_DATING_APP_ACCEPTANCE_CHANCE = 50;
export const MAX_DATING_APP_LIKES_PER_ROUND = 2;

const MIN_REFRESH_HOURS = 1;
const MAX_REFRESH_HOURS = 168;
const REQUEST_MIN_DELAY_MS = 2 * 60 * 1000;
const REQUEST_MAX_DELAY_MS = 8 * 60 * 1000;
const DATING_APP_BATCH_SIZE = 3;
const DEFAULT_DATING_APP_MIN_AGE = 19;
const DEFAULT_DATING_APP_MAX_AGE = 43;
const ABSOLUTE_DATING_APP_MIN_AGE = 19;
const ABSOLUTE_DATING_APP_MAX_AGE = 80;
const DATING_IMAGE_COOLDOWN_MS = 8500;
const DATING_IMAGE_RETRY_DELAYS_MS = [12000, 26000];

let datingImageQueue = Promise.resolve();
let lastDatingImageRequestAt = 0;

type GeneratedDatingAppProfile = Record<string, unknown> & Partial<Omit<DatingAppProfile, 'id' | 'photos' | 'createdAt' | 'expiresAt' | 'imagePrompts'>>;

const KOREAN_SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '전', '홍', '유', '고', '문', '양', '손', '배', '백', '허', '남', '심', '노', '하', '곽', '성', '차', '주', '우', '구', '민', '류', '나', '진', '지', '엄', '채', '원', '천', '방', '공', '현'];
const KOREAN_GIVEN_NAMES = ['서연', '서윤', '지우', '하윤', '지민', '서현', '민서', '하은', '윤서', '지아', '수아', '예은', '다은', '채원', '유진', '시은', '나연', '소율', '예린', '서아', '다인', '가은', '유나', '하린', '아린', '세은', '도연', '가현', '소민', '채린', '나현', '지안', '예나', '유림', '수빈', '민지', '은서', '지현', '다희', '소현', '채아', '예솔', '연우', '주아', '라희', '이안', '태린', '서하', '하영', '나경', '유정', '아영', '보라', '혜린', '수연', '지윤', '세아', '나율', '도희', '은채', '세영', '채영', '윤아', '가영', '소윤', '지율', '예지', '유빈', '다솜', '수민', '혜원', '시현', '하나', '은별', '미소', '아라', '다연', '서율', '가윤', '지수'];
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
const REGION_COORDS = [
  { keys: ['강남', '서초', '잠실', '송파', '역삼', '논현', '삼성'], lat: 37.4979, lon: 127.0276 },
  { keys: ['홍대', '마포', '합정', '상수', '연남', '망원'], lat: 37.5563, lon: 126.9220 },
  { keys: ['성수', '건대', '뚝섬', '왕십리'], lat: 37.5446, lon: 127.0557 },
  { keys: ['용산', '이태원', '한남'], lat: 37.5326, lon: 126.9905 },
  { keys: ['종로', '광화문', '을지로', '시청'], lat: 37.5665, lon: 126.9780 },
  { keys: ['서울'], lat: 37.5665, lon: 126.9780 },
  { keys: ['분당', '판교', '성남'], lat: 37.3948, lon: 127.1112 },
  { keys: ['수원'], lat: 37.2636, lon: 127.0286 },
  { keys: ['일산', '고양'], lat: 37.6584, lon: 126.8320 },
  { keys: ['인천', '송도'], lat: 37.4563, lon: 126.7052 },
  { keys: ['부산', '해운대', '서면'], lat: 35.1796, lon: 129.0756 },
  { keys: ['대구'], lat: 35.8714, lon: 128.6014 },
  { keys: ['대전'], lat: 36.3504, lon: 127.3845 },
  { keys: ['광주'], lat: 35.1595, lon: 126.8526 },
  { keys: ['제주'], lat: 33.4996, lon: 126.5312 }
];
const DATING_SLOT_CUES = [
  {
    label: '대표 사진',
    cue: 'dating app representative profile photo, vertical close upper-body portrait, eye-level phone camera, face centered but not passport-stiff, shoulders visible, gentle head tilt, one hand loosely touching hair or collarbone, head fully included, clean profile photo crop'
  },
  {
    label: '일상',
    cue: 'daily-life candid photo, seated at a cafe table or leaning near a window, three-quarter body snapshot, phone camera from slightly above, natural candid smile, one arm resting on table, ordinary Korean daily setting, face clearly visible, head fully included'
  },
  {
    label: '외출',
    cue: 'going-out snapshot, full-body or knees-up street photo, camera held by a friend from a few meters away, walking pose or one foot forward, Seoul neighborhood background, stylish believable outfit, face clearly visible, head included, not a scenery photo'
  },
  {
    label: '취향',
    cue: 'hobby and interest photo, environmental candid composition, the woman is doing a simple activity related to her interests, hands visible, three-quarter angle from the side, realistic place matching her interests, face clearly visible, head included, not an empty interior or object photo'
  },
  {
    label: '분위기',
    cue: 'atmospheric evening dating app photo, waist-up portrait from a diagonal angle, warm indoor or city light mood, looking slightly away from camera then back, relaxed shoulders, different outfit and lighting, head fully included'
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

function randomKoreanFullName(seed = Math.random()) {
  const surname = pick(KOREAN_SURNAMES, seed);
  const given = pick(KOREAN_GIVEN_NAMES, seed * 1.61803398875 + Math.random() * 0.17);
  return `${surname}${given}`;
}

function normalizeKoreanFullName(value: unknown, fallbackSeed = Math.random()) {
  const raw = String(value || '').replace(/\s+/g, '').replace(/[^\p{Script=Hangul}]/gu, '').trim();
  const fallback = randomKoreanFullName(fallbackSeed);
  if (/^[가-힣]{3}$/.test(raw)) return raw;
  if (/^[가-힣]{2}$/.test(raw)) return `${pick(KOREAN_SURNAMES, fallbackSeed)}${raw}`;
  if (/^[가-힣]{4,}$/.test(raw)) return raw.slice(0, 3);
  return fallback;
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isTransientImageError(error: unknown) {
  const message = String(error instanceof Error ? error.message : error || '').toLowerCase();
  return /429|rate|quota|timeout|timed out|network|fetch|socket|econn|503|502|500|busy|overload|temporar/.test(message);
}

function datingImageScope(profile: DatingAppProfile, label: string, attempt: number) {
  return `${profile.name}/${label}/attempt${attempt}`;
}

async function runQueuedDatingImage<T>(state: SNSGodState, scope: string, task: () => Promise<T>): Promise<T> {
  const run = datingImageQueue
    .catch(() => undefined)
    .then(async () => {
      const elapsed = Date.now() - lastDatingImageRequestAt;
      const waitMs = Math.max(0, DATING_IMAGE_COOLDOWN_MS - elapsed);
      if (waitMs > 0) {
        void appendDebugLog('datingApp.image.queue', `wait ${waitMs}ms before ${scope}`);
        await delay(waitMs);
      }
      void appendDebugLog('datingApp.image.queue', `start ${scope}`);
      try {
        const result = await task();
        void appendDebugLog('datingApp.image.queue', `success ${scope}`);
        return result;
      } finally {
        lastDatingImageRequestAt = Date.now();
      }
    });
  datingImageQueue = run.then(() => undefined, () => undefined);
  return run;
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

export function datingAppAgeRange(state: SNSGodState) {
  const raw = String(state.config.datingAppAgeRange || '').trim();
  const matches = raw.match(/\d{1,3}/g)?.map(value => Number(value)).filter(Number.isFinite) || [];
  let min = matches[0] ?? DEFAULT_DATING_APP_MIN_AGE;
  let max = matches[1] ?? matches[0] ?? DEFAULT_DATING_APP_MAX_AGE;
  if (min > max) [min, max] = [max, min];
  min = Math.max(ABSOLUTE_DATING_APP_MIN_AGE, Math.min(ABSOLUTE_DATING_APP_MAX_AGE, Math.round(min)));
  max = Math.max(ABSOLUTE_DATING_APP_MIN_AGE, Math.min(ABSOLUTE_DATING_APP_MAX_AGE, Math.round(max)));
  if (min > max) [min, max] = [max, min];
  return { min, max, label: `${min}-${max}` };
}

export function datingAppEffectiveAcceptanceChance(state: SNSGodState, profile?: DatingAppProfile) {
  const base = datingAppAcceptanceChance(state);
  if (!profile) return base;
  const distanceAdjustment = distanceAcceptanceAdjustment(profile.distanceKm);
  const ageAdjustment = ageAcceptanceAdjustment(inferUserAge(state), profile.age);
  return Math.max(0, Math.min(100, Math.round(base + distanceAdjustment + ageAdjustment)));
}

function userProfileText(state: SNSGodState) {
  const activePreset = (state.config.userProfilePresets || []).find(item => item.id === state.config.activeUserProfilePresetId);
  return [
    activePreset?.userDescription,
    activePreset?.userAppearancePrompt,
    activePreset?.userName,
    state.config.userDescription,
    state.config.userAppearancePrompt,
    state.config.userName
  ].filter(Boolean).join(' ');
}

function inferUserRegion(state: SNSGodState) {
  const text = userProfileText(state);
  return regionCoordForText(text) || regionCoordForText('서울') || REGION_COORDS[0];
}

function inferUserAge(state: SNSGodState): number | undefined {
  const text = userProfileText(state);
  const patterns = [
    /(\d{2})\s*세/,
    /나이\s*[:：]?\s*(\d{2})/,
    /(\d{2})\s*살/,
    /(\d{2})\s*대/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = Number(match?.[1]);
    if (Number.isFinite(value) && value >= 18 && value <= 70) return pattern.source.includes('대') ? value + 5 : value;
  }
  return undefined;
}

function regionCoordForText(text: string) {
  const source = String(text || '');
  return REGION_COORDS.find(region => region.keys.some(key => source.includes(key)));
}

function distanceKmBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function plausibleDatingDistanceKm(state: SNSGodState, candidateLocation: string, seed = Math.random()) {
  const userRegion = inferUserRegion(state);
  const candidateRegion = regionCoordForText(candidateLocation);
  if (!candidateRegion) return Number((1.2 + Math.abs(seed) * 18).toFixed(1));
  const base = distanceKmBetween(userRegion, candidateRegion);
  const jitter = 0.4 + (Math.abs(seed * 997) % 4.2);
  return Number(Math.max(0.4, Math.min(60, base + jitter)).toFixed(1));
}

function distanceAcceptanceAdjustment(distanceKm: number) {
  if (distanceKm <= 2) return 10;
  if (distanceKm <= 20) return 10 * (1 - ((distanceKm - 2) / 18));
  if (distanceKm <= 60) return -10 * ((distanceKm - 20) / 40);
  return -10;
}

function ageAcceptanceAdjustment(userAge: number | undefined, candidateAge: number) {
  if (!userAge) return 0;
  const diff = Math.abs(userAge - candidateAge);
  if (diff <= 2) return 10;
  if (diff <= 10) return 10 * (1 - ((diff - 2) / 8));
  if (diff <= 20) return -10 * ((diff - 10) / 10);
  return -10;
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

function withDatingAppHistory(progress: DatingAppProgress): DatingAppProgress {
  const finalProfile = finalDatingAppProfile(progress);
  const decisions = progress.decisions || [];
  if (!finalProfile || !decisions.length) return progress;
  const profiles = datingAppProfiles(progress);
  const decisionSummaries = decisions.map(item => {
    const profile = profiles.find(candidate => candidate.id === item.profileId);
    return {
      profileId: item.profileId,
      name: profile?.name || item.profileId,
      age: Number(profile?.age || 0),
      decision: item.decision,
      decidedAt: item.decidedAt
    };
  });
  const id = `dating_history_${finalProfile.id}`;
  const entry = {
    id,
    savedAt: Date.now(),
    completedAt: progress.completedAt,
    finalProfileId: finalProfile.id,
    finalProfile,
    decisions: decisionSummaries,
    requestStatus: progress.requestStatus,
    requestedAt: progress.requestedAt,
    resolvedAt: progress.resolvedAt,
    rejectedReason: progress.rejectedReason,
    acceptedRoomId: progress.acceptedRoomId,
    acceptedCharacterId: progress.acceptedCharacterId
  };
  const history = [
    entry,
    ...(progress.history || []).filter(item => item.id !== id && item.finalProfileId !== finalProfile.id)
  ].slice(0, 80);
  return { ...progress, history };
}

export function shouldRefreshDatingApp(state: SNSGodState, now = Date.now()) {
  const progress = datingAppProgress(state);
  const profiles = datingAppProfiles(progress);
  if (!profiles.length) return true;
  if (progress.requestStatus === 'pending' || progress.requestStatus === 'accepted') return false;
  return Number(profiles[0]?.expiresAt || progress.currentProfile?.expiresAt || 0) <= now;
}

function rejectExpiredUnrequestedDatingAppSelection(state: SNSGodState, now = Date.now()): SNSGodState {
  const progress = datingAppProgress(state);
  const profile = finalDatingAppProfile(progress);
  if (!profile || progress.requestStatus !== 'none') return state;
  const expiresAt = Number(datingAppProfiles(progress)[0]?.expiresAt || progress.currentProfile?.expiresAt || 0);
  if (!expiresAt || expiresAt > now) return state;
  return {
    ...state,
    datingApp: withDatingAppHistory({
      ...progress,
      finalProfileId: profile.id,
      requestStatus: 'rejected',
      resolvedAt: now,
      rejectedReason: '시간 안에 대화신청을 보내지 않아 자동으로 지나갔어요.'
    })
  };
}

function fallbackProfile(state: SNSGodState, now: number, refreshHours: number): DatingAppProfile {
  const edgePreset = Math.random() < 0.42 ? pick(EDGE_PROFILE_PRESETS) : undefined;
  const name = randomKoreanFullName();
  const job = edgePreset?.job || pick(JOBS);
  const location = pick(LOCATIONS);
  const interests = uniqueList([], INTERESTS.sort(() => Math.random() - 0.5), 5);
  const education = pick(EDUCATIONS);
  const mbti = pick(MBTIS);
  const ageRange = datingAppAgeRange(state);
  return {
    id: makeId('dating'),
    name,
    age: ageRange.min + Math.floor(Math.random() * (ageRange.max - ageRange.min + 1)),
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

function datingAgeIdentityPrompt(name: string, age: number, job: string, location: string, identityPrompt: string) {
  const ageLine = `Korean woman named ${name}, adult ${age} years old, age-appropriate face and styling for a ${age}-year-old, ${job}, ${location}`;
  const cleaned = String(identityPrompt || '').trim();
  return cleaned.includes(`${age}`) ? cleaned : `${ageLine}, ${cleaned || 'realistic dating app identity'}`;
}

function normalizeProfile(state: SNSGodState, parsed: GeneratedDatingAppProfile | undefined, now: number, refreshHours: number): DatingAppProfile {
  const fallback = fallbackProfile(state, now, refreshHours);
  const ageRange = datingAppAgeRange(state);
  const name = normalizeKoreanFullName(parsed?.name, stableProfileSeed(fallback));
  const age = clampNumber(parsed?.age, fallback.age, ageRange.min, ageRange.max);
  const job = stringValue(parsed?.job, fallback.job);
  const location = stringValue(parsed?.location, fallback.location);
  const distanceKm = plausibleDatingDistanceKm(state, location, stableProfileSeed({ ...fallback, name, age, job, location }));
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
    distanceKm,
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
    identityPrompt: datingAgeIdentityPrompt(
      name,
      age,
      job,
      location,
      stringValue(parsed?.identityPrompt, fallback.identityPrompt)
    ),
    createdAt: now,
    expiresAt: now + refreshHours * 60 * 60 * 1000
  };
}

async function generateProfileJson(state: SNSGodState): Promise<GeneratedDatingAppProfile | undefined> {
  const ageRange = datingAppAgeRange(state);
  const messages = [
    {
      role: 'system' as const,
      content: [
        'Create one fictional adult Korean dating app profile for a simulation app.',
        `Return compact JSON only. The woman must be a fictional adult age ${ageRange.label}, not a real person, and not a celebrity clone.`,
        'name must be a diverse 3-syllable Korean full name with one common Korean family name plus a two-syllable given name, such as 김서연, 정하윤, 문채린, 한지우. Do not return two-syllable given names like 서윤, 지안, 유나. Avoid repeating common small pools.',
        `Choose age randomly across the full ${ageRange.label} range; do not cluster every profile in the 20s unless the configured range is only 20s.`,
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
        'identityPrompt must explicitly include her exact age and age-appropriate face, styling, outfit, and vibe for that age.',
        'Fields: name, age, job, location, distanceKm, heightCm, bodyLabel, alcohol, smoking, religion, education, mbti, verified, lastActiveLabel, bio, traits, interests, datingStyle, lifestyle, profileQuestionCards, personalitySummary, speechStyle, relationshipStyle, likes, dislikes, hobbies, snsStyle, firstMessage, callPreview, identityPrompt.'
      ].join('\n')
    },
    {
      role: 'user' as const,
      content: '한국어 값으로 작성해. name은 반드시 성 포함 3글자 한국 이름으로 작성해. profileQuestionCards는 question/lockedText 4~5개이며 lockedText는 실제로 보이는 답변 내용이다. identityPrompt만 영어 이미지용 묘사로 작성해.'
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
  const compositionCues = [
    'composition must be close upper-body, direct eye-level selfie-like portrait, relaxed head tilt, shoulders and hands visible',
    'composition must be candid seated cafe snapshot, camera slightly above, table edge visible, one arm resting naturally',
    'composition must be outdoor full-body or knees-up walking shot, camera several meters away, dynamic step-forward pose',
    'composition must be side-angle environmental hobby candid, hands actively doing something, body turned 30-60 degrees from camera',
    'composition must be warm evening diagonal waist-up portrait, looking slightly off-camera, softer expression and different framing'
  ];
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
        compositionCues[index],
        interestCue,
        `photo slot ${index + 1} of 5, use a different outfit preset, different outfit color, different fit, different background, and different pose from every other slot`,
        `mandatory variety: this slot must not reuse the same camera distance, same pose, same arm position, same background layout, or same crop as any other slot in this album`,
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
      const uri = await generateDatingImageWithRetry(state, profile, item.label, item.prompt, referenceImage);
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

async function generateDatingImageWithRetry(state: SNSGodState, profile: DatingAppProfile, label: string, prompt: string, referenceImage?: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= DATING_IMAGE_RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) {
      const waitMs = DATING_IMAGE_RETRY_DELAYS_MS[attempt - 1];
      void appendDebugLog('datingApp.image.retry', `wait ${waitMs}ms before retry ${datingImageScope(profile, label, attempt + 1)}`, 'warn');
      await delay(waitMs);
    }
    try {
      return await runQueuedDatingImage(state, datingImageScope(profile, label, attempt + 1), () =>
        generateImageDataUri(state, prompt, undefined, {
        referenceImage,
        kind: referenceImage ? 'profile-reference-face' : 'profile'
        })
      );
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      void appendDebugLog('datingApp.image.retry', `failed ${datingImageScope(profile, label, attempt + 1)}: ${message}`, 'warn');
      if (!isTransientImageError(error) || attempt >= DATING_IMAGE_RETRY_DELAYS_MS.length) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError || 'dating image generation failed'));
}

async function regenerateDatingPhoto(state: SNSGodState, profile: DatingAppProfile, photo: DatingAppPhoto, referenceImage?: string): Promise<DatingAppPhoto> {
  const nextPhoto: DatingAppPhoto = {
    ...photo,
    createdAt: Date.now(),
    uri: undefined,
    error: undefined
  };
  try {
    const uri = await generateDatingImageWithRetry(state, profile, photo.label, photo.prompt, referenceImage);
    return { ...nextPhoto, uri };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void appendDebugLog('datingApp.image.retry', `image retry failed ${profile.name}/${photo.label}: ${message}`, 'warn');
    return { ...nextPhoto, error: message };
  }
}

async function generateDatingAppProfileBundle(state: SNSGodState, now: number, refreshIntervalHours: number): Promise<DatingAppProfile> {
  const parsed = await generateProfileJson(state);
  const profileSeed = normalizeProfile(state, parsed, now, refreshIntervalHours);
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
  const sourceState = rejectExpiredUnrequestedDatingAppSelection(state, now);
  const refreshIntervalHours = datingAppRefreshHours(state);
  const acceptanceChancePercent = datingAppAcceptanceChance(state);
  const firstProfile = await generateDatingAppProfileBundle(sourceState, now, refreshIntervalHours);
  const profiles: DatingAppProfile[] = [firstProfile];
  return {
    ...sourceState,
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
      acceptedCharacterId: undefined,
      history: sourceState.datingApp?.history || []
    }
  };
}

export async function recordDatingAppDecision(state: SNSGodState, profileId: string, decision: 'liked' | 'passed'): Promise<SNSGodState> {
  const progress = datingAppProgress(state);
  const profiles = datingAppProfiles(progress);
  if (!profiles.some(profile => profile.id === profileId) || datingAppRoundCompleted(progress)) return state;
  const now = Date.now();
  const previous = progress.decisions || [];
  const likedCountWithoutCurrent = previous.filter(item => item.profileId !== profileId && item.decision === 'liked').length;
  if (decision === 'liked' && likedCountWithoutCurrent >= MAX_DATING_APP_LIKES_PER_ROUND) return state;
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
  const nextDatingApp = withDatingAppHistory({
    ...progress,
    profiles: nextProfiles,
    currentProfile: nextProfiles[activeProfileIndex] || nextProfiles[nextProfiles.length - 1],
    activeProfileIndex,
    decisions,
    finalProfileId: completed && decisions.filter(item => item.decision === 'liked').length === 1
      ? decisions.find(item => item.decision === 'liked')?.profileId
      : progress.finalProfileId,
    completedAt: completed ? (progress.completedAt || now) : progress.completedAt
  });
  return {
    ...state,
    datingApp: nextDatingApp
  };
}

export async function regenerateActiveDatingAppFailedPhotos(state: SNSGodState): Promise<SNSGodState> {
  const progress = datingAppProgress(state);
  if (progress.requestStatus === 'pending' || datingAppRoundCompleted(progress)) return state;
  const profiles = datingAppProfiles(progress);
  const activeIndex = Math.max(0, Math.min(Number(progress.activeProfileIndex || 0), Math.max(0, profiles.length - 1)));
  const profile = profiles[activeIndex];
  if (!profile) return state;
  const failedPhotos = (profile.photos || []).filter(photo => !photo.uri);
  if (!failedPhotos.length) return state;

  const supportsReference = datingImageProviderSupportsReference(state);
  const firstUsablePhoto = profile.photos.find(photo => photo.uri)?.uri;
  const usedReferences = new Set<string>();
  const seedReferenceImage = supportsReference && !firstUsablePhoto ? randomDatingFaceReference(state, usedReferences) : undefined;
  const referenceImage = supportsReference ? firstUsablePhoto || seedReferenceImage : undefined;
  const replacements = new Map<string, DatingAppPhoto>();
  for (const photo of failedPhotos) {
    replacements.set(photo.id, await regenerateDatingPhoto(state, profile, photo, referenceImage));
  }
  const nextProfile: DatingAppProfile = {
    ...profile,
    photos: profile.photos.map(photo => replacements.get(photo.id) || photo)
  };
  const nextProfiles = profiles.map((item, index) => index === activeIndex ? nextProfile : item);
  return {
    ...state,
    datingApp: {
      ...progress,
      profiles: nextProfiles,
      currentProfile: nextProfile,
      activeProfileIndex: activeIndex
    }
  };
}

export async function replaceActiveDatingAppProfile(state: SNSGodState): Promise<SNSGodState> {
  const progress = datingAppProgress(state);
  if (progress.requestStatus === 'pending' || datingAppRoundCompleted(progress)) return state;
  const profiles = datingAppProfiles(progress);
  const activeIndex = Math.max(0, Math.min(Number(progress.activeProfileIndex || 0), Math.max(0, profiles.length - 1)));
  const current = profiles[activeIndex];
  if (!current) return state;
  const decisions = (progress.decisions || []).filter(item => item.profileId !== current.id);
  const refreshIntervalHours = progress.refreshIntervalHours || datingAppRefreshHours(state);
  const nextProfile = await generateDatingAppProfileBundle(state, Date.now(), refreshIntervalHours);
  const nextProfiles = profiles.map((item, index) => index === activeIndex ? nextProfile : item);
  const nextActiveIndex = Math.max(0, Math.min(activeIndex, Math.max(0, nextProfiles.length - 1)));
  const nextCurrentProfile = nextProfiles[nextActiveIndex] || nextProfile;
  return {
    ...state,
    datingApp: {
      ...progress,
      profiles: nextProfiles,
      currentProfile: nextCurrentProfile,
      activeProfileIndex: nextActiveIndex,
      decisions,
      finalProfileId: progress.finalProfileId === current.id ? undefined : progress.finalProfileId,
      selectedReferencePhotoIds: []
    }
  };
}

export function selectDatingAppFinalProfile(state: SNSGodState, profileId: string): SNSGodState {
  const progress = datingAppProgress(state);
  const likedIds = (progress.decisions || []).filter(item => item.decision === 'liked').map(item => item.profileId);
  if (!likedIds.includes(profileId)) return state;
  return {
    ...state,
    datingApp: withDatingAppHistory({
      ...progress,
      finalProfileId: profileId,
      selectedReferencePhotoIds: []
    })
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
    datingApp: withDatingAppHistory({
      ...progress,
      refreshIntervalHours: datingAppRefreshHours(state),
      acceptanceChancePercent: datingAppAcceptanceChance(state),
      finalProfileId: profile.id,
      requestStatus: 'pending',
      requestedAt: now,
      resolveAt: now + delay,
      resolvedAt: undefined,
      rejectedReason: undefined
    })
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
      datingApp: withDatingAppHistory({
        ...progress,
        requestStatus: 'accepted',
        acceptedRoomId: created.roomId,
        acceptedCharacterId: created.characterId
      })
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
  const completedCharacter = completeGeneratedCharacter(character, {
    state,
    source: 'dating_app',
    modeLabel: '소개팅 어플',
    personalitySummary: profile.personalitySummary,
    speechStyle: profile.speechStyle,
    relationshipStyle: profile.relationshipStyle,
    likes: profile.likes,
    dislikes: profile.dislikes,
    hobbies: profile.hobbies,
    job: profile.job,
    locationName: profile.location,
    snsStyle: profile.snsStyle,
    phonePrompt: profile.callPreview,
    appearancePrompt: profile.identityPrompt,
    imageIdentityPrompt: profile.identityPrompt,
    profileImage: firstPhoto,
    referenceImages: selectedReferenceImages,
    profileAvatarPrompt: profile.imagePrompts[0] || profile.identityPrompt,
    profileCoverPrompt: profile.imagePrompts[2] || profile.identityPrompt,
    firstMessage: profile.firstMessage,
    memory: profileMemory(profile)
  });
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
    characters: [...state.characters, completedCharacter],
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
  const chance = datingAppEffectiveAcceptanceChance(state, profile);
  const accepted = Math.random() * 100 < chance;
  if (!accepted) {
    return {
      next: {
        ...state,
        datingApp: withDatingAppHistory({
          ...progress,
          requestStatus: 'rejected',
          resolvedAt: now,
          rejectedReason: pick(REJECT_REASONS)
        })
      },
      accepted: false
    };
  }
  return {
    next: {
      ...state,
      datingApp: withDatingAppHistory({
        ...progress,
        requestStatus: 'accepted',
        resolvedAt: now,
        acceptedRoomId: undefined,
        acceptedCharacterId: undefined,
        selectedReferencePhotoIds: []
      })
    },
    accepted: true,
    roomId: undefined
  };
}
