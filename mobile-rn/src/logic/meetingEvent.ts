import { callLLMText, generateImageDataUri, parseJsonObject } from './api';
import { appendDebugLog } from './debugLog';
import { primaryCharacterReferenceImage } from './imageReference';
import { makeId } from './ids';
import { DEFAULT_USER_APPEARANCE_PROMPT, configuredPrompt, userNameFor } from './prompts';
import { appendMessage, findCharacter, findRoom, roomMessages, updateCharacter } from './stateHelpers';
import { appendMessageToHistory } from './messageHistoryPolicy';
import { applyLifecycleResultOnce, transitionInteractionLifecycle } from './interactionLifecycle';
import { SNSGodCharacter, SNSGodRoom, SNSGodState, MeetingEventSession, MeetingEventLine, GroupRoom, SNSGodMessage, CharacterMemory, GroupRoomSummary, MeetingEventType, MeetingScenarioPhase, MeetingStats, MeetingResultCard } from '../types';

export type MeetingStartResult = {
  shouldStart: boolean;
  reason?: string;
  location?: string;
  mood?: string;
  seedSummary?: string;
  stillPrompt?: string;
  firstLine?: string;
  promptMessage?: string;
};

type MeetingCandidate = {
  candidate: boolean;
  reason: string;
  transcript: string;
  characterTranscript: string;
  stage: MeetingIntentStage;
  recentCharacterSaidTheyWillComeOut: boolean;
};

export type MeetingIntentStage =
  | 'none'
  | 'future_plan'
  | 'scheduled_plan'
  | 'on_the_way'
  | 'arrived'
  | 'counterpart_coming'
  | 'face_to_face'
  | 'handoff'
  | 'completed'
  | 'cancelled';

type MeetingLlmDecision = {
  stage?: MeetingIntentStage;
  shouldStartNow?: boolean;
  confidence?: number;
  reason?: string;
  detectedLocation?: string | null;
  detectedTime?: string | null;
  location?: string;
  mood?: string;
  seedSummary?: string;
  stillPrompt?: string;
  firstLine?: string;
};

function characterBlindDateMode(character: SNSGodCharacter | undefined): string {
  const memory = character?.blindDateMemory;
  if (!memory || typeof memory !== 'object') return '';
  const mode = (memory as { mode?: unknown }).mode;
  return typeof mode === 'string' ? mode : '';
}

type GroupMeetingParticipantStatus =
  | 'unknown'
  | 'future_plan'
  | 'on_the_way'
  | 'arrived'
  | 'coming_out'
  | 'face_to_face'
  | 'unavailable'
  | 'cancelled'
  | 'completed';

type GroupMeetingStage =
  | 'none'
  | 'future_plan'
  | 'scheduled_plan'
  | 'on_the_way'
  | 'partial_arrived'
  | 'group_arrived'
  | 'group_face_to_face'
  | 'handoff'
  | 'completed'
  | 'cancelled';

type GroupMeetingLineSeed = {
  characterId?: string;
  text?: string;
};

type GroupMeetingDecision = {
  stage?: GroupMeetingStage;
  shouldStartNow?: boolean;
  confidence?: number;
  location?: string;
  mood?: string;
  reason?: string;
  seedSummary?: string;
  stillPrompt?: string;
  presentCharacterIds?: string[];
  absentCharacterIds?: string[];
  participantStatuses?: Record<string, GroupMeetingParticipantStatus | string>;
  firstLines?: GroupMeetingLineSeed[];
  promptMessage?: string;
};

const CANCEL_OR_DELAY_PATTERN = /못\s*만나|안\s*만나|못\s*가|취소|연기|바빠서\s*못|비현실|온라인|전화로|통화로/i;
const COMPLETED_MEETING_PATTERN = /아까\s*(봐서|만나서)|오늘\s*만나서\s*좋|방금\s*헤어|아까\s*(카페|얘기한)|만나고\s*왔|보고\s*왔/i;
const EXIT_PATTERN = /(?:^|\s)(나|이제|저)\s*갈게|집\s*갈게|들어갈게|잘\s*들어가|다음에\s*또\s*봐|퇴근하고\s*또\s*보자/i;
const FACE_TO_FACE_PATTERN = /너\s*보인다|눈\s*마주쳤|앞에\s*있네|우리\s*지금\s*만났|지금\s*만났|방금\s*만났|바로\s*앞에\s*있|저기\s*너\s*맞|서로\s*앞에\s*있|서로\s*앞|마주\s*(보고|섰)|만난\s*상황/i;
const USER_ARRIVED_PATTERN = /도착했|나\s*왔|앞이야|앞에\s*(있|도착)|입구야|입구에\s*있|문\s*앞|근처까지\s*왔|지금\s*아래|건물\s*앞|역\s*앞|카페\s*앞|회사\s*앞|학교\s*앞|센터\s*앞/i;
const COUNTERPART_COMING_PATTERN = /지금\s*나갈게|금방\s*나가|1분만\s*기다|잠깐만\s*기다|입구로\s*갈게|문\s*앞에서\s*봐|내려갈게|나왔어|지금\s*보여|바로\s*나갈|바로\s*나가|나갈게요|나갈께요/i;
const IMMEDIATE_HANDOFF_PATTERN = /(빵|선물|커피|음료|케이크|디저트|물건).*(주고\s*갈|드리고\s*갈|전해|건네|직접\s*줄|받아)|문\s*앞에\s*두고\s*갈|잠깐\s*받고\s*갈래|나와서\s*받아|직접\s*줄게/i;
const ON_THE_WAY_PATTERN = /가는\s*중|가고\s*있|출발했|지금\s*갈게|버스\s*탔|택시\s*탔|지하철\s*타고|거의\s*다\s*와/i;
const FUTURE_PLAN_PATTERN = /이따\s*보|나중에\s*보|다음에\s*보|주말에\s*만나|언젠가|퇴근하고\s*보|끝나고\s*연락|이따\s*연락|데이트\s*기대|오늘\s*기대|기대할게|기다리고\s*있을게/i;
const SCHEDULED_PLAN_PATTERN = /\d{1,2}\s*시(쯤|경)?\s*(에)?\s*(보|만나)|오전\s*\d{1,2}\s*시|오후\s*\d{1,2}\s*시|약속|예약|카페에서\s*보|역에서\s*보|퇴근하고/i;
const CURRENT_LOCATION_PATTERN = /도착|앞이야|앞에\s*(있|도착)|입구|문\s*앞|근처까지\s*왔|지금\s*아래|건물\s*앞|역\s*앞|카페\s*앞|회사\s*앞|학교\s*앞|센터\s*앞/i;
const RECENT_WINDOW = 18;
const DEFAULT_MEETING_STATS: MeetingStats = { affection: 0, trust: 0, tension: 0, awkwardness: 1, intimacy: 0 };

const PHASE_PLAN_BY_TYPE: Record<MeetingEventType, MeetingScenarioPhase[]> = {
  first_meeting: ['intro', 'warmup', 'tension', 'climax', 'afterglow'],
  date: ['intro', 'warmup', 'tension', 'turning', 'climax', 'afterglow'],
  handoff: ['intro', 'warmup', 'climax', 'afterglow'],
  comfort: ['intro', 'warmup', 'tension', 'climax', 'afterglow'],
  confession_tension: ['intro', 'warmup', 'tension', 'turning', 'climax', 'afterglow'],
  fight_reconcile: ['intro', 'tension', 'turning', 'climax', 'afterglow'],
  accidental_meet: ['intro', 'warmup', 'tension', 'climax', 'afterglow'],
  late_night: ['intro', 'warmup', 'tension', 'climax', 'afterglow'],
  short_walk: ['intro', 'warmup', 'tension', 'climax', 'afterglow'],
  group_meet: ['intro', 'warmup', 'tension', 'turning', 'climax', 'afterglow']
};

function inferMeetingEventType(source: string, isGroup = false): MeetingEventType {
  const text = String(source || '');
  if (isGroup) return 'group_meet';
  if (/미안|싸웠|싸움|서운|화해|삐졌|풀어/i.test(text)) return 'fight_reconcile';
  if (/힘들|울|괜찮냐|위로|속상|아프|피곤|지쳤/i.test(text)) return 'comfort';
  if (/고백|좋아해|사귈|썸|설레|질투|키스|손잡/i.test(text)) return 'confession_tension';
  if (/빵|선물|커피|음료|케이크|디저트|물건|전해|건네|주고\s*갈|받아/i.test(text)) return 'handoff';
  if (/새벽|밤|늦게|비\s*오|우산|집\s*앞/i.test(text)) return 'late_night';
  if (/산책|걷|걸을|한강|공원/i.test(text)) return 'short_walk';
  if (/우연|마주쳤|길에서|지나가다|너\s*보인다/i.test(text)) return 'accidental_meet';
  if (/데이트|카페|밥|영화|술|예약|소개팅|매칭/i.test(text)) return 'date';
  return 'first_meeting';
}

function meetingTypeScenario(eventType: MeetingEventType, characterName = '상대') {
  const base: Record<MeetingEventType, { eventGoal: string; eventConflict: string; climaxQuestion: string; expectedEndingTone: string }> = {
    first_meeting: {
      eventGoal: `${characterName}과 사용자가 실제로 처음 마주한 어색함을 풀고 서로의 첫인상을 확인한다.`,
      eventConflict: '채팅에서의 거리감과 실제로 마주했을 때의 어색함이 다르다.',
      climaxQuestion: '사용자가 어색함을 피하지 않고 오늘의 첫인상을 솔직하게 건넬 것인가.',
      expectedEndingTone: '어색하지만 다음 대화가 기대되는 여운'
    },
    date: {
      eventGoal: '약속된 데이트에서 서로가 다음 만남까지 생각할 만큼의 감정적 장면을 만든다.',
      eventConflict: '좋은 분위기와 부담스러운 속도 사이에서 서로의 거리감을 조절해야 한다.',
      climaxQuestion: '사용자가 오늘 좋았던 순간이나 다음 약속을 자연스럽게 꺼낼 것인가.',
      expectedEndingTone: '설렘과 아쉬움이 남는 데이트 여운'
    },
    handoff: {
      eventGoal: '짧은 전달 상황을 단순 심부름이 아니라 기억에 남는 작은 호감 장면으로 만든다.',
      eventConflict: '오래 붙잡기엔 부담스럽지만 그냥 끝내기엔 아쉬운 순간이다.',
      climaxQuestion: '사용자가 장난으로 넘길지, 생각나서 챙겼다고 솔직하게 말할지 선택한다.',
      expectedEndingTone: '짧지만 은근히 오래 남는 따뜻한 여운'
    },
    comfort: {
      eventGoal: `${characterName}이 괜찮은 척하던 감정을 조금 내려놓고 사용자에게 기대도 되는지 확인한다.`,
      eventConflict: `${characterName}은 분위기를 무겁게 만들기 싫어 하지만 사실 위로받고 싶다.`,
      climaxQuestion: '사용자가 캐묻지 않고 곁에 있어줄지, 정확히 이유를 물어볼지 결정한다.',
      expectedEndingTone: '조용하고 따뜻하게 가까워지는 여운'
    },
    confession_tension: {
      eventGoal: '썸과 고백 직전의 긴장감을 실제 거리감과 시선으로 밀어올린다.',
      eventConflict: '서로 끌리지만 너무 빨리 확정하면 어색해질 수 있다.',
      climaxQuestion: '사용자가 농담 뒤에 숨은 진심을 잡아낼 것인가.',
      expectedEndingTone: '확답보다 더 강한 긴장감이 남는 여운'
    },
    fight_reconcile: {
      eventGoal: '싸움이나 서운함 이후 직접 만나 감정의 핵심을 건드리고 관계를 복구한다.',
      eventConflict: '서로 풀고 싶지만 자존심과 서운함이 남아 있다.',
      climaxQuestion: '사용자가 먼저 사과할지, 자기 감정도 솔직히 말할지, 잠시 거리를 둘지 결정한다.',
      expectedEndingTone: '완전히 풀리진 않아도 다시 이어질 가능성이 생기는 여운'
    },
    accidental_meet: {
      eventGoal: '예상치 못한 마주침을 그냥 우연이 아니라 다음 관계로 이어질 장면으로 만든다.',
      eventConflict: '갑작스러움 때문에 반갑지만 어떻게 행동해야 할지 어색하다.',
      climaxQuestion: '사용자가 우연을 핑계로 잠깐 더 시간을 만들 것인가.',
      expectedEndingTone: '우연이 의도처럼 느껴지는 묘한 여운'
    },
    late_night: {
      eventGoal: '밤이나 비 오는 상황의 감정선을 이용해 평소보다 솔직한 말을 끌어낸다.',
      eventConflict: '늦은 시간의 감정은 진심처럼 느껴지지만 다음 날엔 부담이 될 수 있다.',
      climaxQuestion: '사용자가 늦은 밤의 솔직함을 받아줄지 조심스럽게 선을 지킬지 결정한다.',
      expectedEndingTone: '새벽 감성과 현실감이 섞인 여운'
    },
    short_walk: {
      eventGoal: '잠깐 걷는 동안 어색함을 풀고 대화의 리듬을 만든다.',
      eventConflict: '너무 가볍게 끝날 수도 있고, 너무 진지하면 산책의 리듬이 깨진다.',
      climaxQuestion: '사용자가 걷는 속도와 말의 속도를 상대에게 맞출 것인가.',
      expectedEndingTone: '천천히 가까워지는 생활감 있는 여운'
    },
    group_meet: {
      eventGoal: '단톡 멤버들이 실제로 만나며 온라인과 다른 관계 구도를 만든다.',
      eventConflict: '여러 사람이 동시에 있어 누가 주도하고 누가 어색해하는지 드러난다.',
      climaxQuestion: '사용자가 전체 분위기를 살릴지, 특정 캐릭터에게 집중할지 선택한다.',
      expectedEndingTone: '단톡 안의 관계가 실제 기억으로 바뀌는 여운'
    }
  };
  return base[eventType];
}

function meetingPhasePlan(eventType: MeetingEventType): MeetingScenarioPhase[] {
  return PHASE_PLAN_BY_TYPE[eventType] || PHASE_PLAN_BY_TYPE.first_meeting;
}

function meetingMinTurns(eventType: MeetingEventType) {
  return eventType === 'handoff' ? 4 : 5;
}

function meetingMaxTurns(eventType: MeetingEventType) {
  if (eventType === 'handoff') return 5;
  if (eventType === 'group_meet') return 8;
  return 8;
}

function findGroupRoom(state: SNSGodState, roomId?: string): GroupRoom | undefined {
  if (!roomId) return undefined;
  return (state.groupRooms || []).find(room => room.id === roomId);
}

function groupCharacters(state: SNSGodState, room?: GroupRoom): SNSGodCharacter[] {
  const ids = Array.isArray(room?.participantIds) ? room?.participantIds || [] : [];
  return state.characters.filter(character => ids.includes(character.id));
}

function appendMeetingMessage(state: SNSGodState, roomId: string, message: SNSGodMessage): SNSGodState {
  const group = findGroupRoom(state, roomId);
  if (group) {
    return {
      ...state,
      messages: { ...state.messages, [roomId]: appendMessageToHistory(state.messages[roomId], message) },
      groupRooms: (state.groupRooms || []).map(item => item.id === roomId ? { ...item, lastActivity: message.createdAt } : item)
    };
  }
  return appendMessage(state, roomId, message);
}

function appendMeetingMessageOnce(state: SNSGodState, roomId: string, message: SNSGodMessage): SNSGodState {
  return (state.messages[roomId] || []).some(item => item.id === message.id)
    ? state
    : appendMeetingMessage(state, roomId, message);
}

function claimExistingMeetingResult(state: SNSGodState, session: MeetingEventSession): SNSGodState {
  if (session.status !== 'finished' || session.resultAppliedAt) return state;
  const receipt = (state.messages[session.roomId] || []).find(message => (
    message.id === `meeting_result:${session.id}`
    || (message.meetingEventId === session.id && (message.sourceMode === 'meeting' || message.sourceMode === 'group_meeting'))
  ));
  if (!receipt) return state;
  const claimed = applyLifecycleResultOnce(session, Number(receipt.createdAt || Date.now())).session;
  return {
    ...state,
    activeMeetingEventId: state.activeMeetingEventId === session.id ? undefined : state.activeMeetingEventId,
    meetingEventSessions: (state.meetingEventSessions || []).map(item => item.id === session.id ? claimed : item)
  };
}

function groupRecentTranscript(state: SNSGodState, room: GroupRoom, participants: SNSGodCharacter[]): string {
  return roomMessages(state, room.id)
    .filter(message => message.role === 'user' || message.role === 'character')
    .slice(-RECENT_WINDOW)
    .map(message => {
      const speaker = message.role === 'user'
        ? (state.config.userName || '나')
        : participants.find(character => character.id === message.characterId)?.name || 'Character';
      const body = String(message.content || message.imageCaption || (message.mediaData ? '[사진]' : '') || '').trim();
      return body ? `${speaker}: ${body}` : '';
    })
    .filter(Boolean)
    .join('\n');
}

function latestCharacterTextById(state: SNSGodState, roomId: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const message of [...roomMessages(state, roomId)].reverse()) {
    if (message.role !== 'character' || !message.characterId || result[message.characterId]) continue;
    result[message.characterId] = String(message.content || message.imageCaption || '').trim();
  }
  return result;
}

function classifyGroupParticipantStatus(text: string): GroupMeetingParticipantStatus {
  if (CANCEL_OR_DELAY_PATTERN.test(text)) return 'cancelled';
  if (COMPLETED_MEETING_PATTERN.test(text)) return 'completed';
  if (FACE_TO_FACE_PATTERN.test(text)) return 'face_to_face';
  if (COUNTERPART_COMING_PATTERN.test(text)) return 'coming_out';
  if (USER_ARRIVED_PATTERN.test(text) || CURRENT_LOCATION_PATTERN.test(text)) return 'arrived';
  if (ON_THE_WAY_PATTERN.test(text)) return 'on_the_way';
  if (FUTURE_PLAN_PATTERN.test(text) || SCHEDULED_PLAN_PATTERN.test(text)) return 'future_plan';
  return 'unknown';
}

function groupStageFromStatuses(userStatus: GroupMeetingParticipantStatus, statuses: Record<string, GroupMeetingParticipantStatus>, transcript: string): GroupMeetingStage {
  if (userStatus === 'cancelled' || Object.values(statuses).some(status => status === 'cancelled')) return 'cancelled';
  if (COMPLETED_MEETING_PATTERN.test(transcript)) return 'completed';
  if (hasImmediateHandoffWithLocation(transcript)) return 'handoff';
  const presentCount = Object.values(statuses).filter(status => status === 'arrived' || status === 'coming_out' || status === 'face_to_face').length;
  const faceCount = Object.values(statuses).filter(status => status === 'face_to_face').length;
  const userPresent = userStatus === 'arrived' || userStatus === 'face_to_face';
  if (userPresent && (faceCount >= 2 || FACE_TO_FACE_PATTERN.test(transcript))) return 'group_face_to_face';
  if (userPresent && presentCount >= 2) return 'group_arrived';
  if (userPresent && presentCount === 1) return 'partial_arrived';
  if (userStatus === 'on_the_way' || Object.values(statuses).some(status => status === 'on_the_way')) return 'on_the_way';
  if (FUTURE_PLAN_PATTERN.test(transcript)) return 'future_plan';
  if (SCHEDULED_PLAN_PATTERN.test(transcript)) return 'scheduled_plan';
  return 'none';
}

function pickPresentGroupCharacters(participants: SNSGodCharacter[], statuses: Record<string, GroupMeetingParticipantStatus>, messages: SNSGodMessage[], limit = 3): SNSGodCharacter[] {
  const presentIds = new Set(Object.entries(statuses)
    .filter(([, status]) => status === 'arrived' || status === 'coming_out' || status === 'face_to_face')
    .map(([id]) => id));
  const recentScore = new Map<string, number>();
  messages.forEach((message, index) => {
    if (message.characterId) recentScore.set(message.characterId, index);
  });
  return participants
    .filter(character => presentIds.has(character.id))
    .sort((a, b) => (recentScore.get(b.id) || 0) - (recentScore.get(a.id) || 0))
    .slice(0, limit);
}

function normalizeGroupLines(lines: GroupMeetingLineSeed[] | undefined, present: SNSGodCharacter[], fallbackContext: string): MeetingEventLine[] {
  const now = Date.now();
  const seeds = Array.isArray(lines) ? lines : [];
  const normalized = seeds
    .map((line, index) => {
      const character = present.find(item => item.id === line.characterId) || present[index % Math.max(1, present.length)];
      const text = normalizeMeetingVisibleLine(line.text, fallbackContext);
      if (!character || !text) return undefined;
      return {
        id: makeId('meetingline'),
        speaker: 'character' as const,
        speakerType: 'character' as const,
        characterId: character.id,
        characterName: character.name,
        text,
        createdAt: now + index
      };
    })
    .filter(Boolean) as MeetingEventLine[];
  if (normalized.length) return normalized.slice(0, 3);
  return present.slice(0, 2).map((character, index) => ({
    id: makeId('meetingline'),
    speaker: 'character' as const,
    speakerType: 'character' as const,
    characterId: character.id,
    characterName: character.name,
    text: index === 0 ? '진짜 왔네. 단톡에서 얘기하던 거랑 실제로 보니까 느낌이 좀 다르다.' : '일단 여기 서 있지 말고 안쪽으로 들어갈까?',
    createdAt: now + index
  }));
}

function compactText(value: string, max = 1600): string {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function clampMeetingStat(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(-5, Math.min(5, Math.round(number)));
}

function normalizeResultCard(raw: Partial<MeetingResultCard> | undefined, session: MeetingEventSession, summary: string): MeetingResultCard {
  const relationshipChanges = raw?.relationshipChanges || {};
  return {
    title: compactText(raw?.title || '오늘의 만남', 60),
    location: compactText(raw?.location || session.location || '만남 장소', 80),
    mood: compactText(raw?.mood || session.expectedEndingTone || session.mood || '만남의 여운', 120),
    keyMoment: compactText(raw?.keyMoment || summary || '서로의 반응을 직접 확인한 순간', 180),
    characterImpression: compactText(raw?.characterImpression || '오늘의 만남을 통해 사용자를 조금 더 현실적인 사람으로 기억한다.', 180),
    relationshipChanges: {
      affection: clampMeetingStat(relationshipChanges.affection),
      trust: clampMeetingStat(relationshipChanges.trust),
      tension: clampMeetingStat(relationshipChanges.tension),
      awkwardness: clampMeetingStat(relationshipChanges.awkwardness),
      intimacy: clampMeetingStat(relationshipChanges.intimacy)
    },
    futureHooks: Array.isArray(raw?.futureHooks) && raw.futureHooks.length
      ? raw.futureHooks.map(item => compactText(String(item || ''), 120)).filter(Boolean).slice(0, 3)
      : ['다음 대화에서 오늘 하지 못한 이야기가 이어질 수 있다.'],
    afterMessage: compactText(raw?.afterMessage || '', 180)
  };
}

function resultCardText(card: MeetingResultCard): string {
  const changes = Object.entries(card.relationshipChanges || {})
    .filter(([, value]) => Number(value) !== 0)
    .map(([key, value]) => `${key} ${Number(value) > 0 ? '+' : ''}${value}`)
    .join(', ') || '미세한 변화';
  return [
    `${card.title}`,
    `장소: ${card.location}`,
    `분위기: ${card.mood}`,
    `결정적 순간: ${card.keyMoment}`,
    `상대의 인상: ${card.characterImpression}`,
    `관계 변화: ${changes}`,
    card.futureHooks.length ? `후속 떡밥: ${card.futureHooks.join(' / ')}` : ''
  ].filter(Boolean).join('\n');
}

function hasKorean(value: string): boolean {
  return /[가-힣]/.test(value);
}

function visibleKoreanOrFallback(value: string | undefined, fallback: string, max = 240): string {
  const text = compactText(value || '', max);
  if (!text) return fallback;
  return hasKorean(text) ? text : fallback;
}

function meetingLocationFallback(source: string): string {
  const direct = source.match(/(?:직장|회사|센터|건물|학교|카페|역|집|문|입구)\s*(?:앞|입구|근처)?/)?.[0];
  if (direct) return compactText(direct, 80);
  return locationFromMeetingText(source);
}

function meetingMoodFallback(source: string): string {
  if (/배고프|먹|식사|밥|빵|디저트|카페|스테이크/i.test(source)) return '배고픔과 설렘이 섞인 만남 직전 분위기';
  if (/비|우산|젖|추워|춥/i.test(source)) return '비 오는 날의 급하지만 따뜻한 분위기';
  if (/퇴근|일|수업|회사|직장/i.test(source)) return '바쁜 하루 끝에 잠깐 마주치는 설레는 분위기';
  return '짧고 현실적인 만남 직전의 분위기';
}

function firstLineFallback(source: string): string {
  if (/배고프|먹|식사|밥|빵|디저트|카페|스테이크/i.test(source)) {
    return '문이 열리고, 살짝 들뜬 얼굴로 다가와 웃으며 말한다. “오빠, 진짜 왔네. 나 배고파서 쓰러질 뻔했어.”';
  }
  if (/비|우산|젖|추워|춥/i.test(source)) {
    return '문이 열리고, 서로가 바로 앞에서 마주친다. “오빠, 비 오는데 여기까지 와줬네.”';
  }
  return '잠깐 뒤, 문이 열리고 서로가 바로 앞에서 마주친다.';
}

function normalizeMeetingStartText(start: MeetingStartResult, source: string): MeetingStartResult {
  const locationFallback = meetingLocationFallback(source);
  const moodFallback = meetingMoodFallback(source);
  return {
    ...start,
    location: visibleKoreanOrFallback(start.location, locationFallback, 80),
    mood: visibleKoreanOrFallback(start.mood, moodFallback, 80),
    seedSummary: visibleKoreanOrFallback(start.seedSummary, compactText(source, 600), 600),
    firstLine: visibleKoreanOrFallback(start.firstLine, firstLineFallback(source), 260),
    promptMessage: visibleKoreanOrFallback(start.promptMessage, '최근 대화를 기준으로 만남 이벤트를 실행할까요?', 120)
  };
}

export function normalizeMeetingVisibleLine(text: string | undefined, context = ''): string {
  return visibleKoreanOrFallback(text, firstLineFallback(context || ''), 500);
}

function recentTranscript(state: SNSGodState, room: SNSGodRoom, character: SNSGodCharacter): string {
  const userName = userNameFor(state, character, room);
  return roomMessages(state, room.id)
    .filter(message => message.role === 'user' || message.role === 'character')
    .slice(-RECENT_WINDOW)
    .map(message => {
      const speaker = message.role === 'user' ? userName : character.name;
      const body = String(message.content || message.imageCaption || (message.mediaData ? '[사진]' : '') || '').trim();
      return body ? `${speaker}: ${body}` : '';
    })
    .filter(Boolean)
    .join('\n');
}

function recentCharacterTranscript(state: SNSGodState, room: SNSGodRoom, character: SNSGodCharacter): string {
  return roomMessages(state, room.id)
    .filter(message => message.role === 'character')
    .slice(-8)
    .map(message => String(message.content || message.imageCaption || '').trim())
    .filter(Boolean)
    .join('\n');
}

function hasImmediateHandoffWithLocation(text: string): boolean {
  return IMMEDIATE_HANDOFF_PATTERN.test(text) && (CURRENT_LOCATION_PATTERN.test(text) || FACE_TO_FACE_PATTERN.test(text) || COUNTERPART_COMING_PATTERN.test(text));
}

function classifyMeetingStage(contextText: string, latestUserText: string, characterText: string): MeetingIntentStage {
  const text = `${contextText}\n${latestUserText}`;
  const latest = String(latestUserText || '');
  if (CANCEL_OR_DELAY_PATTERN.test(latest) || EXIT_PATTERN.test(latest)) return 'cancelled';
  if (COMPLETED_MEETING_PATTERN.test(latest)) return 'completed';
  if (FACE_TO_FACE_PATTERN.test(text)) return 'face_to_face';

  const userArrived = USER_ARRIVED_PATTERN.test(latest);
  const counterpartComing = COUNTERPART_COMING_PATTERN.test(characterText);
  if (userArrived && counterpartComing) return 'face_to_face';
  if (hasImmediateHandoffWithLocation(text)) return 'handoff';
  if (userArrived) return 'arrived';
  if (counterpartComing) return 'counterpart_coming';
  if (ON_THE_WAY_PATTERN.test(latest)) return 'on_the_way';
  if (FUTURE_PLAN_PATTERN.test(text)) return 'future_plan';
  if (SCHEDULED_PLAN_PATTERN.test(text)) return 'scheduled_plan';
  return 'none';
}

function isAutoStartStage(stage: MeetingIntentStage, recentCharacterSaidTheyWillComeOut: boolean): boolean {
  return stage === 'face_to_face'
    || stage === 'handoff'
    || stage === 'counterpart_coming'
    || stage === 'arrived';
}

function stageReason(stage: MeetingIntentStage, recentCharacterSaidTheyWillComeOut: boolean): string {
  if (stage === 'face_to_face') return '지금 서로 앞에 있거나 곧 마주치는 강한 표현이 감지됨';
  if (stage === 'handoff') return '현재 위치에서 짧은 전달/대면이 성립함';
  if (stage === 'arrived' && recentCharacterSaidTheyWillComeOut) return '사용자가 도착했고 최근 캐릭터가 바로 나오겠다고 함';
  if (stage === 'arrived') return '사용자가 현재 장소에 도착해 만남 이벤트를 시작할 수 있음';
  if (stage === 'counterpart_coming') return '캐릭터가 지금 나오거나 곧 마주치는 흐름이 감지됨';
  if (stage === 'future_plan') return '미래 약속/기대 표현이라 자동 발동 금지';
  if (stage === 'scheduled_plan') return '시간/장소 약속 단계라 자동 발동 금지';
  if (stage === 'on_the_way') return '이동 중이라 아직 실제 만남 직전이 아님';
  if (stage === 'completed') return '이미 끝난 만남 회상이라 자동 발동 금지';
  if (stage === 'cancelled') return '취소/연기/퇴장 표현이라 자동 발동 금지';
  return '즉시 만남 신호 없음';
}

function locationFromMeetingText(source: string): string {
  return compactText(source.match(/센터\s*앞|입구|문\s*앞|역\s*앞|집\s*앞|회사\s*앞|학교\s*앞|카페\s*앞|건물\s*앞|지금\s*아래|카페/)?.[0] || '약속 장소 앞', 80);
}

export function meetingCandidate(state: SNSGodState, roomId: string, latestUserText: string): MeetingCandidate {
  const room = findRoom(state, roomId);
  const character = findCharacter(state, room?.characterId);
  if (!room || !character || room.type === 'random') return { candidate: false, reason: 'unsupported room', transcript: '', characterTranscript: '', stage: 'none', recentCharacterSaidTheyWillComeOut: false };
  const transcript = recentTranscript(state, room, character);
  const characterTranscript = recentCharacterTranscript(state, room, character);
  const recentCharacterSaidTheyWillComeOut = COUNTERPART_COMING_PATTERN.test(characterTranscript);
  const stage = classifyMeetingStage(transcript, latestUserText, characterTranscript);
  const candidate = isAutoStartStage(stage, recentCharacterSaidTheyWillComeOut);
  return {
    candidate,
    reason: stageReason(stage, recentCharacterSaidTheyWillComeOut),
    transcript,
    characterTranscript,
    stage,
    recentCharacterSaidTheyWillComeOut
  };
}

export async function shouldStartMeetingEvent(state: SNSGodState, roomId: string, latestUserText: string): Promise<MeetingStartResult> {
  const room = findRoom(state, roomId);
  const character = findCharacter(state, room?.characterId);
  const candidate = meetingCandidate(state, roomId, latestUserText);
  if (!room || !character || !candidate.candidate) return { shouldStart: false, reason: candidate.reason };
  const userName = userNameFor(state, character, room);
  const source = `${candidate.transcript}\n${latestUserText}`;
  if (isAutoStartStage(candidate.stage, candidate.recentCharacterSaidTheyWillComeOut)) {
    return normalizeMeetingStartText({
      shouldStart: true,
      reason: candidate.reason,
      location: locationFromMeetingText(source),
      mood: '짧고 현실적인 만남 직전의 분위기',
      seedSummary: compactText(candidate.transcript || source, 600),
      stillPrompt: compactText(`A realistic horizontal cinematic still of ${character.name} briefly meeting ${userName} outside the agreed place, natural Korean everyday setting, hurried but warm mood, the female character has just come out for a short moment, the male user is waiting with a small item if mentioned in chat.`, 800),
      firstLine: '잠깐 뒤, 문이 열리고 서로가 바로 앞에서 마주친다.'
    }, source);
  }
  try {
    const { text } = await callLLMText(state, [
      {
        role: 'system',
        content: [
          'You are not deciding whether these two people might meet later.',
          'You decide only whether they are physically at the meeting point right now or about to see each other within the next 1-2 minutes.',
          'Return raw JSON only: {"stage":"none|future_plan|scheduled_plan|on_the_way|arrived|counterpart_coming|face_to_face|handoff|completed|cancelled","shouldStartNow":true|false,"confidence":0.0,"reason":"","detectedLocation":null,"detectedTime":null,"location":"","mood":"","seedSummary":"","stillPrompt":"","firstLine":""}.',
          'Future plans, scheduled dates, excitement, promises, travel-in-progress, completed meetings, cancelled plans, phone calls, and online-only context must return shouldStartNow=false.',
          'Start only for face_to_face, handoff, or arrived when the recent character messages say they are coming out now.',
          configuredPrompt(state, 'meetingEventRules'),
          'Confidence 0.55 or higher is enough to start when the stage is plausible.',
          'stillPrompt must be an English cinematic horizontal still image prompt for the meeting scene. It should show the female character and the user together when natural, but no text, no UI, no logos.',
          'Infer the female character outfit automatically from recent chat, current time, weather, place, and mood. Include a concrete but natural outfit in stillPrompt. Do not force the profile-photo outfit unless recent context supports it.',
          'Include the male user from the provided user appearance prompt as a separate person. Do not make him look like the female character reference.',
          'location, mood, seedSummary, and firstLine are visible to the user and must be Korean only.',
          'firstLine is the first Korean in-person line or situation description shown after the still image. Never write English dialogue or English action text in firstLine.'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          `Character: ${character.name}`,
          `User: ${userName}`,
          `Character profile:\n${character.prompt || '(empty)'}`,
          `Room note:\n${room.relationshipNote || room.roomPrompt || '(empty)'}`,
          `User appearance prompt for meeting still:\n${state.config.userAppearancePrompt || DEFAULT_USER_APPEARANCE_PROMPT}`,
          `Recent messenger transcript:\n${candidate.transcript || '(empty)'}`,
          `Recent character-only transcript:\n${candidate.characterTranscript || '(empty)'}`,
          `Rule-based stage: ${candidate.stage}`,
          `Latest user message: ${latestUserText}`,
          'Decide now.'
        ].join('\n\n')
      }
    ]);
    const parsed = parseJsonObject<MeetingLlmDecision>(text);
    const llmStage = parsed?.stage || 'none';
    const llmAllowedStage = llmStage === 'face_to_face' || llmStage === 'handoff' || llmStage === 'counterpart_coming' || llmStage === 'arrived';
    const confidence = Number(parsed?.confidence || 0);
    if (!parsed?.shouldStartNow || !llmAllowedStage || confidence < 0.55) return { shouldStart: false, reason: parsed?.reason || 'LLM rejected immediate meeting start' };
    return normalizeMeetingStartText({
      shouldStart: true,
      reason: compactText(parsed.reason || 'natural in-person meeting started', 260),
      location: compactText(parsed.location || parsed.detectedLocation || '만남 장소', 80),
      mood: compactText(parsed.mood || '차분한 분위기', 80),
      seedSummary: compactText(parsed.seedSummary || candidate.transcript, 600),
      stillPrompt: compactText(parsed.stillPrompt || `cinematic horizontal still of ${character.name} meeting ${userName}, natural Korean everyday setting`, 800),
      firstLine: compactText(parsed.firstLine || '서로 마주 앉은 순간, 잠깐 정적이 흐른다.', 240)
    }, source);
  } catch (error) {
    await appendDebugLog('meeting.detect', `meeting start check failed room=${roomId}: ${error instanceof Error ? error.message : String(error)}`, 'warn');
    return { shouldStart: false, reason: 'meeting detection failed' };
  }
}

export async function shouldStartGroupMeetingEvent(state: SNSGodState, roomId: string, latestUserText: string): Promise<GroupMeetingDecision> {
  const room = findGroupRoom(state, roomId);
  const participants = groupCharacters(state, room);
  if (!room || participants.length < 2) return { shouldStartNow: false, reason: 'unsupported group room', stage: 'none' };
  const transcript = groupRecentTranscript(state, room, participants);
  const latestById = latestCharacterTextById(state, roomId);
  const participantStatuses: Record<string, GroupMeetingParticipantStatus> = {};
  for (const character of participants) {
    participantStatuses[character.id] = classifyGroupParticipantStatus(latestById[character.id] || '');
  }
  const userStatus = classifyGroupParticipantStatus(latestUserText);
  const stage = groupStageFromStatuses(userStatus, participantStatuses, `${transcript}\n${latestUserText}`);
  const presentCharacters = pickPresentGroupCharacters(participants, participantStatuses, roomMessages(state, roomId));
  const presentCharacterIds = presentCharacters.map(character => character.id);
  const absentCharacterIds = participants.filter(character => participantStatuses[character.id] === 'cancelled' || participantStatuses[character.id] === 'unavailable').map(character => character.id);
  const ruleAllowed = (stage === 'group_face_to_face' || stage === 'group_arrived' || stage === 'handoff') && presentCharacterIds.length >= 2;
  if (!ruleAllowed) {
    return {
      shouldStartNow: false,
      stage,
      confidence: 0,
      reason: '단톡 만남은 사용자와 최소 2명 이상의 캐릭터가 현재 같은 장소에 있는 맥락에서만 시작합니다.',
      presentCharacterIds,
      absentCharacterIds,
      participantStatuses
    };
  }
  try {
    const { text } = await callLLMText(state, [
      {
        role: 'system',
        content: [
          'You are deciding whether a group chat should transition into an in-person group meeting event.',
          configuredPrompt(state, 'meetingEventRules'),
          'Return shouldStartNow true when the user and at least two AI characters are at the meeting location now, clearly arriving, or about to see each other within a few minutes.',
          'Future plans, schedules, excitement, travel-in-progress, one-person arrival, completed meetings, cancelled plans, phone calls, and online-only context must return false.',
          'Track each participant separately.',
          'Return raw JSON only: {"stage":"none|future_plan|scheduled_plan|on_the_way|partial_arrived|group_arrived|group_face_to_face|handoff|completed|cancelled","shouldStartNow":true,"confidence":0.0,"location":"","mood":"","reason":"","seedSummary":"","presentCharacterIds":[],"absentCharacterIds":[],"participantStatuses":{},"stillPrompt":"","firstLines":[{"characterId":"","text":""}]}.',
          'confidence 0.55 or higher is enough to start when the stage is plausible.',
          'presentCharacterIds must include 2 or 3 AI character ids from the allowed list, no outside ids.',
          'Visible Korean fields must be Korean only. firstLines must be Korean in-person dialogue, not messenger chat.',
          'stillPrompt must be English only and describe a realistic offline group meeting atmosphere still: 3 to 4 adults meeting in the same real place, not a messenger screen, not SNS, not phone call, no text, no UI, no logo, no watermark.'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          `User: ${state.config.userName || '나'}`,
          `Group room: ${room.name}`,
          `Allowed members:\n${participants.map(character => `- ${character.id}: ${character.name} / ${character.prompt || '(empty)'}`).join('\n')}`,
          `Rule stage: ${stage}`,
          `Rule participant statuses:\n${JSON.stringify(participantStatuses)}`,
          `Recent group transcript:\n${transcript || '(empty)'}`,
          `Latest user message: ${latestUserText}`,
          'Decide now.'
        ].join('\n\n')
      }
    ]);
    const parsed = parseJsonObject<GroupMeetingDecision>(text);
    const confidence = Number(parsed?.confidence || 0);
    const parsedPresent = (parsed?.presentCharacterIds || []).filter(id => participants.some(character => character.id === id)).slice(0, 3);
    const allowedStage = parsed?.stage === 'group_face_to_face' || parsed?.stage === 'group_arrived' || parsed?.stage === 'handoff';
    if (!parsed?.shouldStartNow || !allowedStage || confidence < 0.55 || parsedPresent.length < 2) {
      return { shouldStartNow: false, stage: parsed?.stage || stage, confidence, reason: parsed?.reason || 'LLM rejected group meeting start', presentCharacterIds: parsedPresent, absentCharacterIds, participantStatuses };
    }
    return {
      shouldStartNow: true,
      stage: parsed.stage || stage,
      confidence,
      location: visibleKoreanOrFallback(parsed.location, meetingLocationFallback(`${transcript}\n${latestUserText}`), 80),
      mood: visibleKoreanOrFallback(parsed.mood, '여럿이 실제로 모이며 어색함과 기대가 섞인 분위기', 100),
      reason: visibleKoreanOrFallback(parsed.reason, '사용자와 단톡 멤버들이 같은 장소에서 만나기 직전이다.', 240),
      seedSummary: visibleKoreanOrFallback(parsed.seedSummary, compactText(transcript, 700), 700),
      stillPrompt: compactText(parsed.stillPrompt || '', 900),
      presentCharacterIds: parsedPresent,
      absentCharacterIds: (parsed.absentCharacterIds || absentCharacterIds).filter(id => participants.some(character => character.id === id)),
      participantStatuses: parsed.participantStatuses || participantStatuses,
      firstLines: parsed.firstLines
    };
  } catch (error) {
    await appendDebugLog('meeting.group.detect', `group meeting start check failed room=${roomId}: ${error instanceof Error ? error.message : String(error)}`, 'warn');
    return {
      shouldStartNow: true,
      stage,
      confidence: 0.86,
      location: meetingLocationFallback(`${transcript}\n${latestUserText}`),
      mood: '여럿이 실제로 모이며 어색함과 기대가 섞인 분위기',
      reason: '규칙 기반으로 사용자와 최소 2명의 캐릭터가 현재 같은 장소에 있는 맥락을 감지했다.',
      seedSummary: compactText(transcript || latestUserText, 700),
      presentCharacterIds,
      absentCharacterIds,
      participantStatuses,
      firstLines: presentCharacters.slice(0, 2).map((character, index) => ({
        characterId: character.id,
        text: index === 0 ? '진짜 왔네. 단톡에서만 보다가 실제로 보니까 좀 어색하다.' : '일단 여기 사람 많으니까 안쪽으로 들어갈까?'
      }))
    };
  }
}

async function generateGroupMeetingStillImage(state: SNSGodState, roomId: string, prompt: string, present: SNSGodCharacter[]): Promise<string> {
  const primary = present[0];
  const referenceImage = primary ? primaryCharacterReferenceImage(primary) : undefined;
  const visualRoster = present.map((character, index) => {
    const profile = compactText([
      character.name,
      character.prompt,
      character.statusMessage
    ].filter(Boolean).join(' '), 320);
    return `${index + 1}. ${character.name}${index === 0 && referenceImage ? ' (attached reference identity)' : ''}: ${profile || 'use her saved character profile and distinct look'}`;
  }).join('\n');
  const referencePrompt = [
    prompt,
    visualRoster ? `Visible AI character roster:\n${visualRoster}` : '',
    referenceImage && primary ? `The attached reference image is mandatory for ${primary.name}. Preserve her recognizable face, hairstyle, hair length, bangs or no bangs, hair color, face shape, and body impression while changing only pose, outfit, and meeting scene.` : '',
    present.length > 1 ? 'For the other AI characters, keep each person visually distinct according to their saved profile descriptions; do not make them clones of the referenced character.' : ''
  ].filter(Boolean).join('\n\n');
  await appendDebugLog(
    'meeting.group.image.reference',
    `room=${roomId} primary=${primary?.name || '-'} reference=${referenceImage ? 'yes' : 'no'} present=${present.map(character => character.name).join(', ')}`
  );
  try {
    return await generateImageDataUri(state, referencePrompt, primary, { kind: 'meeting', referenceImage });
  } catch (error) {
    await appendDebugLog('meeting.group.image', `group meeting still generation failed room=${roomId}: ${error instanceof Error ? error.message : String(error)}`, 'warn');
    return '';
  }
}

export async function createGroupMeetingEventSession(state: SNSGodState, roomId: string, start: GroupMeetingDecision): Promise<SNSGodState> {
  const room = findGroupRoom(state, roomId);
  const participants = groupCharacters(state, room);
  if (!room || !start.shouldStartNow) return state;
  const present = (start.presentCharacterIds || [])
    .map(id => participants.find(character => character.id === id))
    .filter(Boolean)
    .slice(0, 3) as SNSGodCharacter[];
  if (present.length < 2) return state;
  const existing = (state.meetingEventSessions || []).find(item => item.roomId === roomId && (item.status === 'pending' || item.status === 'active' || item.status === 'paused'));
  if (existing) return state;
  const now = Date.now();
  const presentNames = present.map(character => character.name).join(' · ');
  const seed = start.seedSummary || groupRecentTranscript(state, room, participants);
  const stillPrompt = [
    start.stillPrompt || `A realistic horizontal cinematic still of a small Korean group meeting in person at ${start.location || 'an everyday meeting place'}, ${present.length + 1} adults gathered naturally, warm awkward first-meeting atmosphere.`,
    `Group members in UI: ${presentNames}.`,
    `Male user appearance: ${state.config.userAppearancePrompt || DEFAULT_USER_APPEARANCE_PROMPT}`,
    'This is an offline group meeting scene, not a messenger screenshot, not a phone call, not SNS.',
    'Prioritize the referenced primary character identity, then place, body placement, distance, atmosphere, and natural interaction.',
    'Wide horizontal cinematic phone-drama still, realistic Korean everyday setting, no text, no captions, no UI, no logos, no watermark.'
  ].filter(Boolean).join(' ');
  const stillImage = await generateGroupMeetingStillImage(state, roomId, stillPrompt, present);
  const lines = normalizeGroupLines(start.firstLines, present, seed);
  const eventType = inferMeetingEventType(seed, true);
  const scenario = meetingTypeScenario(eventType, present[0]?.name || '상대');
  const phasePlan = meetingPhasePlan(eventType);
  const session: MeetingEventSession = {
    id: makeId('meeting'),
    roomId,
    roomType: 'group',
    mode: 'group',
    primaryCharacterId: present[0]?.id,
    characterId: present[0]?.id,
    participantCharacterIds: participants.map(character => character.id),
    presentCharacterIds: present.map(character => character.id),
    absentCharacterIds: start.absentCharacterIds || [],
    startedAt: now,
    status: 'pending',
    eventType,
    phase: phasePlan[0],
    phasePlan,
    phaseTurn: 0,
    totalUserTurns: 0,
    minTurns: meetingMinTurns(eventType),
    maxTurns: meetingMaxTurns(eventType),
    eventGoal: scenario.eventGoal,
    eventConflict: scenario.eventConflict,
    climaxQuestion: scenario.climaxQuestion,
    expectedEndingTone: scenario.expectedEndingTone,
    hasClimaxChoiceResolved: false,
    stats: { ...DEFAULT_MEETING_STATS, awkwardness: 2 },
    location: visibleKoreanOrFallback(start.location, meetingLocationFallback(seed), 80),
    reason: visibleKoreanOrFallback(start.reason, '단톡 멤버들이 실제 장소에서 만나기 직전이다.', 240),
    mood: visibleKoreanOrFallback(start.mood, '여럿이 실제로 모이며 어색함과 기대가 섞인 분위기', 100),
    seedSummary: visibleKoreanOrFallback(seed, compactText(seed, 700), 700),
    stillPrompt,
    stillImage,
    stillImageMode: 'single_reference',
    turnCount: 0,
    lines,
    speakerQueue: present.map(character => character.id),
    lastSpeakerCharacterId: lines.filter(line => line.characterId).slice(-1)[0]?.characterId,
    groupMood: start.mood
  };
  const sessions = [session, ...(state.meetingEventSessions || []).filter(item => item.id !== session.id)].slice(0, 50);
  let next: SNSGodState = { ...state, meetingEventSessions: sessions };
  next = appendMeetingMessage(next, roomId, {
    id: makeId('msg'),
    role: 'system',
    content: `단톡 만남 이벤트\n참여 예정: ${presentNames} · ${state.config.userName || '나'}\n${session.location || '만남 장소'} · ${session.mood || '만남 준비됨'}`,
    createdAt: now,
    meetingEventId: session.id,
    meetingEventPrompt: true,
    sourceMode: 'group_meeting'
  });
  return next;
}

export async function createManualGroupMeetingEventPrompt(state: SNSGodState, roomId: string): Promise<SNSGodState> {
  const room = findGroupRoom(state, roomId);
  const participants = groupCharacters(state, room).slice(0, 3);
  if (!room || participants.length < 2) return state;
  if ((state.meetingEventSessions || []).some(item => item.roomId === roomId && (item.status === 'pending' || item.status === 'active' || item.status === 'paused'))) return state;
  const transcript = groupRecentTranscript(state, room, participants);
  const start: GroupMeetingDecision = {
    shouldStartNow: true,
    stage: 'group_arrived',
    confidence: 0.9,
    location: '최근 대화 속 만남 장소',
    mood: '단톡 멤버들이 실제로 모이는 어색하지만 들뜬 분위기',
    reason: '사용자가 단톡방에서 만남 이벤트를 직접 요청했다.',
    seedSummary: compactText(transcript || room.relationshipNote || room.name, 700),
    presentCharacterIds: participants.map(character => character.id),
    absentCharacterIds: [],
    participantStatuses: Object.fromEntries(participants.map(character => [character.id, 'arrived'])),
    firstLines: participants.slice(0, 2).map((character, index) => ({
      characterId: character.id,
      text: index === 0 ? '진짜 이렇게 다 같이 보니까 단톡이랑 느낌이 좀 다르다.' : '일단 어색하니까 어디 앉아서 얘기할까?'
    })),
    promptMessage: '최근 대화를 기준으로 단톡 만남 이벤트를 실행할까요?'
  };
  return createGroupMeetingEventSession(state, roomId, start);
}

export async function createManualMeetingEventPrompt(state: SNSGodState, roomId: string): Promise<SNSGodState> {
  const room = findRoom(state, roomId);
  const character = findCharacter(state, room?.characterId);
  if (!room || !character || room.type === 'random') return state;
  if ((state.meetingEventSessions || []).some(item => item.roomId === roomId && (item.status === 'pending' || item.status === 'active' || item.status === 'paused'))) return state;
  const userName = userNameFor(state, character, room);
  const transcript = recentTranscript(state, room, character);
  let start: MeetingStartResult = {
    shouldStart: true,
    reason: '사용자가 최근 대화 흐름을 기준으로 만남 이벤트 실행을 요청했다.',
    location: '최근 대화 속 만남 장소',
    mood: '최근 대화 흐름에 맞춘 만남',
    seedSummary: compactText(transcript, 600),
    stillPrompt: compactText(`A realistic horizontal cinematic still of ${character.name} meeting ${userName}, based on the recent messenger conversation. Natural Korean everyday setting, believable in-person moment, emotional tone from the chat.`, 800),
    firstLine: '최근 대화 흐름을 이어받아, 두 사람이 실제로 마주한 장면이 시작된다.',
    promptMessage: '최근 대화를 기준으로 만남 이벤트를 실행할까요?'
  };
  try {
    const { text } = await callLLMText(state, [
      {
        role: 'system',
        content: [
          'Create a short setup for a user-requested fictional in-person meeting event from recent messenger context.',
          'Return raw JSON only: {"location":"","mood":"","seedSummary":"","stillPrompt":"","firstLine":""}.',
          'Use the recent chat as the source. If the exact place is unclear, use a cautious generic place from the conversation instead of inventing a dramatic location.',
          'Do not claim the meeting already happened. This is only a confirmation card before the user starts the event.',
          'location, mood, seedSummary, and firstLine are visible to the user and must be Korean only.',
          'stillPrompt must be an English realistic horizontal cinematic still image prompt for the meeting scene. No text, no UI, no logos.',
          'Infer the female character outfit from recent chat, current place, time, weather, and mood. Include the male user from the user appearance prompt as a separate person.'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          `Character: ${character.name}`,
          `User: ${userName}`,
          `User appearance prompt:\n${state.config.userAppearancePrompt || DEFAULT_USER_APPEARANCE_PROMPT}`,
          `Recent messenger transcript:\n${transcript || '(empty)'}`
        ].join('\n\n')
      }
    ]);
    const parsed = parseJsonObject<MeetingStartResult>(text);
    start = {
      ...start,
      location: compactText(parsed?.location || start.location || '최근 대화 속 만남 장소', 80),
      mood: compactText(parsed?.mood || start.mood || '최근 대화 흐름에 맞춘 만남', 80),
      seedSummary: compactText(parsed?.seedSummary || start.seedSummary || transcript, 600),
      stillPrompt: compactText(parsed?.stillPrompt || start.stillPrompt || '', 800),
      firstLine: compactText(parsed?.firstLine || start.firstLine || '', 240)
    };
  } catch (error) {
    await appendDebugLog('meeting.manual', `manual meeting prompt failed room=${roomId}: ${error instanceof Error ? error.message : String(error)}`, 'warn');
  }
  return createMeetingEventSession(state, roomId, normalizeMeetingStartText(start, transcript));
}

export async function createBlindDateFirstDatePrompt(state: SNSGodState, roomId: string): Promise<SNSGodState> {
  const room = findRoom(state, roomId);
  const character = findCharacter(state, room?.characterId);
  if (!room || !character || room.type === 'random') return state;
  if ((state.meetingEventSessions || []).some(item => item.roomId === roomId && (item.status === 'pending' || item.status === 'active' || item.status === 'paused'))) return state;
  const userName = userNameFor(state, character, room);
  const isEncounter = characterBlindDateMode(character) === 'encounter'
    || (character.memories || []).some(memory => String(memory).includes('우연한 만남'));
  const blindMemory = [
    character.blindDateMemory ? JSON.stringify(character.blindDateMemory) : '',
    ...(character.memories || []).filter(memory => String(memory).includes('blind_date_memory')).slice(-3)
  ].filter(Boolean).join('\n');
  let start: MeetingStartResult = {
    shouldStart: true,
    reason: isEncounter ? '우연한 만남에서 연락처를 교환한 뒤 첫 1:1 만남이 이어진다.' : '블라인드 데이트 최종 매칭 후 첫 1:1 데이트가 준비되었다.',
    location: isEncounter ? '우연히 만났던 장소 근처' : '첫 소개팅 장소',
    mood: isEncounter ? '길에서 시작된 우연이 다시 이어지는 묘하게 설레는 분위기' : '처음 직접 마주하는 어색하지만 설레는 분위기',
    seedSummary: compactText(blindMemory || (isEncounter ? `${userName}이 우연한 만남에서 ${character.name}과 연락처를 교환했다.` : `${userName}이 블라인드 데이트에서 ${character.name}을 최종 선택했다.`), 600),
    stillPrompt: compactText(isEncounter
      ? `A realistic horizontal cinematic still of a first in-person follow-up meeting between ${character.name} and ${userName} after a chance street encounter, Korean everyday public place connected to where they first met, the same fictional adult woman from the saved reference photo, natural candid posture, face clearly visible, ordinary Korean drama style, no text, no UI, no logos.`
      : `A realistic horizontal cinematic still of a first blind date meeting between ${character.name} and ${userName}, modern Korean cafe or quiet everyday date location, two adults meeting for the first time after a blind date match, slightly awkward but warm mood, natural Korean drama style, no text, no UI, no logos.`, 800),
    firstLine: isEncounter ? '연락처를 주고받았던 그 우연한 순간이, 다시 실제 만남으로 이어진다.' : '최종 매칭 후, 두 사람이 처음으로 직접 마주 앉는다.',
    promptMessage: isEncounter ? `${character.name}과 우연한 만남 이후 첫 1:1 만남을 시작할까요?` : `최종 매칭되었습니다. ${character.name}과 첫 1:1 데이트를 시작할까요?`
  };
  try {
    const { text } = await callLLMText(state, [
      {
        role: 'system',
        content: [
          isEncounter
            ? 'Create a setup for the first short in-person follow-up meeting after a chance street encounter contact exchange.'
            : 'Create a setup for the first short in-person date after a blind-date matching mini game.',
          'Return raw JSON only: {"location":"","mood":"","seedSummary":"","stillPrompt":"","firstLine":""}.',
          'This is a confirmation card before the user starts the event, not a completed memory.',
          isEncounter
            ? 'Use the saved chance-encounter memory as the source. Do not describe it as blind date matching, rotation dating, or question blind dating.'
            : 'Use the selected candidate profile and blind date memory as the source.',
          'location, mood, seedSummary, and firstLine are visible to the user and must be Korean only.',
          isEncounter
            ? 'stillPrompt must be English only. It must describe one realistic horizontal cinematic still for a follow-up meeting after their chance encounter, with location continuity from the encounter memory.'
            : 'stillPrompt must be English only. It must describe one realistic horizontal cinematic still for the first blind date meeting.',
          'The still must be generated from the selected candidate reference photo when one exists. Preserve her face, body impression, exact hairstyle direction, hair length, bangs or no bangs, hair color, and ordinary-person likeness while changing only the date scene, pose, outfit, and background.',
          'The still should include the female character and the male user as separate adults. Use the provided user appearance prompt for the male user.',
          'Choose the female outfit naturally from her profile, personality, job, and the date context. No text, no UI, no logos.'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          `Character: ${character.name}`,
          `Character profile:\n${character.prompt || '(empty)'}`,
          `${isEncounter ? 'Chance encounter memory' : 'Blind date memory'}:\n${blindMemory || '(empty)'}`,
          `User: ${userName}`,
          `User appearance prompt:\n${state.config.userAppearancePrompt || DEFAULT_USER_APPEARANCE_PROMPT}`
        ].join('\n\n')
      }
    ]);
    const parsed = parseJsonObject<MeetingStartResult>(text);
    start = {
      ...start,
      location: compactText(parsed?.location || start.location || (isEncounter ? '우연히 만났던 장소 근처' : '첫 소개팅 장소'), 80),
      mood: compactText(parsed?.mood || start.mood || (isEncounter ? '우연이 이어지는 첫 만남 분위기' : '첫 만남 분위기'), 80),
      seedSummary: compactText(parsed?.seedSummary || start.seedSummary || blindMemory, 600),
      stillPrompt: compactText(parsed?.stillPrompt || start.stillPrompt || '', 800),
      firstLine: compactText(parsed?.firstLine || start.firstLine || '', 240)
    };
  } catch (error) {
    await appendDebugLog('meeting.blindDateFirstDate', `first date prompt failed room=${roomId}: ${error instanceof Error ? error.message : String(error)}`, 'warn');
  }
  return createMeetingEventSession(state, roomId, normalizeMeetingStartText(start, blindMemory || character.prompt || ''));
}

function upsertGroupMeetingMemory(state: SNSGodState, session: MeetingEventSession, overallSummary: string, perCharacter: Record<string, string>, relationshipDeltas: NonNullable<MeetingEventSession['relationshipDeltas']>): SNSGodState {
  const now = Date.now();
  const presentIds = session.presentCharacterIds || [];
  const existingGroup = (state.groupRoomSummaries || []).filter(summary => summary.roomId !== session.roomId);
  const groupSummary: GroupRoomSummary = {
    id: makeId('summary'),
    roomId: session.roomId,
    roomType: 'group',
    characterIds: presentIds,
    messageCount: (state.messages[session.roomId] || []).length,
    summary: overallSummary,
    topics: ['단톡 만남 이벤트', session.location || '만남 장소'].filter(Boolean),
    mood: session.groupMood || session.mood || '단톡 만남',
    followUps: Object.values(perCharacter).slice(0, 4),
    updatedAt: now,
    lastMessageAt: now,
    publicInfo: [overallSummary],
    characterTakeaways: Object.fromEntries(presentIds.map(id => [id, [perCharacter[id] || overallSummary]])),
    relationshipChanges: Object.entries(relationshipDeltas).map(([id, delta]) => `${id}: affinity ${delta.affinity || 0}, trust ${delta.trust || 0}, tension ${delta.tension || 0}`)
  };
  const existingMemories = state.characterMemories || [];
  const memories: CharacterMemory[] = presentIds.map(characterId => ({
    id: makeId('memory'),
    characterId,
    sourceRoomId: session.roomId,
    sourceRoomType: 'group',
    visibility: 'group_public',
    knownByCharacterIds: presentIds,
    content: `[group_meeting_event_summary] ${perCharacter[characterId] || overallSummary}`,
    importance: 8,
    createdAt: now,
    lastUsedAt: now
  }));
  let next: SNSGodState = {
    ...state,
    groupRoomSummaries: [groupSummary, ...existingGroup].slice(0, 80),
    characterMemories: [...memories, ...existingMemories].slice(0, 400)
  };
  for (const characterId of presentIds) {
    const character = findCharacter(next, characterId);
    if (!character) continue;
    next = updateCharacter(next, characterId, {
      memories: [...(character.memories || []), `[group_meeting_event_summary] ${perCharacter[characterId] || overallSummary}`].filter(Boolean).slice(-80) as string[]
    });
  }
  return next;
}

async function finishGroupMeetingEventSession(state: SNSGodState, session: MeetingEventSession): Promise<SNSGodState> {
  if (session.status === 'cancelled' || (session.status === 'finished' && session.resultAppliedAt)) return state;
  if (session.status !== 'active' && session.status !== 'paused' && session.status !== 'finished') return state;
  const room = findGroupRoom(state, session.roomId);
  const present = (session.presentCharacterIds || []).map(id => findCharacter(state, id)).filter(Boolean) as SNSGodCharacter[];
  if (!room || present.length < 2) return state;
  const userName = state.config.userName || '나';
  const nameById = new Map(present.map(character => [character.id, character.name]));
  const transcript = session.lines
    .filter(item => item.speaker !== 'system')
    .map(item => {
      const speaker = item.speaker === 'user' ? userName : nameById.get(String(item.characterId || '')) || item.characterName || 'Character';
      return `${speaker}: ${item.text}`;
    })
    .join('\n');
  let overallSummary = '';
  let perCharacterSummaries: Record<string, string> = {};
  let relationshipDeltas: NonNullable<MeetingEventSession['relationshipDeltas']> = {};
  let resultCard: MeetingResultCard | undefined;
  try {
    const { text } = await callLLMText(state, [
      {
        role: 'system',
        content: [
          'Summarize a fictional in-person group meeting event into durable memory.',
          'Return raw JSON only: {"overallSummary":"","perCharacterSummaries":{"characterId":""},"relationshipDeltas":{"characterId":{"affinity":0,"trust":0,"tension":0}},"resultCard":{"title":"","location":"","mood":"","keyMoment":"","characterImpression":"","relationshipChanges":{"affection":0,"trust":0,"tension":0,"awkwardness":0,"intimacy":0},"futureHooks":[""],"afterMessage":""}}.',
          'Write Korean compact memory. Mention that this was a real offline group meeting, not chat, not phone call.',
          'Each per-character summary must describe what that character personally experienced and how they saw the user.',
          'The resultCard must feel like a game event result card: key moment, relationship changes, and future hook.',
          'Only include present characters. Absent characters must not know this memory.'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          `Group room: ${room.name}`,
          `User: ${userName}`,
          `Present characters:\n${present.map(character => `- ${character.id}: ${character.name}`).join('\n')}`,
          `Location: ${session.location || '(unknown)'}`,
          `Mood: ${session.mood || '(unknown)'}`,
          `Seed context:\n${session.seedSummary || '(empty)'}`,
          `Meeting transcript:\n${transcript || '(empty)'}`
        ].join('\n\n')
      }
    ]);
    const parsed = parseJsonObject<{ overallSummary?: string; perCharacterSummaries?: Record<string, string>; relationshipDeltas?: NonNullable<MeetingEventSession['relationshipDeltas']>; resultCard?: Partial<MeetingResultCard>; futureHooks?: string[] }>(text);
    overallSummary = compactText(parsed?.overallSummary || text, 1000);
    perCharacterSummaries = parsed?.perCharacterSummaries || {};
    relationshipDeltas = parsed?.relationshipDeltas || {};
    resultCard = normalizeResultCard(parsed?.resultCard, session, overallSummary);
  } catch (error) {
    await appendDebugLog('meeting.group.summary', `group meeting summary failed session=${session.id}: ${error instanceof Error ? error.message : String(error)}`, 'warn');
  }
  if (!overallSummary) {
    overallSummary = compactText(`단톡 만남: ${session.location || '장소 미상'}에서 ${present.map(character => character.name).join(', ')}와 ${userName}이 실제로 만나 짧게 대화했다.`, 1000);
  }
  if (!resultCard) resultCard = normalizeResultCard(undefined, session, overallSummary);
  for (const character of present) {
    if (!perCharacterSummaries[character.id]) {
      perCharacterSummaries[character.id] = `${character.name}은 ${session.location || '만남 장소'}에서 단톡 멤버들과 ${userName}을 실제로 만났고, 그 자리의 분위기와 사용자의 반응을 기억한다.`;
    }
  }
  const endedAt = Date.now();
  const finishedSession = session.status === 'finished' ? session : transitionInteractionLifecycle(session, 'finished', endedAt);
  const claimedSession = applyLifecycleResultOnce(finishedSession, endedAt).session;
  let next = upsertGroupMeetingMemory(state, session, overallSummary, perCharacterSummaries, relationshipDeltas);
  next = {
    ...next,
    activeMeetingEventId: next.activeMeetingEventId === session.id ? undefined : next.activeMeetingEventId,
    meetingEventSessions: (next.meetingEventSessions || []).map(item => item.id === session.id ? {
      ...item,
      ...claimedSession,
      endedAt,
      summary: overallSummary,
      resultCard,
      postMeetingMessageScheduled: Boolean(resultCard?.afterMessage),
      perCharacterSummaries,
      relationshipDeltas
    } : item)
  };
  next = appendMeetingMessageOnce(next, session.roomId, {
    id: `meeting_result:${session.id}`,
    role: 'system',
    content: resultCardText(resultCard),
    createdAt: endedAt,
    meetingEventId: session.id,
    meetingSummaryContext: overallSummary,
    sourceMode: 'group_meeting'
  });
  if (resultCard.afterMessage && present[0]) {
    next = appendMeetingMessageOnce(next, session.roomId, {
      id: `meeting_followup:${session.id}`,
      role: 'character',
      characterId: present[0].id,
      content: resultCard.afterMessage,
      createdAt: endedAt + 1000,
      meetingEventId: session.id,
      sourceMode: 'group_meeting_followup'
    });
  }
  return next;
}

async function generateMeetingStillImage(state: SNSGodState, character: SNSGodCharacter, stillPrompt: string, roomId: string): Promise<string> {
  const referenceImage = primaryCharacterReferenceImage(character);
  const isEncounter = characterBlindDateMode(character) === 'encounter'
    || (character.memories || []).some(memory => String(memory).includes('우연한 만남'));
  await appendDebugLog(
    'meeting.image.reference',
    `room=${roomId} character=${character.name} reference=${referenceImage ? 'yes' : 'no'} prompt=${String(stillPrompt || '').replace(/\s+/g, ' ').slice(0, 260)}`
  );
  try {
    return await generateImageDataUri(state, stillPrompt, character, {
      referenceImage,
      kind: 'meeting'
    });
  } catch (error) {
    await appendDebugLog('meeting.image', `meeting still generation failed room=${roomId}: ${error instanceof Error ? error.message : String(error)}`, 'warn');
  }
  const retryPrompt = [
    isEncounter
      ? `Reference-based follow-up meeting still of ${character.name} meeting the male user again after a chance encounter in a realistic Korean everyday public place connected to their first encounter memory.`
      : `Reference-based first date still of ${character.name} meeting the male user in a realistic Korean cafe or everyday date place.`,
    referenceImage ? 'Use the attached female reference image as mandatory identity reference; preserve her face, hairstyle, hair length, bangs or no bangs, hair color, face shape, and recognizable visual identity.' : '',
    'Show the female character clearly, face visible, upper body or half-body included, natural date posture.',
    isEncounter ? 'Do not describe this as blind date matching. Make it feel like two people who exchanged contacts after an accidental meeting and are seeing each other again.' : '',
    `Male user appearance: ${state.config.userAppearancePrompt || DEFAULT_USER_APPEARANCE_PROMPT}`,
    'Two distinct adults, warm realistic lighting, horizontal cinematic phone-drama still, no text, no UI, no logos, no watermark.'
  ].filter(Boolean).join(' ');
  try {
    return await generateImageDataUri(state, retryPrompt, character, {
      referenceImage,
      kind: 'meeting'
    });
  } catch (error) {
    await appendDebugLog('meeting.image.retry', `meeting still retry failed room=${roomId}: ${error instanceof Error ? error.message : String(error)}`, 'warn');
    return '';
  }
}

export async function createMeetingEventSession(state: SNSGodState, roomId: string, start: MeetingStartResult): Promise<SNSGodState> {
  const room = findRoom(state, roomId);
  const character = findCharacter(state, room?.characterId);
  if (!room || !character || !start.shouldStart) return state;
  const existing = (state.meetingEventSessions || []).find(item => item.roomId === roomId && (item.status === 'pending' || item.status === 'active' || item.status === 'paused'));
  if (existing) return state;
  const now = Date.now();
  const visibleStart = normalizeMeetingStartText(start, start.seedSummary || start.reason || '');
  const firstLine = visibleStart.firstLine || '서로 마주 본 채, 대화가 시작된다.';
  const lines: MeetingEventLine[] = [{ id: makeId('meetingline'), speaker: 'character', speakerType: 'character', characterId: character.id, characterName: character.name, text: firstLine, createdAt: now }];
  const eventType = inferMeetingEventType(`${visibleStart.reason || ''}\n${visibleStart.seedSummary || ''}\n${visibleStart.location || ''}\n${visibleStart.mood || ''}`, false);
  const scenario = meetingTypeScenario(eventType, character.name);
  const phasePlan = meetingPhasePlan(eventType);
  let stillImage = '';
  const stillPrompt = [
    start.stillPrompt || '',
    `Male user appearance: ${state.config.userAppearancePrompt || DEFAULT_USER_APPEARANCE_PROMPT}`,
    'The attached reference image, if provided, is only for the female character. Keep the male user visually separate and based on the male user appearance prompt.',
    'If a female reference image is attached, preserve her face and hair exactly enough that she reads as the same woman from the match photo.',
    'Automatically choose the female character outfit from recent chat, current place, time, weather, and mood. The outfit should fit the meeting context.',
    'Horizontal cinematic still, realistic phone-drama composition, natural light, emotional in-person meeting moment.',
    'No text, no captions, no UI, no logos, no watermark.'
  ].filter(Boolean).join(' ');
  stillImage = await generateMeetingStillImage(state, character, stillPrompt, roomId);
  const session: MeetingEventSession = {
    id: makeId('meeting'),
    roomId,
    roomType: 'dm',
    mode: 'dm',
    characterId: character.id,
    primaryCharacterId: character.id,
    participantCharacterIds: [character.id],
    presentCharacterIds: [character.id],
    absentCharacterIds: [],
    startedAt: now,
    status: 'pending',
    eventType,
    phase: phasePlan[0],
    phasePlan,
    phaseTurn: 0,
    totalUserTurns: 0,
    minTurns: meetingMinTurns(eventType),
    maxTurns: meetingMaxTurns(eventType),
    eventGoal: scenario.eventGoal,
    eventConflict: scenario.eventConflict,
    climaxQuestion: scenario.climaxQuestion,
    expectedEndingTone: scenario.expectedEndingTone,
    hasClimaxChoiceResolved: false,
    stats: DEFAULT_MEETING_STATS,
    location: visibleStart.location,
    reason: visibleStart.reason,
    mood: visibleStart.mood,
    seedSummary: visibleStart.seedSummary,
    stillPrompt,
    stillImage,
    turnCount: 0,
    lines
  };
  const sessions = [session, ...(state.meetingEventSessions || []).filter(item => item.id !== session.id)].slice(0, 50);
  let next: SNSGodState = { ...state, meetingEventSessions: sessions };
  next = appendMeetingMessage(next, roomId, {
    id: makeId('msg'),
    role: 'system',
    content: `${visibleStart.promptMessage || '만남 이벤트가 감지되었습니다. 실행할까요?'}\n${visibleStart.location || '현재 장소'} · ${visibleStart.mood || '만남 준비됨'}`,
    createdAt: now,
    meetingEventId: session.id,
    meetingEventPrompt: true,
    sourceMode: 'meeting'
  });
  return next;
}

export async function finishMeetingEventSession(state: SNSGodState, sessionId: string): Promise<SNSGodState> {
  const session = (state.meetingEventSessions || []).find(item => item.id === sessionId);
  if (session?.status === 'cancelled' || (session?.status === 'finished' && session.resultAppliedAt)) return state;
  if (session?.status === 'finished') {
    const claimed = claimExistingMeetingResult(state, session);
    if (claimed !== state) return claimed;
  }
  if (session && session.status !== 'active' && session.status !== 'paused' && session.status !== 'finished') return state;
  if (session?.mode === 'group' || session?.roomType === 'group') return finishGroupMeetingEventSession(state, session);
  const character = findCharacter(state, session?.characterId);
  const room = findRoom(state, session?.roomId);
  if (!session || !character) return state;
  const userName = userNameFor(state, character, room);
  const transcript = session.lines
    .filter(item => item.speaker !== 'system')
    .map(item => `${item.speaker === 'user' ? userName : character.name}: ${item.text}`)
    .join('\n');
  let summary = '';
  let resultCard: MeetingResultCard | undefined;
  try {
    const { text } = await callLLMText(state, [
      {
        role: 'system',
        content: [
          'Summarize a short fictional in-person meeting event into durable memory.',
          'Return raw JSON only: {"summary":"","resultCard":{"title":"","location":"","mood":"","keyMoment":"","characterImpression":"","relationshipChanges":{"affection":0,"trust":0,"tension":0,"awkwardness":0,"intimacy":0},"futureHooks":[""],"afterMessage":""}}.',
          'The summary must include eventType, location, keyMoment, userChoicePattern, characterFelt, relationshipShift, futureHook, and doNotForget.',
          'The resultCard must feel like a game event result: key moment, character impression, relationship changes, and future hooks.',
          'afterMessage is a natural short follow-up chat message the character can send after the meeting.',
          'Write Korean compact memory. Mention that this was a real in-person meeting, not a call or chat.'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          `Character: ${character.name}`,
          `User: ${userName}`,
          `Started: ${new Date(session.startedAt).toLocaleString()}`,
          `Event type: ${session.eventType || 'first_meeting'}`,
          `Event goal: ${session.eventGoal || '(unknown)'}`,
          `Event conflict: ${session.eventConflict || '(unknown)'}`,
          `Climax question: ${session.climaxQuestion || '(unknown)'}`,
          `Stats: ${JSON.stringify(session.stats || DEFAULT_MEETING_STATS)}`,
          `Location: ${session.location || '(unknown)'}`,
          `Reason: ${session.reason || '(unknown)'}`,
          `Mood: ${session.mood || '(unknown)'}`,
          `Seed context:\n${session.seedSummary || '(empty)'}`,
          `Meeting transcript:\n${transcript || '(empty)'}`
        ].join('\n\n')
      }
    ]);
    const parsed = parseJsonObject<{ summary?: string; resultCard?: Partial<MeetingResultCard> }>(text);
    summary = compactText(parsed?.summary || text, 900);
    resultCard = normalizeResultCard(parsed?.resultCard, session, summary);
  } catch (error) {
    await appendDebugLog('meeting.summary', `meeting summary failed session=${sessionId}: ${error instanceof Error ? error.message : String(error)}`, 'warn');
  }
  if (!summary) {
    summary = compactText(`실제 만남: ${session.location || '장소 미상'}에서 ${session.reason || '대화 흐름상'} 만나 ${transcript || '짧게 대화했다.'}`, 900);
  }
  if (!resultCard) resultCard = normalizeResultCard(undefined, session, summary);
  const endedAt = Date.now();
  const finishedSession = session.status === 'finished' ? session : transitionInteractionLifecycle(session, 'finished', endedAt);
  const claimedSession = applyLifecycleResultOnce(finishedSession, endedAt).session;
  const memory = `[meeting_event_summary] ${summary}`;
  let next = updateCharacter(state, character.id, {
    memories: [...(character.memories || []), memory].filter(Boolean).slice(-80) as string[],
    blindDateMemory: character.blindDateMemory ? {
      ...character.blindDateMemory,
      firstDateSummary: summary
    } : character.blindDateMemory
  });
  next = {
    ...next,
    activeMeetingEventId: next.activeMeetingEventId === sessionId ? undefined : next.activeMeetingEventId,
    meetingEventSessions: (next.meetingEventSessions || []).map(item => item.id === sessionId ? {
      ...item,
      ...claimedSession,
      endedAt,
      summary,
      resultCard,
      postMeetingMessageScheduled: Boolean(resultCard?.afterMessage)
    } : item)
  };
  if (session.roomId) {
    next = appendMeetingMessageOnce(next, session.roomId, {
      id: `meeting_result:${sessionId}`,
      role: 'system',
      content: resultCardText(resultCard),
      createdAt: endedAt,
      meetingEventId: sessionId,
      meetingSummaryContext: summary,
      sourceMode: 'meeting'
    });
    if (resultCard.afterMessage) {
      next = appendMeetingMessageOnce(next, session.roomId, {
        id: `meeting_followup:${sessionId}`,
        role: 'character',
        characterId: character.id,
        content: resultCard.afterMessage,
        createdAt: endedAt + 1000,
        meetingEventId: sessionId,
        sourceMode: 'meeting_followup'
      });
    }
  }
  return next;
}

export function appendMeetingLine(state: SNSGodState, sessionId: string, line: MeetingEventLine): SNSGodState {
  return {
    ...state,
    meetingEventSessions: (state.meetingEventSessions || []).map(session => session.id === sessionId ? {
      ...session,
      lines: [...session.lines, line].slice(-40),
      turnCount: line.speaker === 'user' ? session.turnCount + 1 : session.turnCount
    } : session)
  };
}
