import { BlindDateMode, CandidateAppearance } from '../types';

type OutfitExposure = 'low' | 'medium' | 'medium-high' | 'high';

type OutfitPreset = {
  id: string;
  useCase: 'daily' | 'date' | 'office' | 'sporty' | 'uniform' | 'adult' | 'fantasy';
  exposure: OutfitExposure;
  fit: string;
  prompt: string;
  avoid: string;
};

type RandomPromptOptions = {
  mode?: BlindDateMode;
  age?: number;
  nationality?: string;
  appearance: CandidateAppearance;
  seedIndex: number;
  outfitSlot?: number;
  usedOutfitIds?: string[];
};

export const HAIR_STYLES = [
  'long dark brown layered hair',
  'long glossy black hair with center part',
  'long layered black hair with curtain bangs',
  'long dark brown hair with soft face-framing layers',
  'long straight black hair with see-through bangs',
  'long straight ash brown hair with see-through bangs',
  'long silky black hair with blunt full bangs',
  'long loose waves with Korean curtain bangs',
  'medium wavy chestnut hair',
  'long wavy chestnut hair',
  'long wavy black hair with soft C-curl ends',
  'long chestnut brown hair with airy bangs',
  'long mocha brown layered hair',
  'long honey brown wavy hair',
  'long ash beige straight hair',
  'long soft black hair with side-swept bangs',
  'long layered hair with Korean side bangs',
  'long idol-style wavy hair with volume',
  'long black hair with subtle S-curl waves',
  'long brown hair with soft natural waves',
  'long straight hair with thin see-through bangs',
  'long dark hair with rounded face-framing cut',
  'long layered hair with curled ends',
  'long natural black hair with glossy finish',
  'long reddish brown loose perm hair',
  'long soft loose perm hair',
  'long black hippie perm hair',
  'long soft brown hippie perm hair',
  'long gradient hair',
  'medium layered hush cut hair',
  'medium Korean layered hair with airy bangs',
  'medium brown C-curl hair',
  'medium straight black hair with curtain bangs',
  'medium soft wavy hair with side part',
  'medium ash brown layered hair',
  'medium wolf hush cut hair',
  'medium idol-style loose perm hair',
  'medium chestnut hair with face-framing bangs',
  'medium black hair with soft inward curls',
  'shoulder-length Korean hush cut hair',
  'shoulder-length layered hair with see-through bangs',
  'shoulder-length soft brown C-curl hair',
  'shoulder-length wavy lob hair',
  'shoulder-length black hair with curtain bangs',
  'shoulder-length straight hair with blunt bangs',
  'shoulder-length layered cut with airy volume',
  'shoulder-length idol bob hair',
  'shoulder-length brown hair with soft waves',
  'shoulder-length natural black hair with side bangs',
  'sleek black long bob hair',
  'sleek brown lob hair with center part',
  'straight blunt lob hair with full bangs',
  'soft wavy lob hair with side part',
  'Korean layered lob hair',
  'short blunt bob hair',
  'short sleek bob hair with blunt bangs',
  'short rounded bob hair',
  'short black bob hair with see-through bangs',
  'short airy bob hair',
  'short French bob hair with soft bangs',
  'low ponytail with loose face-framing strands',
  'high ponytail with airy bangs',
  'high ponytail with see-through bangs',
  'high ponytail with face-framing strands',
  'sleek high ponytail with center part',
  'voluminous high ponytail with airy bangs',
  'low ponytail with soft curled ends',
  'sleek low ponytail with middle part',
  'half-up wavy hair',
  'half-up half-down wavy hair',
  'half-up hair with ribbon',
  'half-up hair with curled ends',
  'half-up bun with loose strands',
  'half-up twin mini buns',
  'messy bun with soft flyaway hair',
  'messy bun with soft bangs',
  'low messy bun with face-framing strands',
  'sleek ballerina bun',
  'soft low bun with side bangs',
  'double bun hair with loose strands',
  'space buns with wavy hair',
  'messy space buns with bangs',
  'cute twin buns with face-framing hair',
  'two low pigtails with wavy ends',
  'low twin braids with see-through bangs',
  'loose twin braids with face-framing strands',
  'side braid with soft bangs',
  'single loose braid over shoulder',
  'braided half-up hair',
  'thin accent braids with long wavy hair',
  'baby braids with loose waves',
  'ribbon-tied twin braids',
  'long twin tails hair',
  'high twin tails with straight bangs',
  'high twin tails with curled ends',
  'low twin tails with soft waves',
  'short twin tails with ribbons',
  'voluminous anime twin tails',
  'drill twin tails hair',
  'spiral twin tails hair',
  'odango buns with long twin tails',
  'magical girl odango hair',
  'high double buns with long side locks',
  'natural black hime cut',
  'long black hime cut with blunt bangs',
  'traditional hime cut with side locks',
  'modern hime cut with layered ends',
  'short hime cut bob hair',
  'long straight hime cut with glossy hair',
  'dark brown hime cut with soft bangs',
  'anime princess hime cut hair',
  'jellyfish cut hair',
  'long jellyfish cut hair',
  'black jellyfish cut with blunt bangs',
  'two-tone jellyfish cut hair',
  'anime jellyfish haircut',
  'layered jellyfish hair with long back',
  'short jellyfish bob hair',
  'long hair with ahoge',
  'short hair with ahoge',
  'messy anime hair with ahoge',
  'anime heroine long straight hair',
  'anime schoolgirl bob hair',
  'anime short tomboy hair',
  'anime wolf cut hair',
  'anime fluffy short hair',
  'asymmetrical anime bob hair',
  'K-pop idol high ponytail with curled ends',
  'Y2K layered hair with baby braids',
  'Y2K high ponytail with face-framing strands',
  'Y2K spiky bun hair',
  'Y2K half-up pigtails',
  'Y2K straight hair with hair clips',
  'long hair with colorful hair clips',
  'long wavy hair with ribbon accessories',
  'idol stage hair with glitter clips',
  'high ponytail with ribbon',
  'twin tails with ribbon bows',
  'braided pigtails with ribbons',
  'half-up hair with pearl hairpins',
  'sleek hair with side hair clips',
  'wet look long black hair',
  'slicked-back long hair',
  'sleek center-parted idol hair',
  'glossy straight hair with sharp part',
  'high-fashion wet hair look',
  'soft messy bedhead waves',
  'short wolf cut hair',
  'wolf cut with airy bangs',
  'long wolf cut hair',
  'medium wolf cut with soft layers',
  'black wolf cut hair',
  'brown wolf cut with loose waves',
  'hush cut with see-through bangs',
  'long hush cut hair',
  'layered hush cut with face-framing strands',
  'Korean hush cut with natural volume',
  'soft brown hippie perm hair'
];

export const HAIR_COLOR_TAGS = [
  'natural black hair',
  'natural black hair',
  'natural black hair',
  'natural black hair',
  'natural black hair',
  'black hair',
  'black hair',
  'black hair',
  'soft black hair',
  'soft black hair',
  'blue-black hair',
  'dark brown hair',
  'dark brown hair',
  'dark brown hair',
  'chestnut brown hair',
  'chestnut brown hair',
  'mocha brown hair',
  'ash brown hair',
  'milk tea brown hair',
  'honey brown hair',
  'reddish brown hair',
  'natural black hair',
  'blue-black hair',
  'dark brown hair',
  'chestnut brown hair',
  'mocha brown hair',
  'ash brown hair',
  'ash beige hair',
  'honey brown hair',
  'reddish brown hair',
  'burgundy hair',
  'wine red hair',
  'rose brown hair',
  'pink brown hair',
  'milk tea brown hair',
  'silver ash hair',
  'platinum blonde hair',
  'soft pink hair',
  'lavender hair',
  'smoky purple hair',
  'two-tone hair',
  'split-dye hair',
  'inner color hair',
  'ombre hair',
  'gradient hair',
  'black and blonde split-dye hair',
  'black hair with blonde inner color',
  'brown hair with pink inner color',
  'ash brown hair with blue inner color',
  'hidden color hair'
];

const RARE_HAIR_COLOR_PATTERN = /\b(?:brown|chestnut|mocha|ash|beige|honey|reddish|pink|lavender|purple|silver|platinum|gradient|ombre|two-tone|split-dye|inner color|hidden color|blonde|burgundy|wine red|rose brown|milk tea)\b/i;
const COMMON_HAIR_STYLES = HAIR_STYLES.filter(style => !RARE_HAIR_COLOR_PATTERN.test(style));
const RARE_HAIR_STYLES = HAIR_STYLES.filter(style => RARE_HAIR_COLOR_PATTERN.test(style));
const COMMON_HAIR_COLORS = HAIR_COLOR_TAGS.filter(color => !RARE_HAIR_COLOR_PATTERN.test(color));
const RARE_HAIR_COLORS = HAIR_COLOR_TAGS.filter(color => RARE_HAIR_COLOR_PATTERN.test(color));

const HAIR_BANG_TAGS = [
  'with see-through bangs',
  'with airy bangs',
  'with curtain bangs',
  'with full blunt bangs',
  'with wispy bangs',
  'with side-swept bangs',
  'with choppy bangs',
  'with baby bangs',
  'with long side bangs',
  'with face-framing strands',
  'with soft layered bangs',
  'with Korean bangs',
  'with anime blunt bangs',
  'with asymmetrical bangs',
  'with parted bangs'
];

const STYLE_IDENTITIES = [
  'ordinary non-celebrity vibe',
  'clean influencer-like styling',
  'beautiful model-like presence',
  'K-pop idol inspired styling',
  'light natural makeup vibe',
  'soft student-style makeup on a clearly adult woman',
  'clean innocent makeup',
  'glamorous evening makeup',
  'fresh daily makeup'
];

const BODY_PROMPTS = [
  'very slim body, narrow frame',
  'slender body, delicate shoulders',
  'average realistic body, balanced proportions',
  'soft chubby body, rounder natural silhouette',
  'curvy voluptuous body, fuller hips and bust',
  'toned athletic body, visible posture strength',
  'slim body with large bust',
  'glamorous body with very large bust, adult styling',
  'small-busted slim body, delicate chest line',
  'petite body with compact proportions',
  'tall long-legged body, model-like proportions',
  'soft average body with natural waist'
];

const EXPRESSIONS = [
  'quiet neutral expression',
  'small shy smile',
  'wide friendly smile',
  'cool unsmiling gaze',
  'playful teasing smile',
  'awkward first-meeting smile',
  'thoughtful distant gaze',
  'laughing candid expression',
  'soft tired after-work expression',
  'confident direct gaze',
  'slightly surprised eye contact',
  'gentle innocent smile'
];

const POSES = [
  'standing naturally with one hand resting at the waist',
  'seated at a cafe table with hands visible',
  'walking candidly while looking back at the camera',
  'mirror selfie pose with phone partly visible',
  'leaning lightly against a wall',
  'arms relaxed at sides, natural posture',
  'one hand brushing hair behind ear',
  'sitting on a bench with knees angled to one side',
  'standing with one hand in pocket',
  'hands lightly clasped in front, no handheld props',
  'over-the-shoulder pose',
  'slightly leaning forward toward the camera',
  'full-body standing pose',
  'waist-up portrait pose',
  'POV date snapshot pose'
];

const BACKGROUNDS = [
  'small independent cafe in Seoul',
  'quiet bookstore aisle',
  'Han River walking path',
  'Seongsu brick alley',
  'university library steps',
  'modern office elevator lobby',
  'subway platform',
  'flower shop front',
  'minimal apartment room',
  'restaurant table',
  'city street crosswalk',
  'department store cosmetics floor',
  'hotel lobby lounge',
  'rooftop evening city view',
  'neighborhood bakery front',
  'plant-filled apartment balcony',
  'rainy bus stop',
  'vinyl record shop',
  'cozy laundromat',
  'photo booth curtain'
];

const LIGHTING = [
  'warm soft lighting',
  'natural daylight',
  'indoor ambient lighting',
  'golden hour sunlight',
  'soft window light',
  'night street flash lighting',
  'overcast outdoor light',
  'warm cafe lamp light',
  'clean studio-like indoor light',
  'soft backlight through hair'
];

const COMPOSITIONS = [
  'full-body shot',
  'upper-body shot',
  'waist-up portrait',
  'POV date photo',
  'low-angle phone photo',
  'top-view candid angle',
  'eye-level portrait',
  'three-quarter body shot',
  'close-up selfie crop',
  'knee-up street snapshot'
];

const QUALITY_PROMPTS = [
  'ultra photorealistic',
  '8k',
  'masterpiece',
  'best quality',
  'highly detailed'
];

const OUTFIT_PRESETS: OutfitPreset[] = [
  { id: 'outfit_0001', useCase: 'daily', exposure: 'low', fit: 'cropped fitted outerwear, tight skinny bottom', prompt: 'a black fitted leather biker jacket with a cropped waist, layered over a plain white top, black high-waisted skinny pants, slim city street styling, sharp structured shoulders, compact silhouette', avoid: 'gown, swimsuit, school uniform, fantasy armor' },
  { id: 'outfit_0002', useCase: 'adult', exposure: 'high', fit: 'very tight bodycon, short mini length', prompt: 'a burgundy bodycon mini dress with a corset-like waist panel, deep neckline, sleeveless upper cut, very tight fit through the torso and hips, short clubwear silhouette', avoid: 'loose oversized fit, office blazer, sportswear' },
  { id: 'outfit_0003', useCase: 'date', exposure: 'medium', fit: 'fitted cropped top, tight mini skirt', prompt: 'a white short-sleeve cropped cardigan with black button accents, paired with a high-waisted gray bodycon mini skirt, clean fitted summer styling, compact waist emphasis', avoid: 'oversized sweater, long skirt, heavy coat' },
  { id: 'outfit_0004', useCase: 'adult', exposure: 'medium-high', fit: 'loose short romper with cinched waist', prompt: 'a white sleeveless ruffled romper with a soft gathered neckline, gold button details, slim belt at the waist, loose airy shorts, resort poolside styling', avoid: 'leather, dark business suit, winter knit' },
  { id: 'outfit_0005', useCase: 'uniform', exposure: 'medium', fit: 'cropped fitted cardigan, structured pleated mini skirt', prompt: 'a beige cropped button cardigan layered over a white collared shirt, matching beige pleated mini skirt, plain white knee socks rising just below the knees, rolled white cuffs, neat preppy styling, fitted waist with a soft school-inspired silhouette', avoid: 'bikini, latex, evening gown' },
  { id: 'outfit_0006', useCase: 'adult', exposure: 'high', fit: 'minimal bikini, tight swim fit', prompt: 'a white ruffled off-shoulder bikini with frill trim along the top and bottoms, minimal beachwear coverage, soft romantic swim styling', avoid: 'office wear, heavy outerwear, sneakers' },
  { id: 'outfit_0007', useCase: 'sporty', exposure: 'medium', fit: 'fitted short blouse, tight mini skirt', prompt: 'a white short-sleeve button shirt with a small emblem patch, navy neck scarf, bright blue high-waisted bodycon mini skirt, fitted flight-attendant-inspired styling', avoid: 'loose hoodie, long pants, fantasy costume' },
  { id: 'outfit_0008', useCase: 'adult', exposure: 'high', fit: 'lace crop top, flared micro mini skirt', prompt: 'a black lace bralette-style crop top with thin straps, paired with a black pleated micro mini skirt, sheer lace texture, tight upper fit and flared lower silhouette', avoid: 'casual denim, office blouse, long coat' },
  { id: 'outfit_0009', useCase: 'sporty', exposure: 'medium-high', fit: 'tight cropped tee, short fitted shorts', prompt: 'a navy cropped graphic baby tee, white low-rise fitted shorts with belt detail, sporty casual styling, tight compact fit, exposed midriff', avoid: 'formal dress, heavy knitwear' },
  { id: 'outfit_0010', useCase: 'date', exposure: 'medium', fit: 'fitted long-sleeve top, tight pencil skirt with high slit', prompt: 'a soft pink fitted long-sleeve knit top tucked into a beige high-waisted pencil skirt, front thigh slit, black sheer tights, elegant tight silhouette', avoid: 'swimsuit, oversized hoodie, pleated school skirt' },
  { id: 'outfit_0011', useCase: 'adult', exposure: 'high', fit: 'tight satin cheongsam, long length with high slit', prompt: 'a silver satin cheongsam-style evening dress with red piping, floral embroidery, body-hugging waist and hips, high side slit, glossy formal fabric', avoid: 'casual sneakers, denim shorts' },
  { id: 'outfit_0012', useCase: 'adult', exposure: 'high', fit: 'tight mini slip dress', prompt: 'a black spaghetti-strap bodycon mini dress, simple straight neckline, very tight fit, short hem, paired with sheer black stockings', avoid: 'loose fit, school uniform, sports bra' },
  { id: 'outfit_0013', useCase: 'adult', exposure: 'high', fit: 'tight long dress, high slit', prompt: 'a red floral halter-style long evening dress, glossy satin-like fabric, bodycon torso, dramatic thigh-high side slit, elegant banquet styling', avoid: 'casual hoodie, baseball cap' },
  { id: 'outfit_0014', useCase: 'daily', exposure: 'medium', fit: 'loose romper, cinched waist', prompt: 'a white off-shoulder short romper with puff sleeves, pink printed belt, soft gathered waist, loose playful summer fit', avoid: 'black leather, formal blazer' },
  { id: 'outfit_0015', useCase: 'adult', exposure: 'high', fit: 'tight one-piece swimsuit', prompt: 'a black ribbed halter one-piece swimsuit with a deep front cutout and side tie details, tight swimwear fit, minimal resort styling', avoid: 'winter coat, office skirt' },
  { id: 'outfit_0016', useCase: 'fantasy', exposure: 'high', fit: 'tight cutout bodysuit, frilled apron elements', prompt: 'a white maid-inspired cutout bodysuit with black piping, frilled trim, halter straps, garter-style details, very tight costume fit', avoid: 'casual realism, office wear' },
  { id: 'outfit_0017', useCase: 'uniform', exposure: 'medium', fit: 'tight sleeveless top, loose pleated mini skirt', prompt: 'a white sleeveless knit top with a gray bow tie detail, paired with gray pleated mini shorts or skirt, white knee socks with dark double stripes rising just below the knees, sporty school-inspired look, fitted upper body with loose lower pleats', avoid: 'evening gown, swimwear' },
  { id: 'outfit_0018', useCase: 'adult', exposure: 'high', fit: 'tight lace bodysuit', prompt: 'a pale blue lace lingerie bodysuit with structured cups, sheer floral lace panels, thin straps, tight sculpted fit', avoid: 'casual denim, outdoor coat' },
  { id: 'outfit_0019', useCase: 'fantasy', exposure: 'high', fit: 'sheer tight mini dress', prompt: 'a sheer white lace nurse-inspired mini dress with a large red bow at the chest, red fishnet stockings, tight costume silhouette', avoid: 'realistic hospital uniform, casual streetwear' },
  { id: 'outfit_0020', useCase: 'daily', exposure: 'medium', fit: 'fitted blazer mini dress, flared hem', prompt: 'a black double-breasted blazer mini dress with long sleeves, fitted waist, slightly flared skirt hem, polished dark feminine styling', avoid: 'bikini, latex catsuit' },
  { id: 'outfit_0021', useCase: 'date', exposure: 'medium', fit: 'fitted knit top, short wrap skirt', prompt: 'an ivory ribbed long-sleeve fitted knit top, cream wrap mini skirt with side tie, white sneakers, soft casual date styling, slim but not bodycon fit', avoid: 'lingerie, fantasy costume' },
  { id: 'outfit_0022', useCase: 'office', exposure: 'medium', fit: 'fitted blazer, tight mini skirt', prompt: 'a black fitted business blazer over a white shirt, burgundy tie, black high-waisted bodycon mini skirt, sharp office-uniform styling', avoid: 'swimsuit, loose streetwear' },
  { id: 'outfit_0024', useCase: 'uniform', exposure: 'medium', fit: 'fitted shirt, loose pleated mini skirt', prompt: 'a white long-sleeve button shirt with a red neck scarf, navy pleated mini skirt, clean school-inspired styling, fitted waist and crisp fabric', avoid: 'leather catsuit, evening gown' },
  { id: 'outfit_0025', useCase: 'sporty', exposure: 'medium', fit: 'cropped sweatshirt, loose pleated mini skirt', prompt: 'a sky-blue cropped long-sleeve sweatshirt, white pleated mini skirt, white socks, soft sporty casual styling, relaxed top with a short flared skirt', avoid: 'lace lingerie, business blazer' },
  { id: 'outfit_0026', useCase: 'uniform', exposure: 'medium', fit: 'loose vest, pleated mini skirt', prompt: 'a gray sleeveless knit vest over a white short-sleeve blouse, black ribbon tie, dark plaid pleated mini skirt, soft preppy school styling', avoid: 'bodycon dress, swimwear' },
  { id: 'outfit_0027', useCase: 'sporty', exposure: 'medium', fit: 'tight sports bra, compression leggings', prompt: 'a black sports bra with red underband, white high-waisted compression leggings, black calf panels, athletic tight performance fit', avoid: 'skirt, blazer, gown' },
  { id: 'outfit_0030', useCase: 'fantasy', exposure: 'medium-high', fit: 'fitted crop camisole, layered frill shorts', prompt: 'a white cropped camisole with purple bow accents, layered lavender frill shorts over black lace bloomers, cute costume-like styling, fitted top with puffed lower volume', avoid: 'formal blazer, denim streetwear' },
  { id: 'outfit_0031', useCase: 'sporty', exposure: 'medium', fit: 'fitted tank, flared tennis skirt', prompt: 'a white sleeveless tennis dress with black trim, fitted upper body and flared pleated skirt, clean athletic court styling', avoid: 'lingerie, office tie' },
  { id: 'outfit_0034', useCase: 'uniform', exposure: 'medium', fit: 'fitted sleeveless vest, loose pleated mini skirt', prompt: 'a navy sleeveless button knit vest, beige plaid pleated mini skirt, cream canvas tote bag, casual preppy outdoor styling, fitted top with loose short skirt', avoid: 'latex, formal gown' },
  { id: 'outfit_0035', useCase: 'sporty', exposure: 'medium', fit: 'tight sports bra, tight leggings', prompt: 'a white seamless sports bra and matching high-waisted leggings, sculpted athletic fit, clean minimal activewear', avoid: 'mini skirt, blazer' },
  { id: 'outfit_0036', useCase: 'adult', exposure: 'medium', fit: 'tight camisole, tight leather mini skirt', prompt: 'a black spaghetti-strap camisole tucked into a silver-gray faux leather mini skirt with a side slit, fitted nightlife styling, glossy tight lower silhouette', avoid: 'loose sweater, school uniform' },
  { id: 'outfit_0037', useCase: 'office', exposure: 'medium', fit: 'fitted blouse, tight pencil skirt', prompt: 'a lavender satin button blouse tucked into a pale gray high-waisted pencil skirt, slim office-date silhouette, soft glossy fabric', avoid: 'bikini, fantasy armor' },
  { id: 'outfit_0039', useCase: 'daily', exposure: 'medium', fit: 'oversized sweater dress, belted waist', prompt: 'an oversized ivory long-sleeve sweater mini dress cinched with a wide black belt, slouchy sleeves, thigh-high black boots, loose upper fit with defined waist', avoid: 'summer bikini, school blazer' },
  { id: 'outfit_0040', useCase: 'daily', exposure: 'medium', fit: 'tight crop top, fitted denim shorts', prompt: 'a white asymmetrical strappy crop top, light blue high-waisted denim shorts, casual summer styling, fitted waist and compact silhouette', avoid: 'formal skirt suit' },
  { id: 'outfit_0041', useCase: 'date', exposure: 'medium', fit: 'fitted sleeveless mini dress', prompt: 'a black sleeveless mini dress with a simple fitted bodice and slight A-line hem, black strappy sandals, minimal summer date styling', avoid: 'athletic leggings, heavy coat' },
  { id: 'outfit_0042', useCase: 'adult', exposure: 'medium-high', fit: 'lace bra top, tight mini skirt', prompt: 'a lavender floral lace bra top with 3D flower appliques, pale pink high-waisted bodycon mini skirt, soft pastel adult styling, tight waist and short hem', avoid: 'office blazer, sporty sneakers' },
  { id: 'outfit_0043', useCase: 'sporty', exposure: 'medium', fit: 'fitted long-sleeve top, tight dolphin shorts', prompt: 'a fitted white long-sleeve crop top layered under a black cropped tank, gray tight dolphin shorts with white trim, sporty lounge styling', avoid: 'formal gown, school tie' },
  { id: 'outfit_0044', useCase: 'sporty', exposure: 'medium', fit: 'tight sleeveless mini dress', prompt: 'a dark green sleeveless velour mini dress with a high collar, bodycon fit, side slit, sporty-luxe club styling', avoid: 'loose casual jeans' },
  { id: 'outfit_0045', useCase: 'sporty', exposure: 'medium-high', fit: 'bandeau crop top, tight ruched shorts', prompt: 'a black bandeau crop top, beige low-rise ruched micro shorts with side drawstrings, tight sporty summer fit', avoid: 'long skirt, blazer' },
  { id: 'outfit_0046', useCase: 'adult', exposure: 'high', fit: 'tight long dress, high slit', prompt: 'a navy sleeveless high-neck evening gown with ornate gold floral embroidery and a thigh-high slit, fitted torso and long dramatic skirt', avoid: 'casual sneakers, school socks' },
  { id: 'outfit_0047', useCase: 'daily', exposure: 'medium', fit: 'loose open shirt, tight mini skirt', prompt: 'a loose white short-sleeve button shirt worn open over a fitted white tank, black high-waisted bodycon mini skirt, relaxed summer street styling', avoid: 'lingerie lace, fantasy armor' },
  { id: 'outfit_0048', useCase: 'uniform', exposure: 'medium', fit: 'fitted knit top, flared pleated mini skirt', prompt: 'a pale mint fitted short-sleeve knit top, white pleated mini skirt with a belt, black thigh-high socks, cute preppy silhouette', avoid: 'latex, swimsuit' },
  { id: 'outfit_0049', useCase: 'adult', exposure: 'high', fit: 'sheer tight top, flared mini skirt', prompt: 'a black sheer long-sleeve mesh top over a dark bra, paired with a black flared mini skirt, tight upper body with short flared lower silhouette', avoid: 'office blouse, denim shorts' },
  { id: 'outfit_0050', useCase: 'sporty', exposure: 'medium', fit: 'tight sleeveless crop top, flared tennis skirt', prompt: 'a burgundy sleeveless high-neck crop top, white flared tennis mini skirt, fitted sporty silhouette with exposed midriff', avoid: 'long dress, business suit' },
  { id: 'outfit_0051', useCase: 'sporty', exposure: 'medium', fit: 'tight crop tank, compression leggings', prompt: 'a beige sleeveless cropped athletic top with cutout waist detail, taupe high-waisted compression leggings, body-hugging gym fit', avoid: 'lace, school uniform' },
  { id: 'outfit_0052', useCase: 'daily', exposure: 'medium-high', fit: 'oversized loose knit, tight shorts', prompt: 'a peach loose open-knit long-sleeve sweater falling off one shoulder, cream low-rise fitted shorts, relaxed top with tight short bottom contrast', avoid: 'formal blazer, pleated uniform' },
  { id: 'outfit_0053', useCase: 'fantasy', exposure: 'high', fit: 'cropped blouse, very short shorts, garter stockings', prompt: 'a white cropped blouse with puff sleeves and a gray bow, denim micro shorts with visible garter straps, sheer black thigh-high stockings rising to the upper thighs and connected by garter straps, tight costume styling', avoid: 'casual realism, office skirt' },
  { id: 'outfit_0054', useCase: 'date', exposure: 'medium-high', fit: 'tight off-shoulder sweater dress', prompt: 'a gray ribbed off-shoulder bodycon mini sweater dress with front lace-up tie, very tight knit fit, short hem', avoid: 'loose hoodie, long coat' },
  { id: 'outfit_0055', useCase: 'uniform', exposure: 'medium', fit: 'fitted blazer, pleated mini skirt', prompt: 'a navy school-uniform blazer over a white shirt, striped tie, navy pleated mini skirt, structured preppy silhouette', avoid: 'swimsuit, evening dress' },
  { id: 'outfit_0056', useCase: 'adult', exposure: 'high', fit: 'tight white mini dress', prompt: 'a white bodycon mini dress with thin straps and a deep neckline, soft stretchy fabric, very tight torso and hip fit', avoid: 'loose fit, blazer, sportswear' },
  { id: 'outfit_0057', useCase: 'sporty', exposure: 'medium', fit: 'tight sleeveless crop top, tight leggings', prompt: 'a pale yellow sleeveless crop workout top, gray high-waisted compression leggings, tight gym silhouette with clean athletic styling', avoid: 'frills, formalwear' },
  { id: 'outfit_0058', useCase: 'daily', exposure: 'medium', fit: 'strapless bodycon mini dress', prompt: 'a yellow strapless DHL-logo print bodycon mini dress, very tight tube-dress fit, loud graphic streetwear styling', avoid: 'soft pastel, office wear' },
  { id: 'outfit_0061', useCase: 'date', exposure: 'medium', fit: 'loose white shirt dress, cinched waist', prompt: 'a white semi-sheer long-sleeve shirt dress with a belted waist, ruffled short hem, airy loose fit with defined waist', avoid: 'latex, athletic leggings' },
  { id: 'outfit_0062', useCase: 'uniform', exposure: 'medium', fit: 'fitted crop knit, loose plaid skirt', prompt: 'a white fitted long-sleeve cropped knit top, gray plaid pleated mini skirt, white thigh-high socks, soft school-inspired casual styling', avoid: 'lingerie, gown' },
  { id: 'outfit_0064', useCase: 'date', exposure: 'medium', fit: 'slim satin slip mini dress', prompt: 'a white satin sleeveless slip mini dress with a draped neckline, slim fitted waist, smooth minimalist date styling', avoid: 'sportswear, school tie' },
  { id: 'outfit_0065', useCase: 'adult', exposure: 'medium', fit: 'loose white tee, tight ruched mini skirt', prompt: 'a loose white short-sleeve tee layered over a white tank, gray ruched bodycon mini skirt, casual indoor styling with relaxed top and tight skirt', avoid: 'formal gown, bikini' },
  { id: 'outfit_0066', useCase: 'fantasy', exposure: 'medium', fit: 'corset bodice, flared mini skirt', prompt: 'a white fantasy mini dress with a metallic silver corset bodice, structured bust, flared short skirt, glossy armored waist styling', avoid: 'realistic office outfit' },
  { id: 'outfit_0069', useCase: 'uniform', exposure: 'medium', fit: 'fitted cropped jacket, flared pleated skirt', prompt: 'a cream tweed cropped jacket with gold buttons, white pleated mini skirt, soft romantic preppy styling, fitted top and flared skirt', avoid: 'leather, swimwear' },
  { id: 'outfit_0070', useCase: 'adult', exposure: 'medium-high', fit: 'tight cropped cardigan, tight plaid micro skirt', prompt: 'a white ruched cropped cardigan with front buttons, beige plaid micro mini skirt, white lace thigh-high stockings, tight street styling', avoid: 'long pants, formal gown' },
  { id: 'outfit_0071', useCase: 'daily', exposure: 'medium', fit: 'boxy vest, loose shorts', prompt: 'a pink sleeveless tweed vest with front buttons, matching high-waisted shorts with scalloped trim, loose cute summer set', avoid: 'latex, black leather' },
  { id: 'outfit_0072', useCase: 'daily', exposure: 'medium', fit: 'sleeveless fitted top, belted flared skirt', prompt: 'a black sleeveless top tucked into a black belted A-line mini skirt, structured city styling, fitted waist with loose skirt volume', avoid: 'lingerie, swimsuit' },
  { id: 'outfit_0073', useCase: 'date', exposure: 'medium', fit: 'loose tiered dress', prompt: 'a black short-sleeve tiered babydoll mini dress, airy loose fit, soft puff sleeves, relaxed summer silhouette', avoid: 'bodycon latex, office pencil skirt' },
  { id: 'outfit_0074', useCase: 'adult', exposure: 'medium-high', fit: 'tight strapless mini dress', prompt: 'a silver metallic strapless bodycon mini dress, glossy reflective fabric, tight straight silhouette, party styling', avoid: 'casual cotton, sneakers' },
  { id: 'outfit_0075', useCase: 'sporty', exposure: 'medium', fit: 'fitted long-sleeve top, flared mini skirt', prompt: 'a white fitted long-sleeve top with black collar and cuffs, black flared mini skirt, black thigh-high socks, sporty school-inspired styling', avoid: 'bikini, latex' },
  { id: 'outfit_0076', useCase: 'fantasy', exposure: 'high', fit: 'fishnet body stocking', prompt: 'a nude-toned fishnet bodystocking with black ribbon bows, sheer full-body net texture, very tight costume fit', avoid: 'casual realism, office wear' },
  { id: 'outfit_0077', useCase: 'adult', exposure: 'high', fit: 'sheer cropped blouse, tight vinyl mini skirt', prompt: 'a sheer white cropped blouse with black ribbon bow, black glossy vinyl micro mini skirt with chain belt, tight clubwear silhouette', avoid: 'loose knitwear, denim casual' },
  { id: 'outfit_0078', useCase: 'sporty', exposure: 'medium', fit: 'loose jersey top, tight leggings', prompt: 'a white cropped baseball jersey top, olive high-waisted athletic leggings, white striped knee socks, sporty fitted lower silhouette', avoid: 'lace dress, business suit' },
  { id: 'outfit_0079', useCase: 'adult', exposure: 'high', fit: 'glossy latex crop top and mini skirt', prompt: 'a black glossy latex long-sleeve crop top with deep neckline, matching black latex micro mini skirt, extremely tight reflective clubwear fit', avoid: 'soft cotton, loose fit' },
  { id: 'outfit_0080', useCase: 'fantasy', exposure: 'medium-high', fit: 'cropped sailor top, pleated mini skirt', prompt: 'a white cropped sailor-style sleeveless top with navy trim and gold buttons, navy pleated mini skirt, dark thigh-high garter stockings rising to mid-thigh with visible strap connections, tight costume styling', avoid: 'realistic office wear' },
  { id: 'outfit_0081', useCase: 'date', exposure: 'medium', fit: 'loose blouse top, belted mini dress', prompt: 'a beige long-sleeve mini dress with blouse-like top, high gathered waist, double-breasted belt detail, soft loose sleeves and short skirt', avoid: 'sportswear, bikini' },
  { id: 'outfit_0082', useCase: 'adult', exposure: 'high', fit: 'tight cutout bodysuit', prompt: 'a white and blue cutout bodysuit with side ties, high-cut leg openings, tight costume-swim hybrid fit', avoid: 'casual jeans, blazer' },
  { id: 'outfit_0083', useCase: 'adult', exposure: 'high', fit: 'flowing long dress, high slit', prompt: 'a cream halter maxi dress with black polka dots, flowing skirt, plunging neckline, thigh-high slit, resort evening styling', avoid: 'sporty leggings, hoodie' },
  { id: 'outfit_0084', useCase: 'sporty', exposure: 'medium-high', fit: 'tight sport crop top, high-waisted swim bottom', prompt: 'a white athletic crop top with navy high-waisted swim shorts, white thigh-high athletic socks with navy stripes, tight sporty swim styling', avoid: 'office blouse, long gown' },
  { id: 'outfit_0085', useCase: 'date', exposure: 'medium', fit: 'fitted wrap mini dress', prompt: 'a black short-sleeve wrap mini dress with ruffled neckline, cinched waist buckle, soft fitted date silhouette', avoid: 'latex bodysuit, school uniform' },
  { id: 'outfit_0086', useCase: 'daily', exposure: 'medium-high', fit: 'tight crop tee, distressed micro shorts', prompt: 'a navy tight cropped baby tee, distressed low-rise denim micro shorts, white thigh-high stocking on one leg, edgy casual styling', avoid: 'formal blazer, gown' },
  { id: 'outfit_0087', useCase: 'sporty', exposure: 'medium', fit: 'loose polo, flared tennis skirt', prompt: 'a black short-sleeve polo shirt tucked into a cream pleated tennis mini skirt, white sneakers, sporty casual fit', avoid: 'lingerie, latex' },
  { id: 'outfit_0088', useCase: 'uniform', exposure: 'medium', fit: 'fitted blouse, structured pleated skirt', prompt: 'a dark gray short-sleeve button blouse with a black bow at the collar, black pleated mini skirt, sheer black tights, fitted school-inspired styling', avoid: 'swimsuit, evening gown' },
  { id: 'outfit_0089', useCase: 'fantasy', exposure: 'high', fit: 'mesh corset top, micro skirt', prompt: 'a sheer gray mesh corset-style halter top with neck tie, matching micro mini skirt with black trim, sheer black garter stockings rising high on the thighs with visible garter straps, tight costume silhouette', avoid: 'casual cotton, office wear' },
  { id: 'outfit_0090', useCase: 'office', exposure: 'medium', fit: 'tight cropped shirt, tight mini skirt', prompt: 'a white cropped button shirt with black necktie, black high-waisted bodycon mini skirt, fitted office-inspired styling', avoid: 'loose sweater, swimwear' },
  { id: 'outfit_0091', useCase: 'adult', exposure: 'high', fit: 'sheer lace bodysuit', prompt: 'a peach sheer lace lingerie bodysuit with thin straps, scalloped lace edges, transparent fitted fabric, delicate adult styling', avoid: 'casual realism, street coat' },
  { id: 'outfit_0092', useCase: 'adult', exposure: 'high', fit: 'tight black long dress, high slit', prompt: 'a black lace halter evening gown with side cutouts, sheer lace torso panels, thigh-high slit, fitted waist and long skirt', avoid: 'sportswear, school socks' },
  { id: 'outfit_0093', useCase: 'office', exposure: 'medium-high', fit: 'fitted blouse, tight lace mini skirt', prompt: 'a white button blouse tucked into a black sheer lace bodycon mini skirt, slim office-adult styling, tight skirt with transparent lace texture', avoid: 'sneakers, loose denim' },
  { id: 'outfit_0094', useCase: 'fantasy', exposure: 'medium-high', fit: 'cropped sailor top, loose pleated mini skirt', prompt: 'a navy sailor-style cropped top with a large red bow, navy pleated mini skirt, wrist cuff accessories, playful costume fit', avoid: 'realistic workwear, long pants' },
  { id: 'outfit_0095', useCase: 'office', exposure: 'medium', fit: 'loose blouse, tight textured mini skirt', prompt: 'a black satin button blouse tucked into a white fuzzy textured bodycon mini skirt, office-date styling with loose glossy top and tight soft skirt', avoid: 'swimsuit, fantasy outfit' },
  { id: 'outfit_0096', useCase: 'adult', exposure: 'high', fit: 'tight high-cut one-piece', prompt: 'a white high-cut one-piece swimsuit with deep side openings and thin shoulder straps, very tight swimwear fit', avoid: 'skirt, blazer' },
  { id: 'outfit_0097', useCase: 'fantasy', exposure: 'medium-high', fit: 'tight camisole, loose sheer apron skirt', prompt: 'a pink maid-inspired mini dress with a fitted camisole top, tiny bow, white apron bib, sheer ruffled skirt, soft cute costume styling', avoid: 'business suit, sportswear' },
  { id: 'outfit_0098', useCase: 'adult', exposure: 'high', fit: 'strappy lace bodysuit', prompt: 'a red strappy lace lingerie bodysuit with large chest bow, crisscross torso straps, high-cut leg openings, very tight adult fit', avoid: 'casual outfit, long coat' },
  { id: 'outfit_0099', useCase: 'fantasy', exposure: 'high', fit: 'tight velvet bodysuit, garter stockings', prompt: 'a black and white maid-inspired velvet bodysuit with white collar trim, lace-up sides, sheer black thigh-high garter stockings with small bow ties at the upper thigh, tight costume fit', avoid: 'casual denim, office realism' },
  { id: 'outfit_0100', useCase: 'sporty', exposure: 'medium', fit: 'tight sports bra, compression leggings', prompt: 'a white sports bra with pale pink high-waisted compression leggings, clean athletic tight fit, white striped socks', avoid: 'dress, blazer' },
  { id: 'outfit_0101', useCase: 'adult', exposure: 'high', fit: 'tight corset bodysuit, garter stockings', prompt: 'a black corset lingerie bodysuit with pink lace-up front, structured waist, sheer black mid-thigh garter stockings attached to thin garter straps, tight hourglass costume fit', avoid: 'casual realism' },
  { id: 'outfit_0102', useCase: 'fantasy', exposure: 'high', fit: 'sheer off-shoulder top, frilled micro skirt', prompt: 'a sheer black off-shoulder maid-style top with bow ties, layered black and white ruffled micro skirt, fishnet stockings, tight costume styling', avoid: 'office wear, sportswear' },
  { id: 'outfit_0103', useCase: 'adult', exposure: 'high', fit: 'tight mini dress', prompt: 'a black long-sleeve bodycon mini dress with white lace bust trim and front bow, very tight waist and hip fit, short hem', avoid: 'loose dress, athletic wear' },
  { id: 'outfit_0104', useCase: 'uniform', exposure: 'high', fit: 'tight sleeveless mini outfit', prompt: 'a black sleeveless uniform-inspired mini dress with white collar, deep chest cutout, black garter stocking detail rising to the upper thighs with visible strap accents, tight short fit', avoid: 'casual realism' },
  { id: 'outfit_0105', useCase: 'adult', exposure: 'high', fit: 'full-body fishnet', prompt: 'a black full-body fishnet bodystocking, strapless upper edge, transparent net texture, extremely tight all-over fit', avoid: 'outdoor casual, office outfit' },
  { id: 'outfit_0106', useCase: 'adult', exposure: 'high', fit: 'tight lace teddy, garter stockings', prompt: 'a black lace lingerie teddy with sheer center panel, garter straps, black thigh-high stockings, tight adult silhouette', avoid: 'casual clothing, sportswear' },
  { id: 'outfit_0107', useCase: 'adult', exposure: 'high', fit: 'strapless crop top, tight mini skirt', prompt: 'a black strapless bandeau crop top with a front cutout, matching black bodycon mini skirt, minimal tight clubwear silhouette', avoid: 'preppy skirt, office blouse' },
  { id: 'outfit_0108', useCase: 'adult', exposure: 'high', fit: 'strappy minimal lingerie', prompt: 'a pink and white strappy lingerie set with heart-shaped cups, bow accents, minimal coverage, tight decorative strap fit', avoid: 'casual realism' },
  { id: 'outfit_0109', useCase: 'sporty', exposure: 'medium', fit: 'loose cropped jersey, flared pleated skirt', prompt: 'a red oversized cropped baseball jersey, white pleated tennis mini skirt, sporty casual fit with loose top and flared skirt', avoid: 'lingerie, formal gown' },
  { id: 'outfit_0110', useCase: 'fantasy', exposure: 'medium', fit: 'layered fantasy costume', prompt: 'a white and red fantasy battle-dress outfit with layered asymmetric skirt panels, thigh straps, decorative red ribbons, fitted bodice and flared costume silhouette', avoid: 'modern casual realism' },
  { id: 'outfit_0112', useCase: 'fantasy', exposure: 'medium-high', fit: 'tight metallic mini dress', prompt: 'a silver metallic sci-fi mini dress with structured short sleeves, reflective panels, matching silver thigh-high boots and gloves, tight futuristic fit', avoid: 'cotton casual, school uniform' },
  { id: 'outfit_0113', useCase: 'adult', exposure: 'high', fit: 'tight lace bodysuit', prompt: 'a black lace bodysuit with halter straps, sheer floral lace panels, black thigh-high stockings, tight adult costume fit', avoid: 'everyday casual' },
  { id: 'outfit_0114', useCase: 'fantasy', exposure: 'medium', fit: 'full-body latex catsuit', prompt: 'a glossy black full-body latex catsuit with neon green circuit-like accents, extremely tight futuristic silhouette', avoid: 'loose fabric, casual streetwear' },
  { id: 'outfit_0115', useCase: 'fantasy', exposure: 'high', fit: 'metallic pants, strappy top', prompt: 'a silver metallic high-waisted tight pant look with a strappy jeweled bikini-style top, glossy cyber styling, body-hugging lower fit', avoid: 'preppy outfit, soft knit' },
  { id: 'outfit_0116', useCase: 'adult', exposure: 'high', fit: 'glossy high-cut bodysuit', prompt: 'a black glossy latex high-cut bodysuit with red accents, tight reflective club-fantasy silhouette', avoid: 'loose cotton, office wear' },
  { id: 'outfit_0117', useCase: 'fantasy', exposure: 'medium', fit: 'fitted blouse, pleated skirt', prompt: 'a white sleeveless fantasy blouse with black collar details, black pleated mini skirt with white trim, fitted school-fantasy styling', avoid: 'swimwear, latex catsuit' },
  { id: 'outfit_0118', useCase: 'fantasy', exposure: 'medium', fit: 'loose cropped jacket, pleated mini skirt', prompt: 'a gray cropped one-sleeve uniform jacket over a black pleated mini skirt with red belt accents, fantasy school styling', avoid: 'realistic office outfit' },
  { id: 'outfit_0119', useCase: 'fantasy', exposure: 'medium-high', fit: 'tight bodice, pleated skirt', prompt: 'a red and black gothic fantasy outfit with strappy fitted bodice, black pleated mini skirt, red garter straps, black thigh-high stockings rising to the upper thighs under the straps', avoid: 'casual denim' },
  { id: 'outfit_0120', useCase: 'fantasy', exposure: 'high', fit: 'tight bodysuit, loose cropped jacket', prompt: 'a black glossy bodysuit with a loose cropped black jacket, fishnet tights, gloves, gothic cyber club styling', avoid: 'soft preppy styling' },
  { id: 'outfit_0121', useCase: 'fantasy', exposure: 'medium', fit: 'fitted turtleneck top, short skirt', prompt: 'a teal ribbed turtleneck top with a gold asymmetrical armor-like skirt panel, black thigh-high stockings, futuristic fantasy styling', avoid: 'realistic casual outfit' },
  { id: 'outfit_0122', useCase: 'adult', exposure: 'high', fit: 'strappy high-cut bodysuit', prompt: 'a black and silver strappy high-cut bodysuit with diagonal bands across the torso, tight glossy adult fantasy fit', avoid: 'school uniform, daily casual' },
  { id: 'outfit_0123', useCase: 'fantasy', exposure: 'medium', fit: 'full-body latex suit', prompt: 'a hot pink glossy latex full-body suit with high collar and cropped jacket-like shoulder layer, extremely tight cyber styling', avoid: 'cotton, loose skirt' },
  { id: 'outfit_0124', useCase: 'fantasy', exposure: 'medium-high', fit: 'tight white bodysuit', prompt: 'a white fantasy bodysuit with red and gold ornamental chest details, long gloves, thigh-high white stockings, tight costume silhouette', avoid: 'modern casual' },
  { id: 'outfit_0125', useCase: 'uniform', exposure: 'medium', fit: 'fitted blazer, short pleated skirt', prompt: 'a navy fitted school blazer with white shirt and red ribbon tie, short pleated skirt with reddish underskirt trim, black tights, polished anime-uniform styling', avoid: 'swimsuit, latex' },
  { id: 'outfit_0126', useCase: 'fantasy', exposure: 'medium', fit: 'fitted blouse, short skirt, chunky boots', prompt: 'a pale pink long-sleeve blouse layered under a black ruffled mini skirt or pinafore, black fishnet stockings, chunky knee-high boots, gothic cute street styling', avoid: 'office realism, swimwear' },
  { id: 'outfit_0127', useCase: 'uniform', exposure: 'low', fit: 'structured coat, fitted waist', prompt: 'a red military-inspired long coat dress with black trim, gold buttons, fitted waist, black leggings, white boots, structured uniform silhouette', avoid: 'casual denim, bikini' },
  { id: 'outfit_0128', useCase: 'adult', exposure: 'medium-high', fit: 'tight draped dress', prompt: 'a coral-red draped slip mini dress with thin straps, soft cowl neckline, body-skimming tight fit, elegant evening styling', avoid: 'sporty socks, school uniform' },
  { id: 'outfit_0129', useCase: 'daily', exposure: 'medium', fit: 'cropped tee, fitted denim shorts', prompt: 'a pale pink cropped short-sleeve shirt with a heart cutout, low-rise blue denim shorts with belt straps, playful anime casual styling', avoid: 'formal gown, office blouse' },
  { id: 'outfit_0130', useCase: 'daily', exposure: 'medium', fit: 'fitted jacket, pleated mini skirt', prompt: 'a pink and black punk school outfit with cropped jacket, pleated mini skirt, thigh straps, tall black boots, fitted rebellious anime styling', avoid: 'soft office styling' },
  { id: 'outfit_0131', useCase: 'daily', exposure: 'medium', fit: 'oversized checkered jacket, tight crop top', prompt: 'an oversized black-and-white checkerboard jacket over a black crop top with heart cutout, blue jeans, edgy loose-over-tight street styling', avoid: 'formal gown' },
  { id: 'outfit_0132', useCase: 'daily', exposure: 'medium', fit: 'fitted vest, pleated mini skirt', prompt: 'a white school shirt with a purple tie, black vest, green pleated mini skirt, mismatched graphic thigh-high stockings with different printed patterns on each leg rising to the upper thighs, punk anime styling', avoid: 'simple minimalist outfit' },
  { id: 'outfit_0133', useCase: 'uniform', exposure: 'medium', fit: 'fitted vest, tight mini skirt', prompt: 'a navy sleeveless uniform vest over a white mini skirt, pink bow at the chest, one single black thigh-high sock on one leg rising to the upper thigh while the other leg is bare, asymmetrical anime uniform styling', avoid: 'realistic business suit' },
  { id: 'outfit_0134', useCase: 'office', exposure: 'medium', fit: 'sleeveless blouse, fitted shorts', prompt: 'a white sleeveless collared blouse tucked into black fitted knee-length shorts, slim office-casual anime styling', avoid: 'lingerie, swimsuit' },
  { id: 'outfit_0135', useCase: 'fantasy', exposure: 'medium', fit: 'loose oversized sweater, short skirt', prompt: 'a white oversized knit sweater with lace-up sleeve details, black mini skirt peeking underneath, dark red hem trim, gothic cute styling', avoid: 'office suit, sporty leggings' },
  { id: 'outfit_0136', useCase: 'fantasy', exposure: 'medium-high', fit: 'fitted bodice, ruffled mini skirt', prompt: 'a white and red fantasy jester-maid outfit with fitted bodice, red plaid center panel, black ruffled mini skirt, long black gloves, thigh-high stockings, chunky platform shoes', avoid: 'modern casual realism' },
  { id: 'outfit_0137', useCase: 'fantasy', exposure: 'medium', fit: 'fitted bodice, very full skirt', prompt: 'a black gothic maid dress with white apron, puff sleeves, layered full skirt, black patterned stockings, chunky shoes, voluminous Victorian maid silhouette', avoid: 'bodycon clubwear' },
  { id: 'outfit_0138', useCase: 'uniform', exposure: 'medium', fit: 'fitted sailor top, pleated skirt', prompt: 'a navy sailor-style mini uniform with white trim, pleated skirt, white thigh-high stockings, fitted top and flared short skirt', avoid: 'latex, swimwear' },
  { id: 'outfit_0139', useCase: 'uniform', exposure: 'low', fit: 'fitted sleeveless mini dress', prompt: 'a cream sleeveless collared mini dress with navy skirt panel and thin red ribbon tie, neat preppy A-line silhouette', avoid: 'lingerie, latex' },
  { id: 'outfit_0140', useCase: 'daily', exposure: 'low', fit: 'fitted waist, flared skirt', prompt: 'a pale pink short-sleeve collared mini dress with button front, black trim, fitted waist and softly flared skirt', avoid: 'adult costume, swimwear' },
  { id: 'outfit_0141', useCase: 'daily', exposure: 'low', fit: 'straight long coat dress', prompt: 'a black long coat dress with red piping, high collar, front zipper, long sleeves, structured straight silhouette', avoid: 'swimsuit, crop top' },
  { id: 'outfit_0142', useCase: 'date', exposure: 'low', fit: 'loose A-line dress', prompt: 'a black long-sleeve A-line dress with floral embroidery at the hem and sleeves, cream collar bow detail, loose romantic silhouette', avoid: 'bodycon mini dress, latex' },
  { id: 'outfit_0143', useCase: 'date', exposure: 'low', fit: 'loose tiered dress', prompt: 'a white floral long-sleeve tiered dress with black ribbon trim, frilled layers, airy loose romantic silhouette', avoid: 'sporty leggings, bikini' },
  { id: 'outfit_0144', useCase: 'date', exposure: 'low', fit: 'long flowing dress', prompt: 'a pale floral long dress with soft ruffled layers, long sleeves, high waist, flowing romantic fit', avoid: 'leather, latex, crop top' },
  { id: 'outfit_0145', useCase: 'date', exposure: 'medium', fit: 'loose oversized blouse', prompt: 'a cream oversized blouse with a large lavender bow at the collar, gathered front tie, loose soft romantic fit', avoid: 'tight bodycon, swimwear' },
  { id: 'outfit_0146', useCase: 'uniform', exposure: 'low', fit: 'regular fitted shirt', prompt: 'a white long-sleeve button shirt with red and navy trim at the cuffs and placket, large navy and red bow at the collar, clean preppy blouse fit', avoid: 'lingerie, swimsuit' },
  { id: 'outfit_0147', useCase: 'date', exposure: 'low', fit: 'fitted waist, long dress', prompt: 'a coral sleeveless long dress with front ruffle trim, black waist ribbon, fitted waist and long straight romantic skirt', avoid: 'bodycon clubwear' },
  { id: 'outfit_0148', useCase: 'fantasy', exposure: 'low', fit: 'loose blouse', prompt: 'a black long-sleeve blouse with white ruffled collar, cream placket, red ribbon bow, loose gothic preppy fit', avoid: 'swimwear, sportswear' },
  { id: 'outfit_0149', useCase: 'daily', exposure: 'medium', fit: 'cropped fitted top, belted pleated skirt', prompt: 'a mint-green loose-sleeve cropped jacket over a white lace-up top, high-waisted pink pleated skirt with wide black belt, layered anime street styling', avoid: 'minimalist office wear' },
  { id: 'outfit_0150', useCase: 'fantasy', exposure: 'medium', fit: 'fitted bodice, high-low skirt', prompt: 'a black gothic high-low dress with red lining, fitted bodice, choker straps, thigh-high stockings, dark fantasy silhouette', avoid: 'casual cotton' },
  { id: 'outfit_0151', useCase: 'fantasy', exposure: 'medium', fit: 'fitted bodice, layered ruffled skirt', prompt: 'a black and white gothic maid outfit with layered ruffled skirt, red tie, black thigh-high stockings, platform Mary Jane shoes, fitted bodice with wide skirt volume', avoid: 'modern office wear' },
  { id: 'outfit_0152', useCase: 'uniform', exposure: 'medium', fit: 'fitted cardigan, pleated mini skirt', prompt: 'a red cardigan over a black shirt and striped tie, navy plaid pleated mini skirt, black sheer tights, school uniform styling', avoid: 'swimwear, lingerie' },
  { id: 'outfit_0153', useCase: 'uniform', exposure: 'medium', fit: 'fitted blazer, pleated skirt', prompt: 'a red fitted school blazer with black trim, navy plaid pleated skirt, black tights, polished anime uniform silhouette', avoid: 'casual streetwear' },
  { id: 'outfit_0154', useCase: 'fantasy', exposure: 'medium', fit: 'loose graphic top, pleated mini skirt', prompt: 'a black graphic oversized tee layered with a black pleated mini skirt, chain belt, white leg warmers, chunky black platform shoes, messy gothic street styling', avoid: 'formal gown, office suit' },
  { id: 'outfit_0155', useCase: 'daily', exposure: 'medium', fit: 'fitted camisole, flared mini skirt', prompt: 'a white strappy camisole mini dress with fitted bust and flared short skirt, simple summer anime date styling', avoid: 'heavy coat, latex' },
  { id: 'outfit_0156', useCase: 'adult', exposure: 'medium-high', fit: 'tight ribbed bodycon dress', prompt: 'a white ribbed long-sleeve bodycon dress with deep neckline, knee-to-midi length, extremely tight knit fit, small black handbag', avoid: 'loose fit, school skirt' },
  { id: 'outfit_0157', useCase: 'daily', exposure: 'medium-high', fit: 'tight high-slit skirt, fitted top', prompt: 'a black fitted long-sleeve top paired with a high-waisted floral satin wrap skirt, dramatic thigh-high slit, tight elegant silhouette', avoid: 'sporty casual, school uniform' },
  { id: 'outfit_0158', useCase: 'daily', exposure: 'medium', fit: 'fitted tank, loose denim jacket, fitted shorts', prompt: 'a white fitted sleeveless tank top, light blue denim jacket worn loose off the shoulders, high-waisted denim shorts, beige belt, casual denim-on-denim styling', avoid: 'latex, evening gown' },
  { id: 'outfit_0159', useCase: 'fantasy', exposure: 'high', fit: 'tight lace corset top, flared mini skirt', prompt: 'a black lace corset crop top with thin straps and front lacing, black flared mini skirt, dark gothic club styling, tight upper body with short flared lower silhouette', avoid: 'casual office wear, sports leggings' }
];

function pick<T>(items: T[], index: number): T {
  return items[Math.abs(index) % items.length];
}

function isRareVariant(index: number, salt: number): boolean {
  return Math.abs(index * 37 + salt * 101) % 20 === 0;
}

export function pickHairStyle(index: number): string {
  if (RARE_HAIR_STYLES.length && isRareVariant(index, 7)) return pick(RARE_HAIR_STYLES, index * 5);
  return pick(COMMON_HAIR_STYLES.length ? COMMON_HAIR_STYLES : HAIR_STYLES, index * 5);
}

export function pickHairColor(index: number): string {
  if (RARE_HAIR_COLORS.length && isRareVariant(index, 11)) return pick(RARE_HAIR_COLORS, index * 3);
  return pick(COMMON_HAIR_COLORS.length ? COMMON_HAIR_COLORS : HAIR_COLOR_TAGS, index * 3);
}

function stableTextIndex(value: string): number {
  return value.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function hairBangDetailFor(hairStyle: string): string {
  if (!hairStyle) return '';
  if (/\b(?:bangs|part|face-framing|hime|ahoge|braid|braids|bun|buns|ponytail|pigtails|twin tails|ribbon|clips|hairpins|locks)\b/i.test(hairStyle)) return '';
  return pick(HAIR_BANG_TAGS, stableTextIndex(hairStyle));
}

function mixedIndex(primary: number, secondary: number, salt: number): number {
  return Math.abs(primary * 37 + secondary * 101 + Math.floor(Math.abs(primary) / 5) * 17 + salt);
}

function weightedQuality(index: number): string {
  if (index % 5 !== 0) return '';
  return pick(QUALITY_PROMPTS, index);
}

function sceneVariationSeed(index: number, outfitIndex: number): number {
  return mixedIndex(index, outfitIndex, Date.now() + Math.floor(Math.random() * 100000));
}

function clothingOnlyPrompt(outfit: OutfitPreset): string {
  return outfit.prompt
    .replace(/\b(?:city|street|cafe|café|cafe-date|arcade-date|indoor date|night-walk|picnic|festival|home snapshot|clubwear|party|lounge-date|amusement-park|academy-date|office-date|date)\s+styling\b/gi, 'styling')
    .replace(/\b(?:city|street|cafe|café|arcade|indoor|night-walk|picnic|festival|home snapshot|clubwear|party|lounge|amusement-park|academy|office|date)[-\s]*(?:date|snapshot|styling)\b/gi, 'styling')
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .trim();
}

function hasVisibleLegwear(outfit: OutfitPreset): boolean {
  return /\b(?:stocking|stockings|tights|pantyhose|socks|sock|fishnet|thigh-high|knee socks|boots|leggings|leg warmers)\b/i.test(
    `${outfit.prompt} ${outfit.fit}`,
  );
}

function legwearDetailPrompt(outfit: OutfitPreset): string {
  if (!hasVisibleLegwear(outfit)) return '';
  return [
    'legwear must be described and rendered explicitly',
    'include legwear color, material, opacity or sheer level, pattern or lace/fishnet detail',
    'include exact length and height on the leg, such as ankle, calf, knee-high, over-knee, mid-thigh, thigh-high, or full tights',
    'include whether it is symmetrical, single-leg, garter-connected, strap-connected, striped, patterned, or plain',
    'preserve the clothing preset legwear details instead of replacing them with bare legs',
  ].join(', ');
}

function allowedOutfits(mode: BlindDateMode | undefined, index: number): OutfitPreset[] {
  return OUTFIT_PRESETS;
}

function bodyFor(index: number, outfit: OutfitPreset): string {
  return pick(BODY_PROMPTS, index * 7);
}

function ageBand(age: number): string {
  if (age === 19) return '19-year-old adult woman';
  if (age <= 23) return 'early 20s adult woman';
  if (age <= 26) return 'mid 20s adult woman';
  if (age <= 29) return 'late 20s adult woman';
  if (age <= 33) return 'early 30s adult woman';
  if (age <= 36) return 'mid 30s adult woman';
  return 'late 30s adult woman';
}

export function buildRandomCategorizedImagePrompt(options: RandomPromptOptions): string {
  const index = options.seedIndex;
  const outfitIndex = options.outfitSlot ?? index;
  const sceneIndex = sceneVariationSeed(index, outfitIndex);
  const outfitPool = allowedOutfits(options.mode, index);
  const freshOutfits = options.usedOutfitIds?.length
    ? outfitPool.filter(item => !options.usedOutfitIds?.includes(item.id))
    : outfitPool;
  const outfit = pick(freshOutfits.length ? freshOutfits : outfitPool, mixedIndex(outfitIndex, index, options.outfitSlot === undefined ? 23 : 0));
  if (options.usedOutfitIds && !options.usedOutfitIds.includes(outfit.id)) {
    options.usedOutfitIds.push(outfit.id);
  }
  const quality = weightedQuality(index);
  const age = options.age || 27;
  const hairStyle = options.appearance.hairStyle || pickHairStyle(index);
  const legwearVisible = hasVisibleLegwear(outfit);
  const composition = legwearVisible
    ? pick(['full-body shot', 'knee-up street snapshot', 'full-body standing portrait'], sceneIndex * 31)
    : pick(COMPOSITIONS, sceneIndex * 31);
  return [
    'adult Asian woman, age 19 or older',
    options.nationality || options.appearance.ethnicityDetail || 'Korean',
    `age ${age}`,
    `${ageBand(age)}, ${pick(STYLE_IDENTITIES, index * 3)}`,
    options.appearance.faceShape,
    options.appearance.eyes,
    options.appearance.eyelids,
    options.appearance.eyebrows,
    options.appearance.nose,
    options.appearance.lips,
    options.appearance.cheeks,
    options.appearance.jawline,
    options.appearance.chin,
    options.appearance.skinTone,
    ...(options.appearance.distinctiveMarks || []),
    hairStyle,
    hairBangDetailFor(hairStyle),
    options.appearance.hairColor || pickHairColor(index),
    pick([
      options.appearance.makeupStyle,
      'light makeup',
      'soft natural makeup',
      'student-style makeup on an adult woman',
      'clean innocent makeup',
      'K-pop idol inspired makeup',
      'influencer-style glossy makeup',
      'ordinary daily makeup'
    ], index * 13),
    bodyFor(index, outfit),
    `clothing preset ${outfit.id}, clothing only, not a pose or camera preset: ${clothingOnlyPrompt(outfit)}`,
    `fit detail: ${outfit.fit}`,
    'The clothing preset must not control pose, camera angle, crop, arm position, background, or facial expression.',
    'Even if this same clothing appears again, choose a fresh natural pose and different composition each generation.',
    legwearDetailPrompt(outfit),
    legwearVisible ? 'show the full outfit clearly including legwear, do not crop above the knees' : '',
    'no bag, no handbag, no backpack, no coffee cup, no mug, no drink cup, no handheld drink props',
    pick(EXPRESSIONS, sceneIndex * 17),
    pick(POSES, sceneIndex * 19),
    `background: ${pick(BACKGROUNDS, sceneIndex * 23)}`,
    pick(LIGHTING, sceneIndex * 29),
    composition,
    quality,
    'realistic Korean personal snapshot, natural skin texture, face clearly visible'
  ].filter(Boolean).join(', ');
}
