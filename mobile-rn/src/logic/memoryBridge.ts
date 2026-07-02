import { CharacterMemory, GroupRoom, GroupRoomSummary, RoomSummary, SNSGodCharacter, SNSGodMessage, SNSGodRoom, SNSGodState } from '../types';

const SUMMARY_INTERVAL = 20;
const MAX_ROOM_SUMMARIES = 180;
const MAX_CHARACTER_MEMORIES = 400;

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
  const pieces = [
    roomSummary ? [
      `Current private room summary: ${roomSummary.summary}`,
      roomSummary.topics.length ? `Topics: ${roomSummary.topics.join(', ')}` : '',
      roomSummary.followUps.length ? `Follow-ups: ${roomSummary.followUps.join(' / ')}` : ''
    ].filter(Boolean).join('\n') : '',
    relatedPrivate.length ? [
      'Relevant memories this character is allowed to know:',
      ...relatedPrivate.map(memory => `- [${memory.visibility}] ${memory.content}`)
    ].join('\n') : '',
    'Memory visibility rules: private_with_user memories may be directly mentioned in this 1:1 room. group_public memories may be referenced only if this character was in that group. Never pretend to know memories not listed here.'
  ].filter(Boolean);
  return pieces.join('\n\n');
}

export function groupMemoryPromptBlock(state: SNSGodState, roomId: string, participants: SNSGodCharacter[], latestText: string): string {
  const groupSummary = latestGroupSummary(state, roomId);
  const participantIds = participants.map(character => character.id);
  const publicMemories = (state.characterMemories || [])
    .filter(memory => memory.visibility === 'group_public' && memory.sourceRoomId === roomId)
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
  const summary = buildRoomSummary(state, roomId, 'private', [characterId], messages);
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
    updatedAt: Date.now(),
    lastMessageAt
  };
}

function buildCharacterMemory(input: Omit<CharacterMemory, 'id' | 'createdAt' | 'lastUsedAt'>): CharacterMemory {
  return {
    ...input,
    id: `memory_${input.characterId}_${input.sourceRoomId}_${input.visibility}`,
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
  return (state.characterMemories || [])
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
  return [item, ...items.filter(existing => existing.id !== item.id)].slice(0, MAX_CHARACTER_MEMORIES);
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
  const latest = lines.slice(-8).join(' / ').replace(/\s+/g, ' ').slice(0, 520);
  const topicText = topics.length ? `주요 화제는 ${topics.join(', ')}.` : '짧은 대화 흐름이 이어졌다.';
  return `${topicText} 분위기는 ${mood}. 최근 흐름: ${latest}`;
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
    .map(message => messageLine(state, message).slice(0, 130))
    .filter(Boolean)
    .slice(-6);
}

function characterTakeaways(state: SNSGodState, characterId: string, messages: SNSGodMessage[]): string[] {
  const character = state.characters.find(item => item.id === characterId);
  const name = character?.name || '이 캐릭터';
  return messages.slice(-SUMMARY_INTERVAL)
    .filter(message => message.role === 'user' || message.characterId === characterId)
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
