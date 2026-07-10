import { CharacterMemory, GroupRoom, GroupRoomSummary, RoomSummary, SNSGodCharacter, SNSGodMessage, SNSGodRoom, SNSGodState } from '../types';
import { isLikelySceneMemory, partitionMemoryEntries } from './memoryPolicy';

const SUMMARY_INTERVAL = 20;
const MAX_ROOM_SUMMARIES = 180;
const MAX_CHARACTER_MEMORIES = 400;
const AUTO_SUMMARY_START = '[자동 대화 요약]';
const AUTO_SUMMARY_END = '[/자동 대화 요약]';

type RoomKind = 'private' | 'group';
type PrivateSummaryContext = {
  characterId: string;
  characterName: string;
  roomId: string;
  summary: string;
  topics: string[];
  followUps: string[];
  updatedAt: number;
};

export function updateRoomMemoryAfterAppend(state: SNSGodState, roomId: string): SNSGodState {
  const messages = state.messages[roomId] || [];
  if (messages.length < 6) return state;
  const roomType = groupRoomById(state, roomId) ? 'group' : 'private';
  const currentSummary = latestRoomSummary(state, roomId);
  const lastCount = Number(currentSummary?.messageCount || 0);
  const shouldSummarize = !currentSummary || messages.length - lastCount >= SUMMARY_INTERVAL;
  if (!shouldSummarize) return state;
  return roomType === 'group'
    ? upsertGroupSummaryAndMemories(state, roomId, messages)
    : upsertPrivateSummaryAndMemory(state, roomId, messages);
}

export function forceUpdateRoomMemory(state: SNSGodState, roomId: string): SNSGodState {
  const messages = state.messages[roomId] || [];
  const group = groupRoomById(state, roomId);
  if (group) {
    const privateContexts = privateSummaryContextsForParticipants(state, group.participantIds || []);
    if (messages.length < 2 && !privateContexts.length) return state;
    return upsertGroupSummaryAndMemories(state, roomId, messages, privateContexts);
  }
  if (messages.length < 2) return state;
  return upsertPrivateSummaryAndMemory(state, roomId, messages);
}

export function privateMemoryPromptBlock(state: SNSGodState, room: SNSGodRoom, character: SNSGodCharacter, latestText: string): string {
  const roomSummary = latestRoomSummary(state, room.id);
  const relatedPrivate = selectRelevantMemories(state, character.id, latestText, {
    includePrivate: true,
    includeGroupPublic: true,
    roomId: room.id
  });
  const summaryBlock = roomSummary ? [
    roomSummary.fixedRelationship?.length ? 'Fixed relationship facts: ' + roomSummary.fixedRelationship.join(' / ') : '',
    roomSummary.activeEvents?.length ? 'Active events and promises: ' + roomSummary.activeEvents.join(' / ') : '',
    roomSummary.lastingMemories?.length ? 'Long-term facts: ' + roomSummary.lastingMemories.join(' / ') : '',
    roomSummary.temporaryContext?.length ? 'Temporary recent context: ' + roomSummary.temporaryContext.join(' / ') : '',
    !isLikelySceneMemory(roomSummary.summary) ? 'Recent factual summary: ' + compactMemoryFact(roomSummary.summary) : ''
  ].filter(Boolean).join('\n') : '';
  const pieces = [
    summaryBlock,
    relatedPrivate.length ? [
      'Relevant factual memories this character is allowed to know:',
      ...relatedPrivate.map(memory => '- [' + (memory.kind || 'summary') + ' / ' + memory.visibility + '] ' + compactMemoryFact(memory.content))
    ].join('\n') : '',
    'Memory rules: facts and promises may guide the reply, but scene prose is not a script. Never replay old dialogue or expose memories not listed here. Temporary or expired memories must not be treated as permanent facts.'
  ].filter(Boolean);
  return pieces.join('\n\n');
}

export function groupMemoryPromptBlock(state: SNSGodState, roomId: string, participants: SNSGodCharacter[], latestText: string): string {
  const groupSummary = latestGroupSummary(state, roomId);
  const participantIds = participants.map(character => character.id);
  const publicMemories = (state.characterMemories || [])
    .filter(memory => memory.visibility === 'group_public' && memory.sourceRoomId === roomId)
    .filter(memory => memory.kind !== 'scene_archive' && !isLikelySceneMemory(memory.content))
    .filter(memory => memory.knownByCharacterIds.some(id => participantIds.includes(id)))
    .sort((a, b) => scoreMemory(b, latestText) - scoreMemory(a, latestText))
    .slice(0, 8);
  const privateHints = participants
    .map(character => {
      const relevant = selectRelevantMemories(state, character.id, latestText, {
        includePrivate: true,
        includeGroupPublic: false,
        roomId
      }).filter(memory => memory.visibility === 'private_with_user');
      const recent = (state.characterMemories || [])
        .filter(memory => memory.characterId === character.id && memory.visibility === 'private_with_user')
        .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
      const memories = uniqueMemories([...relevant, ...recent]).slice(0, 3);
      if (!memories.length) return '';
      return `${character.name}: ${memories.map(memory => memory.content).join(' / ')}`;
    })
    .filter(Boolean);
  return [
    groupSummary ? [
      `Current group room summary: ${groupSummary.summary}`,
      groupSummary.publicInfo.length ? `Public group-known info: ${groupSummary.publicInfo.join(' / ')}` : '',
      groupSummary.relationshipChanges.length ? `Relationship changes: ${groupSummary.relationshipChanges.join(' / ')}` : '',
      groupSummary.followUps.length ? `Follow-ups: ${groupSummary.followUps.join(' / ')}` : ''
    ].filter(Boolean).join('\n') : '',
    publicMemories.length ? [
      'Relevant group_public memories known in this room:',
      ...publicMemories.map(memory => `- ${memory.content}`)
    ].join('\n') : '',
    privateHints.length ? [
      'Private 1:1 memories for tone only. Do not reveal these in the group. If relevant, say something like "that is better to talk about separately."',
      ...privateHints.map(item => `- ${item}`)
    ].join('\n') : '',
    'Group memory rules: characters only know information from groups they joined or private memories assigned to them. In group chat, never expose private_with_user details directly.'
  ].filter(Boolean).join('\n\n');
}

function upsertPrivateSummaryAndMemory(state: SNSGodState, roomId: string, messages: SNSGodMessage[]): SNSGodState {
  const room = allRooms(state).find(item => item.id === roomId);
  const characterId = room?.characterId;
  if (!characterId) return state;
  const previous = latestRoomSummary(state, roomId);
  const built = buildRoomSummary(state, roomId, 'private', [characterId], messages);
  // Keep the last LLM relationship summary text for prompts/UI until a new LLM pass runs.
  // Heuristic "나: ... / 캐릭터: ..." recap must NOT overwrite 관계 요약 (roomPrompt).
  const summary: RoomSummary = {
    ...built,
    summary: previous?.llmSummaryMessageCount ? previous.summary : built.summary,
    llmSummaryMessageCount: previous?.llmSummaryMessageCount
  };
  const memory = buildCharacterMemory({
    characterId,
    knownByCharacterIds: [characterId],
    sourceRoomId: roomId,
    sourceRoomType: 'private',
    visibility: 'private_with_user',
    content: summary.summary,
    importance: summaryImportance(summary)
  });
  return {
    ...state,
    roomSummaries: upsertByRoom(state.roomSummaries || [], summary).slice(0, MAX_ROOM_SUMMARIES),
    characterMemories: upsertMemory(state.characterMemories || [], memory)
  };
}

/** True when private room is due for the same LLM summary as the room-settings button. */
export function privateRoomNeedsLlmSummary(state: SNSGodState, roomId: string): boolean {
  const room = allRooms(state).find(item => item.id === roomId);
  if (!room?.characterId || room.type === 'random') return false;
  if (groupRoomById(state, roomId)) return false;
  const messages = state.messages[roomId] || [];
  if (messages.length < 6) return false;
  const current = latestRoomSummary(state, roomId);
  const lastLlm = Number(current?.llmSummaryMessageCount || 0);
  return !lastLlm || messages.length - lastLlm >= SUMMARY_INTERVAL;
}

/**
 * Apply LLM "현재 대화 요약" output into roomPrompt + roomSummaries + characterMemories.
 * Same storage shape as the room-settings button.
 */
export function applyPrivateRoomLlmSummary(
  state: SNSGodState,
  roomId: string,
  summaryText: string,
  options?: { draft?: Partial<SNSGodRoom> }
): SNSGodState {
  const cleaned = String(summaryText || '').trim();
  if (!cleaned) return state;
  const room = allRooms(state).find(item => item.id === roomId);
  const characterId = room?.characterId;
  if (!characterId || room?.type === 'random') return state;
  const messages = state.messages[roomId] || [];
  const previous = latestRoomSummary(state, roomId);
  const topics = extractTopics(cleaned);
  const followUps = extractFollowUps(cleaned);
  const mood = previous?.mood || inferMood(cleaned);
  const summary: RoomSummary = {
    id: `summary_${roomId}`,
    roomId,
    roomType: 'private',
    characterIds: [characterId],
    messageCount: messages.length,
    llmSummaryMessageCount: messages.length,
    summary: cleaned,
    topics: topics.length ? topics : (previous?.topics || []),
    mood,
    followUps: followUps.length ? followUps : (previous?.followUps || []),
    ...structuredSummaryFields(state, roomId, cleaned, followUps, topics),
    updatedAt: Date.now(),
    lastMessageAt: Number(messages[messages.length - 1]?.createdAt || Date.now())
  };
  const memory = buildCharacterMemory({
    characterId,
    knownByCharacterIds: [characterId],
    sourceRoomId: roomId,
    sourceRoomType: 'private',
    visibility: 'private_with_user',
    content: cleaned,
    importance: summaryImportance(summary)
  });
  let next: SNSGodState = {
    ...state,
    roomSummaries: upsertByRoom(state.roomSummaries || [], summary).slice(0, MAX_ROOM_SUMMARIES),
    characterMemories: upsertMemory(state.characterMemories || [], memory)
  };
  // Prefer draft room fields when saving from room settings.
  if (options?.draft) {
    const chatRooms = { ...next.chatRooms };
    chatRooms[characterId] = (chatRooms[characterId] || []).map(item => {
      if (item.id !== roomId) return item;
      const basePrompt = options.draft?.roomPrompt != null ? String(options.draft.roomPrompt) : String(item.roomPrompt || '');
      return {
        ...item,
        name: options.draft?.name != null ? String(options.draft.name) : item.name,
        userAlias: options.draft?.userAlias != null ? String(options.draft.userAlias) : item.userAlias,
        relationshipNote: options.draft?.relationshipNote != null ? String(options.draft.relationshipNote) : item.relationshipNote,
        roomPrompt: replaceAutoSummaryBlock(basePrompt, cleaned)
      };
    });
    next = { ...next, chatRooms };
    return next;
  }
  return syncPrivateRoomPromptSummary(next, roomId, cleaned);
}

function upsertGroupSummaryAndMemories(state: SNSGodState, roomId: string, messages: SNSGodMessage[], privateContexts?: PrivateSummaryContext[]): SNSGodState {
  const group = groupRoomById(state, roomId);
  if (!group) return state;
  const participantIds = group.participantIds || [];
  const bridgeContexts = privateContexts || privateSummaryContextsForParticipants(state, participantIds);
  const base = messages.length
    ? buildRoomSummary(state, roomId, 'group', participantIds, messages)
    : buildPrivateBridgeSummary(roomId, participantIds, bridgeContexts);
  const groupSummary: GroupRoomSummary = {
    ...base,
    roomType: 'group',
    publicInfo: [
      ...publicInfoFromMessages(state, messages, participantIds),
      ...privateBridgePublicInfo(bridgeContexts)
    ].slice(-8),
    characterTakeaways: Object.fromEntries(participantIds.map(id => [
      id,
      [
        ...characterTakeaways(state, id, messages),
        ...privateBridgeTakeaways(id, bridgeContexts)
      ].slice(-6)
    ])),
    relationshipChanges: [
      ...relationshipChangesFromMessages(state, messages),
      ...bridgeContexts.flatMap(context => context.followUps.map(item => `${context.characterName} 개인톡 후속 맥락: ${item}`))
    ].slice(-8)
  };
  const memories = participantIds.map(characterId => buildCharacterMemory({
    characterId,
    knownByCharacterIds: participantIds,
    sourceRoomId: roomId,
    sourceRoomType: 'group',
    visibility: 'group_public',
    content: groupSummary.summary,
    importance: summaryImportance(groupSummary)
  }));
  return {
    ...state,
    roomSummaries: upsertByRoom(state.roomSummaries || [], groupSummary).slice(0, MAX_ROOM_SUMMARIES),
    groupRoomSummaries: upsertGroupByRoom(state.groupRoomSummaries || [], groupSummary).slice(0, MAX_ROOM_SUMMARIES),
    characterMemories: memories.reduce((list, memory) => upsertMemory(list, memory), state.characterMemories || [])
  };
}

function buildPrivateBridgeSummary(roomId: string, participantIds: string[], contexts: PrivateSummaryContext[]): RoomSummary {
  const latestAt = contexts.reduce((max, context) => Math.max(max, Number(context.updatedAt || 0)), 0) || Date.now();
  const topicText = [...new Set(contexts.flatMap(context => context.topics || []))].slice(0, 6);
  const summaryText = contexts.length
    ? `단톡방 기억 연결: ${contexts.map(context => `${context.characterName} 개인톡 요약`).join(', ')}이 연결되어 있다. 각 캐릭터는 자기 개인톡 기억을 말투와 반응 힌트로 참고하고, 다른 캐릭터의 개인톡 세부 내용은 단톡에서 직접 공개하지 않는다.`
    : '단톡방 기억 연결 준비됨. 아직 가져올 개인톡 요약이 없다.';
  return {
    id: `summary_${roomId}`,
    roomId,
    roomType: 'group',
    characterIds: participantIds,
    messageCount: 0,
    summary: summaryText,
    topics: topicText,
    mood: '개인톡 기억을 단톡 맥락에 조심스럽게 연결하는 상태',
    followUps: contexts.flatMap(context => context.followUps || []).slice(-6),
    updatedAt: Date.now(),
    lastMessageAt: latestAt
  };
}

function buildRoomSummary(state: SNSGodState, roomId: string, roomType: RoomKind, characterIds: string[], messages: SNSGodMessage[]): RoomSummary {
  const recent = messages.slice(-SUMMARY_INTERVAL);
  const textLines = recent.map(message => messageLine(state, message)).filter(Boolean);
  const topics = extractTopics(textLines.join('\n'));
  const followUps = extractFollowUps(textLines.join('\n'));
  const mood = inferMood(textLines.join('\n'));
  const summary = compactSummary(textLines, topics, mood);
  const lastMessageAt = Number(messages[messages.length - 1]?.createdAt || Date.now());
  return {
    id: `summary_${roomId}`,
    roomId,
    roomType,
    characterIds,
    messageCount: messages.length,
    summary,
    topics,
    mood,
    followUps,
    ...structuredSummaryFields(state, roomId, textLines.join('\n'), followUps, topics),
    updatedAt: Date.now(),
    lastMessageAt
  };
}

function structuredSummaryFields(state: SNSGodState, roomId: string, text: string, followUps: string[], topics: string[]) {
  const room = allRooms(state).find(item => item.id === roomId);
  const lines = String(text || '').split(/\n|(?<=[.!?\u3002\uFF01\uFF1F])\s+/).map(compactMemoryFact).filter(Boolean);
  const lastingPattern = /\uC88B\uC544|\uC2EB\uC5B4|\uC120\uD638|\uC0DD\uC77C|\uAE30\uB150|\uBE44\uBC00|\uACE0\uBC31|\uAC00\uC871|\uC9C1\uC5C5|\uCDE8\uBBF8|\uC57D\uC18D|preference|birthday|anniversary|secret|promise/i;
  const activePattern = /\uC624\uB298|\uB0B4\uC77C|\uBAA8\uB808|\uB9CC\uB098|\uC608\uC57D|\uD1B5\uD654|\uC804\uD654|\uAC00\uC790|\uBCF4\uC790|today|tomorrow|meet|call|reservation/i;
  const lasting = lines.filter(line => lastingPattern.test(line)).slice(-6);
  const active = [...followUps.map(compactMemoryFact), ...lines.filter(line => activePattern.test(line))]
    .filter(Boolean).filter((item, index, all) => all.indexOf(item) === index).slice(-6);
  return {
    fixedRelationship: [room?.relationshipNote || ''].map(compactMemoryFact).filter(Boolean).slice(0, 3),
    activeEvents: active,
    lastingMemories: lasting,
    temporaryContext: topics.slice(0, 6)
  };
}

function buildCharacterMemory(input: Omit<CharacterMemory, 'id' | 'createdAt' | 'lastUsedAt'>): CharacterMemory {
  const kind = input.kind || (isLikelySceneMemory(input.content) ? 'scene_archive' : 'summary');
  return {
    status: 'active',
    ...input,
    kind,
    fingerprint: input.fingerprint || memoryFingerprint(input.content),
    id: 'memory_' + input.characterId + '_' + input.sourceRoomId + '_' + input.visibility,
    createdAt: Date.now(),
    lastUsedAt: Date.now()
  };
}

function latestRoomSummary(state: SNSGodState, roomId: string): RoomSummary | undefined {
  return (state.roomSummaries || []).filter(summary => summary.roomId === roomId).sort((a, b) => b.updatedAt - a.updatedAt)[0];
}

function latestGroupSummary(state: SNSGodState, roomId: string): GroupRoomSummary | undefined {
  return (state.groupRoomSummaries || []).filter(summary => summary.roomId === roomId).sort((a, b) => b.updatedAt - a.updatedAt)[0];
}

function selectRelevantMemories(
  state: SNSGodState,
  characterId: string,
  latestText: string,
  options: { includePrivate: boolean; includeGroupPublic: boolean; roomId?: string }
): CharacterMemory[] {
  const now = Date.now();
  return (state.characterMemories || [])
    .filter(memory => memory.status !== 'expired' && (!memory.expiresAt || memory.expiresAt > now))
    .filter(memory => memory.kind !== 'scene_archive')
    .filter(memory => memory.characterId === characterId || memory.knownByCharacterIds.includes(characterId))
    .filter(memory => {
      if (memory.visibility === 'private_with_user') return options.includePrivate;
      if (memory.visibility === 'group_public') return options.includeGroupPublic;
      return memory.visibility === 'global' || memory.visibility === 'character_private';
    })
    .filter(memory => memory.sourceRoomId === options.roomId || scoreMemory(memory, latestText) > 0 || memory.importance >= 7)
    .sort((a, b) => scoreMemory(b, latestText) - scoreMemory(a, latestText))
    .slice(0, 10);
}

function scoreMemory(memory: CharacterMemory, latestText: string): number {
  const overlap = tokenOverlap(memory.content, latestText);
  const recency = Math.max(0, 4 - Math.floor((Date.now() - Number(memory.createdAt || 0)) / 86_400_000));
  return overlap * 4 + Number(memory.importance || 0) + recency;
}

export function stripAutoSummaryBlock(prompt: string): string {
  return String(prompt || '')
    .replace(/\n?\[자동 대화 요약\][\s\S]*?\[\/자동 대화 요약\]\n?/g, '\n')
    .trim();
}

export function replaceAutoSummaryBlock(prompt: string, summary: string): string {
  const cleanedSummary = String(summary || '').trim();
  const cleaned = stripAutoSummaryBlock(prompt);
  if (!cleanedSummary) return cleaned;
  const block = `${AUTO_SUMMARY_START}\n${cleanedSummary}\n${AUTO_SUMMARY_END}`;
  return [cleaned, block].filter(Boolean).join('\n\n');
}

function syncPrivateRoomPromptSummary(state: SNSGodState, roomId: string, summary: string): SNSGodState {
  const room = allRooms(state).find(item => item.id === roomId);
  if (!room || !room.characterId || room.type === 'random') return state;
  const chatRooms = { ...state.chatRooms };
  const rooms = (chatRooms[room.characterId] || []).map(item => (
    item.id === roomId ? { ...item, roomPrompt: replaceAutoSummaryBlock(String(item.roomPrompt || ''), summary) } : item
  ));
  chatRooms[room.characterId] = rooms;
  return { ...state, chatRooms };
}

function uniqueMemories(memories: CharacterMemory[]): CharacterMemory[] {
  const seen = new Set<string>();
  return memories.filter(memory => {
    const key = memory.id || `${memory.characterId}_${memory.sourceRoomId}_${memory.content}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function privateSummaryContextsForParticipants(state: SNSGodState, participantIds: string[]): PrivateSummaryContext[] {
  return participantIds
    .map(characterId => {
      const character = state.characters.find(item => item.id === characterId);
      const summaries = (state.roomSummaries || [])
        .filter(summary => summary.roomType === 'private' && summary.characterIds.includes(characterId))
        .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
      const summary = summaries[0];
      if (!summary) return undefined;
      return {
        characterId,
        characterName: character?.name || '캐릭터',
        roomId: summary.roomId,
        summary: summary.summary,
        topics: summary.topics || [],
        followUps: summary.followUps || [],
        updatedAt: Number(summary.updatedAt || 0)
      };
    })
    .filter((item): item is PrivateSummaryContext => Boolean(item));
}

function privateBridgePublicInfo(contexts: PrivateSummaryContext[]): string[] {
  if (!contexts.length) return [];
  return [
    `참여 캐릭터 ${contexts.map(context => context.characterName).join(', ')}의 개인톡 요약이 단톡 맥락 힌트로 연결됨`
  ];
}

function privateBridgeTakeaways(characterId: string, contexts: PrivateSummaryContext[]): string[] {
  return contexts
    .filter(context => context.characterId === characterId)
    .map(context => `${context.characterName}는 사용자와의 개인톡 요약을 단톡 말투/반응 힌트로 참고한다: ${context.summary}`)
    .slice(-3);
}

function tokenOverlap(a: string, b: string): number {
  const left = new Set(keywordTokens(a));
  return keywordTokens(b).filter(token => left.has(token)).length;
}

function keywordTokens(text: string): string[] {
  return String(text || '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length >= 2)
    .slice(0, 80);
}

function upsertByRoom<T extends RoomSummary>(items: T[], item: T): T[] {
  return [item, ...items.filter(existing => existing.roomId !== item.roomId)];
}

function upsertGroupByRoom(items: GroupRoomSummary[], item: GroupRoomSummary): GroupRoomSummary[] {
  return [item, ...items.filter(existing => existing.roomId !== item.roomId)];
}

function upsertMemory(items: CharacterMemory[], item: CharacterMemory): CharacterMemory[] {
  const now = Date.now();
  const active = items.filter(existing => existing.status !== 'expired' && (!existing.expiresAt || existing.expiresAt > now));
  return [item, ...active.filter(existing => existing.id !== item.id && existing.fingerprint !== item.fingerprint)].slice(0, MAX_CHARACTER_MEMORIES);
}

function groupRoomById(state: SNSGodState, roomId: string): GroupRoom | undefined {
  return (state.groupRooms || []).find(room => room.id === roomId);
}

function allRooms(state: SNSGodState): SNSGodRoom[] {
  return [
    ...Object.values(state.chatRooms || {}).flat(),
    ...(state.randomChats || []).map(room => ({
      id: room.id,
      characterId: room.characterId,
      name: room.name,
      createdAt: room.createdAt,
      lastActivity: room.lastActivity,
      type: 'random'
    } as SNSGodRoom))
  ];
}

function messageLine(state: SNSGodState, message: SNSGodMessage): string {
  if (!message.content?.trim()) return '';
  if (message.role === 'user') return `${state.config.userName || '나'}: ${message.content}`;
  const character = state.characters.find(item => item.id === message.characterId);
  if (message.role === 'character') return `${character?.name || '캐릭터'}: ${message.content}`;
  return `시스템: ${message.content}`;
}

function compactSummary(lines: string[], topics: string[], mood: string): string {
  const followUps = extractFollowUps(lines.join('\n')).map(compactMemoryFact).filter(Boolean);
  const topicText = topics.length ? 'Key topics: ' + topics.join(', ') : 'Key topics: none established';
  const followUpText = followUps.length ? 'Open plans or follow-ups: ' + followUps.join(' / ') : 'Open plans or follow-ups: none';
  return (topicText + '. Current mood: ' + mood + '. ' + followUpText).slice(0, 620);
}

export function compactLegacyMemoryFacts(memories: string[], limit = 8): string[] {
  return partitionMemoryEntries(memories).facts.slice(-limit);
}

function compactMemoryFact(value: string): string {
  return String(value || '')
    .replace(/\[[^\]]{0,40}\]/g, '')
    .replace(/^[^:]{1,20}:\s*/g, '')
    .replace(/[\u201C\u201D"']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

function memoryFingerprint(value: string): string {
  return keywordTokens(compactMemoryFact(value)).sort().slice(0, 12).join('|') || compactMemoryFact(value).slice(0, 60);
}

function extractTopics(text: string): string[] {
  const tokens = keywordTokens(text).filter(token => !['그리고', '그래서', '오늘', '진짜', '아니', '그냥', '나는', '너는', '우리'].includes(token));
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([token]) => token).slice(0, 6);
}

function extractFollowUps(text: string): string[] {
  const lines = String(text || '').split('\n').filter(line => /나중|다음|약속|만나|전화|통화|기억|알려|해보|가자|보자/.test(line));
  return lines.slice(-4).map(line => line.replace(/\s+/g, ' ').slice(0, 120));
}

function inferMood(text: string): string {
  if (/미안|속상|울|힘들|걱정|불안|서운/.test(text)) return '조심스럽고 감정적인 편';
  if (/ㅋㅋ|ㅎㅎ|웃|재밌|장난|좋아|설레/.test(text)) return '가볍고 친근한 편';
  if (/약속|만나|도착|기다|갈게|보자/.test(text)) return '약속과 만남 쪽으로 구체화되는 편';
  return '차분한 편';
}

function publicInfoFromMessages(state: SNSGodState, messages: SNSGodMessage[], participantIds: string[]): string[] {
  return messages.slice(-SUMMARY_INTERVAL)
    .filter(message => message.role === 'user' || (message.characterId && participantIds.includes(message.characterId)))
    .filter(message => /\uC57D\uC18D|\uB9CC\uB098|\uC608\uC57D|\uC88B\uC544|\uC2EB\uC5B4|\uC120\uD638|\uC0DD\uC77C|\uAE30\uB150|\uBE44\uBC00|\uC9C1\uC5C5|\uCDE8\uBBF8|promise|meet|preference|birthday|secret/i.test(message.content || ''))
    .map(message => messageLine(state, message).slice(0, 130))
    .filter(Boolean)
    .slice(-6);
}

function characterTakeaways(state: SNSGodState, characterId: string, messages: SNSGodMessage[]): string[] {
  const character = state.characters.find(item => item.id === characterId);
  const name = character?.name || '이 캐릭터';
  return messages.slice(-SUMMARY_INTERVAL)
    .filter(message => message.role === 'user' || message.characterId === characterId)
    .filter(message => /\uC57D\uC18D|\uB9CC\uB098|\uC608\uC57D|\uC88B\uC544|\uC2EB\uC5B4|\uC120\uD638|\uC0DD\uC77C|\uAE30\uB150|\uBE44\uBC00|\uC9C1\uC5C5|\uCDE8\uBBF8|promise|meet|preference|birthday|secret/i.test(message.content || ''))
    .map(message => `${name} 관점에서 기억할 공개 흐름: ${messageLine(state, message).slice(0, 120)}`)
    .slice(-4);
}

function relationshipChangesFromMessages(state: SNSGodState, messages: SNSGodMessage[]): string[] {
  return messages.slice(-SUMMARY_INTERVAL)
    .filter(message => /고마|미안|좋아|서운|설레|친해|기억|약속|만나/.test(message.content || ''))
    .map(message => messageLine(state, message).slice(0, 130))
    .slice(-5);
}

function summaryImportance(summary: RoomSummary): number {
  let score = 4;
  if (summary.followUps.length) score += 2;
  if (/약속|만남|비밀|고백|싸움|사과|통화/.test(summary.summary)) score += 2;
  if (summary.roomType === 'group') score += 1;
  return Math.max(1, Math.min(10, score));
}
