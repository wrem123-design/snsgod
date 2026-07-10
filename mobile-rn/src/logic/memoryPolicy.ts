import { CharacterMemory, RoomSummary, SNSGodState } from '../types';

const MAX_FACT_LENGTH = 240;
const MAX_ARCHIVE_LENGTH = 6000;
const MAX_FACTS_PER_CHARACTER = 80;
const MAX_ARCHIVES = 400;

const SCENE_BODY_PATTERN = /숨|품에|심장|입술|눈빛|손끝|손을|팔을|허리|어깨|뺨|키스|포옹|끌어안|안아|몸을|체온|떨림|숨결|고개를|다가오|밀착|침대|소파/i;
const SCENE_ACTION_PATTERN = /바라보|속삭|미소를|웃으며|말하며|말했|내뱉|들어오|다가가|다가오|움직|기대며|기댄|감싸|잡아|쓸어|쓰다듬|끌어|눕히|일으키|돌아서|고개를|눈을 감|숨을 들이/i;
const SCENE_ENDING_PATTERN = /(합니다|됩니다|느낍니다|보입니다|있었습니다|했습니다|였다|이었다|했다|말했다|바라봤다|속삭였다|웃었다|다가왔다)(?:[.!?]|$)/g;
const DIRECT_DIALOGUE_PATTERN = /[\u201C\u201D"][^\u201C\u201D"]{2,}[\u201C\u201D"]|(?:^|\n)\s*(?:\uB098|\uB108|\uC0AC\uC6A9\uC790|\uCE90\uB9AD\uD130|\uADF8|\uADF8\uB140|[\uAC00-\uD7A3]{2,8})\s*:\s*[^\n]{2,}/m;
const FACT_SIGNAL_PATTERN = /관계|연인|친구|부부|호칭|부른다|좋아한다|싫어한다|선호|취향|생일|기념일|약속|예정|가기로|만나기로|직업|가족|비밀|경계|원한다|기억한다/i;

export type MemoryPartition = { facts: string[]; scenes: string[] };

export function compactFactMemory(value: string): string {
  return String(value || '')
    .replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, '')
    .replace(/\[[^\]]{0,40}\]/g, '')
    .replace(/^[^:\n]{1,20}:\s*/g, '')
    .replace(/[“”"'‘’]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_FACT_LENGTH);
}

export function memoryFingerprint(value: string): string {
  const normalized = compactFactMemory(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `m${(hash >>> 0).toString(36)}`;
}

export function isLikelySceneMemory(value: string): boolean {
  const raw = String(value || '').trim();
  if (!raw) return false;
  if (structuredMeetingFacts(raw).length) return false;
  const compact = raw.replace(/\s+/g, ' ');
  const body = SCENE_BODY_PATTERN.test(compact);
  const action = SCENE_ACTION_PATTERN.test(compact);
  const dialogue = DIRECT_DIALOGUE_PATTERN.test(raw);
  const narrativeEndings = [...compact.matchAll(SCENE_ENDING_PATTERN)].length;
  const sentenceCount = compact.split(/[.!?。！？]+/).filter(item => item.trim().length > 5).length;
  const factSignals = FACT_SIGNAL_PATTERN.test(compact);
  if (dialogue && (body || action || compact.length >= 70)) return true;
  if (body && action) return true;
  if (body && !factSignals && compact.length >= 25) return true;
  if ((body || action) && narrativeEndings >= 2) return true;
  if (!factSignals && compact.length >= 140 && sentenceCount >= 2 && (body || action || narrativeEndings >= 2)) return true;
  return false;
}

const MEETING_FIELD_PATTERN = /\b(eventType|location|keyMoment|userChoicePattern|characterFelt|relationshipShift|futureHook|doNotForget)\s*:\s*/gi;

function structuredMeetingFacts(value: string): string[] {
  const raw = String(value || '').trim();
  if (!/^\[meeting_event_summary\]/i.test(raw)) return [];
  const matches = [...raw.matchAll(MEETING_FIELD_PATTERN)];
  if (matches.length < 2) return [];
  return matches.map((match, index) => {
    const start = Number(match.index || 0) + match[0].length;
    const end = index + 1 < matches.length ? Number(matches[index + 1].index || raw.length) : raw.length;
    return compactFactMemory(raw.slice(start, end).replace(/^[\s,.;]+|[\s,.;]+$/g, ''));
  }).filter(Boolean);
}
export function partitionMemoryEntries(entries: string[]): MemoryPartition {
  const facts: string[] = [];
  const scenes: string[] = [];
  const factKeys = new Set<string>();
  const sceneKeys = new Set<string>();
  const pushFact = (value: string) => {
    const fact = compactFactMemory(value);
    if (!fact) return;
    const key = memoryFingerprint(fact);
    if (factKeys.has(key)) return;
    factKeys.add(key);
    facts.push(fact);
  };
  for (const entry of entries) {
    const raw = String(entry || '').trim();
    if (!raw) continue;
    const structuredFacts = structuredMeetingFacts(raw);
    if (structuredFacts.length) {
      structuredFacts.forEach(pushFact);
      continue;
    }
    if (isLikelySceneMemory(raw)) {
      const key = memoryFingerprint(raw);
      if (!sceneKeys.has(key)) {
        sceneKeys.add(key);
        scenes.push(raw.slice(0, MAX_ARCHIVE_LENGTH));
      }
      continue;
    }
    pushFact(raw);
  }
  return { facts: facts.slice(-MAX_FACTS_PER_CHARACTER), scenes };
}

export function parseFactExtraction(value: string): string[] {
  const lines = String(value || '').split(/\r?\n/).map(item => item.trim()).filter(Boolean);
  return partitionMemoryEntries(lines).facts.slice(0, 12);
}

function sceneArchive(input: {
  characterId: string;
  content: string;
  sourceRoomId?: string;
  sourceRoomType?: 'private' | 'group';
  createdAt?: number;
}): CharacterMemory {
  const fingerprint = memoryFingerprint(input.content);
  return {
    id: `scene_archive_${input.characterId}_${fingerprint}`,
    characterId: input.characterId,
    sourceRoomId: input.sourceRoomId || `memory_archive:${input.characterId}`,
    sourceRoomType: input.sourceRoomType || 'private',
    visibility: 'private_with_user',
    knownByCharacterIds: [input.characterId],
    content: String(input.content || '').trim().slice(0, MAX_ARCHIVE_LENGTH),
    kind: 'scene_archive',
    status: 'active',
    fingerprint,
    importance: 3,
    createdAt: Number(input.createdAt || Date.now()),
    lastUsedAt: Number(input.createdAt || Date.now())
  };
}

function upsertArchives(memories: CharacterMemory[], archives: CharacterMemory[]): CharacterMemory[] {
  const archiveKeys = new Set(archives.map(item => item.fingerprint || memoryFingerprint(item.content)));
  const kept = memories.filter(item => {
    if (item.kind !== 'scene_archive') return true;
    return !archiveKeys.has(item.fingerprint || memoryFingerprint(item.content));
  });
  return [...archives, ...kept].slice(0, MAX_ARCHIVES);
}

export function archiveSceneMemories(
  state: SNSGodState,
  characterId: string,
  scenes: string[],
  options?: { sourceRoomId?: string; sourceRoomType?: 'private' | 'group'; createdAt?: number }
): SNSGodState {
  const archives = partitionMemoryEntries(scenes).scenes.map(content => sceneArchive({
    characterId,
    content,
    sourceRoomId: options?.sourceRoomId,
    sourceRoomType: options?.sourceRoomType,
    createdAt: options?.createdAt
  }));
  if (!archives.length) return state;
  return { ...state, characterMemories: upsertArchives(state.characterMemories || [], archives) };
}

function updateCharacterFacts(state: SNSGodState, characterId: string, facts: string[]): SNSGodState {
  return {
    ...state,
    characters: state.characters.map(character => character.id === characterId ? { ...character, memories: facts } : character),
    randomChats: (state.randomChats || []).map(room => room.characterId === characterId || room.character.id === characterId
      ? { ...room, character: { ...room.character, memories: facts } }
      : room)
  };
}

export function ingestCharacterMemory(state: SNSGodState, characterId: string, value: string, sourceRoomId?: string): SNSGodState {
  const current = state.characters.find(character => character.id === characterId)
    || (state.randomChats || []).find(room => room.characterId === characterId || room.character.id === characterId)?.character;
  if (!current) return state;
  const incoming = partitionMemoryEntries(String(value || '').split(/\r?\n/));
  const existing = partitionMemoryEntries(current.memories || []);
  const facts = partitionMemoryEntries([...existing.facts, ...incoming.facts]).facts;
  let next = updateCharacterFacts(state, characterId, facts);
  next = archiveSceneMemories(next, characterId, [...existing.scenes, ...incoming.scenes], { sourceRoomId });
  return next;
}

function safeSummary(summary: RoomSummary): string {
  const candidates = [
    ...(summary.fixedRelationship || []),
    ...(summary.activeEvents || []),
    ...(summary.lastingMemories || [])
  ];
  const facts = partitionMemoryEntries(candidates).facts.slice(0, 8);
  return facts.length ? facts.join(' / ') : '이 장면에서 장기 사실로 확정된 내용이 없습니다.';
}

export function migrateMemoryState(state: SNSGodState): SNSGodState {
  let next: SNSGodState = { ...state, characterMemories: [...(state.characterMemories || [])] };
  const allCharacters = [...state.characters, ...(state.randomChats || []).map(room => room.character)]
    .filter((character, index, all) => all.findIndex(item => item.id === character.id) === index);
  for (const character of allCharacters) {
    const partition = partitionMemoryEntries(character.memories || []);
    next = updateCharacterFacts(next, character.id, partition.facts);
    next = archiveSceneMemories(next, character.id, partition.scenes);
  }

  const recoveredStructuredFacts = new Map<string, string[]>();
  const reclassified: CharacterMemory[] = [];
  for (const memory of next.characterMemories || []) {
    if (memory.kind === 'scene_archive') {
      const recovered = structuredMeetingFacts(memory.content);
      if (recovered.length) {
        recoveredStructuredFacts.set(memory.characterId, [...(recoveredStructuredFacts.get(memory.characterId) || []), ...recovered]);
        continue;
      }
      reclassified.push(memory);
      continue;
    }
    if (!isLikelySceneMemory(memory.content)) {
      reclassified.push(memory);
      continue;
    }
    reclassified.push(sceneArchive({
      characterId: memory.characterId,
      content: memory.content,
      sourceRoomId: memory.sourceRoomId,
      sourceRoomType: memory.sourceRoomType,
      createdAt: memory.createdAt
    }));
  }
  next = { ...next, characterMemories: upsertArchives([], reclassified) };
  for (const [characterId, recovered] of recoveredStructuredFacts) {
    const current = next.characters.find(character => character.id === characterId)
      || (next.randomChats || []).find(room => room.characterId === characterId || room.character.id === characterId)?.character;
    if (!current) continue;
    const trusted = [...(current.memories || []), ...recovered].map(compactFactMemory).filter(Boolean);
    const seen = new Set<string>();
    const facts = trusted.filter(fact => {
      const key = memoryFingerprint(fact);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(-MAX_FACTS_PER_CHARACTER);
    next = updateCharacterFacts(next, characterId, facts);
  }

  const migrateSummaries = (summaries: RoomSummary[]) => summaries.map(summary => {
    if (!isLikelySceneMemory(summary.summary)) return summary;
    for (const characterId of summary.characterIds || []) {
      next = archiveSceneMemories(next, characterId, [summary.summary], {
        sourceRoomId: summary.roomId,
        sourceRoomType: summary.roomType,
        createdAt: summary.updatedAt
      });
    }
    return { ...summary, summary: safeSummary(summary) };
  });
  const roomSummaries = migrateSummaries(next.roomSummaries || []);
  const groupRoomSummaries = migrateSummaries(next.groupRoomSummaries || []) as SNSGodState['groupRoomSummaries'];
  return { ...next, roomSummaries, groupRoomSummaries };
}

export function sceneArchivesForCharacter(state: SNSGodState, characterId: string): CharacterMemory[] {
  return (state.characterMemories || [])
    .filter(memory => memory.characterId === characterId && memory.kind === 'scene_archive' && memory.status !== 'expired')
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
}

export function removeSceneArchive(state: SNSGodState, archiveId: string): SNSGodState {
  return { ...state, characterMemories: (state.characterMemories || []).filter(memory => memory.id !== archiveId) };
}
