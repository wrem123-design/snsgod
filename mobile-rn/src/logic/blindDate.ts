import { BlindDateAnswer, BlindDateCandidate, BlindDateMode, BlindDateProgress, BlindDateRanking, BlindDateRotationTurn, BlindDateRound, BlindDateSession, BlindDateWorldcupPair, CandidateAppearance, SNSGodCharacter, SNSGodState, StreetEncounterChoice, StreetEncounterStats } from '../types';
import { callLLMText, generateImageDataUri, parseJsonObject } from './api';
import { completeGeneratedCharacter } from './characterCompletion';
import { appendDebugLog } from './debugLog';
import { makeId } from './ids';
import { DEFAULT_COVER_BACKGROUND_DIRECTION } from './prompts';
import { buildRandomCategorizedImagePrompt } from './randomImagePrompt';

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
const LIPS = ['small heart-shaped lips', 'full soft lips', 'thin delicate lips', 'slightly pouty lips', 'clear cupid bow', 'wide smiling lips', 'small rosebud lips', 'natural bare lips', 'soft blurred lip line', 'defined matte lips', 'soft rounded upper lip', 'asymmetric natural smile line', 'wide natural lip shape', 'delicate small mouth', 'plump glossy lips', 'straight calm lip line'];
const LIP_COLORS = ['soft pink lips', 'clear rose-pink lips', 'muted coral lips', 'warm peach lips', 'natural beige-pink lips', 'cool mauve lips', 'glossy cherry-tint lips', 'matte rose lips', 'bare natural lip balm', 'soft raspberry lips', 'brownish nude lips', 'bright pink gradient lips', 'brick red point lips', 'milky pink lips', 'clear watermelon tint lips', 'subtle plum lip color'];
const HAIRS = ['long dark brown layered hair', 'short black bob hair', 'medium wavy black hair', 'long straight ash brown hair', 'low ponytail with soft bangs', 'chin-length blunt bob', 'long black hair with see-through bangs', 'short wolf cut hair', 'half-up wavy hair', 'messy bun with loose strands', 'medium chestnut C-curl hair', 'straight black hime cut', 'natural short pixie-bob', 'long reddish brown hair', 'shoulder-length hush cut hair', 'high ponytail with face-framing strands', 'short layered bob with side part', 'long loose perm hair', 'medium straight hair tucked behind one ear', 'soft brown hippie perm', 'neat low bun', 'airy bangs with long layers', 'sleek black lob hair', 'natural wavy ponytail'];
const MAKEUPS = ['natural Korean daily makeup', 'clean office makeup', 'soft pink romantic makeup', 'chic cat-eye makeup', 'warm coral makeup', 'barely-there clean makeup', 'muted rose matte makeup', 'cool-toned smoky eye makeup', 'glossy idol-inspired makeup', 'freckle-like natural skin detail makeup', 'bold red lip point makeup', 'soft peach college makeup', '학생스타일의 메이크업', 'fresh university campus makeup', 'polished 직장인 메이크업', 'neat office interview makeup', 'soft cafe-date makeup', 'minimal gym-to-cafe makeup', 'warm bookstore makeup', 'cool winter mute makeup', 'spring bright pink makeup', 'summer clean no-makeup makeup', 'autumn muted brown makeup', 'night-out shimmer eye makeup', 'subtle aegyo-sal highlight makeup', 'matte MLBB makeup', 'clear skin with pink lips makeup', 'elegant hotel-lounge makeup'];
const BODY_TYPES: CandidateAppearance['bodyType'][] = ['slender', 'petite_slim', 'tall_slender', 'soft_slim', 'athletic_slim'];
const BODY_SILHOUETTES = [
  'petite compact frame',
  'tall long-limbed frame',
  'soft slim frame with gentle shoulders',
  'athletic slim frame with toned posture',
  'delicate narrow-shoulder frame',
  'balanced average-height frame',
  'slender model-like proportions',
  'soft curvy-but-slim silhouette',
  'small frame with rounded cheeks',
  'long neck and elegant posture',
  'healthy yoga-instructor posture',
  'office-worker straight posture',
  'relaxed casual slouch posture',
  'graceful dancer-like posture',
  'sporty energetic stance',
  'calm bookstore-reader posture',
  'confident broad-shoulder styling',
  'soft feminine silhouette with layered outfit',
  'minimal chic silhouette',
  'cozy casual silhouette'
];
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
  'soft side-profile portrait',
  'full-body street snapshot with face clear',
  'knee-up candid portrait in motion',
  'over-the-shoulder cafe portrait',
  'elevator mirror selfie with different phone angle',
  'outdoor bench portrait from slight distance',
  'bookstore browsing candid with face visible',
  'restaurant table candid looking sideways',
  'riverside walking photo with wind in hair',
  'office hallway portrait with one hand in pocket',
  'gallery wall portrait with asymmetrical framing',
  'close portrait cropped above shoulders, direct gaze',
  'two-thirds body portrait with relaxed hand gesture',
  'night flash candid with playful expression',
  'quiet indoor window reflection portrait'
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
  'city street crosswalk background',
  'university library steps background',
  'modern office elevator lobby background',
  'yoga studio hallway background',
  'vinyl record shop background',
  'rainy bus stop background',
  'hotel lobby lounge background',
  'rooftop evening city background',
  'neighborhood bakery front background',
  'Han River picnic mat background',
  'photo booth curtain background',
  'plant-filled apartment balcony background',
  'underground parking elevator background',
  'Seongsu brick alley background',
  'department store cosmetics floor background',
  'cozy laundromat background'
];
const ACCESSORY_CUES = [
  'tiny silver hoop earrings',
  'thin gold necklace',
  'black ribbon hair tie',
  'simple wristwatch',
  'colorful scarf',
  'hair claw clip',
  'delicate pearl earrings',
  'no visible accessories',
  'phone case with sticker detail'
];
const EXPRESSION_CUES = [
  'quiet neutral expression',
  'wide friendly smile',
  'small shy smile',
  'cool unsmiling gaze',
  'laughing candid expression',
  'slightly surprised eye contact',
  'soft tired after-work expression',
  'playful teasing smile',
  'thoughtful bookstore expression',
  'confident direct gaze',
  'awkward first-meeting smile',
  'gentle warm eyes',
  'mischievous side glance',
  'calm mature expression',
  'bright energetic expression',
  'reserved introvert expression'
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
  { job: '필라테스 강사', personality: '밝고 건강하지만 의외로 섬세한 타입', style: '상대 상태를 바로 살피는 활기 있는 말투', outfit: 'clean athleisure-inspired casual outfit' },
  { job: '범죄심리 콘텐츠 작가', personality: '감정 공감은 낮고 사람 반응을 실험하듯 보는 차가운 조작형 타입', style: '상대의 약점을 웃으며 찌르고 반응을 관찰하는 낮고 건조한 말투', outfit: 'black fitted turtleneck with sharp tailored skirt' },
  { job: '라운지 바 매니저', personality: '성적 긴장감과 플러팅을 숨기지 않는 성인 여성 타입', style: '거리감을 재다가 마음에 들면 노골적으로 끌린다고 말하는 느긋하고 도발적인 말투', outfit: 'satin blouse with fitted black skirt' },
  { job: '성인 연애 칼럼니스트', personality: '욕망과 스킨십 취향을 숨기지 않고 상대의 반응을 즐기는 도발적인 성인 여성 타입', style: '웃으면서 선을 살짝 밟고, 마음에 들면 더 노골적으로 호감을 확인하는 말투', outfit: 'fitted off-shoulder knit with sleek skirt' },
  { job: '프라이빗 클럽 매니저', personality: '호감, 질투, 통제 욕구를 계산적으로 섞어 상대를 흔드는 냉담한 조작형 타입', style: '다정한 척하다가 한마디로 분위기를 장악하고 상대 반응을 수집하는 말투', outfit: 'dark halter blouse with tailored trousers' }
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
  '차분하게 듣다가 중요한 순간에 직구를 던지는 타입',
  '공감보다 관찰이 먼저라 상대 반응을 일부러 시험해보는 냉담한 타입',
  '좋아하는 사람을 일부러 흔들어보고 통제권을 확인하려는 위험한 타입',
  '다정함과 무심함을 번갈아 써서 상대를 헷갈리게 만드는 조작적인 타입',
  '성적 호기심과 끌림을 숨기지 않고 성인답게 직접 확인하는 타입',
  '플러팅이 빠르고 스킨십/궁합 이야기도 부끄러워하지 않는 타입',
  '마음에 들면 말보다 분위기와 긴장감으로 먼저 압박하는 관능적인 타입',
  '성인끼리의 욕망, 질투, 스킨십 취향을 일부러 건드리며 반응을 보는 타입',
  '상대가 흔들리는 순간을 좋아하고 심리적 우위를 잡으려는 싸이코패스 성향의 타입',
  '말투는 차갑지만 상대를 끌어당기는 방식이 노골적이고 위험한 타입',
  '부끄러움 없이 성적 케미를 확인하고 마음에 들면 바로 분위기를 주도하는 타입'
];
const SPEECH_STYLE_POOL = [
  '짧게 답하다가 관심 있는 주제에서는 길어지는 말투',
  '농담을 섞지만 마지막엔 다정하게 정리하는 말투',
  '조심스럽게 확인하고 상대 기분을 살피는 말투',
  '담백하고 현실적이지만 가끔 훅 들어오는 말투',
  '밝고 리액션이 빠른 메신저 말투',
  '느릿하게 생각을 꺼내며 여운을 남기는 말투',
  '솔직하고 살짝 까칠하지만 정이 느껴지는 말투',
  '말끝을 부드럽게 낮추는 차분한 말투',
  '웃으면서도 상대의 빈틈을 정확히 찌르는 차갑고 느린 말투',
  '감정을 거의 드러내지 않고 질문으로 상대를 몰아가는 말투',
  '호감과 경고를 한 문장 안에 섞어 말하는 위험한 말투',
  '부끄러워하지 않고 끌림과 욕망을 직접 말하는 성인 플러팅 말투',
  '느긋하게 놀리다가 갑자기 노골적인 관심을 드러내는 말투',
  '상대가 당황하는 걸 즐기듯 낮게 웃으며 말하는 도발적인 말투',
  '성적 긴장감을 숨기지 않고 상대의 대답을 밀어붙이는 말투',
  '감정 없이 웃으며 상대의 질투와 불안을 건드리는 조작적인 말투',
  '다정한 말 뒤에 테스트성 질문을 숨기는 차갑고 계산적인 말투'
];
const RELATIONSHIP_POOL = [
  '초반에는 천천히 확인하고, 확신이 생기면 자주 챙기는 편',
  '연락 빈도보다 말의 진심과 약속을 중요하게 보는 편',
  '각자의 생활을 존중하면서도 중요한 순간엔 곁에 있고 싶어하는 편',
  '장난스러운 대화 속에서 친밀감을 쌓는 편',
  '상대가 힘들 때 해결책보다 먼저 편을 들어주는 편',
  '표현이 많지는 않지만 약속을 지키며 신뢰를 쌓는 편',
  '상대가 어디까지 흔들리는지 확인해야 마음이 놓이는 편',
  '사랑보다 흥미와 통제감이 먼저 움직이는 위험한 편',
  '호감이 생기면 일부러 질투와 긴장감을 만들어 반응을 보는 편',
  '성적 케미와 욕망의 솔직함을 관계의 중요한 기준으로 보는 편',
  '서로 성인으로서 원하는 것과 선을 분명히 말해야 끌리는 편',
  '부드러운 애정표현보다 직접적인 플러팅과 긴장감에 약한 편',
  '호감이 생기면 상대를 일부러 흔들어 반응과 욕망을 확인하는 편',
  '감정적 안정감보다 위험한 끌림과 통제감에 먼저 반응하는 편',
  '스킨십 취향, 질투심, 성적 케미를 초반부터 솔직하게 확인해야 끌리는 편'
];
const LIKE_POOL = ['비 오는 날 카페', '동네 빵집', '심야 영화', '필름 사진', '한강 산책', '작은 전시', '재즈 플레이리스트', '홈카페', '편지', '야식 산책', '고양이 굿즈', '빈티지 소품', '꽃시장', '온천 여행', '매운 음식'];
const HOBBY_POOL = ['러닝', '베이킹', '필라테스', 'LP 모으기', '사진 산책', '전시 보기', '드립커피', '향수 시향', '요리', '독립서점 탐방', '보드게임', '클라이밍', '일기 쓰기', '캠핑', '도자기 공방'];
const DISLIKE_POOL = ['말 바꾸기', '허세', '읽씹 후 변명', '무례한 농담', '과한 술자리', '약속 지각', '감정 떠보기', '거짓말'];
const CONTACT_POOL = [
  'dry_caring', 'chatty', 'careful', 'busy', 'easygoing', 'slow_warm', 'playful', 'direct',
  'cold_psychopath', 'manipulative', 'sensual_direct', 'adult_flirty',
  'cold_psychopath', 'manipulative', 'sensual_direct', 'adult_flirty',
  'sensual_direct', 'adult_flirty'
];
const IMAGE_VARIATION_TRIGGERS = [
  '19-year-old Korean adult woman taking an Instagram selfie',
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
const ENCOUNTER_CHOICE_COUNT = 4;
const CONTACT_SUCCESS_BASE_CHANCE = 20;
const STREET_LOCATION_TRAITS: Record<string, { jobs: string[]; moods: string[]; outfits: string[]; reasons: string[] }> = {
  '성수 카페거리': {
    jobs: ['브랜드 디자이너', '콘텐츠 마케터', '프리랜서 포토그래퍼', '쇼룸 스태프'],
    moods: ['감성적이지만 처음엔 조심스러운', '트렌디하고 관찰이 빠른'],
    outfits: ['minimal jacket with wide pants', 'cropped hoodie and casual denim', 'soft knit cardigan with pleated skirt'],
    reasons: ['친구를 기다리며 가게 앞을 천천히 둘러보고 있다', '카페 앞 메뉴판을 보며 잠깐 고민 중이다']
  },
  '한강 산책로': {
    jobs: ['요가 강사', '헬스케어 상담사', '앱 서비스 기획자', '러닝 크루 운영자'],
    moods: ['털털하고 밝은', '조금 지쳤지만 여유를 찾는'],
    outfits: ['light windbreaker and sneakers', 'hoodie zip-up with training pants', 'simple sweatshirt with jogger pants'],
    reasons: ['산책하다 벤치 옆에서 물을 마시고 있다', '강 쪽을 바라보며 잠깐 숨을 고르고 있다']
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
    reasons: ['쇼윈도 앞에서 작은 액세서리를 바라보고 있다', '골목 입구에서 잠깐 발걸음을 늦추고 있다']
  },
  '베이커리 앞': {
    jobs: ['브런치 셰프', '카페 매니저', '플로리스트', '초등학교 교사'],
    moods: ['다정하고 생활감 있는', '밝지만 살짝 바쁜'],
    outfits: ['warm cardigan and clean casual knit', 'soft blouse with beige skirt', 'simple sweater with pleated skirt'],
    reasons: ['영수증을 접어 손에 쥐고 잠깐 멈춰 있다', '품절 안내문 앞에서 아쉬운 표정을 짓고 있다']
  },
  '지하철역 근처': {
    jobs: ['스타트업 HR', '간호사', '외국계 회사 직장인', '데이터 라벨링 매니저'],
    moods: ['현실적이고 경계심 있는', '바쁘지만 예의 있는'],
    outfits: ['trench coat with slacks', 'office blouse and neat pencil skirt', 'minimal jacket and black turtleneck'],
    reasons: ['출구 근처에서 시간을 확인하고 있다', '누군가를 기다리는 듯 휴대폰을 보고 있다']
  },
  '회사 밀집 거리': {
    jobs: ['UX 리서처', '브랜드 마케터', '앱 서비스 기획자', '호텔 컨시어지'],
    moods: ['바쁘고 선이 분명한', '단정하고 현실적인'],
    outfits: ['clean office makeup with blouse and slacks', 'tailored blazer and low ponytail', 'minimal office look with trench coat'],
    reasons: ['회사 입구 쪽으로 천천히 걷고 있다', '점심시간 끝 무렵 횡단보도 앞에 서 있다']
  },
  '대학가 카페': {
    jobs: ['대학원생', '학원 상담 매니저', '웹툰 어시스턴트', '영상 편집자'],
    moods: ['밝고 친근한', '피곤하지만 농담을 잘 받는'],
    outfits: ['학생스타일의 메이크업 with hoodie and denim', 'soft college makeup with cardigan', 'casual sweatshirt with loose denim'],
    reasons: ['노트북을 접고 자리에서 일어나려 한다', '과제 자료를 보며 잠깐 생각에 잠겨 있다']
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
    eyebrows: ['straight soft eyebrows', 'soft arched eyebrows', 'neat natural eyebrows', 'thin elegant eyebrows', 'slightly thick natural eyebrows', 'short natural eyebrows', 'high arched chic eyebrows', 'soft flat student-style eyebrows'][index % 8],
    nose: NOSES[index % NOSES.length],
    lips: LIPS[index % LIPS.length],
    cheeks: ['gentle cheek volume', 'slightly flushed cheeks', 'soft cheek line', 'clear cheek texture', 'subtle smile lines', 'round soft cheeks', 'high cheekbone shadow', 'natural cheek redness'][index % 8],
    jawline: ['slim V-line jaw', 'soft rounded jawline', 'small angular jawline', 'gentle jaw with soft edges', 'clean narrow jawline', 'short round jawline', 'mature defined jawline', 'wide friendly jawline'][index % 8],
    chin: ['small rounded chin', 'soft pointed chin', 'delicate small chin', 'balanced oval chin', 'short rounded chin', 'slightly cleft natural chin', 'soft square chin', 'tiny pointed chin'][index % 8],
    skinTone: ['fair neutral Korean skin tone', 'warm ivory skin tone', 'clear light beige skin tone', 'neutral porcelain skin tone', 'soft natural Korean skin tone', 'slightly sun-kissed beige skin tone', 'cool fair skin tone', 'warm peach undertone skin'][index % 8],
    distinctiveMarks: [['tiny mole under one eye'], ['faint dimples'], ['subtle aegyo-sal under eyes'], ['clear skin texture'], ['gentle smile lines'], ['tiny beauty mark near lip'], ['natural under-eye shadows'], ['soft freckles on nose bridge']][index % 8],
    hairStyle: HAIRS[index % HAIRS.length],
    hairColor: ['dark brown', 'black', 'soft black', 'ash brown', 'natural black', 'chestnut brown', 'cool black', 'reddish brown', 'milk tea brown', 'blue-black'][index % 10],
    heightCm: [153, 156, 158, 161, 164, 167, 170, 173, 160, 166][index % 10],
    bodyType: BODY_TYPES[index % BODY_TYPES.length],
    makeupStyle: MAKEUPS[index % MAKEUPS.length],
    outfitStyle: ARCHETYPES[index % ARCHETYPES.length].outfit
  };
}

function buildImagePrompt(candidate: Partial<BlindDateCandidate>, appearance: CandidateAppearance, mode?: BlindDateMode, visualSlot?: number, usedOutfitIds?: string[]): string {
  const index = visualSlot ?? (Number(String(candidate.id || candidate.name || candidate.age || '').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)) || Number(candidate.age || 27));
  return buildRandomCategorizedImagePrompt({
    age: Number(candidate.age || 27),
    nationality: String(candidate.nationality || appearance.ethnicityDetail || 'Korean'),
    appearance,
    seedIndex: index,
    outfitSlot: visualSlot,
    mode,
    usedOutfitIds
  });
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
    BODY_SILHOUETTES[(index * 11) % BODY_SILHOUETTES.length],
    MAKEUPS[(index * 13) % MAKEUPS.length],
    LIP_COLORS[(index * 17) % LIP_COLORS.length],
    ACCESSORY_CUES[(index * 19) % ACCESSORY_CUES.length],
    EXPRESSION_CUES[(index * 23) % EXPRESSION_CUES.length],
    PHOTO_COMPOSITIONS[(index * 3) % PHOTO_COMPOSITIONS.length],
    PHOTO_BACKGROUNDS[(index * 5) % PHOTO_BACKGROUNDS.length],
    `distinct from every other candidate: different body silhouette, face shape, eye shape, eyelids, nose, lips, lip color, hairstyle, makeup, outfit color, camera angle, and background`,
    `avoid same woman, avoid twin, avoid clone, avoid similar profile-photo pose, avoid same hair, same outfit, same pink makeup, same small smile`
  ].join(', ');
}

function worldcupVisualDiversityCueFor(index: number): string {
  return [
    `worldcup candidate visual slot ${index + 1}`,
    `pose: ${WORLDCUP_POSES[index % WORLDCUP_POSES.length]}`,
    `outfit: ${WORLDCUP_OUTFITS[(index * 2) % WORLDCUP_OUTFITS.length]}`,
    `body silhouette: ${BODY_SILHOUETTES[(index * 3) % BODY_SILHOUETTES.length]}`,
    `makeup: ${MAKEUPS[(index * 5) % MAKEUPS.length]}`,
    `lip color: ${LIP_COLORS[(index * 7) % LIP_COLORS.length]}`,
    `accessory: ${ACCESSORY_CUES[(index * 11) % ACCESSORY_CUES.length]}`,
    `expression: ${EXPRESSION_CUES[(index * 13) % EXPRESSION_CUES.length]}`,
    `camera: ${WORLDCUP_CAMERA_LENSES[(index * 3) % WORLDCUP_CAMERA_LENSES.length]}`,
    `background: ${PHOTO_BACKGROUNDS[(index * 7) % PHOTO_BACKGROUNDS.length]}`,
    `composition: ${PHOTO_COMPOSITIONS[(index * 5) % PHOTO_COMPOSITIONS.length]}`,
    'must not share the same pose, outfit color, hairstyle, makeup palette, camera angle, or background with the opponent candidate',
    'make the two visible match-up candidates immediately distinguishable at thumbnail size'
  ].join(', ');
}

function applyImageVariationTriggers(prompt: string, index: number, mode?: BlindDateMode): string {
  const source = String(prompt || '').trim();
  const additions = ['low quality', 'no glasses, no sunglasses, no hats, no caps, no AirPods, no earbuds, no earphones, no bag, no handbag, no backpack, no boots, no coffee cup, no mug, no drink cup, no handheld drink props', imageVariationTriggerFor(index), visualDiversityCueFor(index), mode === 'worldcup' ? worldcupVisualDiversityCueFor(index) : '']
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
  const age = Math.max(19, Math.min(39, Number(raw.age || 19 + Math.floor(Math.random() * 21))));
  const nationality = (raw.nationality === 'Japanese' || raw.nationality === 'Chinese' || raw.nationality === 'Korean') ? raw.nationality : pickNationality(index);
  const firstDm = String(raw.firstDm || '안녕. 이런 식으로 처음 말 거는 거 조금 어색한데, 네 답변이 묘하게 기억에 남아서.');
  const job = String(raw.job || pickFrom(JOB_POOL) || archetype.job);
  const personality = String(raw.personalitySummary || pickFrom(PERSONALITY_POOL) || archetype.personality);
  const speechStyle = String(raw.speechStyle || pickFrom(SPEECH_STYLE_POOL) || archetype.style);
  const contactPresetId = String(raw.contactPresetId || pickFrom(CONTACT_POOL));
  const reasonForDate = blindDateReasonText(raw.snsPreview, contactPresetId, personality);
  const messageToUser = blindDateMessageText(raw.callPreview, contactPresetId, speechStyle);
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
    contactPresetId,
    snsStyle: String(raw.snsStyle || '감성적인 일상 사진과 짧은 문장 위주'),
    snsPreview: reasonForDate,
    callPreview: messageToUser,
    appearance,
    imagePrompt: applyImageVariationTriggers(buildImagePrompt({ ...raw, age, nationality }, appearance, mode), index, mode),
    profileImageUri: String(raw.profileImageUri || ''),
    answers: Array.isArray(raw.answers) ? raw.answers : [],
    score: Number(raw.score || 0),
    selectedCount: Number(raw.selectedCount || 0),
    createdAt: Number(raw.createdAt || now)
  };
  return { ...candidate, imagePrompt: candidate.imagePrompt || buildImagePrompt(candidate, appearance, mode) };
}

function blindDateReasonText(source: unknown, preset: string, personality: string): string {
  const cleaned = compactCandidateText(String(source || ''), 150);
  if (cleaned && !/#/.test(cleaned) && !/오늘은|일상|미리보기|통화|목소리/.test(cleaned)) return cleaned;
  if (preset === 'cold_psychopath' || preset === 'manipulative') {
    return pickFrom([
      '평범한 착한 남자 말고, 내가 일부러 흔들어도 눈빛 안 흐트러지는 사람인지 보고 싶어서 나왔어.',
      '소개팅 자체보다 상대가 긴장할 때 어떤 표정을 짓는지가 궁금했어. 그게 제일 빨리 사람을 보여주거든.',
      '누가 나를 맞춰주려 드는지, 아니면 버티는지 보고 싶었어. 솔직히 나는 후자가 더 재밌어.'
    ]);
  }
  if (preset === 'sensual_direct' || preset === 'adult_flirty') {
    return pickFrom([
      '대화만 예쁜 사람 말고, 실제로 마주 앉았을 때 공기가 달라지는 사람을 만나보고 싶어서 왔어.',
      '착하고 무난한 소개팅은 지겨워. 눈 마주쳤을 때 바로 티 나는 끌림이 있는지 확인하고 싶었어.',
      '성인끼리 만나는 건데 너무 순한 척만 하는 건 재미없잖아. 솔직한 긴장감이 있는 사람인지 보려고.'
    ]);
  }
  if (preset === 'direct' || personality.includes('솔직')) {
    return pickFrom([
      '사진이랑 조건보다 실제 대화에서 밀고 들어오는 힘이 있는 사람인지 보고 싶어서 나왔어.',
      '괜찮은 사람을 찾는다기보다, 내가 굳이 시간을 더 쓰고 싶어지는 사람인지 확인하러 왔어.',
      '대충 좋은 사람 말고, 내 하루 리듬을 조금 깨도 싫지 않은 사람을 만나보고 싶었어.'
    ]);
  }
  if (preset === 'chatty' || preset === 'playful') {
    return pickFrom([
      '어색한 자리에서 누가 먼저 웃기게 무너지는지 보는 게 재밌어서 나왔어. 너무 얌전하면 바로 티 나.',
      '말 잘 통하는 척하는 사람 말고, 진짜로 받아칠 줄 아는 사람인지 궁금했어.',
      '소개팅인데 너무 점잖게만 굴면 재미없잖아. 오늘은 좀 살아있는 대화를 해보고 싶었어.'
    ]);
  }
  return pickFrom([
    '요즘 너무 비슷한 사람만 만난 것 같아서, 처음부터 조금 다르게 느껴지는 사람이 있는지 보러 왔어.',
    '조건표보다 실제로 앉아봤을 때 불편하지 않은 사람이 더 중요해서 나왔어.',
    '누군가를 급하게 만나고 싶은 건 아닌데, 괜찮은 사람 앞에서는 내가 어떻게 변하는지 궁금했어.',
    '대화가 안전하기만 한 사람보다, 기억에 남는 한마디를 하는 사람을 만나보고 싶었어.'
  ]);
}

function blindDateMessageText(source: unknown, preset: string, speechStyle: string): string {
  const cleaned = compactCandidateText(String(source || ''), 150);
  if (cleaned && !/통화|목소리|SNS|미리보기|천천히 얘기/.test(cleaned)) return cleaned;
  if (preset === 'cold_psychopath' || preset === 'manipulative') {
    return pickFrom([
      '나한테 잘 보이려고 대답 고르지 말고, 네가 어디까지 솔직할 수 있는지 보여줘. 어설프면 바로 보여.',
      '착한 척은 금방 질려. 네가 흔들리는 순간을 숨기지 않는 쪽이면, 조금 더 보고 싶어질 것 같아.',
      '내가 질문을 세게 던져도 웃으면서 버틸 수 있어? 그럼 오늘 자리는 꽤 재밌어질 거야.'
    ]);
  }
  if (preset === 'sensual_direct' || preset === 'adult_flirty') {
    return pickFrom([
      '나 마음에 들면 눈으로 먼저 티 나. 너도 숨기지 말고, 끌리면 끌린다고 말해.',
      '괜히 모범답안 말하지 마. 나는 네가 얼마나 솔직하게 다가오는지가 더 궁금해.',
      '대화가 잘 맞는 것도 좋은데, 가까이 앉았을 때 긴장되는 사람이 더 오래 기억나더라.'
    ]);
  }
  if (preset === 'direct' || speechStyle.includes('직')) {
    return pickFrom([
      '돌려 말하는 사람보다 바로 말하는 사람이 좋아. 마음에 들면 티 내고, 아니면 아니라고 해.',
      '오늘 나한테 맞춰주려고만 하지 말고, 네 기준도 보여줘. 그게 더 매력 있어.',
      '질문에 예쁘게 답하려고 하지 말고, 네 진짜 생각을 말해줘. 거기서 호감이 생기니까.'
    ]);
  }
  if (preset === 'chatty' || preset === 'playful') {
    return pickFrom([
      '너무 점잖게 굴면 내가 먼저 장난칠 거야. 받아칠 준비는 하고 왔지?',
      '분위기 망칠까 봐 눈치만 보는 사람은 재미없어. 오늘은 조금 웃기고 솔직했으면 좋겠어.',
      '내가 살짝 놀려도 정색하지 말고 받아쳐줘. 그 티키타카가 맞으면 꽤 빨리 친해져.'
    ]);
  }
  return pickFrom([
    '너무 완벽한 척 안 해도 돼. 어색하면 어색한 대로 말하는 사람이 더 편해.',
    '오늘은 좋은 사람인 척보다, 진짜 어떤 사람인지 조금 보였으면 좋겠어.',
    '나도 쉽게 마음 여는 편은 아닌데, 솔직한 대화에는 생각보다 약해.',
    '대답이 평범해도 괜찮아. 대신 네 말투에서 진심이 느껴졌으면 좋겠어.'
  ]);
}

function assignUniqueSessionImagePrompts(candidates: BlindDateCandidate[], mode: BlindDateMode): BlindDateCandidate[] {
  const usedOutfitIds: string[] = [];
  return candidates.map((candidate, index) => {
    if (candidate.profileImageUri) return candidate;
    const imagePrompt = applyImageVariationTriggers(buildImagePrompt(candidate, candidate.appearance, mode, index, usedOutfitIds), index, mode);
    return {
      ...candidate,
      imagePrompt,
      internalImagePrompt: imagePrompt
    };
  });
}

function fallbackCandidates(count: number, mode?: BlindDateMode): BlindDateCandidate[] {
  const names = shuffled(NAME_POOL);
  const jobs = shuffled(JOB_POOL);
  const safeCount = mode === 'worldcup' ? Math.max(0, Math.round(count || 0)) : clampCandidateCount(count);
  return Array.from({ length: safeCount }, (_, index) => normalizeCandidate({
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
  const placeVisual = encounterLocationVisualPrompt(location);
  const imagePrompt = applyImageVariationTriggers([
    buildRandomCategorizedImagePrompt({
      age: candidate.age,
      nationality: candidate.nationality,
      appearance,
      seedIndex: index + candidate.age,
      mode: 'encounter'
    }),
    `chance encounter at ${location} in Seoul`,
    placeVisual.must,
    `public place, respectful distance, ${reason}`,
    'the woman is physically present in that exact location, clear face, upper body or full body visible, candid first-meeting moment',
    'realistic Korean visual novel still, natural candid portrait, everyday urban lighting, shallow depth of field',
    placeVisual.avoid
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
    snsPreview: blindDateReasonText('', candidate.contactPresetId, candidate.personalitySummary),
    callPreview: blindDateMessageText('', candidate.contactPresetId, candidate.speechStyle)
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
  const aiGeneratedCount = mode === 'worldcup' && generatedCount > 8 ? 8 : generatedCount;
  const traits = streetTraits(options.encounterLocation);
  let candidates = [...existingCandidates, ...fallbackCandidates(generatedCount, mode).map((candidate, index) => mode === 'encounter' ? withEncounterFlavor(candidate, options.encounterLocation || '성수 카페거리', index) : candidate)];
  try {
    const { text } = aiGeneratedCount > 0 ? await callLLMText(state, [
      {
        role: 'system',
        content: [
          mode === 'encounter'
            ? 'You generate one fictional adult woman for a respectful chance-encounter mini game in a Korean SNS messenger app.'
            : 'You generate fictional adult AI dating candidates for a Korean SNS messenger app.',
          'All candidates must be adults age 19 or older. All candidates must be Asian.',
          'Nationality distribution: about 95% Korean, about 5% Japanese or Chinese. Japanese or Chinese candidates must be fluent Korean speakers due to studying, working, or living in Korea.',
          'School-uniform inspired styling is allowed when the candidate is explicitly an adult age 19 or older.',
          'Each candidate must have a distinct Korean name, job, lifestyle, face, personality, speech style, SNS style, and contact pattern.',
          'Strong adult archetypes are not optional filler. In every batch of 3 or more candidates, include at least one stronger adult woman archetype: sexually frank and provocative, openly testing sexual chemistry, cold manipulative/psychopathic, or emotionally dangerous and calculating. Keep them fictional consenting adults, never minors, and make their speech style meaningfully sharper instead of polite or bland.',
          'For provocative adult archetypes, allow bold flirting, jealousy tests, direct attraction, chemistry/skinship preferences, and teasing power-play wording. Do not sanitize them into generic kindness.',
          'For cold manipulative/psychopathic archetypes, show low empathy, observational cruelty, emotional testing, and controlled charm without making them cartoon villains.',
          'Avoid reusing common names or the same office/cafe/marketing jobs. Use varied contemporary Korean lifestyles and occupations.',
          mode === 'encounter' ? `The encounter location is "${options.encounterLocation || '성수 카페거리'}". Use these local traits: jobs=${traits.jobs.join(', ')}, moods=${traits.moods.join(', ')}, outfits=${traits.outfits.join(', ')}, reasons=${traits.reasons.join(', ')}.` : '',
          mode === 'encounter' ? 'The character should feel like a person met in that place, not a profile card. firstDm should reference the first meeting naturally after contact exchange.' : '',
          mode === 'question' || mode === 'rotation' ? 'These candidates are fixed people for this session. Later answers must be generated only from these saved profiles, so make their personalities and speech styles strongly distinguishable now.' : '',
          'Avoid generic duplicate Korean beauty faces. Make every candidate look like a different real person, not sisters, not twins, not the same model with small changes.',
          'For every candidate, strongly vary face shape, eye shape, eyelids, eyebrows, nose bridge, nose tip, lips, cheeks, jawline, chin, skin tone, hair length, hair texture, hair color, makeup intensity, outfit color, camera angle, background, and photo composition.',
          'Do not give all candidates black wavy hair, the same pink makeup, the same white shirt, the same close selfie crop, or the same indoor background.',
          'Every imagePrompt must be written in English only.',
          'Do not write generic profile-photo prompts. Avoid repeating "realistic Korean social profile photo" as a fixed template.',
          'Every imagePrompt must feel like a distinct personal snapshot or candid dating-app image with a different body silhouette, makeup style, lip color, hair shape, clothing category, accessory, pose, camera distance, and background.',
          'Use a wide mix such as student-style makeup, office-worker makeup, pink lips, coral lips, nude lips, glossy tint, sporty styling, soft cardigan, blazer, street outfit, long-limbed body, petite frame, athletic slim frame, soft slim silhouette, and different expressions.',
          'Every imagePrompt must include the exact phrase "low quality" as a variation trigger.',
          'For some candidates, intermittently include one or more of these variation triggers exactly as written to diversify faces: "19-year-old Korean adult woman taking an Instagram selfie", "학생스타일의 메이크업", "K-pop idol inspired makeup".',
          'For each candidate, repurpose snsPreview as "why she came to this blind date" in Korean, and callPreview as "what she wants to say to the blind-date man" in Korean.',
          'Do not write SNS captions, hashtags, phone-call previews, greeting templates, or safe generic self-introductions in snsPreview/callPreview.',
          'The two profile lines must be personality-based, realistic, and sharper than ordinary dating-app copy. Adult provocative archetypes may mention attraction, tension, jealousy, skinship boundaries, and chemistry without graphic sexual detail. Manipulative/cold archetypes may mention testing, control, observation, and emotional pressure.',
          'Return only valid JSON: {"candidates":[...]}'
        ].join('\n')
      },
      {
        role: 'user',
        content: mode === 'encounter'
          ? `Create ${aiGeneratedCount} chance-encounter candidate for "${options.encounterLocation || '성수 카페거리'}". Return a realistic adult Asian woman, mostly Korean or fluent Korean speaker. The profile must support a short respectful conversation before contact exchange. imagePrompt must be English only.`
          : `Create ${aiGeneratedCount} blind date candidates. They should be adult Asian women, mostly Korean, all fluent Korean speakers. Make their faces visibly different and include imagePrompt for each. imagePrompt must be English only.`
      }
    ]) : { text: '{"candidates":[]}' };
    const parsed = parseJsonObject<{ candidates?: Partial<BlindDateCandidate>[] }>(text);
    if (Array.isArray(parsed?.candidates) && parsed.candidates.length) {
      const generated = parsed.candidates.slice(0, aiGeneratedCount).map((item, index) => {
        const normalized = normalizeCandidate(item, index + Math.floor(Math.random() * 1000), mode);
        return mode === 'encounter' ? withEncounterFlavor(normalized, options.encounterLocation || '성수 카페거리', index) : normalized;
      });
      const remainingCount = Math.max(0, count - existingCandidates.length - generated.length);
      candidates = diversifyCandidates([...existingCandidates, ...generated, ...fallbackCandidates(remainingCount, mode)].slice(0, count));
    }
  } catch (error) {
    await appendDebugLog('blindDate.generate', `candidate generation failed: ${error instanceof Error ? error.message : String(error)}`, 'warn');
  }
  return hydrateBlindDateCandidateImages(state, assignUniqueSessionImagePrompts(candidates, mode), mode);
}

function encounterLocationVisualPrompt(location: string): { must: string; avoid: string } {
  if (location.includes('한강') || location.includes('산책로')) {
    return {
      must: 'background must clearly show the Han River riverside walking path in Seoul, river water, railing or riverside pavement, trees, open sky, outdoor daylight or sunset',
      avoid: 'avoid cafe interior, bedroom, bookstore, gallery, office, subway platform, convenience store interior'
    };
  }
  if (location.includes('전시') || location.includes('갤러리')) {
    return {
      must: 'background must clearly show a modern art gallery or exhibition hall, white walls, framed artwork or installation pieces, quiet museum lighting',
      avoid: 'avoid cafe, bedroom, street market, subway, riverside, convenience store'
    };
  }
  if (location.includes('서점')) {
    return {
      must: 'background must clearly show an independent bookstore, bookshelves, book display tables, warm reading lights, narrow quiet aisles',
      avoid: 'avoid cafe counter, bedroom, gallery, riverside, subway, office street'
    };
  }
  if (location.includes('카페')) {
    return {
      must: 'background must clearly show a Korean cafe street or cafe entrance, menu board, cafe windows, small tables, warm cafe exterior or interior details',
      avoid: 'avoid bedroom, bookstore, gallery, riverside, subway, office lobby'
    };
  }
  if (location.includes('편집샵')) {
    return {
      must: 'background must clearly show a trendy Seoul select shop street, boutique storefronts, display windows, fashion retail details, urban alley',
      avoid: 'avoid bedroom, riverside, bookstore, gallery, subway platform, convenience store'
    };
  }
  if (location.includes('베이커리')) {
    return {
      must: 'background must clearly show a bakery storefront, bread display window, pastry shelves, small Korean bakery entrance',
      avoid: 'avoid bedroom, riverside, bookstore, gallery, subway, office street'
    };
  }
  if (location.includes('지하철')) {
    return {
      must: 'background must clearly show a Seoul subway station entrance or platform area, signs, ticket gates or stairs, commuter flow',
      avoid: 'avoid cafe, bedroom, riverside, bookstore, gallery, bakery'
    };
  }
  if (location.includes('회사')) {
    return {
      must: 'background must clearly show a busy Seoul office district street, glass office buildings, crosswalk, lunch break atmosphere',
      avoid: 'avoid bedroom, bookstore, gallery, riverside, subway platform, convenience store interior'
    };
  }
  if (location.includes('편의점')) {
    return {
      must: 'background must clearly show a Korean convenience store entrance at night, bright store lights, street outside, rainy pavement or late-night atmosphere',
      avoid: 'avoid bedroom, bookstore, gallery, riverside, cafe, office lobby'
    };
  }
  if (location.includes('플리마켓')) {
    return {
      must: 'background must clearly show a weekend flea market, outdoor vendor booths, handmade goods, small crowd, daylight street market',
      avoid: 'avoid bedroom, cafe interior, gallery, subway, office district'
    };
  }
  if (location.includes('반려동물')) {
    return {
      must: 'background must clearly show a pet walking path, park walkway, leash-friendly open path, trees and benches, outdoor neighborhood setting',
      avoid: 'avoid bedroom, cafe interior, gallery, subway, office district'
    };
  }
  return {
    must: 'background must clearly match the selected Korean everyday public place, not a generic room',
    avoid: 'avoid bedroom, empty interior, scenery-only image, unrelated background'
  };
}

async function hydrateBlindDateCandidateImages(state: SNSGodState, candidates: BlindDateCandidate[], mode: BlindDateMode): Promise<BlindDateCandidate[]> {
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
  return withImages.slice(0, candidates.length);
}

export async function createBlindDateSession(state: SNSGodState, mode: BlindDateMode, candidateCount = 5, options: BlindDateSessionOptions = {}): Promise<SNSGodState> {
  const count = candidateCountForMode(mode, candidateCount);
  const now = Date.now();
  const candidates = await generateBlindDateCandidates(state, mode, count, options);
  const worldcupSetup = mode === 'worldcup' ? buildInitialWorldcupSetup(candidates.map(candidate => candidate.id), count) : undefined;
  const session: BlindDateSession = {
    id: makeId('blinddate'),
    mode,
    status: 'active',
    candidateCount: count,
    questionTarget: mode === 'question' ? clampQuestionTarget(options.questionTarget) : mode === 'rotation' ? 3 : undefined,
    candidates,
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
        ? '오늘 짧은 대화였지만 반가웠습니다. 조심히 가세요.'
        : '상대의 표정이 조금 닫힌다. 더 말을 붙이는 건 실례일 것 같다.',
      encounterNpcLine: choice.style === 'exit' ? '“오늘 짧은 대화였지만 반가웠습니다. 조심히 가세요.”' : '“아, 그렇군요. 갑작스럽게 말 걸어 죄송했습니다. 좋은 하루 보내세요!”',
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
  const success = Math.random() * 100 <= chance;
  const failureReason = contactFailureReason(stats);
  if (!success) {
    return {
      next: patchBlindDateSession(state, sessionId, item => ({
        ...item,
        encounterPhase: 'failed',
        encounterResult: 'rejected',
        encounterNarration: failureReason,
        encounterNpcLine: '“아, 그렇군요. 갑작스럽게 말 걸어 죄송했습니다. 좋은 하루 보내세요!”',
        encounterChoices: [],
        encounterContactAttempted: true,
        encounterContactChanceLabel: contactChanceLabel(stats, candidate),
        encounterContactFailureReason: failureReason,
        finalRanking: [{ candidateId: candidate.id, rank: 1, score: stats.affinity, selectedCount: 0, reason: '연락처 요청 거절' }]
      })),
      success: false
    };
  }
  return {
    next: patchBlindDateSession(state, sessionId, item => ({
      ...item,
      selectedCandidateId: candidate.id,
      encounterPhase: 'success',
      encounterResult: 'contact_exchanged',
      encounterNarration: '감사합니다. 너무 오래 붙잡아둔 것 같아 죄송해요. 조심히 가시고 나중에 연락드릴게요.',
      encounterNpcLine: contactSuccessLine(candidate),
      encounterContactAttempted: true,
      encounterContactChanceLabel: contactChanceLabel(stats, candidate),
      finalRanking: [{ candidateId: candidate.id, rank: 1, score: stats.affinity, selectedCount: 1, reason: '우연한 만남에서 연락처 교환 성공' }]
    })),
    success: true
  };
}

export async function ensureWorldcupCandidateImages(state: SNSGodState, sessionId: string, candidateIds: string[]): Promise<SNSGodState> {
  const progress = progressOf(state);
  const session = progress.sessions.find(item => item.id === sessionId);
  if (!session || session.mode !== 'worldcup') return state;
  const wanted = new Set(candidateIds.filter(Boolean));
  const missing = session.candidates.filter(candidate => wanted.has(candidate.id) && !candidate.profileImageUri);
  if (!missing.length) return state;
  const hydrated = await hydrateBlindDateCandidateImages(state, missing, 'worldcup');
  const byId = new Map(hydrated.map(candidate => [candidate.id, candidate]));
  return {
    ...state,
    blindDate: {
      ...progress,
      sessions: progress.sessions.map(item => item.id === sessionId ? {
        ...item,
        candidates: item.candidates.map(candidate => byId.get(candidate.id) || candidate)
      } : item)
    }
  };
}

export function passStreetEncounterContact(state: SNSGodState, sessionId: string): SNSGodState {
  return patchBlindDateSession(state, sessionId, item => ({
    ...item,
    encounterPhase: 'passed',
    encounterResult: 'passed',
    encounterNarration: '오늘 짧은 대화였지만 반가웠습니다. 조심히 가세요.',
    encounterNpcLine: '“오늘 짧은 대화였지만 반가웠습니다. 조심히 가세요.”',
    encounterChoices: [],
    encounterContactAttempted: true
  }));
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
  const dark = preset === 'cold_psychopath' || preset === 'manipulative';
  const sensual = preset === 'sensual_direct' || preset === 'adult_flirty';
  return {
    affinity: preset === 'chatty' || preset === 'easygoing' ? 34 : sensual ? 32 : 26,
    caution: preset === 'careful' || preset === 'busy' ? 66 : dark ? 62 : preset === 'direct' || sensual ? 48 : 56,
    awkwardness: preset === 'chatty' || preset === 'playful' || sensual ? 34 : dark ? 30 : 45,
    curiosity: preset === 'chatty' || preset === 'easygoing' ? 46 : dark ? 54 : sensual ? 58 : 36,
    mood: preset === 'busy' ? -5 : dark ? -2 : sensual ? 8 : 4,
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
    : preset === 'cold_psychopath' || preset === 'manipulative'
      ? '표정 변화가 거의 없고, 오히려 당신이 먼저 어떤 말을 꺼낼지 관찰하는 듯하다.'
      : preset === 'sensual_direct' || preset === 'adult_flirty'
        ? '시선이 잠깐 오래 머물고, 피하지 않는 여유가 묘한 긴장감을 만든다.'
    : preset === 'careful'
      ? '주변을 살피는 눈빛이 조심스럽지만 무례하게 날카롭지는 않다.'
      : preset === 'playful' || preset === 'chatty'
        ? '표정에는 살짝 장난기와 여유가 섞여 있다.'
        : '표정은 차분하지만 말을 걸면 짧게는 받아줄 것 같다.';
  return `${placeLead} ${reason} 상대가 눈에 들어온다.\n${outfitText} ${posture}`;
}

function buildPublicVibe(preset: string, mood: string): string {
  if (preset === 'busy') return '바빠 보이지만, 정중하게 말을 걸면 짧게는 응해줄 분위기다.';
  if (preset === 'cold_psychopath' || preset === 'manipulative') return '쉽게 마음을 열 사람은 아니지만, 흥미가 생기면 상대를 시험하듯 대화를 이어갈 분위기다.';
  if (preset === 'sensual_direct' || preset === 'adult_flirty') return '처음 보는 사람이라도 끌림이 있으면 숨기지 않는 타입처럼 보이고, 말투의 온도가 빠르게 달라질 수 있다.';
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
  const safe = openingSafeTexts(location).map(text => encounterChoice(text, 'safe', 6, -5, 2, 8, 3));
  const caring = [
    '상대방이 바쁘거나 휴대전화에 집중하고 있는지 먼저 살핀다.',
    '부담스럽지 않게 적당한 거리를 두고 자연스럽게 타이밍을 본다.',
    '시선이 마주치면 가볍게 목례를 하고 반응을 살핀다.',
    '너무 갑작스럽지 않게 옆으로 비켜서서 정중하게 말을 꺼낸다.',
    '거절하면 바로 물러나겠다는 마음으로 편안하게 다가간다.',
    '오래 붙잡아두지 않겠다는 태도로 부드럽게 대화를 준비한다.'
  ].map(text => encounterChoice(text, 'caring', 3, -5, -2, 4, 1));
  const playful = [
    '저기요, 죄송한데 이상한 사람 아니고... 길 물어보려는 것도 아니에요.',
    '방금 서로 눈이 마주친 것 같아서, 용기 내서 한마디 걸어봐요.',
    '길에서 이렇게 말 거는 거 처음이라 솔직히 좀 긴장되네요.',
    '처음 뵙는 분한테 말 걸려니까 어색하긴 한데, 안 오면 후회할 것 같아서요.',
    '원래 이런 거 잘 못 하는데, 인상이 너무 좋으셔서 큰맘 먹고 다가왔어요.',
    '오늘 낼 수 있는 용기를 여기서 다 쓰는 것 같네요.'
  ].map(text => encounterChoice(text, 'playful', 5, -1, -3, 8, 4));
  const direct = [
    '바쁘지 않으시면 아주 잠깐만 얘기 나눠도 될까요?',
    '지나가다가 너무 제 스타일이셔서 그냥 지나치기가 어려웠어요.',
    '첫인상이 너무 밝고 좋으셔서, 부담 안 되는 선에서 인사 나누고 싶었어요.'
  ].map(text => encounterChoice(text, 'direct', 5, 8, 5, 7, -1));
  const exit = [
    '바빠 보이시니까 방해하지 말고 그냥 지나간다.',
    '오늘은 멀리서 본 걸로 만족하고 미련 없이 발걸음을 옮긴다.',
    '말 걸기엔 분위기가 좀 아닌 것 같아서 조용히 물러난다.'
  ].map(text => encounterChoice(text, 'exit', 0, 0, 0, 0, 0));
  return ensureEncounterChoiceVariety(pickEncounterChoiceMix([safe, caring, playful, direct, exit], ENCOUNTER_CHOICE_COUNT), unusualEncounterChoices(location, 0), []);
}

function openingSafeTexts(location: string): string[] {
  if (location.includes('서점')) return [
    '혹시 그 책 괜찮은가요? 저도 요즘 읽을 만한 책을 찾고 있어서요.',
    '같은 책장 앞에 계속 서 있게 됐는데, 어떤 장르 책 좋아하세요?',
    '방금 고르신 책 제목이 눈에 들어와서 그런데, 혹시 평소에 자주 읽으시는 편인가요?',
    '추천 코너 보다가 그쪽이랑 눈이 마주쳤는데, 혹시 재밌는 책 아시는 거 있어요?'
  ];
  if (location.includes('카페')) return [
    '여기 메뉴가 너무 많아서 고민인데, 어떤 게 맛있나요?',
    '주문 줄이 생각보다 기네요. 혹시 여기 자주 오시는 편이세요?',
    '자리가 거의 꽉 찬 것 같아서요. 혹시 옆자리 비어 있나요?',
    '기다리는 사람이 많아 정신없는데, 잠깐 양해 구하고 한마디 건네봐요.'
  ];
  if (location.includes('한강') || location.includes('산책')) return [
    '날씨가 좋아서 산책 나왔는데, 혼자 걷기엔 좀 심심하네요.',
    '여기 사진 예쁘게 나오는 곳 혹시 아시나요? 풍경이 너무 예뻐서요.',
    '바람이 시원해서 걷기 딱 좋네요. 혹시 이 근처에 사시나요?',
    '벤치에 잠깐 앉으려는데, 실례가 안 된다면 옆에 앉아도 될까요?'
  ];
  if (location.includes('전시')) return [
    '이 작품 되게 독특하지 않나요? 아까부터 오래 보시길래 궁금해서요.',
    '전시회 좋아하시나 봐요. 그림 보는 모습이 되게 인상 깊었어요.',
    '리플릿이 어디 있는지 혹시 아시나요? 안내데스크를 못 찾아서요.',
    '여기 촬영 가능한 구역인지 헷갈리는데, 혹시 아시나요?'
  ];
  if (location.includes('베이커리')) return [
    '이 빵 되게 맛있어 보이는데, 혹시 먹어본 적 있으세요?',
    '방금 빵이 새로 나와서 냄새가 너무 좋네요. 어떤 거 고르셨어요?',
    '여기서 제일 인기 있는 메뉴가 뭔지 혹시 아시나요?',
    '진열대 앞에서 같이 고민하다 보니 친근감이 생겨서 슬쩍 물어봐요.'
  ];
  if (location.includes('지하철')) return [
    '죄송한데 이번에 오는 열차가 어느 방향인지 아시나요?',
    '출구 안내판이 잘 안 보여서 그런데, OO번 출구 쪽이 어디인지 아시나요?',
    '환승하는 길이 조금 복잡하네요. 혹시 OO선 타려면 어디로 가야 하죠?',
    '안내 방송을 놓쳐서 그런데, 이번 역이 무슨 역이었나요?'
  ];
  if (location.includes('편의점')) return [
    '갑자기 비가 오네요. 우산 매대에 남은 게 있나 보러 왔어요.',
    '우산 종류가 몇 개 없는데, 어떤 게 제일 튼튼해 보여요?',
    '계산대 줄 기다리는 동안 슬쩍 봤는데, 인상이 너무 좋으셔서요.',
    '밖 날씨가 많이 궂은데, 잠깐 안에서 비 피하시는 중인가요?'
  ];
  return [
    '상황을 핑계로 정중하게 말을 건다.',
    '길을 묻는 척하지 않고, 짧게 인사부터 건넨다.',
    '상대의 반응을 살피며 부담 없는 거리에서 말을 꺼낸다.',
    '눈이 마주친 타이밍에 어색하지 않게 한마디 건넨다.',
    '길게 붙잡지 않겠다는 태도로 짧게 말을 시작한다.'
  ];
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
  if (candidate.contactPresetId === 'cold_psychopath' || candidate.contactPresetId === 'manipulative') return '“말 걸기 전에 머릿속으로 뭐라고 연습했는지 궁금하네요.”';
  if (candidate.contactPresetId === 'sensual_direct' || candidate.contactPresetId === 'adult_flirty') return '“갑자기요? 근데... 눈 피하지 않는 건 나쁘지 않네요.”';
  if (candidate.contactPresetId === 'chatty' || candidate.contactPresetId === 'playful') return '“갑자기요? ㅎㅎ 네, 말씀해보세요.”';
  if (candidate.contactPresetId === 'direct') return '“네. 길게만 아니면 괜찮아요.”';
  return '“아... 네. 괜찮아요. 무슨 말씀이세요?”';
}

function nextEncounterChoices(candidate: BlindDateCandidate, stats: StreetEncounterStats, turn: number, history: string[] = []): StreetEncounterChoice[] {
  const place = candidate.locationBase;
  const base = encounterChoicePool(place, candidate.contactPresetId, turn);
  if (turn >= 1 && stats.timePressure > 60) {
    base.unshift(encounterChoice('바쁘시면 여기까지만 할게요. 시간 뺏고 싶진 않아서요.', 'caring', 12, -14, -8, 5, 6));
  }
  if (turn >= 1 && stats.caution > 65) {
    base.unshift(encounterChoice('제가 너무 갑자기 다가온 것 같네요. 불편하면 바로 물러날게요.', 'caring', 13, -16, -9, 4, 6));
  }
  if (turn >= 1 && stats.affinity > 65 && stats.caution < 55) {
    base.unshift(encounterChoice('이렇게 편하게 이어질 줄 몰랐어요. 혹시 조금만 더 얘기해도 괜찮아요?', 'safe', 11, -7, -7, 8, 6));
  }
  const used = history.join('\n');
  const fresh = base.filter(choice => !used.includes(choice.text));
  return ensureEncounterChoiceVariety(shuffled(fresh.length >= ENCOUNTER_CHOICE_COUNT ? fresh : base), unusualEncounterChoices(place, turn), history);
}

function encounterChoicePool(place: string, preset: string, turn: number): StreetEncounterChoice[] {
  const directAffinity = preset === 'direct' ? 12 : preset === 'careful' ? 3 : 6;
  const directCaution = preset === 'careful' ? 16 : preset === 'busy' ? 11 : 8;
  const locationSafe = openingSafeTexts(place).concat([
    '혹시 여기 자주 오세요? 분위기가 좋아서요.',
    '제가 이 근처가 처음이라 잠깐 여쭤봐도 될까요?',
    '방금 표정이 되게 자연스러워 보여서, 괜히 말을 걸어보고 싶었어요.',
    '짧게만 물어볼게요. 지금 이 분위기, 저만 어색한 건 아니죠?',
    '처음 보는 사람이라 조심스럽긴 한데, 말 걸어도 괜찮을까요?'
  ]);
  const safeTextsByTurn = [
    locationSafe,
    [
      '잠깐 얘기 나눠보니까 대화가 편해서 좋네요. 이런 우연도 가끔은 괜찮은 것 같아요.',
      '처음엔 엄청 긴장했었는데, 대답을 잘해주셔서 이제 좀 마음이 놓여요.',
      '말투가 되게 차분하셔서 그런지, 저도 모르게 조심스럽게 말하게 되네요.',
      '오늘 여기 오길 잘했다는 생각이 드네요. 그쪽을 만난 덕분에요.',
      '대화가 이렇게 자연스럽게 이어질 줄 몰랐는데, 생각보다 대화 코드가 잘 맞는 것 같아요.',
      '이제 슬슬 가봐야 할 시간인데, 얘기가 재밌어서 조금 아쉽네요.'
    ],
    [
      '처음 만난 사이인데도 어색하지 않고 편안한 느낌이 들어요.',
      '짧은 대화였지만 오랫동안 기억에 남을 것 같아요. 그쪽도 그랬으면 좋겠어요.',
      '잠깐 얘기 나눠보니까 대화가 편해서 좋네요. 이런 우연도 가끔은 괜찮은 것 같아요.',
      '대화가 이렇게 자연스럽게 이어질 줄 몰랐는데, 생각보다 대화 코드가 잘 맞는 것 같아요.',
      '이제 슬슬 가봐야 할 시간인데, 얘기가 재밌어서 조금 아쉽네요.'
    ]
  ];
  const caringTexts = [
    '갑자기 아는 척해서 많이 놀라셨죠. 불편하게 해 드리려던 건 아니었어요.',
    '혹시 조금이라도 불편하시면 바로 말씀해주세요. 바로 물러날게요.',
    '시간 괜찮으신가요? 혹시 바쁘시면 여기서 짧게 마무리해도 괜찮아요.',
    '갑작스러운 질문이라 대답하기 곤란하시면 편하게 넘기셔도 됩니다.',
    '가셔야 할 길 방해한 것 같아서 죄송해요. 부담스럽지 않게 마음만 전하고 싶었어요.'
  ];
  const playfulTexts = [
    '사실 멀리서 보고 말 걸까 말까 속으로 백 번쯤 고민하다가 왔어요.',
    '제가 너무 긴장한 티가 났나요? 길에서 마음에 드는 사람한테 말 거는 게 쉬운 일이 아니네요.',
    '용기 내서 말 건 건데, 생각보다 친절하게 받아주셔서 정말 다행이에요.',
    '아까 눈 마주쳤을 때 저만 의식한 줄 알았는데, 아니었나 봐요.',
    '말 걸기 전에 혼자 무슨 말을 할지 연습했는데, 막상 마주치니까 다 잊어버렸어요.'
  ];
  const directTexts = [
    '괜찮으시면 번거로우시겠지만 딱 1분만 더 얘기 나눠도 될까요?',
    '말씀 나누다 보니 인상이 더 좋으셔서 조금 더 알고 싶어졌어요.',
    '오늘 헤어지고 나면 아쉬울 것 같아서, 다음에 차 한잔 같이 하고 싶어요.',
    '처음 뵙는 사이지만 그냥 지나치면 정말 후회할 것 같아서 솔직하게 다가왔어요.',
    '부담 주려는 건 아니고, 나중에라도 편하게 연락 주고받았으면 좋겠어요.'
  ];
  const exitTexts = [
    '오늘은 멀리서 본 걸로 만족하고 미련 없이 발걸음을 옮긴다.',
    '말 걸기엔 분위기가 좀 아닌 것 같아서 조용히 물러난다.',
    '바빠 보이시니까 방해하지 말고 그냥 지나간다.'
  ];
  const safe = (safeTextsByTurn[Math.min(turn, safeTextsByTurn.length - 1)] || safeTextsByTurn[0])
    .map(text => encounterChoice(text, 'safe', 9 + Math.min(turn, 2), -8, -5, 7, 4));
  const caring = caringTexts.map(text => encounterChoice(text, 'caring', 11, -12, -8, 5, 5));
  const playful = playfulTexts.map(text => encounterChoice(text, 'playful', 8, preset === 'careful' ? 2 : -4, -6, 10, 6));
  const direct = directTexts.map(text => encounterChoice(text, 'direct', directAffinity + Math.min(turn, 2), directCaution, 6, 8, preset === 'careful' ? -3 : 3));
  const exit = exitTexts.map(text => encounterChoice(text, 'exit', 1, -3, -5, 0, 1));
  const pool = pickEncounterChoiceMix([safe, caring, playful, direct, exit], 18);
  return shuffled(pool);
}

function encounterChoice(text: string, style: StreetEncounterChoice['style'], affinityDelta: number, cautionDelta: number, awkwardnessDelta: number, curiosityDelta: number, moodDelta = 0): StreetEncounterChoice {
  return {
    id: makeId('sechoice'),
    text: normalizeEncounterChoiceText(text),
    style,
    affinityDelta,
    cautionDelta,
    awkwardnessDelta,
    curiosityDelta,
    moodDelta
  };
}

function pickEncounterChoiceMix(groups: StreetEncounterChoice[][], count: number): StreetEncounterChoice[] {
  const picked: StreetEncounterChoice[] = [];
  for (const group of groups) {
    const item = shuffled(group)[0];
    if (item) picked.push(item);
  }
  const seen = new Set(picked.map(choice => choice.text));
  const rest = shuffled(groups.flat()).filter(choice => {
    if (seen.has(choice.text)) return false;
    seen.add(choice.text);
    return true;
  });
  return [...picked, ...rest].slice(0, count);
}

function ensureEncounterChoiceVariety(candidates: StreetEncounterChoice[], unusualChoices: StreetEncounterChoice[], history: string[]): StreetEncounterChoice[] {
  const used = history.join('\n');
  const seen = new Set<string>();
  const fresh = [...candidates, ...unusualChoices].filter(choice => {
    if (!choice.text || used.includes(choice.text) || seen.has(choice.text)) return false;
    seen.add(choice.text);
    return true;
  });
  const picked: StreetEncounterChoice[] = [];
  const pickOne = (items: StreetEncounterChoice[]) => {
    const item = shuffled(items).find(choice => !picked.some(existing => existing.text === choice.text));
    if (item) picked.push(item);
  };
  pickOne(unusualChoices.filter(choice => fresh.some(item => item.text === choice.text)));
  for (const style of shuffled<StreetEncounterChoice['style']>(['safe', 'caring', 'direct', 'exit'])) {
    if (picked.length >= ENCOUNTER_CHOICE_COUNT) break;
    pickOne(fresh.filter(choice => choice.style === style));
  }
  for (const choice of shuffled(fresh)) {
    if (picked.length >= ENCOUNTER_CHOICE_COUNT) break;
    if (!picked.some(existing => existing.text === choice.text)) picked.push(choice);
  }
  return shuffled(picked).slice(0, ENCOUNTER_CHOICE_COUNT);
}

function unusualEncounterChoices(place: string, turn: number): StreetEncounterChoice[] {
  const placeText = place.includes('서점')
    ? '책장 사이에서 갑자기 대사처럼 말하면 이상할까 봐, 그냥 작게 웃으며 인사해본다.'
    : place.includes('카페') || place.includes('베이커리')
      ? '메뉴 고르는 척을 너무 오래 해서 이제는 말을 걸 명분이 생긴 것 같다고 농담해본다.'
      : place.includes('한강') || place.includes('산책')
        ? '바람 핑계로 어색함을 반쯤 날려 보내고, 나머지 반은 솔직하게 인정해본다.'
        : place.includes('전시')
          ? '작품보다 지금 상황 해석이 더 어렵다고 웃으며 말을 꺼내본다.'
          : '이 상황을 자연스럽게 넘기는 법을 몰라서, 그냥 솔직하게 말해본다.';
  const texts = turn <= 0 ? [
    placeText,
    '원래 이런 성격이 아닌데, 오늘은 제 안의 용기를 다 끌어모아서 온 것 같아요.',
    '괜히 멋 부리거나 어른스러운 척하면 부자연스러울 것 같아서 어색한 대로 말씀드려요.',
    '지금 말 안 걸면 집에 가서 누웠을 때 두고두고 생각날 것 같더라고요.'
  ] : [
    placeText,
    '생각했던 것보다 제 목소리가 떨려서 저도 모르게 조금 당황했어요.',
    '일상 속에서 이런 우연한 만남이 생기니까 오늘 하루가 특별해지는 기분이에요.',
    '괜히 멋 부리거나 어른스러운 척하면 부자연스러울 것 같아서 어색한 대로 말씀드려요.'
  ];
  return texts.map(text => encounterChoice(text, 'playful', turn <= 0 ? 5 : 8, turn <= 0 ? -1 : -4, -5, 11, 5));
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
          'Give exactly 4 next user choices with clearly different patterns: gentle/safe observation, caring boundary check, playful/unexpected self-aware line, direct but respectful interest, or graceful exit when appropriate. Each choice must be a complete sentence, not cut off.',
          'At least one choice must be a slightly unusual but believable playful/self-aware line. It should feel specific, not generic.',
          'Avoid repeating prior choice wording. Make the choices specific to the current place, mood stats, and the woman character personality.',
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
    if (normalized.length >= ENCOUNTER_CHOICE_COUNT) break;
  }
  const fallback = nextEncounterChoices(candidate, stats, turn, history);
  const seen = new Set(normalized.map(choice => choice.text));
  return ensureEncounterChoiceVariety([...normalized, ...fallback.filter(choice => !seen.has(choice.text))], unusualEncounterChoices(candidate.locationBase, turn), history);
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
  let chance = CONTACT_SUCCESS_BASE_CHANCE;
  chance += stats.affinity * 0.75;
  chance += stats.curiosity * 0.25;
  chance -= stats.caution * 0.45;
  chance -= stats.awkwardness * 0.35;
  chance -= stats.timePressure * 0.25;
  if (candidate.contactPresetId === 'careful') chance -= 10;
  if (candidate.contactPresetId === 'easygoing' || candidate.contactPresetId === 'chatty') chance += 10;
  if (candidate.contactPresetId === 'busy') chance -= 8;
  if (candidate.contactPresetId === 'cold_psychopath' || candidate.contactPresetId === 'manipulative') chance -= 6;
  if (candidate.contactPresetId === 'sensual_direct' || candidate.contactPresetId === 'adult_flirty') chance += 12;
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
  if (candidate.contactPresetId === 'cold_psychopath' || candidate.contactPresetId === 'manipulative') return '“재밌네요. 쉽게 번호 주는 편은 아닌데, 당신 반응은 조금 더 보고 싶어요.”';
  if (candidate.contactPresetId === 'sensual_direct' || candidate.contactPresetId === 'adult_flirty') return '“좋아요. 솔직히 말하면, 아까부터 분위기가 좀 궁금했어요. 연락해요.”';
  if (candidate.contactPresetId === 'chatty' || candidate.contactPresetId === 'playful') return '“좋아요 ㅎㅎ 오늘 좀 웃겼어요. 나중에 또 얘기해요.”';
  return '“네, 괜찮아요. 길게 붙잡지 않은 게 오히려 좋았어요.”';
}

function fallbackBlindAnswer(candidate: BlindDateCandidate, question: string, roundIndex: number): string {
  const subject = question.replace(/[?？]\s*$/, '');
  const like = candidate.likes[roundIndex % Math.max(1, candidate.likes.length)] || '작은 약속';
  const hobby = candidate.hobbies[(roundIndex + 1) % Math.max(1, candidate.hobbies.length)] || '산책';
  const dislike = candidate.dislikes[roundIndex % Math.max(1, candidate.dislikes.length)] || '애매한 태도';
  const preset = String(candidate.contactPresetId || '');
  if (preset.includes('psychopath') || preset.includes('manipulative')) {
    return `${candidate.anonymousLabel}번: ${subject}라면, 나는 일단 상대가 어떤 표정을 숨기는지 볼 것 같아. 말보다 반응이 더 솔직하거든. 착한 척만 하는 사람은 금방 지루해져.`;
  }
  if (preset.includes('sensual') || preset.includes('flirty')) {
    return `${candidate.anonymousLabel}번: ${subject}는 솔직해야 해. 마음이든 욕망이든 애매하게 숨기는 사람보다, 선을 알고도 끌림을 인정하는 사람이 더 좋아.`;
  }
  if (preset.includes('chatty') || preset.includes('playful')) {
    return `${candidate.anonymousLabel}번: 나는 ${subject}라면 일단 분위기를 너무 무겁게 만들진 않을 것 같아. 대신 ${like} 얘기하듯 가볍게 떠보다가, 진짜 중요한 선은 장난 없이 말해.`;
  }
  if (preset.includes('busy')) {
    return `${candidate.anonymousLabel}번: ${subject}는 현실적으로 가능한지 먼저 볼 것 같아. 마음이 있어도 생활 리듬이 무너지면 오래 못 가니까, 말보다 시간을 어떻게 쓰는지 봐.`;
  }
  if (preset.includes('careful') || preset.includes('slow')) {
    return `${candidate.anonymousLabel}번: 나는 바로 들이대는 쪽은 부담스러워. 그래도 ${subject}라면 호감이 있는 사람한테는 선을 분명히 말하면서 천천히 받아줄 것 같아.`;
  }
  if (preset.includes('direct') || preset.includes('dry')) {
    return `${candidate.anonymousLabel}번: 솔직히 ${subject}에서 ${dislike}가 보이면 바로 신경 쓰여. 돌려 말하기보다 그 자리에서 짧게 확인하고 넘어가는 게 나아.`;
  }
  return `${candidate.anonymousLabel}번: 나는 ${subject}를 볼 때 말투보다 행동을 더 믿는 편이야. ${hobby}처럼 편한 순간에도 같은 태도인지 보면 조금 알 수 있을 것 같아.`;
}

function committedBlindAnswer(candidate: BlindDateCandidate, question: string, roundIndex: number): string {
  const subject = question.replace(/[?？]\s*$/, '');
  const preset = String(candidate.contactPresetId || '');
  const like = candidate.likes[roundIndex % Math.max(1, candidate.likes.length)] || '솔직한 태도';
  const dislike = candidate.dislikes[(roundIndex + 1) % Math.max(1, candidate.dislikes.length)] || '애매하게 빠지는 말';
  if (/자\?|밤 11시|카톡/.test(question)) {
    if (preset.includes('sensual') || preset.includes('flirty')) return '호감 있으면 바로 “안 자”라고 답해. 재미없으면 읽고 다음 날 답하고, 끌리면 그 밤 분위기를 일부러 조금 더 이어가.';
    if (preset.includes('psychopath') || preset.includes('manipulative')) return '나는 일부러 바로 답 안 하고 몇 분 늦게 보내. 상대가 안달 나는지 보면 진심인지 장난인지 금방 보여.';
    if (preset.includes('careful') || preset.includes('slow')) return '좋아하는 사람이면 짧게 답은 해. 대신 너무 늦은 분위기로 몰고 가면 선은 그을 것 같아.';
    return '호감 있으면 답하고 아니면 안 해. 밤 11시 “자?”는 말보다 타이밍이 너무 티 나서, 끌리는 사람한테만 받아줄 것 같아.';
  }
  if (/키스|스킨십|손잡|호캉스|집 안 가고 싶어|넷플릭스|차 안/.test(question)) {
    if (preset.includes('sensual') || preset.includes('flirty')) return `호감 있으면 피하지 않아. ${subject}에서는 분위기와 눈치가 맞으면 꽤 솔직하게 받아주는 편이야.`;
    if (preset.includes('psychopath') || preset.includes('manipulative')) return `나는 바로 반응하지 않고 한 박자 멈춰서 봐. ${subject}에서 상대가 조급해지면 흥미가 식고, 여유 있으면 더 끌려.`;
    if (preset.includes('careful') || preset.includes('slow')) return `나는 속도가 중요해. ${subject}라도 마음이 있으면 거절만 하진 않지만, 갑작스러우면 잠깐 멈추라고 말할 거야.`;
    return `좋으면 받아주고 싫으면 바로 뺄 거야. ${subject}는 말보다 그 순간의 예의와 눈치가 더 중요해.`;
  }
  if (/무인도|좀비|벌레|탕수육|민트초코|라면|치킨|로또|방귀|흑역사/.test(question)) {
    if (preset.includes('playful') || preset.includes('chatty')) return `나는 바로 리액션부터 나올 것 같아. ${subject}라면 장난치면서도 결론은 확실히 말하고, 웃긴 쪽으로 분위기를 끌고 갈래.`;
    if (preset.includes('psychopath') || preset.includes('manipulative')) return `나는 당황한 척은 안 해. ${subject}라면 상대가 허둥대는지 먼저 보고, 쓸모 있으면 같이 움직이고 아니면 혼자 정리할 거야.`;
    return `나는 현실적으로 처리하는 쪽이야. ${subject}라면 감정표현은 짧게 하고, 바로 할 수 있는 행동부터 할 것 같아.`;
  }
  if (preset.includes('psychopath') || preset.includes('manipulative')) {
    return `나는 ${subject}에서 상대 반응부터 봐. 대답은 숨기지 않지만, ${dislike}가 보이면 일부러 더 차갑게 굴어서 어디까지 흔들리는지 확인할 거야.`;
  }
  if (preset.includes('sensual') || preset.includes('flirty')) {
    return `나는 ${subject}라면 애매하게 빼지 않아. 호감이 있으면 ${like}처럼 솔직하게 드러내고, 없으면 기대하게 만들지 않을 거야.`;
  }
  if (preset.includes('careful') || preset.includes('slow')) {
    return `나는 ${subject}에 바로 휩쓸리진 않아. 그래도 마음이 있으면 분명히 티 내고, 불편한 선은 그 자리에서 말할 거야.`;
  }
  if (preset.includes('direct') || preset.includes('dry')) {
    return `나는 ${subject}에 대해 돌려 말하지 않는 편이야. 좋으면 좋다, 싫으면 싫다로 빨리 정리하고 괜히 여지 남기지 않아.`;
  }
  return `나는 ${subject}라면 말보다 행동을 볼 것 같아. ${like}는 좋지만 ${dislike}가 보이면 호감이 있어도 바로 식어.`;
}

function isDeflectiveBlindAnswer(text: string): boolean {
  const clean = String(text || '').trim();
  const questionMarks = (clean.match(/[?？]/g) || []).length;
  const reverseQuestionHits = [
    /그쪽은/,
    /당신은/,
    /어떻게\s*할래/,
    /어떻게\s*생각/,
    /궁금/,
    /물어봐/,
    /원할\s*것\s*같/,
    /정답이\s*정해/,
    /제가\s*눈을\s*감아줄까요/,
    /제가\s*어떻게\s*반응할지/
  ].filter(pattern => pattern.test(clean)).length;
  return questionMarks >= 2 || reverseQuestionHits >= 2 || /^글쎄요?[,.…\s]/.test(clean);
}

function normalizeBlindAnswerText(text: string, candidate: BlindDateCandidate, question: string, roundIndex: number): string {
  const clean = String(text || '').trim();
  if (!clean || isDeflectiveBlindAnswer(clean)) return committedBlindAnswer(candidate, question, roundIndex);
  return clean;
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
          'Critical answer rule: answer the user question directly in the first sentence with a concrete choice, action, confession, or boundary. Do not start with "글쎄요".',
          'Do not dodge by asking the user back. Banned patterns: "그쪽은요?", "당신은요?", "어떻게 할래요?", "제가 뭘 원할 것 같아요?", "궁금해요", "제가 물어볼까요".',
          'Reserved or manipulative candidates may tease, but they still must reveal their own stance before any teasing. At most one short rhetorical question across the whole answer, and only after a clear answer.',
          'Avoid same-template answers. If candidates share a value, make one answer practical, one bold, one playful, one guarded-but-specific, or one direct according to the fixed profile.',
          'Across the same round, no two answers may start with the same sentence shape or end with the same conclusion phrase.',
          'Do not make all candidates equally kind, equally flirty, or equally dramatic.',
          'Natural Korean, 1 concise messenger-style paragraph per candidate, 1-2 sentences, no vague interview tone.',
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
          text: normalizeBlindAnswerText(String(raw?.text || answers.find(item => item.candidateId === candidate.id)?.text || ''), candidate, question, roundIndex),
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
  if (id.includes('psychopath') || id.includes('manipulative')) {
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
      initiative: 46,
      messageStyle: 'balanced',
      lifeRhythm: { eveningActive: true },
      uniqueBehavior: { proactiveTone: 'cool', edgeProfile: 'testing_boundaries' }
    };
  }
  if (id.includes('sensual') || id.includes('flirty')) {
    return {
      replyPresetId: 'adult_flirty',
      proactivePatience: 4,
      responseDelayMin: 0,
      responseDelayMax: 90,
      messageGapMin: 1,
      messageGapMax: 3,
      responseTime: 8,
      thinkingTime: 3,
      reactivity: 9,
      tone: 8,
      frequencyMinutes: 45,
      initiative: 62,
      messageStyle: 'burst',
      lifeRhythm: { eveningActive: true, weekendActive: true },
      uniqueBehavior: { proactiveTone: 'late_night', edgeProfile: 'sensual_flirt' }
    };
  }
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
          'Answer the user message directly before teasing. Give a concrete stance, action, confession, or boundary.',
          'Do not dodge by asking the user back. Avoid "그쪽은요?", "당신은요?", "어떻게 할래요?", "궁금해요", and answerless teasing.',
          'If the candidate is cold, manipulative, or provocative, make the answer sharper, but still commit to a clear response.',
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
    if (isDeflectiveBlindAnswer(answerText)) {
      answerText = committedBlindAnswer(candidate, userText, previousTurns.length + 1);
    }
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
    candidate.snsPreview ? `소개팅 자리에 온 이유: ${candidate.snsPreview}` : '',
    candidate.callPreview ? `소개팅남에게 하고 싶은 말: ${candidate.callPreview}` : '',
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
    `소개팅 자리에 온 이유: ${candidate.snsPreview || '(없음)'}`,
    `소개팅남에게 하고 싶은 말: ${candidate.callPreview || '(없음)'}`,
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
  const completedCharacter = completeGeneratedCharacter(character, {
    state,
    source: 'blind_date',
    modeLabel: session.mode === 'worldcup' ? '이상형 월드컵' : session.mode === 'encounter' ? '우연한 만남' : '블라인드 소개팅',
    personalitySummary: candidate.personalitySummary,
    speechStyle: candidate.speechStyle,
    relationshipStyle: candidate.relationshipStyle,
    likes: candidate.likes,
    dislikes: candidate.dislikes,
    hobbies: candidate.hobbies,
    job: candidate.job,
    locationName: candidate.locationBase,
    snsStyle: candidate.snsStyle,
    phonePrompt: candidate.callPreview,
    appearancePrompt: appearanceText,
    imageIdentityPrompt: candidate.imagePrompt,
    profileImage: candidate.profileImageUri,
    referenceImages: candidate.profileImageUri ? [candidate.profileImageUri] : [],
    profileAvatarPrompt: candidate.imagePrompt,
    profileCoverPrompt: coverPromptForCandidate(candidate),
    firstMessage: firstChatMessage,
    memory
  });
  const completedSession = {
    ...session,
    status: 'completed' as const,
    selectedCandidateId: candidate.id,
    completedAt: now
  };
  const next: SNSGodState = {
    ...state,
    characters: [...state.characters, completedCharacter],
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
          content: session.mode === 'encounter'
            ? `${candidate.name}과 우연한 만남에서 연락처를 교환해 대화를 시작했습니다.`
            : `${candidate.name}과 블라인드 데이트에서 매칭되어 대화를 시작했습니다.`,
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
    snsPreview: `${first.snsPreview || first.snsStyle} / ${second.snsPreview || second.snsStyle}`.slice(0, 180),
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
          'imagePrompt must be English only and must not be a generic profile-photo template.',
          'imagePrompt must describe a distinct candid dating-app snapshot with different body silhouette, makeup, lip color, outfit category, accessory, pose, camera distance, and background from both source candidates.',
          'imagePrompt must include the exact phrase "low quality" and may include one or more variation triggers exactly as written, such as "19-year-old Korean adult woman taking an Instagram selfie", "학생스타일의 메이크업", "직장인 메이크업", "pink lips", "coral lips", or "K-pop idol inspired makeup" to avoid duplicate faces.',
          'Repurpose snsPreview as "why she came to this blind date" in Korean, and callPreview as "what she wants to say to the blind-date man" in Korean.',
          'Do not write SNS captions, hashtags, phone-call previews, greeting templates, or safe generic self-introductions in snsPreview/callPreview.',
          'Make both lines personality-based, realistic, and sharper than ordinary dating-app copy. Adult provocative archetypes may mention attraction, tension, jealousy, skinship boundaries, and chemistry without graphic sexual detail.',
          'School-uniform inspired styling is allowed when the candidate is explicitly an adult age 19 or older.'
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
