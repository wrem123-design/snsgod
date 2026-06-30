import { SNSGodState } from '../types';
import { createDefaultState } from '../data/defaultState';
import { DEFAULT_PROMPTS } from '../logic/prompts';
import { ensureCharacterRooms, normalizeRandomChats } from '../logic/stateHelpers';

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function firstArray(...values: unknown[]): unknown[] | undefined {
  return values.find(Array.isArray) as unknown[] | undefined;
}

function firstObject(...values: unknown[]): Record<string, unknown> | undefined {
  return values.find(isObject) as Record<string, unknown> | undefined;
}

function boolConfig(config: Record<string, unknown>, fallback: boolean, ...keys: string[]): boolean {
  for (const key of keys) {
    if (typeof config[key] === 'boolean') return config[key] as boolean;
  }
  return fallback;
}

function numberConfig(config: Record<string, unknown>, fallback: number, ...keys: string[]): number {
  for (const key of keys) {
    const value = Number(config[key]);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function normalizeCharacters(parsed: Record<string, unknown>, fallback: SNSGodState): SNSGodState['characters'] {
  const source = firstArray(parsed.characters, parsed.characterList, parsed.charList, parsed.chars);
  if (!source) return fallback.characters;
  return source.filter(isObject).map((item, index) => ({
    ...item,
    id: String(item.id || item.key || item.uuid || `character_${index}`),
    name: String(item.name || item.displayName || item.title || `캐릭터 ${index + 1}`),
    handle: item.handle ? String(item.handle) : item.username ? String(item.username).replace(/^@/, '') : undefined,
    avatar: typeof item.avatar === 'string'
      ? item.avatar
      : typeof item.profileImage === 'string'
        ? item.profileImage
        : typeof item.profilePhoto === 'string'
          ? item.profilePhoto
          : undefined,
    profileImage: typeof item.avatar === 'string'
      ? item.avatar
      : typeof item.profileImage === 'string'
        ? item.profileImage
        : typeof item.profilePhoto === 'string'
          ? item.profilePhoto
          : undefined,
    coverImage: typeof item.coverImage === 'string' ? item.coverImage : typeof item.backgroundImage === 'string' ? item.backgroundImage : undefined
  })) as SNSGodState['characters'];
}

function normalizeMessages(parsed: Record<string, unknown>, fallback: SNSGodState): SNSGodState['messages'] {
  const source = firstObject(parsed.messages, parsed.chatMessages, parsed.roomMessages);
  if (!source) return fallback.messages;
  const normalized: SNSGodState['messages'] = {};
  for (const [roomId, value] of Object.entries(source)) {
    if (!Array.isArray(value)) continue;
    normalized[roomId] = value.filter(isObject).map((item, index) => ({
      ...item,
      id: String(item.id || item.key || `msg_${roomId}_${index}`),
      role: item.role === 'user' || item.role === 'system' ? item.role : 'character',
      characterId: item.characterId ? String(item.characterId) : undefined,
      content: String(item.content || item.text || item.message || ''),
      createdAt: Number(item.createdAt || item.time || item.timestamp || Date.now()),
      mediaData: typeof item.mediaData === 'string' ? item.mediaData : typeof item.image === 'string' ? item.image : undefined
    }));
  }
  return Object.keys(normalized).length ? normalized : fallback.messages;
}

function normalizeRooms(parsed: Record<string, unknown>, fallback: SNSGodState): SNSGodState['chatRooms'] {
  const source = firstObject(parsed.chatRooms, parsed.rooms, parsed.dmRooms);
  if (!source) return fallback.chatRooms;
  const normalized: SNSGodState['chatRooms'] = {};
  for (const [characterId, value] of Object.entries(source)) {
    if (!Array.isArray(value)) continue;
    normalized[characterId] = value.filter(isObject).map((item, index) => ({
      ...item,
      id: String(item.id || item.roomId || `room_${characterId}_${index}`),
      characterId: String(item.characterId || characterId),
      name: String(item.name || item.title || '기본 채팅'),
      createdAt: Number(item.createdAt || item.time || Date.now()),
      lastActivity: Number(item.lastActivity || item.updatedAt || item.createdAt || Date.now())
    }));
  }
  return Object.keys(normalized).length ? normalized : fallback.chatRooms;
}

function normalizeSnsDmThreads(parsed: Record<string, unknown>, characters: SNSGodState['characters']): SNSGodState['snsDmThreads'] {
  return (firstArray(parsed.snsDmThreads, parsed.dmThreads, parsed.snsDms) || []).filter(isObject).map((item, index) => {
    const rawMessages = Array.isArray(item.messages) ? item.messages : [];
    return {
      id: String(item.id || item.threadId || `snsdm_${index}`),
      postId: item.postId ? String(item.postId) : undefined,
      characterId: String(item.characterId || item.authorId || characters[0]?.id || 'unknown'),
      title: String(item.title || item.name || 'SNS DM'),
      messages: rawMessages.filter(isObject).map((message, messageIndex) => ({
        id: String(message.id || `snsdmmsg_${index}_${messageIndex}`),
        from: String(message.from || message.role || '').toLowerCase().includes('user') ? 'user' as const : String(message.from || '').toLowerCase().includes('third') ? 'thirdParty' as const : 'character' as const,
        author: message.author ? String(message.author) : message.from ? String(message.from) : undefined,
        body: String(message.body || message.content || message.text || ''),
        createdAt: Number(message.createdAt || message.time || Date.now())
      })).filter(message => message.body),
      createdAt: Number(item.createdAt || item.time || Date.now()),
      updatedAt: Number(item.updatedAt || item.lastActivity || item.createdAt || Date.now()),
      unread: Number(item.unread || 0)
    };
  });
}

export function normalizeLegacyState(rawJson: string): SNSGodState {
  const parsedRoot = JSON.parse(rawJson) as unknown;
  if (!isObject(parsedRoot)) throw new Error('백업 JSON 형식이 올바르지 않습니다.');
  const parsed = isObject(parsedRoot.state) ? parsedRoot.state : parsedRoot;
  const fallback = createDefaultState();
  const config = isObject(parsed.config) ? parsed.config : {};
  const characters = normalizeCharacters(parsed, fallback);
  const chatRooms = normalizeRooms(parsed, fallback);
  const messages = normalizeMessages(parsed, fallback);
  const normalized = {
    ...fallback,
    ...parsed,
    config: {
      ...fallback.config,
      ...config,
      prompts: {
        ...DEFAULT_PROMPTS,
        ...(isObject(config.prompts) ? config.prompts : {}),
        ...(isObject(config.prompts) && isObject(config.prompts.main) ? {
          systemRules: String((config.prompts.main as Record<string, unknown>).system_rules || DEFAULT_PROMPTS.systemRules),
          roleObjective: String((config.prompts.main as Record<string, unknown>).role_and_objective || DEFAULT_PROMPTS.roleObjective),
          characterActing: String((config.prompts.main as Record<string, unknown>).character_acting || DEFAULT_PROMPTS.characterActing),
          jsonFormat: String((config.prompts.main as Record<string, unknown>).message_writing || (config.prompts.main as Record<string, unknown>).message_json || DEFAULT_PROMPTS.jsonFormat),
          memoryRules: String((config.prompts.main as Record<string, unknown>).memory_generation || DEFAULT_PROMPTS.memoryRules),
          stickerRules: String((config.prompts.main as Record<string, unknown>).sticker_usage || DEFAULT_PROMPTS.stickerRules),
          language: String((config.prompts.main as Record<string, unknown>).language || DEFAULT_PROMPTS.language)
        } : {})
      },
      apiProfiles: {
        ...fallback.config.apiProfiles,
        ...(isObject(config.apiProfiles) ? config.apiProfiles : {})
      },
      privateFirst: boolConfig(config, fallback.config.privateFirst === true, 'privateFirst', 'proactiveChatEnabled'),
      groupFirst: boolConfig(config, fallback.config.groupFirst === true, 'groupFirst'),
      randomDmEnabled: boolConfig(config, fallback.config.randomDmEnabled !== false, 'randomDmEnabled', 'randomFirstMessageEnabled'),
      snsAutoPostEnabled: boolConfig(config, fallback.config.snsAutoPostEnabled !== false, 'snsAutoPostEnabled', 'autoSnsEnabled'),
      characterPhoneCallEnabled: boolConfig(config, fallback.config.characterPhoneCallEnabled !== false, 'characterPhoneCallEnabled', 'characterPhoneInvitesEnabled'),
      characterPhoneCallRarityLevel: numberConfig(config, Number(fallback.config.characterPhoneCallRarityLevel ?? 0), 'characterPhoneCallRarityLevel'),
      characterPhoneCallChancePercent: numberConfig(config, Number(fallback.config.characterPhoneCallChancePercent ?? 33), 'characterPhoneCallChancePercent'),
      characterPhoneCallMinCooldownMinutes: numberConfig(config, numberConfig(config, Number(fallback.config.characterPhoneCallMinCooldownHours ?? 6), 'characterPhoneCallMinCooldownHours') * 60, 'characterPhoneCallMinCooldownMinutes'),
      characterPhoneCallGlobalCooldownMinutes: numberConfig(config, numberConfig(config, Number(fallback.config.characterPhoneCallGlobalCooldownHours ?? 3), 'characterPhoneCallGlobalCooldownHours') * 60, 'characterPhoneCallGlobalCooldownMinutes'),
      characterPhoneCallMinCooldownHours: numberConfig(config, Number(fallback.config.characterPhoneCallMinCooldownHours ?? 6), 'characterPhoneCallMinCooldownHours'),
      characterPhoneCallGlobalCooldownHours: numberConfig(config, Number(fallback.config.characterPhoneCallGlobalCooldownHours ?? 3), 'characterPhoneCallGlobalCooldownHours'),
      snsAutoChance: numberConfig(config, Number(fallback.config.snsAutoChance ?? 40), 'snsAutoChance', 'autoSnsChance'),
      snsStartCount: numberConfig(config, Number(fallback.config.snsStartCount ?? 6), 'snsStartCount', 'autoSnsMinMessages')
    },
    characters: characters as SNSGodState['characters'],
    chatRooms: chatRooms as SNSGodState['chatRooms'],
    messages: messages as SNSGodState['messages'],
    unreadCounts: isObject(parsed.unreadCounts) ? parsed.unreadCounts as SNSGodState['unreadCounts'] : {},
    snsPosts: (firstArray(parsed.snsPosts, parsed.posts, parsed.snsFeed) || []).filter(isObject).map((item, index) => ({
      ...item,
      id: String(item.id || `sns_${index}`),
      characterId: String(item.characterId || item.authorId || characters[0]?.id || 'unknown'),
      platform: item.platform === 'twitter' ? 'twitter' : 'instagram',
      content: String(item.content || item.text || item.caption || ''),
      createdAt: Number(item.createdAt || item.time || Date.now())
    })) as SNSGodState['snsPosts'],
    snsDmThreads: normalizeSnsDmThreads(parsed, characters),
    groupRooms: (firstArray(parsed.groupRooms, parsed.groupChatRooms, parsed.groups) || []).map(item => {
      if (!isObject(item)) return item;
      const participants = Array.isArray(item.participantIds)
        ? item.participantIds
        : Array.isArray(item.participants)
          ? item.participants
          : [];
      return { ...item, participantIds: participants.map(value => String(value)).filter(Boolean) };
    }) as SNSGodState['groupRooms'],
    loreEntries: (firstArray(parsed.loreEntries, parsed.lorebook, parsed.loreItems) || []) as SNSGodState['loreEntries'],
    loreFolders: firstArray(parsed.loreFolders, parsed.loreGroups) || [],
    userStickers: (firstArray(parsed.userStickers, parsed.stickers) || []) as SNSGodState['userStickers'],
    notifications: (firstArray(parsed.notifications, parsed.notificationList, parsed.alerts) || []) as SNSGodState['notifications']
  };
  return normalizeRandomChats(ensureCharacterRooms(normalized));
}
