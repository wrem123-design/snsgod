import AsyncStorage from '@react-native-async-storage/async-storage';
import { RandomChatRoom, SNSGodState } from '../types';
import { createDefaultState } from '../data/defaultState';

const STATE_KEY = 'snsgod.state.v1';
const LEGACY_BACKUP_KEY = 'snsgod.legacyBackup.v1';

export async function loadState(): Promise<SNSGodState> {
  const raw = await AsyncStorage.getItem(STATE_KEY);
  if (!raw) return normalizeState(createDefaultState());
  try {
    return normalizeState(JSON.parse(raw) as SNSGodState);
  } catch {
    return normalizeState(createDefaultState());
  }
}

export async function saveState(state: SNSGodState): Promise<void> {
  const snapshot: SNSGodState = { ...normalizeState(state), __savedAt: Date.now() };
  const payload = JSON.stringify(snapshot);
  await AsyncStorage.setItem(STATE_KEY, payload);
  const saved = await AsyncStorage.getItem(STATE_KEY);
  if (saved !== payload) {
    throw new Error('저장소 검증 실패: 저장 직후 읽은 데이터가 일치하지 않습니다.');
  }
}

export async function importState(state: SNSGodState, originalJson: string): Promise<SNSGodState> {
  const imported: SNSGodState = { ...normalizeState(state), __importedAt: Date.now(), __savedAt: Date.now() };
  await AsyncStorage.multiSet([
    [STATE_KEY, JSON.stringify(imported)],
    [LEGACY_BACKUP_KEY, originalJson]
  ]);
  return imported;
}

export async function clearState(): Promise<SNSGodState> {
  const fresh = normalizeState(createDefaultState());
  await saveState(fresh);
  return fresh;
}

function normalizeState(state: SNSGodState): SNSGodState {
  return normalizeRandomChats(normalizeSnsOptions(normalizeApiProfiles(normalizeProfileImages(state))));
}

function normalizeApiProfiles(state: SNSGodState): SNSGodState {
  const defaultVertex = createDefaultState().config.apiProfiles.vertex || {};
  const apiProfiles = state.config.apiProfiles || {};
  const currentVertex = apiProfiles.vertex || {};
  const legacyGemini = apiProfiles.gemini || {};
  const vertexProfile = {
    ...defaultVertex,
    maxTokens: legacyGemini.maxTokens ?? defaultVertex.maxTokens,
    temperature: legacyGemini.temperature ?? defaultVertex.temperature,
    contextMessageLimit: legacyGemini.contextMessageLimit,
    snsContextMessageLimit: legacyGemini.snsContextMessageLimit,
    phoneContextMessageLimit: legacyGemini.phoneContextMessageLimit,
    ...currentVertex,
    apiModel: currentVertex.apiModel || 'gemini-3-flash-preview',
    location: currentVertex.location || 'global'
  };
  const shouldUseVertex = !state.config.apiType || state.config.apiType === 'gemini' || state.config.apiType === 'vertex';
  return {
    ...state,
    config: {
      ...state.config,
      apiType: shouldUseVertex ? 'vertex' : state.config.apiType,
      apiProfiles: {
        ...apiProfiles,
        vertex: vertexProfile
      }
    }
  };
}

function normalizeProfileImages(state: SNSGodState): SNSGodState {
  return {
    ...state,
    characters: (state.characters || []).map(character => {
      const profileImage = character.avatar || character.profileImage || '';
      return {
        ...character,
        avatar: profileImage,
        profileImage
      };
    })
  };
}

function normalizeSnsOptions(state: SNSGodState): SNSGodState {
  const base = state.config.sns || {};
  const fallback = {
    anonymous: base.anonymous === true,
    nsfw: base.nsfw === true,
    textOnly: base.textOnly === true,
    noDM: base.noDM === true,
    thirdPartyDM: base.thirdPartyDM === true,
    autoComments: base.autoComments !== false,
    commentQty: base.commentQty || '2-4',
    subject: base.subject || '',
    mood: base.mood || '',
    autoImage: base.autoImage !== false
  };
  return {
    ...state,
    config: {
      ...state.config,
      sns: {
        ...base,
        platform: base.platform === 'twitter' ? 'twitter' : 'instagram',
        platformOptions: {
          instagram: { ...fallback, ...(base.platformOptions?.instagram || {}) },
          twitter: { ...fallback, ...(base.platformOptions?.twitter || {}) }
        }
      }
    }
  };
}

function normalizeRandomChats(state: SNSGodState): SNSGodState {
  const randomChats = Array.isArray(state.randomChats) ? state.randomChats as RandomChatRoom[] : [];
  if (!randomChats.length) return state;
  const characters = [...(state.characters || [])];
  const chatRooms = { ...(state.chatRooms || {}) };
  const messages = { ...(state.messages || {}) };
  const normalizedRandomChats: RandomChatRoom[] = [];
  for (const room of randomChats) {
    const character = room.character;
    if (!character?.id) continue;
    if (!characters.some(item => item.id === character.id)) {
      characters.push({ ...character, randomTemporary: true });
    }
    const normalizedRoom: RandomChatRoom = {
      ...room,
      character: { ...character, randomTemporary: true },
      type: 'random',
      randomChat: true
    };
    const existing = chatRooms[character.id] || [];
    chatRooms[character.id] = existing.some(item => item.id === room.id)
      ? existing.map(item => item.id === room.id ? { ...item, ...normalizedRoom } : item)
      : [normalizedRoom, ...existing];
    messages[room.id] = messages[room.id] || [];
    normalizedRandomChats.push(normalizedRoom);
  }
  return { ...state, characters, chatRooms, messages, randomChats: normalizedRandomChats };
}
