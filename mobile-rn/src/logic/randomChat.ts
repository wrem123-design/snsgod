import { RandomChatRoom, SNSGodCharacter, SNSGodMessage, SNSGodRoom, SNSGodState } from '../types';
import { parseJsonObject } from './api';
import { makeId } from './ids';
import { createRoom } from './stateHelpers';

export type RandomGender = 'any' | 'male' | 'female';

export const RANDOM_GENDERS: Array<{ value: RandomGender; label: string }> = [
  { value: 'any', label: '전체' },
  { value: 'male', label: '남자만' },
  { value: 'female', label: '여자만' }
];

function pick(list: string[]) {
  return list[Math.floor(Math.random() * list.length)];
}

export function randomGenderPreference(state: SNSGodState): RandomGender {
  const value = String(state.config.randomChatGender || 'any');
  return value === 'male' || value === 'female' ? value : 'any';
}

export function randomGenderLabel(value: RandomGender) {
  return value === 'male' ? '남자만' : value === 'female' ? '여자만' : '전체';
}

export function randomChatRooms(state: SNSGodState): RandomChatRoom[] {
  return Array.isArray(state.randomChats) ? state.randomChats : [];
}

export function findRandomChat(state: SNSGodState, roomId?: string) {
  if (!roomId) return undefined;
  return randomChatRooms(state).find(room => room.id === roomId);
}

export function isRandomRoom(state: SNSGodState, room: SNSGodRoom | undefined) {
  if (!room) return false;
  return room.type === 'random' || room.randomChat === true || Boolean(findRandomChat(state, room.id));
}

export function randomTraitBundle(state: SNSGodState, gender: RandomGender) {
  const identityTypes = [
    'ordinary human', 'diaspora human with mixed cultural background',
    'fantasy human from a fictional kingdom', 'android passing as human',
    'half-fae courier', 'vampire with old-fashioned texting habits',
    'merfolk living secretly near a harbor', 'dragon in a human disguise',
    'ghost tied to an abandoned train station', 'alien exchange student using a translator app',
    'shapeshifter with a borrowed phone', 'sentient familiar using a charm-phone'
  ];
  const origins = [
    'Mexico City, Mexico', 'Lagos, Nigeria', 'Marrakesh, Morocco', 'Sao Paulo, Brazil',
    'Reykjavik, Iceland', 'Kyoto, Japan', 'Paris, France', 'Seville, Spain',
    'Berlin, Germany', 'Istanbul, Turkey', 'Mumbai, India', 'Bangkok, Thailand',
    'Manila, Philippines', 'Toronto, Canada', 'New Orleans, USA',
    'a floating fantasy market', 'a moon colony dormitory', 'a hidden forest village'
  ];
  const languages = [
    'English', 'Japanese', 'Spanish', 'French', 'Portuguese', 'German',
    'Thai', 'Vietnamese', 'Tagalog', 'Hindi', 'Arabic', 'Turkish',
    'Korean only if the origin seed explicitly fits it', 'bilingual English plus local slang'
  ];
  const archetypes = [
    'street food vendor who knows everyone by their shoes',
    'lonely radio host broadcasting after midnight',
    'botanical witch who sells impossible flowers',
    'museum guard who hears paintings whisper',
    'retired monster hunter raising houseplants',
    'student pilot on a lunar shuttle route',
    'underground jazz singer avoiding their old name',
    'hotel concierge for supernatural guests',
    'android learning how to lie politely',
    'ghost who remembers too many versions of the same city'
  ];
  const temperaments = [
    'bright but emotionally guarded', 'dry, teasing, and secretly attentive',
    'soft-spoken but stubborn', 'chaotic and affectionate', 'formal, curious, and lonely',
    'protective but bad at admitting fear', 'reckless, funny, and too honest',
    'sharp-tongued with a sincere caretaking streak'
  ];
  const hooks = [
    'they messaged the wrong person and refuse to admit it was a mistake',
    'they need a stranger to keep them awake until sunrise',
    'they are hiding from a small magical accident',
    'they found the user through a random-chat glitch that feels too specific',
    'they want advice but frame it as a joke',
    'they are stuck somewhere strange and need calm company'
  ];
  const visuals = [
    'distinct cultural clothing details without stereotypes',
    'urban night casualwear with one strange accessory',
    'fantasy travel outfit with practical worn details',
    'soft domestic room lighting and unusual eyes',
    'weathered work clothes, hands-on profession mood',
    'magical traits visible but subtle'
  ];
  const usedNames = randomChatRooms(state).map(room => room.character?.name).filter(Boolean).slice(0, 24).join(', ') || '(none)';
  return [
    `Gender generation target: ${gender === 'male' ? 'male only. The character must identify/present as male.' : gender === 'female' ? 'female only. The character must identify/present as female.' : 'any gender. Choose freely and state it clearly.'}`,
    `Identity type seed: ${pick(identityTypes)}.`,
    `Origin/culture seed: ${pick(origins)}.`,
    `Primary language seed: ${pick(languages)}. The firstMessage and normal chat style should match this language unless the character is explicitly bilingual.`,
    `Archetype seed: ${pick(archetypes)}.`,
    `Temperament seed: ${pick(temperaments)}.`,
    `First-chat hook: ${pick(hooks)}.`,
    `Visual direction: ${pick(visuals)}.`,
    `Avoid these already used random-chat names: ${usedNames}.`,
    'Make this character sharply different from existing random chats in origin, species, job, speech rhythm, emotional problem, and visual tags.',
    'The character has just met the user through random chat. Do not assume romance, shared memories, prior closeness, or physical proximity.',
    'Do not use famous characters, celebrities, real people, copyrighted settings, or stereotypes.'
  ].join('\n');
}

function sanitizeFirstMessage(value: string) {
  const text = String(value || '').trim();
  if (!text) return '랜덤채팅으로 연결됐어요. 혹시 잠깐 이야기해도 괜찮을까요?';
  if (/자기|사랑|보고 싶|기다렸|우리 또|remember us/i.test(text)) {
    return '랜덤채팅으로 연결됐네요. 낯선 사람한테 이런 말 해도 되는지 모르겠지만, 잠깐 이야기해도 돼요?';
  }
  return text;
}

export function parseRandomCharacter(text: string, gender: RandomGender, conceptSeed: string): SNSGodCharacter {
  const parsed = parseJsonObject<Partial<SNSGodCharacter> & { gender?: string; illustrationTags?: string; statusMessage?: string }>(text) || {};
  const id = makeId('random');
  const name = String(parsed.name || parsed.avatarText || '랜덤 캐릭터').trim() || '랜덤 캐릭터';
  return {
    id,
    name,
    handle: String(parsed.handle || id).replace(/^@/, ''),
    avatarText: String(parsed.avatarText || name).slice(0, 2),
    avatar: parsed.avatar,
    profileImage: parsed.profileImage || parsed.avatar,
    color: String(parsed.color || '#8bd3dd'),
    prompt: String(parsed.prompt || parsed.illustrationTags || conceptSeed),
    firstMessage: sanitizeFirstMessage(String(parsed.firstMessage || '랜덤채팅으로 연결됐어요. 혹시 잠깐 이야기해도 괜찮을까요?')),
    statusMessage: String(parsed.statusMessage || '랜덤채팅 중'),
    enabled: true,
    proactiveEnabled: false,
    randomTemporary: true,
    randomConceptSeed: conceptSeed,
    genderPreferenceLabel: randomGenderLabel(gender),
    memories: [],
    stickers: []
  };
}

export function buildRandomPrompt(state: SNSGodState, gender: RandomGender, conceptSeed: string) {
  const promptConfig = state.config.prompts as Partial<Record<string, string>> | undefined;
  return [
    promptConfig?.random_character || state.config.prompts?.profileCreation || 'Create a fictional random-chat character.',
    '',
    'Critical JSON rules:',
    '- Return exactly one JSON object and nothing else.',
    '- Use double-quoted property names and double-quoted string values.',
    '- Do not use trailing commas, comments, markdown fences, or extra prose.',
    '',
    'Create one random-chat character now. Return JSON only:',
    '{"name":"...","handle":"...","avatarText":"...","color":"#hex","prompt":"...","firstMessage":"...","statusMessage":"...","profileAvatarPrompt":"...","profileCoverPrompt":"..."}',
    '',
    'Randomization seed for this one generation:',
    conceptSeed,
    '',
    'User context:',
    `- User name: ${state.config.userName || 'User'}`,
    `- User profile: ${state.config.userDescription || '(empty)'}`,
    `- Current app language: ${state.config.language || 'Korean'}`
  ].join('\n');
}

export function addRandomChatRoom(state: SNSGodState, character: SNSGodCharacter, conceptSeed: string): { next: SNSGodState; roomId: string } {
  const now = Date.now();
  const room: RandomChatRoom = {
    id: `${character.id}_${makeId('room')}`,
    characterId: character.id,
    name: `${character.name} 랜덤채팅`,
    createdAt: now,
    lastActivity: now,
    type: 'random',
    randomChat: true,
    character: { ...character, proactiveEnabled: false, randomTemporary: true },
    conceptSeed,
    promoted: false
  };
  const first: SNSGodMessage[] = character.firstMessage ? [{
    id: makeId('msg'),
    role: 'character',
    characterId: character.id,
    content: character.firstMessage,
    createdAt: now,
    sourceMode: 'randomchat'
  }] : [];
  const next: SNSGodState = {
    ...state,
    messages: { ...state.messages, [room.id]: first },
    randomChats: [room, ...randomChatRooms(state)],
    selectedRoomId: room.id
  };
  return { next, roomId: room.id };
}

export function removeRandomChatRoom(state: SNSGodState, roomId: string): SNSGodState {
  const room = findRandomChat(state, roomId);
  if (!room) return state;
  const messages = { ...state.messages };
  const unreadCounts = { ...state.unreadCounts };
  delete messages[roomId];
  delete unreadCounts[roomId];
  return {
    ...state,
    messages,
    unreadCounts,
    randomChats: randomChatRooms(state).filter(item => item.id !== roomId),
    selectedRoomId: state.selectedRoomId === roomId ? undefined : state.selectedRoomId
  };
}

function cloneCharacterForPromotion(character: SNSGodCharacter, state: SNSGodState): SNSGodCharacter {
  const usedIds = new Set(state.characters.map(item => item.id));
  const id = usedIds.has(character.id) ? makeId('char') : character.id;
  return {
    ...character,
    id,
    enabled: true,
    proactiveEnabled: false,
    randomTemporary: false,
    promotedFromRandom: true
  };
}

export function promoteRandomChatRoom(state: SNSGodState, roomId: string): { next: SNSGodState; newRoomId?: string; characterId?: string } {
  const randomRoom = findRandomChat(state, roomId);
  if (!randomRoom) return { next: state };

  const character = cloneCharacterForPromotion(randomRoom.character, state);
  const directRoom = createRoom(character.id, randomRoom.name || '랜덤채팅');
  const copiedMessages: SNSGodMessage[] = (state.messages[roomId] || []).map(message => ({
    ...message,
    id: makeId('msg'),
    characterId: message.role === 'character' ? character.id : message.characterId,
    sourceMode: message.sourceMode || 'promoted_randomchat'
  }));
  const messages = { ...state.messages, [directRoom.id]: copiedMessages };
  const unreadCounts = { ...state.unreadCounts };
  if (state.messages[roomId]) delete messages[roomId];
  if (unreadCounts[roomId]) {
    unreadCounts[directRoom.id] = unreadCounts[roomId];
    delete unreadCounts[roomId];
  }

  return {
    next: {
      ...state,
      characters: [...state.characters, character],
      chatRooms: {
        ...state.chatRooms,
        [character.id]: [directRoom, ...(state.chatRooms[character.id] || [])]
      },
      messages,
      unreadCounts,
      randomChats: randomChatRooms(state).filter(room => room.id !== roomId),
      notifications: (state.notifications || []).map(item => item.roomId === roomId ? {
        ...item,
        roomId: directRoom.id,
        characterId: character.id,
        target: item.target ? { ...item.target, roomId: directRoom.id, characterId: character.id } : item.target
      } : item),
      selectedRoomId: directRoom.id
    },
    newRoomId: directRoom.id,
    characterId: character.id
  };
}
