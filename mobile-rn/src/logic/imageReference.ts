import { SNSGodCharacter } from '../types';

const RENDERABLE_URI_PATTERN = /^(data:|file:|content:|asset:|https?:\/\/)/i;

export function characterReferenceImageForPrompt(character: SNSGodCharacter | undefined, imagePrompt: string): string | undefined {
  const referenceImages = characterReferenceImages(character);
  if (!referenceImages.length) return undefined;

  const prompt = String(imagePrompt || '');
  const text = prompt.toLowerCase();
  const characterName = String(character?.name || '').trim().toLowerCase();
  const namesCharacter = Boolean(characterName && text.includes(characterName));
  const looksLikeCharacterPhoto = namesCharacter
    || /\b(selfie|self-portrait|portrait|face|facial|mirror selfie|close-up|full body|upper body|photo of me|picture of me)\b/i.test(prompt)
    || /\uC140\uCE74|\uC790\uAE30\s*\uC0AC\uC9C4|\uBCF8\uC778\s*\uC0AC\uC9C4|\uC5BC\uAD74|\uCD08\uC0C1|\uC804\uC2E0|\uC0C1\uBC18\uC2E0|\uAC70\uC6B8\s*\uC0F7/.test(prompt);

  if (!looksLikeCharacterPhoto) return undefined;
  const fullBodyOrOutfit = /(full body|upper body|outfit|wearing|mirror selfie)/i.test(prompt)
    || /전신|상반신|옷|의상|착장|거울s*샷/.test(prompt);
  return fullBodyOrOutfit ? referenceImages[1] || referenceImages[0] : referenceImages[0];
}

export function characterReferenceImageForSns(character: SNSGodCharacter | undefined): string | undefined {
  return characterReferenceImages(character)[0];
}

export function primaryCharacterReferenceImage(character: SNSGodCharacter | undefined): string | undefined {
  const direct = String(character?.profileReferenceImage || character?.profileImage || character?.avatar || '').trim();
  if (RENDERABLE_URI_PATTERN.test(direct)) return direct;
  return characterReferenceImages(character)[0];
}

export function characterReferenceImages(character: SNSGodCharacter | undefined): string[] {
  const values = [
    ...(Array.isArray(character?.profileReferenceImages) ? character?.profileReferenceImages || [] : []),
    character?.profileReferenceImage
  ];
  return Array.from(new Set(values.map(value => String(value || '').trim()).filter(value => RENDERABLE_URI_PATTERN.test(value)))).slice(0, 3);
}

export function randomReferenceImage(images: string[]): string | undefined {
  const candidates = images.map(value => String(value || '').trim()).filter(value => RENDERABLE_URI_PATTERN.test(value)).slice(0, 3);
  if (!candidates.length) return undefined;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
