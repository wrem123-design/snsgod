import { BlindDateAnswer, BlindDateCandidate, BlindDateMode, BlindDateProgress, BlindDateRanking, BlindDateRotationTurn, BlindDateRound, BlindDateSession, BlindDateWorldcupPair, CandidateAppearance, SNSGodCharacter, SNSGodState, StreetEncounterChoice, StreetEncounterStats } from '../types';
import { callLLMText, generateImageDataUri, parseJsonObject } from './api';
import { appendDebugLog } from './debugLog';
import { makeId } from './ids';
import { DEFAULT_COVER_BACKGROUND_DIRECTION } from './prompts';

const LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
export type BlindDateSessionOptions = {
  includeExistingCharacters?: boolean;
  encounterLocation?: string;
  questionTarget?: number;
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
  '오늘 여기서 한 명만 고른다면 너는 뭘로 승부 볼 거야?',
  '좋아하는 사람에게 일부러 차갑게 굴어본 적 있어?',
  '상대가 너보다 인기 많으면 솔직히 신경 쓰여?',
  '나한테 호감이 있는데 내가 눈치 못 채면 어디까지 표현할 거야?',
  '연애할 때 상대의 친구 관계까지 신경 쓰는 편이야?',
  '너는 사랑받는 쪽이 편해, 사랑하는 쪽이 편해?',
  '상대가 너를 너무 빨리 좋아하면 부담스러워, 귀여워?',
  '썸인데 하루 종일 연락이 없으면 너는 어떻게 행동해?',
  '좋아하는 사람이 애매하게 굴면 바로 정리해, 한 번 더 확인해?',
  '나랑 가치관이 안 맞아도 끌리면 만날 수 있어?',
  '네가 연애에서 제일 이기적으로 변하는 순간은?',
  '상대가 네 SNS를 자주 확인하는 걸 알면 어때?',
  '전 연인과 친구로 지내는 사람을 이해할 수 있어?',
  '사랑한다고 말하면서 행동이 부족한 사람을 얼마나 기다려줄 수 있어?',
  '연애 초반에 상대의 단점을 어디까지 눈감아줄 수 있어?',
  '너는 헤어질 때 이유를 끝까지 설명하는 편이야, 조용히 멀어지는 편이야?',
  '상대가 네 약점을 농담처럼 말하면 웃어넘길 수 있어?',
  '첫 만남에서 상대가 너무 적극적이면 끌려, 부담스러워?',
  '친구들이 반대하는 사람을 계속 좋아할 수 있어?',
  '나랑 싸운 뒤 내가 먼저 연락 안 하면 얼마나 기다릴 것 같아?',
  '연애에서 확인받고 싶은 욕구가 큰 편이야?',
  '너한테 “좋은 사람인데 안 끌리는 사람”은 왜 안 끌릴까?',
  '상대가 너를 질투하게 만들려고 행동하면 바로 알아차려?',
  '연애 중 상대가 혼자 여행 간다고 하면 어디까지 괜찮아?',
  '너는 안정적인 사람과 재밌는 사람 중 누구에게 약해?',
  '나한테 딱 하나 경고해야 한다면 뭐라고 할래?',
  '상대가 돈을 아끼는 모습과 인색한 모습의 기준은 어디야?',
  '너는 사과를 말로 듣고 싶어, 행동으로 확인하고 싶어?',
  '처음부터 너무 잘 맞으면 오히려 의심하는 편이야?',
  '좋아하는 사람이 네 계획을 자꾸 흔들면 설레, 피곤해?',
  '연애할 때 네가 제일 자주 하는 방어기제는 뭐야?',
  '내가 갑자기 잠수 타면 너는 화를 내, 걱정부터 해?',
  '상대가 네 과거를 많이 궁금해하면 어디까지 말해줄 거야?',
  '좋아하는 사람 앞에서 일부러 괜찮은 척한 적 있어?',
  '너한테 오래 남는 사람은 다정한 사람, 솔직한 사람, 재밌는 사람 중 누구야?',
  '연애에서 “이건 사랑이 아니라 습관이다”라고 느끼는 순간은?',
  '나랑 사귀면 네가 제일 먼저 시험받을 부분은 뭐야?',
  '상대가 불안해할 때 매번 달래주는 연애를 할 수 있어?',
  '네가 먼저 마음이 식었을 때 티가 나는 편이야?',
  '연애에서 자존심을 내려놓을 수 있는 선은 어디까지야?',
  '상대가 너를 공개적으로 자랑하는 걸 좋아해, 부담스러워?',
  '처음 만난 사람에게 묘하게 기대고 싶어진 적이 있다면 왜였을까?',
  '사랑하면 생활 리듬까지 맞추려고 하는 편이야?',
  '너는 상대의 말투 변화에 예민한 편이야?',
  '내가 너를 좋아하는지 헷갈리게 굴면 어떻게 확인할 거야?',
  '데이트 중 상대가 계속 휴대폰을 보면 바로 말해?',
  '너한테 “센스 있다”는 건 어떤 행동이야?',
  '연애에서 네가 제일 무서워하는 결말은 뭐야?',
  '좋아하는 사람의 단점이 귀여워 보이는 순간은 언제야?',
  '나랑 단둘이 있으면 어떤 침묵은 괜찮고 어떤 침묵은 어색해?'
];
const USER_REQUESTED_QUESTIONS = [
  '데이트 비용은 어떤 비율로 부담하는 게 가장 합리적이라고 생각하시나요?',
  '가장 최근 연애가 끝난 진짜 이유가 무엇인가요?',
  '애인이 이성 친구와 단둘이 술을 마신다고 하면 어디까지 허용 가능하신가요?',
  '결혼을 전제로 한다면, 혼전 동거에 대해 어떻게 생각하시나요?',
  '연인 사이에 스마트폰 비밀번호나 메신저를 공유하는 것에 대해 어떻게 생각하세요?',
  '연애를 시작할 때 스킨십 진도는 어느 정도 속도가 가장 이상적이라고 생각하시나요?',
  '전 연인과 친구로 지내는 게 쿨한 건가요, 아니면 미련인가요?',
  '한 달 수입에서 저축과 소비, 데이트 비용의 비율은 대략 어떻게 되시나요?',
  '술자리에서 필름이 끊기거나 이성 문제로 실수해 본 적이 있으신가요?',
  "본인이 생각하는 '바람'의 정확한 기준은 어디부터인가요?",
  '속궁합이 심각하게 안 맞는다면, 감정적인 사랑만으로 평생 극복할 수 있다고 생각하시나요?',
  "본인 스스로 생각할 때 '나는 연애할 때 이 부분은 진짜 피곤한 사람이다' 하는 단점이 있나요?",
  '애인이 밤늦게 클럽이나 헌팅 포차에 간다고 하면 쿨하게 보내주실 수 있나요?',
  '피임에 대해서는 평소 어떤 방식과 가치관을 중요하게 생각하시나요?',
  '상대방의 빚이나 경제적인 어려움을 알게 된다면 어디까지 감당하실 수 있나요?',
  '잠수 이별과 환승 이별 중, 굳이 하나를 당해야 한다면 어느 쪽이 덜 분노할 것 같나요?',
  '종교나 정치 성향이 완전히 반대여도 연애나 결혼이 원만하게 가능하다고 보시나요?',
  '화가 났을 때 당장 끝까지 대화로 푸는 편인가요, 아니면 입을 닫고 잠수 타는 편인가요?',
  '평소 연락 빈도와 답장 속도는 어느 정도여야 서로 숨이 막히지 않는다고 생각하시나요?',
  '만약 오늘 저와 느낌이 잘 통한다면, 당장 내일이라도 같이 1박 2일 여행을 떠날 수 있나요?'
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
const WORLDCUP_POSES = [
  'standing three-quarter pose with one shoulder angled toward camera',
  'seated cafe pose with both hands around a cup',
  'walking candid pose looking back over one shoulder',
  'mirror selfie pose with phone low near chest',
  'leaning lightly on a railing with relaxed arms',
  'side-profile pose fixing hair near one ear',
  'arms loosely crossed in an office lounge',
  'one hand holding tote strap, direct eye contact',
  'sitting on a bench with legs angled to the side',
  'close portrait with chin slightly lifted'
];
const WORLDCUP_OUTFITS = [
  'navy blazer with white blouse and silver necklace',
  'cream knit cardigan with denim skirt and canvas tote',
  'black leather jacket with muted red scarf',
  'sage green linen shirt with wide beige trousers',
  'sporty white windbreaker with black leggings',
  'lavender blouse with charcoal slacks',
  'striped oversized shirt with brown pleated skirt',
  'minimal black turtleneck with camel coat',
  'soft pink sweater with light gray jeans',
  'vintage denim jacket with floral dress'
];
const WORLDCUP_CAMERA_LENSES = [
  '35mm phone camera look',
  '50mm portrait lens look',
  'slight wide-angle candid phone photo',
  'soft telephoto street portrait',
  'front-camera selfie perspective',
  'low handheld camera perspective'
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
const STREET_ENCOUNTER_LOCATIONS = [
  '성수 카페거리',
  '한강 산책로',
  '전시회/갤러리',
  '독립서점',
  '편집샵 거리',
  '베이커리 앞',
  '지하철역 근처',
  '회사 밀집 거리',
  '대학가 카페',
  '야간 편의점 앞',
  '주말 플리마켓',
  '반려동물 산책로'
];
const ENCOUNTER_MAX_TURNS = 4;
const STREET_LOCATION_TRAITS: Record<string, { jobs: string[]; moods: string[]; outfits: string[]; reasons: string[] }> = {
  '성수 카페거리': {
    jobs: ['브랜드 디자이너', '콘텐츠 마케터', '프리랜서 포토그래퍼', '쇼룸 스태프'],
    moods: ['감성적이지만 처음엔 조심스러운', '트렌디하고 관찰이 빠른'],
    outfits: ['minimal jacket with wide pants', 'cropped hoodie and casual denim', 'soft knit cardigan with tote bag'],
    reasons: ['친구를 기다리며 테이크아웃 컵을 들고 있다', '카페 앞 메뉴판을 보며 잠깐 고민 중이다']
  },
  '한강 산책로': {
    jobs: ['요가 강사', '헬스케어 상담사', '앱 서비스 기획자', '러닝 크루 운영자'],
    moods: ['털털하고 밝은', '조금 지쳤지만 여유를 찾는'],
    outfits: ['light windbreaker and sneakers', 'hoodie zip-up with training pants', 'simple sweatshirt and cap'],
    reasons: ['산책하다 벤치 옆에서 물을 마시고 있다', '이어폰을 빼고 강 쪽을 바라보고 있다']
  },
  '전시회/갤러리': {
    jobs: ['전시 코디네이터', '박물관 도슨트', '공연 기획자', '일러스트레이터'],
    moods: ['차분하고 취향이 분명한', '말수는 적지만 호기심 있는'],
    outfits: ['black coat with a small necklace', 'simple one-piece dress and loafers', 'tailored jacket with muted colors'],
    reasons: ['작품 설명 앞에서 오래 멈춰 서 있다', '팸플릿을 접어 들고 다음 전시실을 살피고 있다']
  },
  '독립서점': {
    jobs: ['번역가', '로컬 매거진 에디터', '북카페 운영자', '작가 지망생'],
    moods: ['조용하고 생각이 많은', '낯을 가리지만 섬세한'],
    outfits: ['oversized knit and long skirt', 'shirt with cardigan in calm colors', 'loose cotton blouse and canvas bag'],
    reasons: ['시집 코너 앞에서 책등을 천천히 훑고 있다', '계산대 근처에서 책갈피를 고르고 있다']
  },
  '편집샵 거리': {
    jobs: ['소품샵 바이어', '패션 MD', '향수 브랜드 스태프', '주얼리 디자이너'],
    moods: ['쿨하고 센스 있는', '도도해 보이지만 반응이 빠른'],
    outfits: ['statement jacket with wide trousers', 'vintage layered outfit', 'hip makeup with edited-shop street fashion'],
    reasons: ['쇼윈도 앞에서 작은 액세서리를 바라보고 있다', '종이 쇼핑백을 들고 골목을 서성인다']
  },
  '베이커리 앞': {
    jobs: ['브런치 셰프', '카페 매니저', '플로리스트', '초등학교 교사'],
    moods: ['다정하고 생활감 있는', '밝지만 살짝 바쁜'],
    outfits: ['warm cardigan and clean casual knit', 'soft blouse with beige skirt', 'simple sweater and tote bag'],
    reasons: ['빵 봉투를 들고 영수증을 확인하고 있다', '품절 안내문 앞에서 아쉬운 표정을 짓고 있다']
  },
  '지하철역 근처': {
    jobs: ['스타트업 HR', '간호사', '외국계 회사 직장인', '데이터 라벨링 매니저'],
    moods: ['현실적이고 경계심 있는', '바쁘지만 예의 있는'],
    outfits: ['trench coat with slacks', 'office blouse and neat shoulder bag', 'minimal jacket and black turtleneck'],
    reasons: ['출구 근처에서 시간을 확인하고 있다', '누군가를 기다리는 듯 휴대폰을 보고 있다']
  },
  '회사 밀집 거리': {
    jobs: ['UX 리서처', '브랜드 마케터', '앱 서비스 기획자', '호텔 컨시어지'],
    moods: ['바쁘고 선이 분명한', '단정하고 현실적인'],
    outfits: ['clean office makeup with blouse and slacks', 'tailored blazer and low ponytail', 'minimal office look with trench coat'],
    reasons: ['커피를 들고 회사 입구 쪽으로 걷고 있다', '점심시간 끝 무렵 횡단보도 앞에 서 있다']
  },
  '대학가 카페': {
    jobs: ['대학원생', '학원 상담 매니저', '웹툰 어시스턴트', '영상 편집자'],
    moods: ['밝고 친근한', '피곤하지만 농담을 잘 받는'],
    outfits: ['학생스타일의 메이크업 with hoodie and denim', 'soft college makeup with cardigan', 'casual sweatshirt and backpack'],
    reasons: ['노트북을 접고 자리에서 일어나려 한다', '과제 자료를 보며 음료를 기다리고 있다']
  },
  '야간 편의점 앞': {
    jobs: ['방송 작가', '응급실 간호사', '프리랜서 디자이너', '와인바 매니저'],
    moods: ['피곤하지만 솔직한', '경계심이 높지만 말은 따뜻한'],
    outfits: ['comfortable hoodie and jogger pants', 'oversized sweatshirt, natural no-filter makeup', 'casual cardigan over lounge outfit'],
    reasons: ['편의점 봉투를 들고 잠깐 숨을 고르고 있다', '우산을 접고 처마 밑에 서 있다']
  },
  '주말 플리마켓': {
    jobs: ['도자기 공방 운영자', '빈티지 소품 셀러', '플로리스트', '공간 디자이너'],
    moods: ['호기심 많고 활발한', '취향 이야기에 금방 풀리는'],
    outfits: ['vintage casual outfit with canvas tote', 'linen shirt and colorful scarf', 'warm casual outfit with handmade accessories'],
    reasons: ['작은 소품을 들고 가격표를 살피고 있다', '부스 사이에서 향초를 시향하고 있다']
  },
  '반려동물 산책로': {
    jobs: ['동물병원 테크니션', '펫 브랜드 MD', '초등학교 교사', '콘텐츠 마케터'],
    moods: ['다정하고 조심스러운', '말랑하지만 낯을 가리는'],
    outfits: ['light cardigan and comfortable sneakers', 'soft sweatshirt with crossbody bag', 'windbreaker and natural daily makeup'],
    reasons: ['강아지 리드줄을 정리하며 천천히 걷고 있다', '벤치 옆에서 반려견에게 물을 먹이고 있다']
  }
};

function progressOf(state: SNSGodState): BlindDateProgress {
  return state.blindDate || { sessions: [], archives: [] };
}

function clampCandidateCount(count: number) {
  return Math.min(8, Math.max(3, Math.round(count || 5)));
}

function clampMiniGameCandidateCount(count: number) {
  return Math.min(5, Math.max(3, Math.round(count || 5)));
}

function clampQuestionTarget(count: number | undefined) {
  return Math.min(10, Math.max(5, Math.round(Number(count || 5))));
}

function clampWorldcupCount(count: number) {
  const value = Math.round(Number(count || 8));
  if (value >= 24) return 24;
  if (value >= 16) return 16;
  return 8;
}

function candidateCountForMode(mode: BlindDateMode, candidateCount: number): number {
  if (mode === 'encounter') return 1;
  if (mode === 'question' || mode === 'rotation') return clampMiniGameCandidateCount(candidateCount);
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

function streetTraits(location?: string) {
  return STREET_LOCATION_TRAITS[String(location || '')] || STREET_LOCATION_TRAITS['성수 카페거리'];
}

function randomStreetLocations(): string[] {
  return shuffled(STREET_ENCOUNTER_LOCATIONS).slice(0, 4);
}

function clampStat(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function clampMood(value: number): number {
  return Math.max(-50, Math.min(50, Math.round(value)));
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

function worldcupVisualDiversityCueFor(index: number): string {
  return [
    `worldcup candidate visual slot ${index + 1}`,
    `pose: ${WORLDCUP_POSES[index % WORLDCUP_POSES.length]}`,
    `outfit: ${WORLDCUP_OUTFITS[(index * 2) % WORLDCUP_OUTFITS.length]}`,
    `camera: ${WORLDCUP_CAMERA_LENSES[(index * 3) % WORLDCUP_CAMERA_LENSES.length]}`,
    `background: ${PHOTO_BACKGROUNDS[(index * 7) % PHOTO_BACKGROUNDS.length]}`,
    `composition: ${PHOTO_COMPOSITIONS[(index * 5) % PHOTO_COMPOSITIONS.length]}`,
    'must not share the same pose, outfit color, hairstyle, makeup palette, camera angle, or background with the opponent candidate',
    'make the two visible match-up candidates immediately distinguishable at thumbnail size'
  ].join(', ');
}

function applyImageVariationTriggers(prompt: string, index: number, mode?: BlindDateMode): string {
  const source = String(prompt || '').trim();
  const additions = ['low quality', imageVariationTriggerFor(index), visualDiversityCueFor(index), mode === 'worldcup' ? worldcupVisualDiversityCueFor(index) : '']
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

function normalizeCandidate(raw: Partial<BlindDateCandidate>, index: number, mode?: BlindDateMode): BlindDateCandidate {
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
    imagePrompt: applyImageVariationTriggers(String(raw.imagePrompt || buildImagePrompt({ ...raw, age }, appearance)), index, mode),
    profileImageUri: String(raw.profileImageUri || ''),
    answers: Array.isArray(raw.answers) ? raw.answers : [],
    score: Number(raw.score || 0),
    selectedCount: Number(raw.selectedCount || 0),
    createdAt: Number(raw.createdAt || now)
  };
  return { ...candidate, imagePrompt: candidate.imagePrompt || buildImagePrompt(candidate, appearance) };
}

function fallbackCandidates(count: number, mode?: BlindDateMode): BlindDateCandidate[] {
  const names = shuffled(NAME_POOL);
  const jobs = shuffled(JOB_POOL);
  return Array.from({ length: clampCandidateCount(count) }, (_, index) => normalizeCandidate({
    name: names[index % names.length],
    job: jobs[index % jobs.length]
  }, index + Math.floor(Math.random() * 1000), mode));
}

function withEncounterFlavor(candidate: BlindDateCandidate, location: string, index = 0): BlindDateCandidate {
  const traits = streetTraits(location);
  const reason = pickFrom(traits.reasons);
  const mood = pickFrom(traits.moods);
  const job = pickFrom(traits.jobs);
  const outfit = pickFrom(traits.outfits);
  const appearance = { ...candidate.appearance, outfitStyle: outfit };
  const imagePrompt = applyImageVariationTriggers([
    `adult Asian woman, ${candidate.nationality}, age ${candidate.age}`,
    `chance encounter at ${location} in Seoul`,
    `public place, respectful distance, ${reason}`,
    appearance.faceShape,
    appearance.eyes,
    appearance.eyelids,
    appearance.nose,
    appearance.lips,
    appearance.skinTone,
    appearance.hairStyle,
    appearance.makeupStyle,
    outfit,
    'realistic Korean visual novel still, natural candid portrait, clear face, everyday urban lighting, shallow depth of field, low quality'
  ].filter(Boolean).join(', '), index);
  const publicObservation = buildPublicObservation(location, reason, outfit, candidate.contactPresetId);
  const publicVibe = buildPublicVibe(candidate.contactPresetId, mood);
  return {
    ...candidate,
    job,
    locationBase: location,
    personalitySummary: `${mood} 타입. ${candidate.personalitySummary}`,
    appearance,
    imagePrompt,
    internalAppearancePrompt: appearanceSummary(appearance),
    internalImagePrompt: imagePrompt,
    hiddenProfile: compactCandidateText(`${candidate.name}, ${candidate.age}, ${job}, ${mood}. ${candidate.personalitySummary}`, 220),
    publicObservation,
    publicVibe,
    firstDm: `그때 ${location}에서 처음 말 걸었던 거 아직 기억나요. 짧았는데 은근히 인상에 남았어요.`,
    snsPreview: `${location}에서 잠깐 멈춘 시간. 생각보다 괜찮은 우연이었다.`,
    callPreview: '처음 만났을 때처럼 너무 부담스럽지 않게, 짧게 얘기해도 좋아요.'
  };
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
  }, index, 'worldcup');
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

function globalFaceReferenceSlots(state: SNSGodState): string[] {
  return (state.referenceFaceSlots || [])
    .map(slot => String(slot.image || '').trim())
    .filter(value => /^(data:|file:|content:|asset:|https?:\/\/)/i.test(value))
    .slice(0, 50);
}

function randomGlobalFaceReference(state: SNSGodState, referencePool?: string[], usedReferences?: Set<string>): string | undefined {
  const slots = (state.referenceFaceSlots || [])
    .map(slot => String(slot.image || '').trim())
    .filter(value => /^(data:|file:|content:|asset:|https?:\/\/)/i.test(value))
    .slice(0, 50);
  if (!slots.length) return undefined;
  const provider = state.config.imageGeneration?.provider || 'openai';
  if (provider !== 'grok-local' && provider !== 'grok-cloud') {
    void appendDebugLog('blindDate.reference', `reference slots=${slots.length}, provider=${provider}, skipped because this provider does not support image reference generation`, 'warn');
    return undefined;
  }
  const chancePercent = referenceFaceChancePercent(state);
  if (Math.random() * 100 >= chancePercent) return undefined;
  const pool = referencePool?.length ? referencePool : slots;
  const unused = usedReferences ? pool.filter(value => !usedReferences.has(value)) : pool;
  const selectable = unused.length ? unused : pool;
  const selected = selectable[Math.floor(Math.random() * selectable.length)];
  if (selected && usedReferences) usedReferences.add(selected);
  return selected;
}

function referenceFaceChancePercent(state: SNSGodState): number {
  const value = Number(state.config.imageGeneration?.referenceFaceChancePercent);
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 70));
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
  const traits = streetTraits(options.encounterLocation);
  let candidates = [...existingCandidates, ...fallbackCandidates(generatedCount, mode).map((candidate, index) => mode === 'encounter' ? withEncounterFlavor(candidate, options.encounterLocation || '성수 카페거리', index) : candidate)];
  try {
    const { text } = generatedCount > 0 ? await callLLMText(state, [
      {
        role: 'system',
        content: [
          mode === 'encounter'
            ? 'You generate one fictional adult woman for a respectful chance-encounter mini game in a Korean SNS messenger app.'
            : 'You generate fictional adult AI dating candidates for a Korean SNS messenger app.',
          'All candidates must be adults age 20 or older. All candidates must be Asian.',
          'Nationality distribution: about 95% Korean, about 5% Japanese or Chinese. Japanese or Chinese candidates must be fluent Korean speakers due to studying, working, or living in Korea.',
          'Do not create minors, teenagers, school-uniform characters, or ambiguous underage appearances.',
          'Each candidate must have a distinct Korean name, job, lifestyle, face, personality, speech style, SNS style, and contact pattern.',
          'Avoid reusing common names or the same office/cafe/marketing jobs. Use varied contemporary Korean lifestyles and occupations.',
          mode === 'encounter' ? `The encounter location is "${options.encounterLocation || '성수 카페거리'}". Use these local traits: jobs=${traits.jobs.join(', ')}, moods=${traits.moods.join(', ')}, outfits=${traits.outfits.join(', ')}, reasons=${traits.reasons.join(', ')}.` : '',
          mode === 'encounter' ? 'The character should feel like a person met in that place, not a profile card. firstDm should reference the first meeting naturally after contact exchange.' : '',
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
        content: mode === 'encounter'
          ? `Create ${generatedCount} chance-encounter candidate for "${options.encounterLocation || '성수 카페거리'}". Return a realistic adult Asian woman, mostly Korean or fluent Korean speaker. The profile must support a short respectful conversation before contact exchange. imagePrompt must be English only.`
          : `Create ${generatedCount} blind date candidates. They should be adult Asian women, mostly Korean, all fluent Korean speakers. Make their faces visibly different and include imagePrompt for each. imagePrompt must be English only.`
      }
    ]) : { text: '{"candidates":[]}' };
    const parsed = parseJsonObject<{ candidates?: Partial<BlindDateCandidate>[] }>(text);
    if (Array.isArray(parsed?.candidates) && parsed.candidates.length) {
      const generated = parsed.candidates.slice(0, generatedCount).map((item, index) => {
        const normalized = normalizeCandidate(item, index + Math.floor(Math.random() * 1000), mode);
        return mode === 'encounter' ? withEncounterFlavor(normalized, options.encounterLocation || '성수 카페거리', index) : normalized;
      });
      candidates = diversifyCandidates([...existingCandidates, ...generated, ...fallbackCandidates(generatedCount, mode)].slice(0, count));
    }
  } catch (error) {
    await appendDebugLog('blindDate.generate', `candidate generation failed: ${error instanceof Error ? error.message : String(error)}`, 'warn');
  }
  const withImages: BlindDateCandidate[] = [];
  const referencePool = shuffled(globalFaceReferenceSlots(state));
  const usedReferences = new Set<string>();
  for (let index = 0; index < candidates.length; index += 4) {
    const batch = candidates.slice(index, index + 4);
    const generatedBatch = await Promise.all(batch.map(async (candidate, batchIndex) => {
    try {
      if (candidate.profileImageUri) return candidate;
      const candidateIndex = index + batchIndex;
      const faceReferenceImage = randomGlobalFaceReference(state, referencePool, usedReferences);
      const imagePrompt = applyImageVariationTriggers(candidate.imagePrompt, candidateIndex, mode);
      void appendDebugLog(
        'blindDate.reference',
        `mode=${mode} candidate=${candidate.name || candidate.anonymousLabel || '-'} slots=${referencePool.length} reference=${faceReferenceImage ? 'yes' : 'no'} kind=${faceReferenceImage ? 'profile-reference-face' : 'profile'}`
      );
      const profileImageUri = await generateImageDataUri(state, imagePrompt, undefined, {
        kind: faceReferenceImage ? 'profile-reference-face' : 'profile',
        referenceImage: faceReferenceImage
      });
      return { ...candidate, imagePrompt, profileImageUri, faceReferenceImage };
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
  const worldcupSetup = mode === 'worldcup' ? buildInitialWorldcupSetup(withImages.map(candidate => candidate.id), count) : undefined;
  const session: BlindDateSession = {
    id: makeId('blinddate'),
    mode,
    status: 'active',
    candidateCount: count,
    questionTarget: mode === 'question' ? clampQuestionTarget(options.questionTarget) : mode === 'rotation' ? 3 : undefined,
    candidates: withImages,
    rounds: [],
    worldcupPairs: worldcupSetup?.pairs,
    worldcupIndex: mode === 'worldcup' ? 0 : undefined,
    worldcupByeCandidateIds: worldcupSetup?.byeCandidateIds,
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

export function createStreetEncounterSession(state: SNSGodState): SNSGodState {
  const now = Date.now();
  const session: BlindDateSession = {
    id: makeId('encounter'),
    mode: 'encounter',
    status: 'active',
    candidateCount: 1,
    candidates: [],
    rounds: [],
    encounterLocations: randomStreetLocations(),
    encounterPhase: 'locations',
    encounterTurn: 0,
    encounterMaxTurns: ENCOUNTER_MAX_TURNS,
    encounterContactAttempted: false,
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

export async function startStreetEncounterAtLocation(state: SNSGodState, sessionId: string, location: string): Promise<SNSGodState> {
  const progress = progressOf(state);
  const session = progress.sessions.find(item => item.id === sessionId);
  if (!session || session.mode !== 'encounter') return state;
  const [candidate] = await generateBlindDateCandidates(state, 'encounter', 1, { encounterLocation: location });
  if (!candidate) return state;
  const traits = streetTraits(location);
  const reason = pickFrom(traits.reasons);
  const stats = initialEncounterStats(candidate);
  const narration = [
    `${location}로 이동했다.`,
    '',
    candidate.publicObservation || buildPublicObservation(location, reason, candidate.appearance.outfitStyle, candidate.contactPresetId),
    candidate.publicVibe || '눈이 마주쳤지만, 상대는 먼저 말을 걸 분위기는 아니다.'
  ].join('\n');
  return patchBlindDateSession(state, sessionId, item => ({
    ...item,
    candidates: [candidate],
    encounterLocation: location,
    encounterPhase: 'intro',
    encounterNarration: narration,
    encounterNpcLine: '아직 서로 이름도 모른다. 지금은 말을 걸지, 지나칠지 정해야 한다.',
    encounterStats: stats,
    encounterChoices: openingEncounterChoices(location),
    encounterHistory: [],
    encounterTurn: 0,
    encounterMaxTurns: ENCOUNTER_MAX_TURNS,
    encounterContactAttempted: false,
    encounterContactChanceLabel: contactChanceLabel(stats, candidate),
    encounterContactFailureReason: undefined
  }));
}

export async function approachStreetEncounter(state: SNSGodState, sessionId: string, actionText: string): Promise<SNSGodState> {
  const progress = progressOf(state);
  const session = progress.sessions.find(item => item.id === sessionId);
  const candidate = session?.candidates[0];
  if (!session || session.mode !== 'encounter' || !candidate) return state;
  const stats = session.encounterStats || initialEncounterStats(candidate);
  const nextStats = applyEncounterChoice(stats, {
    id: 'open',
    text: actionText,
    style: actionText.includes('지나') ? 'exit' : actionText.includes('지켜') ? 'safe' : 'safe',
    affinityDelta: actionText.includes('지나') ? 0 : 6,
    cautionDelta: actionText.includes('지나') ? 0 : -4,
    awkwardnessDelta: actionText.includes('지나') ? 0 : 4,
    curiosityDelta: actionText.includes('지켜') ? 4 : 8,
    moodDelta: actionText.includes('지나') ? 0 : 3
  });
  if (actionText.includes('지나')) {
    return patchBlindDateSession(state, sessionId, item => ({
      ...item,
      encounterPhase: 'passed',
      encounterResult: 'passed',
      encounterNarration: '당신은 더 말을 걸지 않고 지나갔다. 스쳐 지나간 얼굴은 잠깐 기억에 남았지만, 오늘의 인연은 여기서 끝났다.',
      encounterStats: nextStats
    }));
  }
  const ai = await generateStreetEncounterAiStep(state, session, candidate, actionText, nextStats, 0, true);
  return patchBlindDateSession(state, sessionId, item => ({
    ...item,
    encounterPhase: 'talk',
    encounterTurn: 0,
    encounterStats: nextStats,
    encounterNarration: ai?.narration || `당신은 부담스럽지 않은 거리에서 말을 건넸다.\n\n상대는 잠깐 놀란 듯했지만, 바로 자리를 피하지는 않았다.`,
    encounterNpcLine: ai?.npcLine || firstNpcLineFor(candidate),
    encounterChoices: ai?.choices?.length ? ai.choices : nextEncounterChoices(candidate, nextStats, 0, item.encounterHistory || []),
    encounterContactChanceLabel: contactChanceLabel(nextStats, candidate),
    encounterHistory: [...(item.encounterHistory || []), `시작: ${actionText}`]
  }));
}

export async function chooseStreetEncounterOption(state: SNSGodState, sessionId: string, choiceId: string): Promise<SNSGodState> {
  const progress = progressOf(state);
  const session = progress.sessions.find(item => item.id === sessionId);
  const choice = session?.encounterChoices?.find(item => item.id === choiceId);
  if (!session || session.mode !== 'encounter' || !choice) return state;
  return advanceStreetEncounterWithChoice(state, sessionId, choice);
}

export async function chooseStreetEncounterCustomText(state: SNSGodState, sessionId: string, text: string): Promise<SNSGodState> {
  const clean = normalizeEncounterChoiceText(text);
  if (!clean) return state;
  const progress = progressOf(state);
  const session = progress.sessions.find(item => item.id === sessionId);
  if (!session || session.mode !== 'encounter') return state;
  if ((session.encounterPhase || 'locations') === 'intro') {
    return approachStreetEncounter(state, sessionId, clean);
  }
  const choice: StreetEncounterChoice = {
    id: makeId('sechoice'),
    text: clean,
    style: customEncounterStyle(clean),
    affinityDelta: customEncounterAffinityDelta(clean),
    cautionDelta: customEncounterCautionDelta(clean),
    awkwardnessDelta: customEncounterAwkwardnessDelta(clean),
    curiosityDelta: customEncounterCuriosityDelta(clean),
    moodDelta: customEncounterMoodDelta(clean)
  };
  return advanceStreetEncounterWithChoice(state, sessionId, choice);
}

async function advanceStreetEncounterWithChoice(state: SNSGodState, sessionId: string, choice: StreetEncounterChoice): Promise<SNSGodState> {
  const progress = progressOf(state);
  const session = progress.sessions.find(item => item.id === sessionId);
  const candidate = session?.candidates[0];
  if (!session || session.mode !== 'encounter' || !candidate) return state;
  const previousStats = session.encounterStats || initialEncounterStats(candidate);
  const stats = applyEncounterChoice(previousStats, choice);
  const maxTurns = Number(session.encounterMaxTurns || ENCOUNTER_MAX_TURNS);
  const turn = Math.min(maxTurns, Number(session.encounterTurn || 0) + 1);
  const badExit = choice.style === 'exit' || stats.caution >= 88 || stats.awkwardness >= 90 || stats.mood <= -35;
  if (badExit) {
    return patchBlindDateSession(state, sessionId, item => ({
      ...item,
      encounterPhase: choice.style === 'exit' ? 'passed' : 'failed',
      encounterResult: choice.style === 'exit' ? 'passed' : 'rejected',
      encounterTurn: turn,
      encounterStats: stats,
      encounterNarration: choice.style === 'exit'
        ? '당신은 대화를 더 이어가지 않고 자연스럽게 물러났다. 짧은 우연은 여기서 끝났다.'
        : '상대의 표정이 조금 닫힌다. 더 말을 붙이는 건 실례일 것 같다.',
      encounterNpcLine: choice.style === 'exit' ? '“네, 조심히 가세요.”' : '“죄송해요. 제가 지금은 조금 부담스러워서요.”',
      encounterChoices: [],
      encounterContactChanceLabel: contactChanceLabel(stats, candidate),
      encounterHistory: [...(item.encounterHistory || []), `Q${turn}: ${choice.text}`]
    }));
  }
  const ai = await generateStreetEncounterAiStep(state, session, candidate, choice.text, stats, turn, false);
  return patchBlindDateSession(state, sessionId, item => ({
    ...item,
    encounterTurn: turn,
    encounterStats: stats,
    encounterNarration: ai?.narration || narrationAfterChoice(candidate, choice, stats, turn),
    encounterNpcLine: ai?.npcLine || npcLineAfterChoice(candidate, choice, stats),
    encounterChoices: turn >= maxTurns ? [] : ai?.choices?.length ? ai.choices : nextEncounterChoices(candidate, stats, turn, item.encounterHistory || []),
    encounterContactChanceLabel: contactChanceLabel(stats, candidate),
    encounterHistory: [...(item.encounterHistory || []), `Q${turn}: ${choice.text}`]
  }));
}

export function requestStreetEncounterContact(state: SNSGodState, sessionId: string): { next: SNSGodState; success: boolean; roomId?: string; characterId?: string } {
  const progress = progressOf(state);
  const session = progress.sessions.find(item => item.id === sessionId);
  const candidate = session?.candidates[0];
  if (!session || session.mode !== 'encounter' || !candidate) return { next: state, success: false };
  const stats = session.encounterStats || initialEncounterStats(candidate);
  const chance = contactSuccessChance(stats, candidate);
  const success = stats.affinity >= 50 && Math.random() * 100 <= chance;
  const failureReason = contactFailureReason(stats);
  if (!success) {
    return {
      next: patchBlindDateSession(state, sessionId, item => ({
        ...item,
        encounterPhase: 'failed',
        encounterResult: 'rejected',
        encounterNarration: failureReason,
        encounterNpcLine: '“대화는 괜찮았는데, 연락처까지는 조금 부담스러워요. 이해해주셨으면 좋겠어요.”',
        encounterChoices: [],
        encounterContactAttempted: true,
        encounterContactChanceLabel: contactChanceLabel(stats, candidate),
        encounterContactFailureReason: failureReason,
        finalRanking: [{ candidateId: candidate.id, rank: 1, score: stats.affinity, selectedCount: 0, reason: '연락처 요청 거절' }]
      })),
      success: false
    };
  }
  const imported = importBlindDateCandidate(
    patchBlindDateSession(state, sessionId, item => ({
      ...item,
      selectedCandidateId: candidate.id,
      encounterPhase: 'success',
      encounterResult: 'contact_exchanged',
      encounterNarration: '짧은 대화 끝에 분위기가 부드럽게 풀렸다. 상대는 잠깐 고민하더니 휴대폰을 꺼낸다.',
      encounterNpcLine: contactSuccessLine(candidate),
      encounterContactAttempted: true,
      encounterContactChanceLabel: contactChanceLabel(stats, candidate),
      finalRanking: [{ candidateId: candidate.id, rank: 1, score: stats.affinity, selectedCount: 1, reason: '우연한 만남에서 연락처 교환 성공' }]
    })),
    sessionId,
    candidate.id
  );
  return { ...imported, success: true };
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

function initialEncounterStats(candidate: BlindDateCandidate): StreetEncounterStats {
  const preset = candidate.contactPresetId;
  return {
    affinity: preset === 'chatty' || preset === 'easygoing' ? 34 : 26,
    caution: preset === 'careful' || preset === 'busy' ? 66 : preset === 'direct' ? 48 : 56,
    awkwardness: preset === 'chatty' || preset === 'playful' ? 34 : 45,
    curiosity: preset === 'chatty' || preset === 'easygoing' ? 46 : 36,
    mood: preset === 'busy' ? -5 : 4,
    timePressure: preset === 'busy' ? 72 : candidate.locationBase.includes('회사') || candidate.locationBase.includes('지하철') ? 62 : 35
  };
}

function buildPublicObservation(location: string, reason: string, outfit: string, preset: string): string {
  const outfitText = publicOutfitText(outfit);
  const placeLead = location.includes('서점')
    ? '책장 사이의 조용한 공기 속에서'
    : location.includes('카페') || location.includes('베이커리')
      ? '주문을 기다리는 사람들 사이에서'
      : location.includes('한강') || location.includes('산책')
        ? '잠깐 느려진 걸음들 사이에서'
        : '사람들이 오가는 흐름 속에서';
  const posture = preset === 'busy'
    ? '곧 자리를 옮길 듯 시간을 한 번 확인한다.'
    : preset === 'careful'
      ? '주변을 살피는 눈빛이 조심스럽지만 무례하게 날카롭지는 않다.'
      : preset === 'playful' || preset === 'chatty'
        ? '표정에는 살짝 장난기와 여유가 섞여 있다.'
        : '표정은 차분하지만 말을 걸면 짧게는 받아줄 것 같다.';
  return `${placeLead} ${reason} 상대가 눈에 들어온다.\n${outfitText} ${posture}`;
}

function buildPublicVibe(preset: string, mood: string): string {
  if (preset === 'busy') return '바빠 보이지만, 정중하게 말을 걸면 짧게는 응해줄 분위기다.';
  if (preset === 'careful') return '처음 보는 사람에게 쉽게 마음을 여는 타입은 아니어서 부담 없는 접근이 필요해 보인다.';
  if (preset === 'direct') return '빙빙 돌려 말하는 것보다 짧고 분명한 말에 반응할 것 같다.';
  if (preset === 'chatty' || preset === 'playful') return '대화의 리듬만 맞으면 생각보다 금방 분위기가 풀릴 것 같다.';
  return `${mood.replace(/\s*타입\.?$/, '')} 느낌이지만, 선을 지키면 대화가 이어질 수도 있다.`;
}

function publicOutfitText(outfit: string): string {
  const value = String(outfit || '').toLowerCase();
  if (value.includes('blouse') || value.includes('shirt')) return '단정한 셔츠 차림이 장소 분위기와 잘 어울린다.';
  if (value.includes('cardigan') || value.includes('knit')) return '부드러운 니트나 가디건 차림이 편안해 보인다.';
  if (value.includes('jacket') || value.includes('blazer') || value.includes('coat')) return '깔끔한 아우터 차림이라 첫인상이 단정하다.';
  if (value.includes('hoodie') || value.includes('sweatshirt')) return '편한 캐주얼 차림이라 과하게 꾸민 느낌은 없다.';
  if (value.includes('dress') || value.includes('skirt')) return '차분한 옷차림이 눈에 띄지만 과하게 화려하지는 않다.';
  return '일상적인 옷차림이 자연스럽고 부담 없어 보인다.';
}

function openingEncounterChoices(location: string): StreetEncounterChoice[] {
  if (location.includes('서점')) {
    return [
      { id: makeId('sechoice'), text: '책갈피를 보며 자연스럽게 말을 건다', style: 'safe', affinityDelta: 7, cautionDelta: -6, awkwardnessDelta: 2, curiosityDelta: 9, moodDelta: 4 },
      { id: makeId('sechoice'), text: '방해될까 봐 조금 더 거리를 둔다', style: 'caring', affinityDelta: 3, cautionDelta: -5, awkwardnessDelta: -2, curiosityDelta: 3, moodDelta: 1 },
      { id: makeId('sechoice'), text: '그냥 책을 둘러보다가 지나간다', style: 'exit', affinityDelta: 0, cautionDelta: 0, awkwardnessDelta: 0, curiosityDelta: 0 }
    ];
  }
  return [
    { id: makeId('sechoice'), text: openingSafeText(location), style: 'safe', affinityDelta: 6, cautionDelta: -4, awkwardnessDelta: 3, curiosityDelta: 8, moodDelta: 3 },
    { id: makeId('sechoice'), text: '방해하지 않게 한 발짝 물러서서 분위기를 본다', style: 'caring', affinityDelta: 2, cautionDelta: -4, awkwardnessDelta: -2, curiosityDelta: 4, moodDelta: 1 },
    { id: makeId('sechoice'), text: '괜히 붙잡지 않고 지나간다', style: 'exit', affinityDelta: 0, cautionDelta: 0, awkwardnessDelta: 0, curiosityDelta: 0 }
  ];
}

function openingSafeText(location: string): string {
  if (location.includes('카페')) return '줄이 맞는지 물어보며 가볍게 말을 건다';
  if (location.includes('한강')) return '산책길이 괜찮은지 물어보며 말을 건다';
  if (location.includes('전시')) return '작품 설명을 핑계로 조심스럽게 말을 건다';
  if (location.includes('베이커리')) return '빵이 아직 남았는지 물어보며 말을 건다';
  if (location.includes('지하철')) return '출구 위치를 물어보며 짧게 말을 건다';
  if (location.includes('편의점')) return '비가 그칠지 얘기하며 짧게 말을 건다';
  return '상황을 핑계로 정중하게 말을 건다';
}

function normalizeEncounterChoiceText(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (!clean) return '';
  if (/[.!?。！？…]$/.test(clean)) return clean;
  if (/(한다|한다요|한다\.|건다|본다|물러난다|보낸다|마무리한다|얘기한다|말한다|묻는다|물어본다|건넨다|지나간다|기다린다|싶어요|돼요|예요|이에요|합니다|할게요|주세요|가세요)$/.test(clean)) return clean;
  return `${clean}.`;
}

function customEncounterStyle(text: string): StreetEncounterChoice['style'] {
  if (/(가세요|갈게|갈게요|마무리|지나갈|지나가|그만|여기까지|실례)/.test(text)) return 'exit';
  if (/(불편|부담|죄송|괜찮으|괜찮아|방해|천천히|시간|바쁘)/.test(text)) return 'caring';
  if (/(번호|연락처|다음|또|한 번|한번|커피|밥|만나)/.test(text)) return 'direct';
  if (/(ㅋㅋ|ㅎㅎ|농담|영화|신기|운명|웃)/.test(text)) return 'playful';
  return 'safe';
}

function customEncounterAffinityDelta(text: string): number {
  const style = customEncounterStyle(text);
  if (style === 'exit') return 1;
  if (style === 'caring') return 10;
  if (style === 'direct') return 6;
  if (style === 'playful') return 7;
  return 8;
}

function customEncounterCautionDelta(text: string): number {
  const style = customEncounterStyle(text);
  if (style === 'exit') return -3;
  if (style === 'caring') return -12;
  if (style === 'direct') return 10;
  if (style === 'playful') return -3;
  return -6;
}

function customEncounterAwkwardnessDelta(text: string): number {
  const style = customEncounterStyle(text);
  if (style === 'exit') return -5;
  if (style === 'caring') return -8;
  if (style === 'direct') return 6;
  if (style === 'playful') return -6;
  return -4;
}

function customEncounterCuriosityDelta(text: string): number {
  const style = customEncounterStyle(text);
  if (style === 'exit') return 0;
  if (style === 'direct') return 7;
  if (style === 'playful') return 10;
  return 6;
}

function customEncounterMoodDelta(text: string): number {
  const style = customEncounterStyle(text);
  if (style === 'exit') return 1;
  if (style === 'direct') return -1;
  return 4;
}

function firstNpcLineFor(candidate: BlindDateCandidate): string {
  if (candidate.contactPresetId === 'busy') return '“아, 네. 제가 지금 시간이 많진 않은데... 무슨 일이세요?”';
  if (candidate.contactPresetId === 'chatty' || candidate.contactPresetId === 'playful') return '“갑자기요? ㅎㅎ 네, 말씀해보세요.”';
  if (candidate.contactPresetId === 'direct') return '“네. 길게만 아니면 괜찮아요.”';
  return '“아... 네. 괜찮아요. 무슨 말씀이세요?”';
}

function nextEncounterChoices(candidate: BlindDateCandidate, stats: StreetEncounterStats, turn: number, history: string[] = []): StreetEncounterChoice[] {
  const place = candidate.locationBase;
  const base = encounterChoicePool(place, candidate.contactPresetId, turn);
  if (turn >= 1 && stats.timePressure > 60) {
    base.unshift({ id: makeId('sechoice'), text: '바쁘시면 여기까지만 할게요. 시간 뺏고 싶진 않아서요.', style: 'caring', affinityDelta: 12, cautionDelta: -14, awkwardnessDelta: -8, curiosityDelta: 5, moodDelta: 6 });
  }
  const used = history.join('\n');
  const fresh = base.filter(choice => !used.includes(choice.text));
  return shuffled(fresh.length >= 4 ? fresh : base).slice(0, 4);
}

function encounterChoicePool(place: string, preset: string, turn: number): StreetEncounterChoice[] {
  const directAffinity = preset === 'direct' ? 12 : preset === 'careful' ? 3 : 6;
  const directCaution = preset === 'careful' ? 16 : preset === 'busy' ? 11 : 8;
  const locationSafe = place.includes('서점')
    ? ['이 서점은 처음인데, 혹시 볼 만한 코너 있어요?', '책갈피 고르시는 거 보니까 취향이 확실하신 것 같아서요.']
    : place.includes('카페') || place.includes('베이커리')
      ? ['여기 줄이 원래 이렇게 긴가요?', '저도 메뉴 고르다 살짝 포기할 뻔했어요.']
      : place.includes('전시')
        ? ['이 작품 앞에서 다들 오래 멈추네요. 혹시 인상 깊으셨어요?', '팸플릿 보시는 거 보고 저도 괜히 궁금해졌어요.']
        : place.includes('한강') || place.includes('산책')
          ? ['여기 바람이 생각보다 좋네요.', '사진 찍기 좋은 자리 찾고 있었는데, 이쪽 괜찮네요.']
          : ['혹시 여기 자주 오세요?', '제가 이 근처가 처음이라 잠깐 여쭤봐도 될까요?'];
  const pools: StreetEncounterChoice[][] = [
    [
      { id: makeId('sechoice'), text: locationSafe[0], style: 'safe', affinityDelta: 9, cautionDelta: -8, awkwardnessDelta: -5, curiosityDelta: 7, moodDelta: 4 },
      { id: makeId('sechoice'), text: '갑자기 말 걸어서 놀라셨죠. 방해하려던 건 아니에요.', style: 'caring', affinityDelta: 11, cautionDelta: -12, awkwardnessDelta: -8, curiosityDelta: 5, moodDelta: 5 },
      { id: makeId('sechoice'), text: '사실 지금 상황이 좀 영화 첫 장면 같아서요. 말 걸까 말까 고민했어요.', style: 'playful', affinityDelta: 7, cautionDelta: preset === 'careful' ? 2 : -3, awkwardnessDelta: -4, curiosityDelta: 10, moodDelta: 6 },
      { id: makeId('sechoice'), text: '괜찮으면 딱 1분만 얘기해도 돼요?', style: 'direct', affinityDelta: directAffinity, cautionDelta: directCaution, awkwardnessDelta: 7, curiosityDelta: 7, moodDelta: preset === 'careful' ? -4 : 2 },
      { id: makeId('sechoice'), text: '괜히 붙잡은 것 같네요. 좋은 하루 보내세요.', style: 'exit', affinityDelta: 1, cautionDelta: -2, awkwardnessDelta: -4, curiosityDelta: 0, moodDelta: 1 }
    ],
    [
      { id: makeId('sechoice'), text: locationSafe[1] || locationSafe[0], style: 'safe', affinityDelta: 9, cautionDelta: -7, awkwardnessDelta: -5, curiosityDelta: 8, moodDelta: 4 },
      { id: makeId('sechoice'), text: '불편하시면 바로 물러날게요. 선 넘고 싶진 않아서요.', style: 'caring', affinityDelta: 12, cautionDelta: -13, awkwardnessDelta: -8, curiosityDelta: 5, moodDelta: 5 },
      { id: makeId('sechoice'), text: '제가 방금 너무 진지했나요? 처음 보는 사람한테 말 거는 건 아직 어렵네요.', style: 'playful', affinityDelta: 8, cautionDelta: -4, awkwardnessDelta: -7, curiosityDelta: 9, moodDelta: 6 },
      { id: makeId('sechoice'), text: '말투가 차분해서 조금 더 얘기해보고 싶었어요.', style: 'direct', affinityDelta: directAffinity, cautionDelta: directCaution, awkwardnessDelta: 6, curiosityDelta: 7, moodDelta: preset === 'careful' ? -3 : 3 },
      { id: makeId('sechoice'), text: '여기서 더 붙잡으면 실례일 것 같네요. 편한 시간 보내세요.', style: 'exit', affinityDelta: 1, cautionDelta: -3, awkwardnessDelta: -5, curiosityDelta: 0, moodDelta: 1 }
    ],
    [
      { id: makeId('sechoice'), text: '잠깐 얘기해보니까 생각보다 편해서요. 이런 우연도 가끔 괜찮네요.', style: 'safe', affinityDelta: 10, cautionDelta: -7, awkwardnessDelta: -6, curiosityDelta: 7, moodDelta: 5 },
      { id: makeId('sechoice'), text: '시간 괜찮으세요? 아니면 여기서 짧게 마무리해도 괜찮아요.', style: 'caring', affinityDelta: 11, cautionDelta: -12, awkwardnessDelta: -8, curiosityDelta: 4, moodDelta: 6 },
      { id: makeId('sechoice'), text: '저 오늘 용기 낸 김에 말했는데, 생각보다 안 망한 것 같아서 다행이에요.', style: 'playful', affinityDelta: 9, cautionDelta: -5, awkwardnessDelta: -7, curiosityDelta: 9, moodDelta: 6 },
      { id: makeId('sechoice'), text: '괜찮으면 다음에 부담 없이 한 번 더 얘기해보고 싶어요.', style: 'direct', affinityDelta: directAffinity + 2, cautionDelta: directCaution, awkwardnessDelta: 5, curiosityDelta: 8, moodDelta: preset === 'careful' ? -2 : 4 },
      { id: makeId('sechoice'), text: '오늘은 여기까지 할게요. 짧았지만 반가웠어요.', style: 'exit', affinityDelta: 2, cautionDelta: -4, awkwardnessDelta: -5, curiosityDelta: 0, moodDelta: 2 }
    ]
  ];
  return pools[Math.min(turn, pools.length - 1)];
}

function applyEncounterChoice(stats: StreetEncounterStats, choice: StreetEncounterChoice): StreetEncounterStats {
  return {
    affinity: clampStat(stats.affinity + choice.affinityDelta),
    caution: clampStat(stats.caution + choice.cautionDelta),
    awkwardness: clampStat(stats.awkwardness + choice.awkwardnessDelta),
    curiosity: clampStat(stats.curiosity + choice.curiosityDelta),
    mood: clampMood(stats.mood + (choice.moodDelta || 0)),
    timePressure: clampStat(stats.timePressure + (choice.style === 'caring' ? -6 : choice.style === 'direct' ? 5 : 0))
  };
}

function narrationAfterChoice(candidate: BlindDateCandidate, choice: StreetEncounterChoice, stats: StreetEncounterStats, turn: number): string {
  const mood = stats.affinity >= 65 && stats.caution <= 45 ? '처음보다 확실히 분위기가 부드럽다.' : stats.caution >= 70 ? '아직은 조심스러운 공기가 남아 있다.' : '짧은 대화가 어색함을 조금 덜어냈다.';
  return `${choice.text}\n\n상대는 잠깐 생각하듯 시선을 돌렸다가 다시 당신을 본다. ${mood}${turn >= ENCOUNTER_MAX_TURNS ? '\n\n짧은 첫 대화는 이 정도면 충분하다. 연락처를 물어볼지, 정중히 마무리할지 선택하면 된다.' : ''}`;
}

function npcLineAfterChoice(candidate: BlindDateCandidate, choice: StreetEncounterChoice, stats: StreetEncounterStats): string {
  if (choice.style === 'direct' && stats.caution > 70) return '“음... 그렇게 바로 말하시면 조금 당황스럽긴 해요.”';
  if (choice.style === 'caring') return '“그렇게 말해주시니까 부담은 덜하네요. 고마워요.”';
  if (choice.style === 'playful') return '“ㅎㅎ 그건 좀 알 것 같아요. 저도 방금 비슷했거든요.”';
  if (stats.affinity >= 65) return '“생각보다 편하게 말하시네요. 처음 보는 사람인데 조금 신기해요.”';
  return '“아, 네. 그럴 수 있죠. 저도 잠깐 있었던 거라서요.”';
}

type EncounterAiStep = {
  narration?: string;
  npcLine?: string;
  choices?: StreetEncounterChoice[];
};

async function generateStreetEncounterAiStep(
  state: SNSGodState,
  session: BlindDateSession,
  candidate: BlindDateCandidate,
  userText: string,
  stats: StreetEncounterStats,
  turn: number,
  isOpening: boolean
): Promise<EncounterAiStep | undefined> {
  try {
    const previous = (session.encounterHistory || []).slice(-6).join('\n') || '(없음)';
    const { text } = await callLLMText(state, [
      {
        role: 'system',
        content: [
          'You write a Korean street encounter mini-game scene.',
          'The user just spoke or acted toward a stranger. Generate the woman character reaction based on her fixed profile, personality, current mood stats, place, and previous encounter history.',
          'All visible text must be natural Korean. No English. No AI/meta/app/system words.',
          'Keep it realistic: strangers are cautious; if the user is rude, too direct, or intrusive, make the response colder.',
          'Give 3 next user choices with clearly different styles: gentle/safe, playful/unexpected, direct/spicy or caring. Each choice must be a complete sentence, not cut off.',
          'Return JSON only: {"narration":"","npcLine":"","choices":[{"text":"","style":"safe|playful|direct|caring|exit","affinityDelta":0,"cautionDelta":0,"awkwardnessDelta":0,"curiosityDelta":0,"moodDelta":0}]}'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          `장소: ${session.encounterLocation || candidate.locationBase}`,
          `현재 턴: ${turn}/${session.encounterMaxTurns || ENCOUNTER_MAX_TURNS}`,
          `상황: ${isOpening ? '처음 말을 건넨 직후' : '짧은 대화 진행 중'}`,
          `사용자 행동/말: ${userText}`,
          `상대: ${candidate.name}, ${candidate.age}, ${candidate.job}`,
          `성격: ${candidate.personalitySummary}`,
          `말투: ${candidate.speechStyle}`,
          `연애/대인관계 스타일: ${candidate.relationshipStyle}`,
          `접근 반응 타입: ${candidate.contactPresetId}`,
          `관찰된 분위기: ${candidate.publicObservation || ''}\n${candidate.publicVibe || ''}`,
          `현재 수치: 호감도 ${stats.affinity}, 경계심 ${stats.caution}, 어색함 ${stats.awkwardness}, 호기심 ${stats.curiosity}, 기분 ${stats.mood}, 시간압박 ${stats.timePressure}`,
          `이전 기록:\n${previous}`
        ].join('\n\n')
      }
    ]);
    const parsed = parseJsonObject<{
      narration?: string;
      npcLine?: string;
      choices?: ({ text?: string; style?: string; affinityDelta?: number; cautionDelta?: number; awkwardnessDelta?: number; curiosityDelta?: number; moodDelta?: number } | string)[];
    }>(text);
    const narration = visibleKoreanLine(parsed?.narration, narrationAfterChoice(candidate, {
      id: 'ai-fallback',
      text: userText,
      style: customEncounterStyle(userText),
      affinityDelta: 0,
      cautionDelta: 0,
      awkwardnessDelta: 0,
      curiosityDelta: 0
    }, stats, turn));
    const npcLine = visibleKoreanLine(parsed?.npcLine, npcLineAfterChoice(candidate, {
      id: 'ai-fallback',
      text: userText,
      style: customEncounterStyle(userText),
      affinityDelta: 0,
      cautionDelta: 0,
      awkwardnessDelta: 0,
      curiosityDelta: 0
    }, stats));
    const choices = normalizeAiEncounterChoices(parsed?.choices, candidate, stats, turn, session.encounterHistory || []);
    return { narration, npcLine, choices };
  } catch (error) {
    await appendDebugLog('blindDate.encounter', `encounter AI response failed session=${session.id}: ${error instanceof Error ? error.message : String(error)}`, 'warn');
    return undefined;
  }
}

function normalizeAiEncounterChoices(
  choices: ({ text?: string; style?: string; affinityDelta?: number; cautionDelta?: number; awkwardnessDelta?: number; curiosityDelta?: number; moodDelta?: number } | string)[] | undefined,
  candidate: BlindDateCandidate,
  stats: StreetEncounterStats,
  turn: number,
  history: string[]
): StreetEncounterChoice[] {
  const used = history.join('\n');
  const normalized: StreetEncounterChoice[] = [];
  for (const item of Array.isArray(choices) ? choices : []) {
    const rawText = typeof item === 'string' ? item : item?.text;
    const text = normalizeEncounterChoiceText(visibleKoreanLine(rawText, ''));
    if (!text || used.includes(text)) continue;
    const style = normalizeEncounterStyle(typeof item === 'string' ? undefined : item?.style, text);
    normalized.push({
      id: makeId('sechoice'),
      text,
      style,
      affinityDelta: clampStat(Number(typeof item === 'string' ? NaN : item?.affinityDelta), -18, 18) || defaultAffinityDelta(style),
      cautionDelta: clampStat(Number(typeof item === 'string' ? NaN : item?.cautionDelta), -20, 20) || defaultCautionDelta(style),
      awkwardnessDelta: clampStat(Number(typeof item === 'string' ? NaN : item?.awkwardnessDelta), -18, 18) || defaultAwkwardnessDelta(style),
      curiosityDelta: clampStat(Number(typeof item === 'string' ? NaN : item?.curiosityDelta), -12, 18) || defaultCuriosityDelta(style),
      moodDelta: clampMood(Number(typeof item === 'string' ? NaN : item?.moodDelta)) || defaultMoodDelta(style)
    });
    if (normalized.length >= 4) break;
  }
  if (normalized.length >= 3) return normalized;
  const fallback = nextEncounterChoices(candidate, stats, turn, history);
  const seen = new Set(normalized.map(choice => choice.text));
  return [...normalized, ...fallback.filter(choice => !seen.has(choice.text))].slice(0, 4);
}

function visibleKoreanLine(value: unknown, fallback: string): string {
  const text = String(value || '').trim();
  if (/[가-힣]/.test(text)) return text.slice(0, 520);
  return fallback;
}

function normalizeEncounterStyle(value: unknown, text: string): StreetEncounterChoice['style'] {
  const style = String(value || '').toLowerCase();
  if (style === 'safe' || style === 'playful' || style === 'direct' || style === 'caring' || style === 'exit') return style;
  return customEncounterStyle(text);
}

function defaultAffinityDelta(style: StreetEncounterChoice['style']): number {
  if (style === 'exit') return 0;
  if (style === 'caring') return 10;
  if (style === 'direct') return 6;
  if (style === 'playful') return 7;
  return 8;
}

function defaultCautionDelta(style: StreetEncounterChoice['style']): number {
  if (style === 'exit') return -2;
  if (style === 'caring') return -12;
  if (style === 'direct') return 9;
  if (style === 'playful') return -3;
  return -7;
}

function defaultAwkwardnessDelta(style: StreetEncounterChoice['style']): number {
  if (style === 'exit') return -4;
  if (style === 'caring') return -8;
  if (style === 'direct') return 6;
  if (style === 'playful') return -5;
  return -4;
}

function defaultCuriosityDelta(style: StreetEncounterChoice['style']): number {
  if (style === 'exit') return 0;
  if (style === 'direct') return 7;
  if (style === 'playful') return 10;
  return 6;
}

function defaultMoodDelta(style: StreetEncounterChoice['style']): number {
  if (style === 'exit') return 1;
  if (style === 'direct') return -1;
  return 4;
}

function contactSuccessChance(stats: StreetEncounterStats, candidate: BlindDateCandidate): number {
  let chance = 10;
  chance += stats.affinity * 0.75;
  chance += stats.curiosity * 0.25;
  chance -= stats.caution * 0.45;
  chance -= stats.awkwardness * 0.35;
  chance -= stats.timePressure * 0.25;
  if (candidate.contactPresetId === 'careful') chance -= 10;
  if (candidate.contactPresetId === 'easygoing' || candidate.contactPresetId === 'chatty') chance += 10;
  if (candidate.contactPresetId === 'busy') chance -= 8;
  return clampStat(chance, 5, 95);
}

function contactChanceLabel(stats: StreetEncounterStats, candidate: BlindDateCandidate): string {
  if (stats.affinity < 50) return '아직 요청 불가';
  const chance = contactSuccessChance(stats, candidate);
  if (chance >= 70) return '성공 가능성 높음';
  if (chance >= 45) return '성공 가능성 보통';
  return '성공 가능성 낮음';
}

function contactFailureReason(stats: StreetEncounterStats): string {
  if (stats.caution >= 70) return '대화는 나쁘지 않았지만, 아직 경계심이 남아 있어 연락처까지는 부담스러워했습니다.';
  if (stats.timePressure >= 65) return '분위기는 나쁘지 않았지만, 상대가 지금은 시간이 없어 연락처 교환까지 이어지지 않았습니다.';
  if (stats.awkwardness >= 65) return '짧은 대화가 이어지긴 했지만 어색함이 남아 있어, 상대는 연락처 교환을 조심스러워했습니다.';
  return '호감은 조금 생겼지만, 오늘 처음 만난 사람에게 연락처를 주기에는 아직 확신이 부족했습니다.';
}

function contactSuccessLine(candidate: BlindDateCandidate): string {
  if (candidate.contactPresetId === 'busy') return '“제가 지금 가봐야 해서요. 그래도... 연락은 나중에 짧게 해도 괜찮아요.”';
  if (candidate.contactPresetId === 'careful') return '“조금 갑작스럽긴 한데, 그래도 불편하진 않았어요. 천천히 연락하는 정도면 괜찮아요.”';
  if (candidate.contactPresetId === 'chatty' || candidate.contactPresetId === 'playful') return '“좋아요 ㅎㅎ 오늘 좀 웃겼어요. 나중에 또 얘기해요.”';
  return '“네, 괜찮아요. 길게 붙잡지 않은 게 오히려 좋았어요.”';
}

function fallbackBlindAnswer(candidate: BlindDateCandidate, question: string, roundIndex: number): string {
  const subject = question.replace(/[?？]\s*$/, '');
  const like = candidate.likes[roundIndex % Math.max(1, candidate.likes.length)] || '작은 약속';
  const hobby = candidate.hobbies[(roundIndex + 1) % Math.max(1, candidate.hobbies.length)] || '산책';
  const dislike = candidate.dislikes[roundIndex % Math.max(1, candidate.dislikes.length)] || '애매한 태도';
  const preset = String(candidate.contactPresetId || '');
  if (preset.includes('chatty') || preset.includes('playful')) {
    return `${candidate.anonymousLabel}번: 나는 ${subject}라면 일단 분위기를 너무 무겁게 만들진 않을 것 같아. 대신 ${like} 얘기하듯 가볍게 떠보다가, 진짜 중요한 선은 장난 없이 말해.`;
  }
  if (preset.includes('busy')) {
    return `${candidate.anonymousLabel}번: ${subject}는 현실적으로 가능한지 먼저 볼 것 같아. 마음이 있어도 생활 리듬이 무너지면 오래 못 가니까, 말보다 시간을 어떻게 쓰는지 봐.`;
  }
  if (preset.includes('careful') || preset.includes('slow')) {
    return `${candidate.anonymousLabel}번: 바로 답을 정하진 않을 것 같아. ${subject}에 대해서는 상대가 왜 그렇게 느끼는지 먼저 듣고, 내가 불편한 부분은 천천히 말하는 편이야.`;
  }
  if (preset.includes('direct') || preset.includes('dry')) {
    return `${candidate.anonymousLabel}번: 솔직히 ${subject}에서 ${dislike}가 보이면 바로 신경 쓰여. 돌려 말하기보다 그 자리에서 짧게 확인하고 넘어가는 게 나아.`;
  }
  return `${candidate.anonymousLabel}번: 나는 ${subject}를 볼 때 말투보다 행동을 더 믿는 편이야. ${hobby}처럼 편한 순간에도 같은 태도인지 보면 조금 알 수 있을 것 같아.`;
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
    text: fallbackBlindAnswer(candidate, question, roundIndex),
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
          'It is okay if two candidates give somewhat similar opinions when their profiles would realistically overlap, but their reason, emotional temperature, boundary, wording, and concrete example must not be copied.',
          'Avoid same-template answers. If candidates share a value, make one answer practical, one evasive, one playful, one careful, or one direct according to the fixed profile.',
          'Across the same round, no two answers may start with the same sentence shape or end with the same conclusion phrase.',
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
    let worldcupByeCandidateIds = session.worldcupByeCandidateIds || [];
    if (currentRoundDone) {
      const winners = currentRoundPairs.map(pair => String(pair.selectedCandidateId || '')).filter(Boolean);
      if (winners.length === 1) {
        selectedCandidateId = winners[0];
        status = 'revealing';
        finalRanking = buildRanking(session.candidates.map(candidate => candidate.id === selectedCandidateId ? { ...candidate, score: candidate.score + 10, selectedCount: candidate.selectedCount + 1 } : candidate));
      } else {
        const nextEntrants = currentPair?.roundLabel === '24강' && worldcupByeCandidateIds.length
          ? shuffled([...winners, ...worldcupByeCandidateIds])
          : winners;
        const nextLabel = worldcupRoundLabel(nextEntrants.length);
        const newPairs = buildWorldcupPairs(nextEntrants, nextLabel);
        nextPairs = [...pairs, ...newPairs];
        worldcupIndex = pairs.length;
        worldcupByeCandidateIds = currentPair?.roundLabel === '24강' ? [] : worldcupByeCandidateIds;
      }
    }
    return {
      ...session,
      status,
      selectedCandidateId,
      finalRanking,
      worldcupPairs: nextPairs,
      worldcupIndex,
      worldcupByeCandidateIds,
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
  const encounterHistory = (session.encounterHistory || []).slice(-5);
  const encounterSummary = session.mode === 'encounter'
    ? [
      `우연한 만남 장소: ${session.encounterLocation || candidate.locationBase}`,
      `첫 만남 흐름: ${encounterHistory.join(' / ') || session.encounterNarration || ''}`,
      `최종 분위기: 호감도 ${session.encounterStats?.affinity ?? candidate.score}%, 경계심 ${session.encounterStats?.caution ?? 0}%`,
      `연락처 교환 결과: ${session.encounterResult === 'contact_exchanged' ? '성공' : '진행 중'}`
    ].join('\n')
    : '';
  const memory = [
    session.mode === 'encounter'
      ? `사용자는 ${session.encounterLocation || candidate.locationBase}에서 ${candidate.name}과 우연히 만나 짧은 대화를 나눈 뒤 연락처를 얻었다.`
      : `사용자는 블라인드 데이트 ${session.mode === 'question' ? '질문 소개팅' : session.mode === 'rotation' ? '로테이션 데이트' : '프로필 소개팅'}에서 ${candidate.name}을 최종 선택하고 연락처를 얻었다.`,
    encounterSummary,
    winningAnswers.length ? `선택된 답변: ${winningAnswers.join(' / ')}` : '',
    rotationAnswers.length ? `로테이션 대화 기록: ${rotationAnswers.join(' / ')}` : '',
    !winningAnswers.length && !rotationAnswers.length && !encounterHistory.length ? `${candidate.name}의 첫인상, 말투, 프로필이 마음에 들어 선택했다.` : '',
    candidate.snsPreview ? `소개팅 당시 SNS 미리보기 문구: ${candidate.snsPreview}` : '',
    candidate.callPreview ? `소개팅 당시 첫 통화 느낌: ${candidate.callPreview}` : '',
    `${candidate.name}은 ${candidate.personalitySummary}. 말투는 ${candidate.speechStyle}.`,
    session.mode === 'encounter' ? '우연한 만남을 사용자와의 첫 실제 만남처럼 기억한다.' : '블라인드 데이트를 사용자와의 첫 의미 있는 만남으로 기억한다.'
  ].filter(Boolean).join('\n');
  const matchMemory = [
    session.mode === 'encounter'
      ? `${candidate.name}은 ${session.encounterLocation || candidate.locationBase}에서 사용자와 우연히 만나 대화했고, 호감이 생겨 연락처를 교환했다.`
      : `${candidate.name}은 블라인드 데이트 질문 소개팅/선택 과정에서 사용자와 매칭되어 연락을 시작했다.`,
    session.mode === 'question' && winningAnswers.length ? `사용자는 특히 ${candidate.name}의 답변 중 "${winningAnswers.slice(-2).join('", "')}"에 끌렸다.` : '',
    session.mode === 'rotation' && rotationAnswers.length ? `사용자는 로테이션 대화에서 ${candidate.name}의 말투와 반응을 보고 연락을 이어가기로 했다.` : '',
    candidate.profileImageUri ? '현재 프로필 사진과 레퍼런스 사진은 소개팅 당시 사용자가 확인했던 같은 사진이다.' : '',
    '앞으로의 대화에서는 서로 소개팅에서 매칭되어 연락을 시작한 사이로 자연스럽게 이어간다.'
  ].filter(Boolean).join('\n');
  const firstChatMessage = session.mode === 'encounter'
    ? `${candidate.firstDm}\n\n아까 ${session.encounterLocation || candidate.locationBase}에서 만난 거, 생각보다 계속 기억나서 먼저 연락 남겨.`
    : `${candidate.firstDm}\n\n아까 블라인드 데이트에서 매칭돼서 이렇게 연락 시작하는 거라 조금 신기하다. 그래도 대화 이어가보고 싶어.`;
  const prompt = [
    session.mode === 'encounter'
      ? `이 캐릭터는 우연한 만남 미니게임에서 사용자가 ${session.encounterLocation || candidate.locationBase}에서 처음 만나 연락처를 교환한 인물이다.`
      : `이 캐릭터는 블라인드 데이트 기능에서 사용자가 최종 선택한 인물이다.`,
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
    session.mode === 'encounter' ? `첫 만남 기억: ${encounterSummary}` : '첫 소개팅에서 사용자가 어떤 답변과 첫인상을 좋아했는지 기억한다.',
    `연락 시작 기억: ${matchMemory}`,
    'AI가 랜덤으로 생성되었다는 메타 발언은 하지 않는다.',
    session.mode === 'encounter' ? '우연한 만남을 사용자와의 첫 의미 있는 접점으로 취급한다.' : '블라인드 데이트를 사용자와의 첫 의미 있는 만남으로 취급한다.'
  ].join('\n');
  const replySettings = replySettingsForCandidate(candidate);
  const profileMessage = profileMessageForCandidate(candidate);
  const appearanceText = appearanceSummary(candidate.appearance);
  const character: SNSGodCharacter = {
    id: characterId,
    name: candidate.name,
    handle: candidate.name.toLowerCase().replace(/\s+/g, '_'),
    avatar: candidate.profileImageUri || undefined,
    avatarText: candidate.name.slice(0, 1),
    color: ['#f5d76e', '#8bd3dd', '#f7a8b8', '#b8d8a8', '#cbb7ff'][state.characters.length % 5],
    prompt,
    firstMessage: firstChatMessage,
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
      `[blind_date_match_memory] ${matchMemory}`,
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
      selectedReason: session.mode === 'encounter' ? '우연한 만남 연락처 교환 성공' : session.mode === 'question' ? '블라인드 질문 답변 선택 결과' : session.mode === 'rotation' ? '로테이션 데이트 대화 선택 결과' : '프로필 소개팅 최종 선택',
      winningAnswers: [...winningAnswers, ...rotationAnswers, ...encounterHistory].slice(-8),
      userPreferenceTags: candidate.answers.flatMap(answer => answer.toneTags || []).slice(-8),
      compatibilityScore: Math.max(candidate.score, candidate.selectedCount * 20, session.encounterStats?.affinity || 0),
      firstDateSummary: session.mode === 'encounter' ? encounterSummary : undefined
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
      [characterId]: [{ id: roomId, characterId, name: '기본 채팅', createdAt: now, lastActivity: now, relationshipNote: session.mode === 'encounter' ? `${session.encounterLocation || candidate.locationBase}에서 우연히 만나 연락처를 교환한 첫 채팅` : '블라인드 데이트에서 이어진 첫 채팅' }]
    },
    messages: {
      ...state.messages,
      [roomId]: [
        {
          id: makeId('msg'),
          role: 'system',
          characterId,
          content: `소개팅 매칭 기억: ${matchMemory}`,
          createdAt: now,
          sourceMode: 'blind_date'
        },
        { id: makeId('msg'), role: 'character', characterId, content: firstChatMessage, createdAt: now + 1 }
      ]
    },
    referenceFaceSlots: candidate.profileImageUri ? [
      { id: makeId('ref'), image: candidate.profileImageUri, name: `${candidate.name} 소개팅 사진`, createdAt: now },
      ...(state.referenceFaceSlots || []).filter(slot => String(slot.image || '') !== candidate.profileImageUri)
    ].slice(0, 80) : state.referenceFaceSlots,
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
    void appendDebugLog(
      'blindDate.reference',
      `mode=mix candidate=${mixed.name || '-'} slots=${Math.min(50, (state.referenceFaceSlots || []).filter(slot => String(slot.image || '').trim()).length)} reference=${faceReferenceImage ? 'yes' : 'no'} kind=${faceReferenceImage ? 'profile-reference-face' : 'profile'}`
    );
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
  return [...new Set([...USER_REQUESTED_QUESTIONS, ...DEFAULT_QUESTIONS])];
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

function buildInitialWorldcupSetup(candidateIds: string[], count: number): { pairs: BlindDateWorldcupPair[]; byeCandidateIds: string[] } {
  const entrants = shuffled(candidateIds);
  if (count === 24 && entrants.length >= 24) {
    const byeCandidateIds = entrants.slice(0, 8);
    const matchCandidateIds = entrants.slice(8, 24);
    return {
      pairs: buildWorldcupPairs(matchCandidateIds, '24강'),
      byeCandidateIds
    };
  }
  return {
    pairs: buildWorldcupPairs(entrants, worldcupRoundLabel(count)),
    byeCandidateIds: []
  };
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
