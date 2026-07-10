export type PromptCapabilityInput = {
  latestUserText: string;
  mode: 'reply' | 'proactive' | 'reroll' | 'group';
  timeEnabled: boolean;
  weatherEnabled: boolean;
  hasWeather: boolean;
  imageEnabled: boolean;
  hasImageInput: boolean;
  phoneEnabled: boolean;
  hasStickers: boolean;
};

export type PromptCapabilityId =
  | 'capability.date'
  | 'capability.time'
  | 'capability.weather'
  | 'capability.image'
  | 'capability.phone'
  | 'capability.stickers';

export type ResolvedPromptCapabilities = {
  date: boolean;
  time: boolean;
  weather: boolean;
  image: boolean;
  phone: boolean;
  stickers: boolean;
  includedBlockIds: PromptCapabilityId[];
};

const DATE_INTENT = /오늘|내일|모레|글피|요일|날짜|며칠|몇\s*일|이번\s*주|다음\s*주|주말|월요일|화요일|수요일|목요일|금요일|토요일|일요일|today|tomorrow|date|weekday|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday/i;
const IMAGE_INTENT = /사진|이미지|그림|셀카|얼굴|모습|보여\s*줘|보여줄|찍어|옷|착장|풍경|photo|picture|image|selfie|show me|outfit|face/i;
const PHONE_INTENT = /전화|통화|보이스콜|콜\s*할|전화해|전화하자|call|phone|voice chat/i;

export function resolvePromptCapabilities(input: PromptCapabilityInput): ResolvedPromptCapabilities {
  const latestUserText = String(input.latestUserText || '');
  const date = DATE_INTENT.test(latestUserText);
  const time = input.timeEnabled;
  const weather = input.weatherEnabled && input.hasWeather;
  const image = input.imageEnabled && (input.hasImageInput || IMAGE_INTENT.test(latestUserText) || input.mode === 'proactive');
  const phone = input.phoneEnabled && PHONE_INTENT.test(latestUserText);
  const stickers = input.hasStickers;
  const includedBlockIds: PromptCapabilityId[] = [];
  if (date) includedBlockIds.push('capability.date');
  if (time) includedBlockIds.push('capability.time');
  if (weather) includedBlockIds.push('capability.weather');
  if (image) includedBlockIds.push('capability.image');
  if (phone) includedBlockIds.push('capability.phone');
  if (stickers) includedBlockIds.push('capability.stickers');
  return { date, time, weather, image, phone, stickers, includedBlockIds };
}

export function hasPromptWeather(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).some(item => {
    if (typeof item === 'string') return item.trim().length > 0;
    return typeof item === 'number' && Number.isFinite(item);
  });
}
