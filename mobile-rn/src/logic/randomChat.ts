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
    'shapeshifter with a borrowed phone', 'talking black cat with a tiny charm-phone',
    'sentient crow familiar who texts through magic', 'wolf-spirit guardian pretending to be a student'
  ];
  const origins = [
    'Mexico City, Mexico', 'Lagos, Nigeria', 'Marrakesh, Morocco', 'Sao Paulo, Brazil',
    'Reykjavik, Iceland', 'Kyoto, Japan', 'Osaka, Japan', 'Paris, France',
    'Seville, Spain', 'Berlin, Germany', 'Istanbul, Turkey', 'Mumbai, India',
    'Bangkok, Thailand', 'Manila, Philippines', 'Hanoi, Vietnam', 'Toronto, Canada',
    'New Orleans, USA', 'Melbourne, Australia', 'a floating fantasy market',
    'a desert kingdom observatory', 'a moon colony dormitory', 'a hidden forest village',
    'a magic academy archive', 'a sea-glass merfolk district'
  ];
  const languages = [
    'English', 'Japanese', 'Spanish', 'French', 'Portuguese', 'German',
    'Thai', 'Vietnamese', 'Tagalog', 'Hindi', 'Arabic', 'Turkish',
    'Korean only if the origin seed explicitly fits it', 'bilingual English plus local slang'
  ];
  const archetypes = [
    'street food vendor who knows everyone by their shoes',
    'lonely radio host broadcasting after midnight',
    'circus aerialist with a practical fear of heights',
    'botanical witch who sells impossible flowers',
    'museum guard who hears paintings whisper',
    'retired monster hunter raising houseplants',
    'student pilot on a lunar shuttle route',
    'underground jazz singer avoiding their old name',
    'fashion apprentice making clothes for nonhuman clients',
    'exiled prince who hates being treated delicately',
    'mechanic who repairs cursed scooters',
    'library assistant cataloging forbidden dreams',
    'small-town veterinarian who can understand complaints',
    'sand-diver searching ruins after sunset',
    'anonymous game streamer with a soft domestic side',
    'hotel concierge for supernatural guests',
    'independent familiar learning ordinary life',
    'talking animal who insists they are not cute',
    'android learning how to lie politely',
    'ghost who remembers too many versions of the same city'
  ];
  const temperaments = [
    'bright but emotionally guarded', 'dry, teasing, and secretly attentive',
    'soft-spoken but stubborn', 'chaotic and affectionate', 'elegant with sudden childishness',
    'formal, curious, and lonely', 'protective but bad at admitting fear',
    'reckless, funny, and too honest', 'mysterious but weirdly domestic',
    'sharp-tongued with a sincere caretaking streak'
  ];
  const hooks = [
    'they messaged the wrong person and refuse to admit it was a mistake',
    'they need a stranger to keep them awake until sunrise',
    'they are hiding from a small magical accident',
    'they found the user through a random-chat glitch that feels too specific',
    'they want advice but frame it as a joke',
    'they are stuck somewhere strange and need calm company',
    'they recognize one detail from the user profile and get curious',
    'they are celebrating something tiny and have nobody to tell',
    'they are waiting for a train, spell, storm, or spaceship that is late'
  ];
  const visuals = [
    'distinct cultural clothing details without stereotypes',
    'urban night casualwear with one strange accessory',
    'fantasy travel outfit with practical worn details',
    'soft domestic room lighting and unusual eyes',
    'weathered work clothes, hands-on profession mood',
    'magical traits visible but subtle',
    'animal or familiar design made expressive and sentient',
    'sci-fi uniform with personal charms and messy hair'
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
    'Nonhuman, fantasy, animal, familiar, spirit, alien, android, or monster characters are allowed sometimes, but they must be sentient fictional chat partners who can naturally message the user.',
    'Do not use famous characters, celebrities, real people, copyrighted settings, or stereotypes. Avoid making every character Korean, a student, a lab worker, or ocean-themed.'
  ].join('\n');
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
    firstMessage: String(parsed.firstMessage || '어... 랜덤채팅으로 연결된 사람 맞죠? 잠깐 이야기해도 괜찮아요?'),
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
  return [
    state.config.prompts?.profileCreation || 'Create a fictional chat character.',
    '',
    'Create one random-chat character now. Return JSON only:',
    '{"name":"...","handle":"...","avatarText":"...","color":"#hex","prompt":"...","firstMessage":"...","statusMessage":"..."}',
    '',
    'Randomization seed:',
    conceptSeed,
    '',
    'User context:',
    `- User name: ${state.config.userName || 'User'}`,
    `- User profile: ${state.config.userDescription || '(empty)'}`,
    `- Current app language: ${state.config.language || 'Korean'}`
  ].join('\n');
}

export function addRandomChatRoom(state: SNSGodState, character: SNSGodCharacter, conceptSeed: string): { next: SNSGodState; roomId: string } {
  const baseRoom = createRoom(character.id, `${character.name} 랜덤채팅`);
  const room: RandomChatRoom = {
    ...baseRoom,
    type: 'random',
    randomChat: true,
    character,
    conceptSeed,
    promoted: false
  };
  const first: SNSGodMessage[] = character.firstMessage ? [{
    id: makeId('msg'),
    role: 'character',
    characterId: character.id,
    content: character.firstMessage,
    createdAt: Date.now(),
    sourceMode: 'randomchat'
  }] : [];
  const exists = state.characters.some(item => item.id === character.id);
  const next: SNSGodState = {
    ...state,
    characters: exists ? state.characters : [...state.characters, character],
    chatRooms: { ...state.chatRooms, [character.id]: [room, ...(state.chatRooms[character.id] || [])] },
    messages: { ...state.messages, [room.id]: first },
    randomChats: [room, ...randomChatRooms(state)],
    selectedRoomId: room.id
  };
  return { next, roomId: room.id };
}

export function removeRandomChatRoom(state: SNSGodState, roomId: string): SNSGodState {
  const room = findRandomChat(state, roomId);
  if (!room) return state;
  const chatRooms = { ...state.chatRooms };
  const messages = { ...state.messages };
  const unreadCounts = { ...state.unreadCounts };
  chatRooms[room.characterId] = (chatRooms[room.characterId] || []).filter(item => item.id !== roomId);
  delete messages[roomId];
  delete unreadCounts[roomId];
  const hasRemainingRooms = (chatRooms[room.characterId] || []).length > 0;
  return {
    ...state,
    characters: hasRemainingRooms ? state.characters : state.characters.filter(character => character.id !== room.characterId),
    chatRooms,
    messages,
    unreadCounts,
    randomChats: randomChatRooms(state).filter(item => item.id !== roomId),
    selectedRoomId: state.selectedRoomId === roomId ? undefined : state.selectedRoomId
  };
}
