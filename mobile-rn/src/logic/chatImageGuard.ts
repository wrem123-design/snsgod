import { SNSGodMessage, SNSGodState } from '../types';

const IMAGE_INTENT_PATTERN = /사진|셀카|이미지|그림|일러|짤|캡처|캡쳐|포토|착장|옷차림|얼굴|모습|표정|전신|거울샷|셀피|보여줘|보내줘|찍어줘|올려줘|첨부|photo|selfie|picture|image|pic|show me|send me|take a photo|draw|illustration|outfit|face|look|appearance/i;
const IMAGE_NEGATION_PATTERN = /사진은\s*(됐|괜찮|필요\s*없|말로)|이미지는\s*(됐|괜찮|필요\s*없|말로)|셀카는\s*(됐|괜찮|필요\s*없|말로)|그림은\s*(됐|괜찮|필요\s*없|말로)|no\s*(photo|image|picture|selfie)|don't\s*(send|show).*(photo|image|picture|selfie)|text\s*only|말로\s*해/i;
const CHARACTER_PROMISED_IMAGE_PATTERN = /사진.*(보낼게|보내줄게|찍어|보여줄게|올릴게)|셀카.*(보낼게|보내줄게|찍어|보여줄게)|photo|selfie|picture/i;
const SITUATIONAL_IMAGE_CONTEXT_PATTERN = /뭐\s*먹|먹었|먹는\s*중|점심|저녁|아침|간식|카페|커피|디저트|음식|메뉴|맛있|외출|밖이|밖에|나왔|나가는|산책|길|거리|장소|풍경|하늘|바다|공원|여행|데이트|착장|옷|입었|입고|코디|패션|거울|머리|화장|네일|지금\s*뭐해|뭐하고|where are you|what are you eating|food|lunch|dinner|coffee|cafe|outfit|wearing|outside|walk|view|sky|place/i;
const SELFIE_IMAGE_PROMPT_PATTERN = /selfie|mirror|portrait|face|full body|outfit|wearing|food|meal|cafe|coffee|street|outside|walk|view|sky|photo|phone photo|snapshot|사진|셀카|착장|음식/i;
const SITUATIONAL_IMAGE_CHANCE = 0.82;

export function hasExplicitImageIntent(text: string): boolean {
  const value = String(text || '');
  if (!value.trim()) return false;
  if (IMAGE_NEGATION_PATTERN.test(value)) return false;
  return IMAGE_INTENT_PATTERN.test(value);
}

export function recentChatEstablishedPhotoContext(messages: SNSGodMessage[], characterId: string, limit = 6): boolean {
  const recent = (messages || []).slice(-limit);
  if (!recent.length) return false;
  const userAsked = recent.some(message => message.role === 'user' && hasExplicitImageIntent(String(message.content || '')));
  const characterPromised = recent.some(message =>
    message.role === 'character'
    && String(message.characterId || '') === String(characterId || '')
    && CHARACTER_PROMISED_IMAGE_PATTERN.test(String(message.content || ''))
  );
  return userAsked || characterPromised;
}

function hasSituationalImageContext(text: string): boolean {
  const value = String(text || '');
  if (!value.trim()) return false;
  if (IMAGE_NEGATION_PATTERN.test(value)) return false;
  return SITUATIONAL_IMAGE_CONTEXT_PATTERN.test(value);
}

function imagePromptMatchesSituation(imagePrompt: string): boolean {
  return SELFIE_IMAGE_PROMPT_PATTERN.test(String(imagePrompt || ''));
}

export function shouldAllowChatImageGeneration(params: {
  state: SNSGodState;
  roomId: string;
  characterId: string;
  latestUserText: string;
  sourceMode?: string;
  imagePrompt?: string;
}): boolean {
  const { state, roomId, characterId, latestUserText, sourceMode, imagePrompt } = params;
  if (state.config.imageGeneration?.enabled === false) return false;
  if (!String(imagePrompt || '').trim()) return false;
  const room = Object.values(state.chatRooms || {}).flat().find(item => item.id === roomId);
  const imageReplyMode = String(room?.imageReplyMode || 'natural');
  if (imageReplyMode === 'off') return false;
  if (imageReplyMode === 'natural') return true;
  if (sourceMode === 'proactive') return imagePromptMatchesSituation(String(imagePrompt || ''));
  if (hasExplicitImageIntent(latestUserText) || recentChatEstablishedPhotoContext(state.messages?.[roomId] || [], characterId)) return true;
  if (hasSituationalImageContext(latestUserText) && imagePromptMatchesSituation(String(imagePrompt || ''))) {
    return Math.random() < SITUATIONAL_IMAGE_CHANCE;
  }
  return false;
}
