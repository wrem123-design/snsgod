import { SNSGodCharacter, SNSGodMessage, SNSGodState } from '../types';
import { appendMessage } from './stateHelpers';
import { makeId } from './ids';
import { encryptOracleTextGenerationProfile } from './oracleProfileCrypto';
import { compactLegacyMemoryFacts } from './memoryBridge';
import { applyMessageToCharacterWorld, resolveCharacterRuntimeState } from './characterWorld';

type ServerMessagingConfig = NonNullable<SNSGodState['config']['serverMessaging']>;

type ServerMessage = {
  id: string;
  roomId: string;
  role: 'user' | 'character' | 'system';
  characterId?: string;
  content: string;
  createdAt: number;
  serverCreatedAt?: number;
  origin?: 'client' | 'server';
  sourceMode?: string;
  proactiveBatchId?: string;
  generationInfo?: SNSGodMessage['generationInfo'];
};

type ServerSyncResponse = {
  cursor: number;
  messages: ServerMessage[];
  serverTime: number;
};

function trimUrl(value: unknown): string {
  return String(value || '').trim().replace(/\/+$/, '');
}

function serverConfig(state: SNSGodState): ServerMessagingConfig | undefined {
  const config = state.config.serverMessaging;
  return config?.enabled && trimUrl(config.baseUrl) ? config : undefined;
}

function headers(state: SNSGodState): Record<string, string> {
  const config = serverConfig(state);
  if (!config?.deviceId || !config.deviceToken) throw new Error('서버 기기 등록이 필요합니다. 설정에서 Oracle 메시지 서버를 연결하세요.');
  return {
    'content-type': 'application/json',
    'x-device-id': config.deviceId,
    'x-device-token': config.deviceToken
  };
}

async function request<T>(state: SNSGodState, path: string, options: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
  const config = serverConfig(state);
  if (!config) throw new Error('Oracle 메시지 서버가 활성화되지 않았습니다.');
  const response = await fetch(`${trimUrl(config.baseUrl)}${path}`, {
    method: options.method || 'GET',
    headers: headers(state),
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const raw = await response.text();
  let payload: unknown;
  try { payload = raw ? JSON.parse(raw) : {}; } catch { throw new Error(`서버 응답 형식 오류 (${response.status})`); }
  if (!response.ok) {
    const message = payload && typeof payload === 'object' ? String((payload as { error?: unknown }).error || '') : '';
    throw new Error(message || `서버 요청 실패 (${response.status})`);
  }
  return payload as T;
}

function directRooms(state: SNSGodState) {
  return Object.values(state.chatRooms || {}).flat().filter(room => room && room.type !== 'random').map(room => {
    const character = state.characters.find(item => item.id === room.characterId);
    return {
      id: room.id,
      type: 'direct' as const,
      name: room.name,
      characterId: room.characterId,
      enabled: room.disabled !== true && character?.enabled !== false,
      relationshipContext: [room.relationshipNote, room.roomPrompt].filter(Boolean).join('\n').slice(0, 6000),
      userAlias: room.userAlias || '',
      automation: automationFor(state, character, 'direct')
    };
  });
}

function groupRooms(state: SNSGodState) {
  return (state.groupRooms || []).map(room => {
    const participants = state.characters.filter(character => room.participantIds.includes(character.id) && character.enabled !== false);
    return {
      id: room.id,
      type: 'group' as const,
      name: room.name,
      participantIds: participants.map(character => character.id),
      enabled: room.disabled !== true,
      relationshipContext: String(room.relationshipNote || '').slice(0, 6000),
      automation: automationFor(state, undefined, 'group', participants)
    };
  });
}

function automationFor(state: SNSGodState, character: SNSGodCharacter | undefined, type: 'direct' | 'group', participants: SNSGodCharacter[] = []) {
  const config = state.config;
  const proactiveParticipants = participants.filter(item => item.proactiveEnabled !== false);
  const groupValues = proactiveParticipants.length ? proactiveParticipants : participants;
  const average = (values: number[], fallback: number) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
  const frequencyMinutes = type === 'group'
    ? (groupValues.length ? Math.min(...groupValues.map(item => Math.max(1, Number(item.frequencyMinutes || 10)))) : 10)
    : Number(character?.frequencyMinutes || 10);
  const initiative = type === 'group'
    ? average(groupValues.map(item => Math.max(0, Math.min(100, Number(item.initiative ?? 40)))), 40)
    : Number(character?.initiative ?? 40);
  const responseDelayMin = type === 'group'
    ? average(participants.map(item => Math.max(0, Number(item.responseDelayMin ?? 1))), 1)
    : Number(character?.responseDelayMin ?? 1);
  const responseDelayMax = type === 'group'
    ? average(participants.map(item => Math.max(0, Number(item.responseDelayMax ?? 8))), 8)
    : Number(character?.responseDelayMax ?? 8);
  const proactivePatience = type === 'group'
    ? Math.max(...groupValues.map(item => Math.max(0, Number(item.proactivePatience ?? 1))), 1)
    : Number(character?.proactivePatience ?? 1);
  return {
    enabled: true,
    replyEnabled: true,
    proactiveEnabled: type === 'group'
      ? config.autoEnabled !== false && config.groupFirst === true && proactiveParticipants.length > 0
      : config.autoEnabled !== false && config.privateFirst === true && character?.proactiveEnabled !== false,
    frequencyMinutes: Math.max(1, Math.min(1440, Number.isFinite(frequencyMinutes) ? frequencyMinutes : 10)),
    initiative: Math.max(0, Math.min(100, Number.isFinite(initiative) ? initiative : 40)),
    responseDelayMin: Math.max(0, responseDelayMin),
    responseDelayMax: Math.max(responseDelayMin, responseDelayMax),
    maxProactiveWithoutReply: Math.max(1, Math.min(3, 1 + proactivePatience)),
    dailyProactiveBudget: initiative >= 90 ? 4 : initiative >= 60 ? 3 : initiative >= 25 ? 2 : 1,
    maxGroupMessages: 6
  };
}
function safeCharacter(state: SNSGodState, character: SNSGodCharacter) {
  const runtimeState = resolveCharacterRuntimeState(state, character);
  const structuredMemories = (state.characterMemories || [])
    .filter(memory => memory.characterId === character.id || (memory.knownByCharacterIds || []).includes(character.id))
    .filter(memory => memory.kind !== 'scene_archive' && memory.status !== 'expired' && (!memory.expiresAt || memory.expiresAt > Date.now()))
    .sort((a, b) => Number(b.importance || 0) - Number(a.importance || 0))
    .slice(0, 20)
    .map(memory => ({ content: String(memory.content || '').slice(0, 1000), kind: memory.kind || 'summary', importance: memory.importance }));
  return {
    id: character.id,
    name: character.name,
    prompt: character.prompt || '',
    proactiveEnabled: character.proactiveEnabled !== false,
    enabled: character.enabled !== false,
    responseDelayMin: character.responseDelayMin,
    responseDelayMax: character.responseDelayMax,
    frequencyMinutes: character.frequencyMinutes,
    initiative: character.initiative,
    messageStyle: character.messageStyle,
    timeZone: character.timeZone || state.config.timeZone || 'Asia/Seoul',
    locationName: character.locationName || state.config.locationName || '',
    lifeRhythm: character.lifeRhythm || {},
    runtimeState,
    imageContinuity: character.imageContinuity,
    memories: compactLegacyMemoryFacts(character.memories || [], 20),
    structuredMemories
  };
}

function recentMessages(state: SNSGodState, excludeMessageIds: string[] = []) {
  const excluded = new Set(excludeMessageIds);
  return Object.entries(state.messages || {}).flatMap(([roomId, messages]) => (messages || [])
    .filter(message => !excluded.has(message.id) && (message.role === 'user' || message.role === 'character'))
    .slice(-30)
    .map(message => ({
      id: message.id,
      clientMessageId: message.role === 'user' ? message.id : undefined,
      roomId,
      role: message.role,
      characterId: message.characterId,
      content: String(message.content || '').slice(0, 4000),
      createdAt: Number(message.createdAt || Date.now()),
      metadata: { sourceMode: message.sourceMode }
    }))
  ).slice(-300);
}

function textGenerationForServer(state: SNSGodState) {
  const provider = state.config.apiType;
  const profile = state.config.apiProfiles[provider] || {};
  return {
    provider,
    apiEndpoint: String(profile.apiEndpoint || '').trim(),
    apiModel: String(profile.apiModel || '').trim(),
    apiKey: String(profile.apiKey || '').trim(),
    apiKeys: (profile.apiKeys || []).map(value => String(value || '').trim()).filter(Boolean).slice(0, 3),
    apiKeyIndex: Math.max(0, Number(profile.apiKeyIndex || 0)),
    serviceAccountJson: String(profile.serviceAccountJson || '').trim(),
    location: String(profile.location || 'global').trim(),
    serviceTier: String(profile.serviceTier || 'auto').trim(),
    proxyAccessToken: String(profile.proxyAccessToken || '').trim(),
    thinkingLevel: String(profile.thinkingLevel || 'off').trim(),
    thinkingBudgetTokens: Math.max(0, Number(profile.thinkingBudgetTokens || 0)),
    maxTokens: Math.max(32, Number(profile.maxTokens || (provider === 'vertex' ? 4096 : 700))),
    temperature: Number.isFinite(Number(profile.temperature)) ? Number(profile.temperature) : 0.85,
    contextMessageLimit: Math.max(4, Math.min(80, Number(profile.contextMessageLimit || 24)))
  };
}

function bootstrapPayload(state: SNSGodState, excludeMessageIds: string[] = []) {
  return {
    characters: state.characters.filter(character => character.randomTemporary !== true).map(character => safeCharacter(state, character)),
    rooms: [...directRooms(state), ...groupRooms(state)],
    messages: recentMessages(state, excludeMessageIds),
    textGenerationEnvelope: encryptOracleTextGenerationProfile(textGenerationForServer(state))
  };
}

export function isServerMessagingEnabled(state: SNSGodState): boolean {
  return Boolean(serverConfig(state));
}

export function newServerDeviceId(): string {
  return makeId('oracle_device');
}

export async function registerServerDevice(state: SNSGodState, deviceName = 'SNSGod Android'): Promise<SNSGodState> {
  const config = state.config.serverMessaging;
  if (!config?.enabled || !trimUrl(config.baseUrl)) throw new Error('서버 주소를 먼저 입력하세요.');
  const pairingSecret = String(config.pairingSecret || '').trim();
  if (!pairingSecret) throw new Error('서버 연결 키를 입력하세요.');
  const deviceId = config.deviceId || newServerDeviceId();
  const response = await fetch(`${trimUrl(config.baseUrl)}/v1/device/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId, deviceName, bootstrapSecret: pairingSecret })
  });
  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) as { deviceId?: string; deviceToken?: string; error?: string } : {};
  if (!response.ok || !payload.deviceToken) throw new Error(payload.error || `기기 등록 실패 (${response.status})`);
  return {
    ...state,
    config: {
      ...state.config,
      serverMessaging: {
        ...config,
        deviceId: payload.deviceId || deviceId,
        deviceToken: payload.deviceToken,
        pairingSecret: '',
        lastError: '',
        lastSyncAt: Date.now()
      }
    }
  };
}

export async function bootstrapServer(state: SNSGodState, excludeMessageIds: string[] = []): Promise<SNSGodState> {
  if (!isServerMessagingEnabled(state)) return state;
  const response = await request<{ cursor?: number }>(state, '/v1/sync/bootstrap', { method: 'POST', body: bootstrapPayload(state, excludeMessageIds) });
  return setServerStatus(state, { syncCursor: Number(response.cursor || state.config.serverMessaging?.syncCursor || 0), lastSyncAt: Date.now(), lastError: '' });
}

export function enqueueServerMessage(state: SNSGodState, message: SNSGodMessage, roomId: string): SNSGodState {
  if (!isServerMessagingEnabled(state)) return state;
  const existing = state.config.serverMessaging?.outbox || [];
  if (existing.some(item => item.id === message.id)) return state;
  return setServerStatus(state, {
    outbox: [...existing, {
      id: message.id,
      roomId,
      content: message.content || `[스티커 ${message.sticker || '메시지'}]`,
      createdAt: Number(message.createdAt || Date.now()),
      sticker: message.sticker,
      hasMedia: Boolean(message.mediaData)
    }].slice(-100)
  });
}

export async function flushServerOutbox(state: SNSGodState): Promise<SNSGodState> {
  if (!isServerMessagingEnabled(state)) return state;
  const outbox = state.config.serverMessaging?.outbox || [];
  let next = await bootstrapServer(state, outbox.map(item => item.id));
  for (let index = 0; index < outbox.length; index += 1) {
    const item = outbox[index];
    try {
      await request(next, '/v1/messages', {
        method: 'POST',
        body: {
          id: item.id,
          clientMessageId: item.id,
          roomId: item.roomId,
          content: item.content,
          createdAt: item.createdAt,
          metadata: { sticker: item.sticker, media: item.hasMedia === true }
        }
      });
    } catch (error) {
      return setServerStatus(next, {
        outbox: outbox.slice(index),
        lastError: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return setServerStatus(next, { outbox: [], lastSyncAt: Date.now(), lastError: '' });
}
function findRoomId(state: SNSGodState, messageId: string): string {
  const match = Object.entries(state.messages || {}).find(([, messages]) => messages.some(message => message.id === messageId));
  if (!match) throw new Error('서버에 전송할 대화방을 찾지 못했습니다.');
  return match[0];
}

export async function syncServerMessages(state: SNSGodState): Promise<SNSGodState> {
  if (!isServerMessagingEnabled(state)) return state;
  const cursor = Number(state.config.serverMessaging?.syncCursor || 0);
  const result = await request<ServerSyncResponse>(state, `/v1/sync/changes?cursor=${encodeURIComponent(String(cursor))}`);
  const merged = mergeServerMessages(state, result.messages || []);
  return setServerStatus(merged, { syncCursor: Number(result.cursor || cursor), lastSyncAt: Date.now(), lastError: '' });
}

export function withServerError(state: SNSGodState, error: unknown): SNSGodState {
  return setServerStatus(state, { lastError: error instanceof Error ? error.message : String(error) });
}

function setServerStatus(state: SNSGodState, patch: Partial<ServerMessagingConfig>): SNSGodState {
  return { ...state, config: { ...state.config, serverMessaging: { ...(state.config.serverMessaging || {}), ...patch } } };
}

export function mergeServerMessages(state: SNSGodState, incoming: ServerMessage[]): SNSGodState {
  let next = state;
  const existing = new Set(Object.values(next.messages || {}).flat().map(message => message.id));
  for (const remote of incoming) {
    if (!remote?.id || existing.has(remote.id) || !next.messages[remote.roomId]) continue;
    const message: SNSGodMessage = {
      id: remote.id,
      role: remote.role,
      characterId: remote.characterId,
      content: remote.content,
      createdAt: Number(remote.createdAt || Date.now()),
      serverCreatedAt: Number(remote.serverCreatedAt || Date.now()),
      sourceMode: remote.sourceMode || 'server',
      proactiveBatchId: remote.proactiveBatchId,
      generationInfo: remote.generationInfo
    };
    const groupIndex = (next.groupRooms || []).findIndex(room => room.id === remote.roomId);
    if (groupIndex >= 0) {
      next = {
        ...next,
        messages: { ...next.messages, [remote.roomId]: [...(next.messages[remote.roomId] || []), message] },
        groupRooms: (next.groupRooms || []).map(room => room.id === remote.roomId ? { ...room, lastActivity: message.createdAt } : room)
      };      if (message.characterId) next = applyMessageToCharacterWorld(next, message.characterId, remote.roomId, message);
    } else {
      next = appendMessage(next, remote.roomId, message);
    }
    existing.add(remote.id);
  }
  return next;
}