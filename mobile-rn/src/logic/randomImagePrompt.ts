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

const HAIR_STYLES = [
  'long dark brown layered hair',
  'long straight black hair with see-through bangs',
  'medium wavy chestnut hair',
  'short blunt bob hair',
  'low ponytail with loose face-framing strands',
  'messy bun with soft flyaway hair',
  'half-up wavy hair',
  'shoulder-length hush cut hair',
  'sleek black lob hair',
  'long reddish brown loose perm hair',
  'high ponytail with airy bangs',
  'short wolf cut hair',
  'natural black hime cut',
  'soft brown hippie perm hair'
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
  { id: 'outfit_0001', useCase: 'daily', exposure: 'low', fit: 'cropped fitted outerwear, tight skinny bottom', prompt: 'a black fitted leather biker jacket with a cropped waist, layered over a plain white top, black high-waisted skinny pants, sharp structured shoulders, compact city silhouette', avoid: 'gown, swimsuit, fantasy armor' },
  { id: 'outfit_0003', useCase: 'date', exposure: 'medium', fit: 'fitted cropped top, tight mini skirt', prompt: 'a white short-sleeve cropped cardigan with black button accents, paired with a high-waisted gray bodycon mini skirt, clean fitted summer styling', avoid: 'oversized sweater, long skirt, heavy coat' },
  { id: 'outfit_0005', useCase: 'daily', exposure: 'medium', fit: 'cropped fitted cardigan, structured pleated mini skirt', prompt: 'a beige cropped button cardigan layered over a white collared shirt, matching beige pleated mini skirt, rolled white cuffs, neat preppy styling', avoid: 'bikini, latex, evening gown' },
  { id: 'outfit_0021', useCase: 'daily', exposure: 'medium', fit: 'fitted knit top, short wrap skirt', prompt: 'an ivory ribbed long-sleeve fitted knit top, cream wrap mini skirt with side tie, white sneakers, slim casual date styling', avoid: 'lingerie, fantasy costume' },
  { id: 'outfit_0022', useCase: 'office', exposure: 'medium', fit: 'fitted blazer, tight mini skirt', prompt: 'a black fitted business blazer over a white shirt, burgundy tie, black high-waisted bodycon mini skirt, sharp office-uniform styling', avoid: 'swimsuit, loose streetwear' },
  { id: 'outfit_0025', useCase: 'daily', exposure: 'medium', fit: 'cropped sweatshirt, loose pleated mini skirt', prompt: 'a sky-blue cropped long-sleeve sweatshirt, white pleated mini skirt, white socks, relaxed sporty casual styling', avoid: 'lace lingerie, business blazer' },
  { id: 'outfit_0024', useCase: 'uniform', exposure: 'medium', fit: 'fitted shirt, loose pleated mini skirt', prompt: 'a white long-sleeve button shirt with a red neck scarf, navy pleated mini skirt, clean school-uniform inspired styling, fitted waist and crisp fabric', avoid: 'leather catsuit, evening gown' },
  { id: 'outfit_0026', useCase: 'uniform', exposure: 'low', fit: 'loose vest, pleated mini skirt', prompt: 'a gray sleeveless knit vest over a white short-sleeve blouse, black ribbon tie, dark plaid pleated mini skirt, soft school-uniform inspired styling', avoid: 'bodycon dress, swimwear' },
  { id: 'outfit_0034', useCase: 'daily', exposure: 'medium', fit: 'fitted sleeveless vest, loose pleated mini skirt', prompt: 'a navy sleeveless button knit vest, beige plaid pleated mini skirt, fitted top with loose short skirt, neat preppy casual styling', avoid: 'latex, formal gown, tote bag, handbag' },
  { id: 'outfit_0036', useCase: 'date', exposure: 'medium', fit: 'tight camisole, tight leather mini skirt', prompt: 'a black spaghetti-strap camisole tucked into a silver-gray faux leather mini skirt with a side slit, glossy tight lower silhouette', avoid: 'loose sweater' },
  { id: 'outfit_0037', useCase: 'office', exposure: 'low', fit: 'fitted blouse, tight pencil skirt', prompt: 'a lavender satin button blouse tucked into a pale gray high-waisted pencil skirt, slim office-date silhouette, soft glossy fabric', avoid: 'bikini, fantasy armor' },
  { id: 'outfit_0039', useCase: 'date', exposure: 'medium', fit: 'oversized sweater dress, belted waist', prompt: 'an oversized ivory long-sleeve sweater mini dress cinched with a wide black belt, slouchy sleeves, loose upper fit with defined waist', avoid: 'summer bikini, school blazer, boots' },
  { id: 'outfit_0040', useCase: 'daily', exposure: 'medium', fit: 'tight crop top, fitted denim shorts', prompt: 'a white asymmetrical strappy crop top, light blue high-waisted denim shorts, casual summer styling, fitted waist and compact silhouette', avoid: 'formal skirt suit' },
  { id: 'outfit_0041', useCase: 'date', exposure: 'low', fit: 'fitted sleeveless mini dress', prompt: 'a black sleeveless mini dress with a simple fitted bodice and slight A-line hem, black strappy sandals, minimal summer date styling', avoid: 'athletic leggings, heavy coat' },
  { id: 'outfit_0047', useCase: 'daily', exposure: 'medium', fit: 'loose open shirt, tight mini skirt', prompt: 'a loose white short-sleeve button shirt worn open over a fitted white tank, black high-waisted bodycon mini skirt, relaxed top with tight skirt', avoid: 'lingerie lace, fantasy armor' },
  { id: 'outfit_0048', useCase: 'date', exposure: 'medium', fit: 'fitted knit top, flared pleated mini skirt', prompt: 'a pale mint fitted short-sleeve knit top, white pleated mini skirt with a belt, black thigh-high socks, cute preppy silhouette', avoid: 'latex, swimsuit' },
  { id: 'outfit_0050', useCase: 'sporty', exposure: 'medium', fit: 'tight sleeveless crop top, flared tennis skirt', prompt: 'a burgundy sleeveless high-neck crop top, white flared tennis mini skirt, fitted sporty silhouette with exposed midriff', avoid: 'long dress, business suit' },
  { id: 'outfit_0051', useCase: 'sporty', exposure: 'medium', fit: 'tight crop tank, compression leggings', prompt: 'a beige sleeveless cropped athletic top with cutout waist detail, taupe high-waisted compression leggings, body-hugging gym fit', avoid: 'lace' },
  { id: 'outfit_0055', useCase: 'uniform', exposure: 'medium', fit: 'fitted blazer, pleated mini skirt', prompt: 'a navy school-uniform blazer over a white shirt, striped tie, navy pleated mini skirt, structured uniform silhouette, adult age 19 or older styling', avoid: 'swimsuit, evening dress' },
  { id: 'outfit_0061', useCase: 'date', exposure: 'low', fit: 'loose white shirt dress, cinched waist', prompt: 'a white semi-sheer long-sleeve shirt dress with a belted waist, ruffled short hem, airy loose fit with defined waist', avoid: 'latex, athletic leggings' },
  { id: 'outfit_0064', useCase: 'date', exposure: 'low', fit: 'slim satin slip mini dress', prompt: 'a white satin sleeveless slip mini dress with a draped neckline, slim fitted waist, smooth minimalist date styling', avoid: 'sportswear, school tie' },
  { id: 'outfit_0069', useCase: 'date', exposure: 'low', fit: 'fitted cropped jacket, flared pleated skirt', prompt: 'a cream tweed cropped jacket with gold buttons, white pleated mini skirt, soft romantic preppy styling, fitted top and flared skirt', avoid: 'leather, swimwear' },
  { id: 'outfit_0072', useCase: 'daily', exposure: 'low', fit: 'sleeveless fitted top, belted flared skirt', prompt: 'a black sleeveless top tucked into a black belted A-line mini skirt, structured city styling, fitted waist with loose skirt volume', avoid: 'lingerie, swimsuit' },
  { id: 'outfit_0073', useCase: 'date', exposure: 'low', fit: 'loose tiered dress', prompt: 'a black short-sleeve tiered babydoll mini dress, airy loose fit, soft puff sleeves, relaxed summer silhouette', avoid: 'bodycon latex, office pencil skirt' },
  { id: 'outfit_0081', useCase: 'date', exposure: 'low', fit: 'loose blouse top, belted mini dress', prompt: 'a beige long-sleeve mini dress with blouse-like top, high gathered waist, double-breasted belt detail, soft loose sleeves and short skirt', avoid: 'sportswear, bikini' },
  { id: 'outfit_0085', useCase: 'date', exposure: 'medium', fit: 'fitted wrap mini dress', prompt: 'a black short-sleeve wrap mini dress with ruffled neckline, cinched waist buckle, soft fitted date silhouette', avoid: 'latex bodysuit' },
  { id: 'outfit_0088', useCase: 'uniform', exposure: 'medium', fit: 'fitted blouse, structured pleated skirt', prompt: 'a dark gray short-sleeve button blouse with a black bow at the collar, black pleated mini skirt, sheer black tights, fitted school-uniform inspired styling', avoid: 'swimsuit, evening gown' },
  { id: 'outfit_0095', useCase: 'office', exposure: 'low', fit: 'loose blouse, tight textured mini skirt', prompt: 'a black satin button blouse tucked into a white fuzzy textured bodycon mini skirt, loose glossy top and tight soft skirt', avoid: 'swimsuit, fantasy outfit' },
  { id: 'outfit_0109', useCase: 'sporty', exposure: 'medium', fit: 'loose cropped jersey, flared pleated skirt', prompt: 'a red oversized cropped baseball jersey, white pleated tennis mini skirt, sporty casual fit with loose top and flared skirt', avoid: 'lingerie, formal gown' },
  { id: 'outfit_0158', useCase: 'daily', exposure: 'medium', fit: 'fitted tank, loose denim jacket, fitted shorts', prompt: 'a white fitted sleeveless tank top, light blue denim jacket worn loose off the shoulders, high-waisted denim shorts, beige belt, casual denim-on-denim styling', avoid: 'latex, evening gown' },
  { id: 'outfit_0201', useCase: 'date', exposure: 'medium-high', fit: 'tight sleeveless knit mini dress, body-hugging waist and hips', prompt: 'a charcoal gray sleeveless ribbed knit turtleneck mini dress, high neck, exposed shoulders and arms, thick textured knit fabric, body-hugging torso, short straight hem, cozy cafe-date styling with a compact fitted silhouette', avoid: 'bag, backpack, boots, coffee cup, mug, drink, loose oversized sweater' },
  { id: 'outfit_0202', useCase: 'daily', exposure: 'medium', fit: 'tight cropped tank, loose cardigan, short relaxed skirt', prompt: 'a white ribbed scoop-neck cropped tank top, lightweight ivory cardigan slipped off the shoulders with long loose sleeves, beige gingham drawstring mini skirt, relaxed picnic styling with fitted upper body and soft loose skirt', avoid: 'bag, handbag, boots, coffee cup, mug, drink, heavy jacket' },
  { id: 'outfit_0203', useCase: 'date', exposure: 'medium-high', fit: 'slim lace camisole, voluminous bubble mini skirt', prompt: 'a pale dusty-pink satin camisole with thin shoulder straps, gray lace trim along the neckline and bust seam, soft semi-sheer layered fabric over an opaque lining, paired with a champagne satin bubble mini skirt with gathered volume and a high waist, delicate arcade-date styling', avoid: 'bag, backpack, boots, coffee cup, mug, drink, denim shorts' },
  { id: 'outfit_0204', useCase: 'daily', exposure: 'medium', fit: 'very tight sleeveless ribbed knit top, relaxed drawstring pants', prompt: 'a black sleeveless ribbed knit mock-neck top, high collar, exposed shoulders, close body-hugging stretch fit through the torso, paired with light gray soft drawstring lounge pants sitting low at the waist, casual home snapshot styling', avoid: 'bag, boots, coffee cup, mug, drink, skirt suit' },
  { id: 'outfit_0205', useCase: 'date', exposure: 'medium-high', fit: 'flowy babydoll mini dress, fitted bust and loose skirt', prompt: 'a pale mint chiffon babydoll mini dress with thin spaghetti straps, ruched fitted bust, empire waist, translucent airy overlay, floaty loose A-line skirt, soft romantic indoor date styling', avoid: 'bag, boots, coffee cup, mug, drink, heavy coat' },
  { id: 'outfit_0206', useCase: 'sporty', exposure: 'medium-high', fit: 'tight wrap crop top, fitted denim short overalls', prompt: 'a white wrap-front strappy crop top with thin shoulder straps and tied front detail, paired with light blue high-waisted denim short overalls, one bib strap worn diagonally off one shoulder, compact festival styling with fitted waist and short denim silhouette', avoid: 'bag, backpack, boots, coffee cup, mug, drink, animal-ear headband' },
  { id: 'outfit_0207', useCase: 'date', exposure: 'medium-high', fit: 'halter wrap top, tight high-waisted mini skirt', prompt: 'a navy pinstripe halter wrap top with a deep V neckline, crossed front panels, open shoulders, tailored waist emphasis, paired with a black high-waisted fitted mini skirt, sleek lounge-date styling with a sharp office-inspired silhouette', avoid: 'bag, boots, coffee cup, mug, drink, blazer jacket' },
  { id: 'outfit_0002', useCase: 'adult', exposure: 'high', fit: 'very tight bodycon, short mini length', prompt: 'a burgundy bodycon mini dress with a corset-like waist panel, deep neckline, sleeveless upper cut, very tight fit through the torso and hips, short clubwear silhouette', avoid: 'loose oversized fit, office blazer, sportswear' },
  { id: 'outfit_0011', useCase: 'adult', exposure: 'high', fit: 'tight satin cheongsam, long length with high slit', prompt: 'a silver satin cheongsam-style evening dress with red piping, floral embroidery, body-hugging waist and hips, high side slit, glossy formal fabric', avoid: 'casual sneakers, denim shorts' },
  { id: 'outfit_0049', useCase: 'adult', exposure: 'high', fit: 'sheer tight top, flared mini skirt', prompt: 'a black sheer long-sleeve mesh top over a dark bra, paired with a black flared mini skirt, tight upper body with short flared lower silhouette', avoid: 'office blouse, denim shorts' },
  { id: 'outfit_0054', useCase: 'adult', exposure: 'medium-high', fit: 'tight off-shoulder sweater dress', prompt: 'a gray ribbed off-shoulder bodycon mini sweater dress with front lace-up tie, very tight knit fit, short hem', avoid: 'loose hoodie, long coat' },
  { id: 'outfit_0074', useCase: 'adult', exposure: 'medium-high', fit: 'tight strapless mini dress', prompt: 'a silver metallic strapless bodycon mini dress, glossy reflective fabric, tight straight silhouette, party styling', avoid: 'casual cotton, sneakers' },
  { id: 'outfit_0079', useCase: 'adult', exposure: 'high', fit: 'glossy latex crop top and mini skirt', prompt: 'a black glossy latex long-sleeve crop top with deep neckline, matching black latex micro mini skirt, extremely tight reflective clubwear fit', avoid: 'soft cotton, loose fit' },
  { id: 'outfit_0092', useCase: 'adult', exposure: 'high', fit: 'tight black long dress, high slit', prompt: 'a black lace halter evening gown with side cutouts, sheer lace torso panels, thigh-high slit, fitted waist and long skirt', avoid: 'sportswear, school socks' },
  { id: 'outfit_0107', useCase: 'adult', exposure: 'high', fit: 'strapless crop top, tight mini skirt', prompt: 'a black strapless bandeau crop top with a front cutout, matching black bodycon mini skirt, minimal tight clubwear silhouette', avoid: 'preppy skirt, office blouse' },
  { id: 'outfit_0157', useCase: 'adult', exposure: 'medium-high', fit: 'tight high-slit skirt, fitted top', prompt: 'a black fitted long-sleeve top paired with a high-waisted floral satin wrap skirt, dramatic thigh-high slit, tight elegant silhouette', avoid: 'sporty casual' },
  { id: 'outfit_0066', useCase: 'fantasy', exposure: 'medium', fit: 'corset bodice, flared mini skirt', prompt: 'a white fantasy mini dress with a metallic silver corset bodice, structured bust, flared short skirt, glossy armored waist styling', avoid: 'realistic office outfit' },
  { id: 'outfit_0112', useCase: 'fantasy', exposure: 'medium-high', fit: 'tight metallic mini dress', prompt: 'a silver metallic sci-fi mini dress with structured short sleeves, reflective panels, matching silver gloves, tight futuristic fit', avoid: 'cotton casual, boots' },
  { id: 'outfit_0114', useCase: 'fantasy', exposure: 'medium', fit: 'full-body latex catsuit', prompt: 'a glossy black full-body latex catsuit with neon green circuit-like accents, extremely tight futuristic silhouette', avoid: 'loose fabric, casual streetwear' },
  { id: 'outfit_0121', useCase: 'fantasy', exposure: 'medium', fit: 'fitted turtleneck top, short skirt', prompt: 'a teal ribbed turtleneck top with a gold asymmetrical armor-like skirt panel, black thigh-high stockings, futuristic fantasy styling', avoid: 'realistic casual outfit' },
  { id: 'outfit_0137', useCase: 'fantasy', exposure: 'low', fit: 'fitted bodice, very full skirt', prompt: 'a black gothic maid dress with white apron, puff sleeves, layered full skirt, black patterned stockings, chunky shoes, voluminous Victorian maid silhouette', avoid: 'bodycon clubwear' }
];

function pick<T>(items: T[], index: number): T {
  return items[Math.abs(index) % items.length];
}

function mixedIndex(primary: number, secondary: number, salt: number): number {
  return Math.abs(primary * 37 + secondary * 101 + Math.floor(Math.abs(primary) / 5) * 17 + salt);
}

function weightedQuality(index: number): string {
  if (index % 5 !== 0) return '';
  return pick(QUALITY_PROMPTS, index);
}

function allowedOutfits(mode: BlindDateMode | undefined, index: number): OutfitPreset[] {
  if (mode === 'encounter') return OUTFIT_PRESETS.filter(item => item.useCase !== 'fantasy' && item.exposure !== 'high');
  if (mode === 'worldcup') return OUTFIT_PRESETS.filter(item => item.useCase !== 'fantasy');
  if (index % 10 === 0) return OUTFIT_PRESETS;
  return OUTFIT_PRESETS.filter(item => item.useCase !== 'fantasy' && item.exposure !== 'high');
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
    pick(HAIR_STYLES, index * 5),
    options.appearance.hairColor,
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
    `outfit preset ${outfit.id}: ${outfit.prompt}`,
    `fit detail: ${outfit.fit}`,
    'no bag, no handbag, no backpack, no boots, no coffee cup, no mug, no drink cup, no handheld drink props',
    pick(EXPRESSIONS, index * 17),
    pick(POSES, index * 19),
    `background: ${pick(BACKGROUNDS, index * 23)}`,
    pick(LIGHTING, index * 29),
    pick(COMPOSITIONS, index * 31),
    quality,
    'realistic Korean personal snapshot, natural skin texture, face clearly visible'
  ].filter(Boolean).join(', ');
}
