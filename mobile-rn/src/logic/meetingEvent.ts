import { callLLMText, generateImageDataUri, parseJsonObject } from './api';
import { appendDebugLog } from './debugLog';
import { primaryCharacterReferenceImage } from './imageReference';
import { makeId } from './ids';
import { DEFAULT_USER_APPEARANCE_PROMPT, userNameFor } from './prompts';
import { appendMessage, findCharacter, findRoom, roomMessages, updateCharacter } from './stateHelpers';
import { SNSGodCharacter, SNSGodRoom, SNSGodState, MeetingEventSession, MeetingEventLine } from '../types';

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

function compactText(value: string, max = 1600): string {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
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
  return stage === 'face_to_face' || stage === 'handoff' || (stage === 'arrived' && recentCharacterSaidTheyWillComeOut);
}

function stageReason(stage: MeetingIntentStage, recentCharacterSaidTheyWillComeOut: boolean): string {
  if (stage === 'face_to_face') return '지금 서로 앞에 있거나 곧 마주치는 강한 표현이 감지됨';
  if (stage === 'handoff') return '현재 위치에서 짧은 전달/대면이 성립함';
  if (stage === 'arrived' && recentCharacterSaidTheyWillComeOut) return '사용자가 도착했고 최근 캐릭터가 바로 나오겠다고 함';
  if (stage === 'arrived') return '사용자가 도착했지만 캐릭터가 지금 나오는 맥락이 부족함';
  if (stage === 'counterpart_coming') return '캐릭터가 나오는 중이나 사용자의 도착 표현이 부족함';
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
          'If uncertain, shouldStartNow=false. Confidence must be 0.85 or higher to start.',
          'Respect time, relationship, and place plausibility. If uncertain, shouldStart=false.',
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
    const llmAllowedStage = llmStage === 'face_to_face' || llmStage === 'handoff' || (llmStage === 'arrived' && candidate.recentCharacterSaidTheyWillComeOut);
    const confidence = Number(parsed?.confidence || 0);
    if (!parsed?.shouldStartNow || !llmAllowedStage || confidence < 0.85) return { shouldStart: false, reason: parsed?.reason || 'LLM rejected immediate meeting start' };
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

export async function createManualMeetingEventPrompt(state: SNSGodState, roomId: string): Promise<SNSGodState> {
  const room = findRoom(state, roomId);
  const character = findCharacter(state, room?.characterId);
  if (!room || !character || room.type === 'random') return state;
  if ((state.meetingEventSessions || []).some(item => item.roomId === roomId && (item.status === 'pending' || item.status === 'active'))) return state;
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
  if ((state.meetingEventSessions || []).some(item => item.roomId === roomId && (item.status === 'pending' || item.status === 'active'))) return state;
  const userName = userNameFor(state, character, room);
  const blindMemory = [
    character.blindDateMemory ? JSON.stringify(character.blindDateMemory) : '',
    ...(character.memories || []).filter(memory => String(memory).includes('blind_date_memory')).slice(-3)
  ].filter(Boolean).join('\n');
  let start: MeetingStartResult = {
    shouldStart: true,
    reason: '블라인드 데이트 최종 매칭 후 첫 1:1 데이트가 준비되었다.',
    location: '첫 소개팅 장소',
    mood: '처음 직접 마주하는 어색하지만 설레는 분위기',
    seedSummary: compactText(blindMemory || `${userName}이 블라인드 데이트에서 ${character.name}을 최종 선택했다.`, 600),
    stillPrompt: compactText(`A realistic horizontal cinematic still of a first blind date meeting between ${character.name} and ${userName}, modern Korean cafe or quiet everyday date location, two adults meeting for the first time after a blind date match, slightly awkward but warm mood, natural Korean drama style, no text, no UI, no logos.`, 800),
    firstLine: '최종 매칭 후, 두 사람이 처음으로 직접 마주 앉는다.',
    promptMessage: `최종 매칭되었습니다. ${character.name}과 첫 1:1 데이트를 시작할까요?`
  };
  try {
    const { text } = await callLLMText(state, [
      {
        role: 'system',
        content: [
          'Create a setup for the first short in-person date after a blind-date matching mini game.',
          'Return raw JSON only: {"location":"","mood":"","seedSummary":"","stillPrompt":"","firstLine":""}.',
          'This is a confirmation card before the user starts the event, not a completed memory.',
          'Use the selected candidate profile and blind date memory as the source.',
          'location, mood, seedSummary, and firstLine are visible to the user and must be Korean only.',
          'stillPrompt must be English only. It must describe one realistic horizontal cinematic still for the first blind date meeting.',
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
          `Blind date memory:\n${blindMemory || '(empty)'}`,
          `User: ${userName}`,
          `User appearance prompt:\n${state.config.userAppearancePrompt || DEFAULT_USER_APPEARANCE_PROMPT}`
        ].join('\n\n')
      }
    ]);
    const parsed = parseJsonObject<MeetingStartResult>(text);
    start = {
      ...start,
      location: compactText(parsed?.location || start.location || '첫 소개팅 장소', 80),
      mood: compactText(parsed?.mood || start.mood || '첫 만남 분위기', 80),
      seedSummary: compactText(parsed?.seedSummary || start.seedSummary || blindMemory, 600),
      stillPrompt: compactText(parsed?.stillPrompt || start.stillPrompt || '', 800),
      firstLine: compactText(parsed?.firstLine || start.firstLine || '', 240)
    };
  } catch (error) {
    await appendDebugLog('meeting.blindDateFirstDate', `first date prompt failed room=${roomId}: ${error instanceof Error ? error.message : String(error)}`, 'warn');
  }
  return createMeetingEventSession(state, roomId, normalizeMeetingStartText(start, blindMemory || character.prompt || ''));
}

async function generateMeetingStillImage(state: SNSGodState, character: SNSGodCharacter, stillPrompt: string, roomId: string): Promise<string> {
  const referenceImage = primaryCharacterReferenceImage(character);
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
    `Reference-based first date still of ${character.name} meeting the male user in a realistic Korean cafe or everyday date place.`,
    referenceImage ? 'Use the attached female reference image as mandatory identity reference; preserve her face, hairstyle, hair length, bangs or no bangs, hair color, face shape, and recognizable visual identity.' : '',
    'Show the female character clearly, face visible, upper body or half-body included, natural date posture.',
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
  const existing = (state.meetingEventSessions || []).find(item => item.roomId === roomId && (item.status === 'pending' || item.status === 'active'));
  if (existing) return state;
  const now = Date.now();
  const visibleStart = normalizeMeetingStartText(start, start.seedSummary || start.reason || '');
  const firstLine = visibleStart.firstLine || '서로 마주 본 채, 대화가 시작된다.';
  const lines: MeetingEventLine[] = [{ id: makeId('meetingline'), speaker: 'character', text: firstLine, createdAt: now }];
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
    characterId: character.id,
    startedAt: now,
    status: 'pending',
    location: visibleStart.location,
    reason: visibleStart.reason,
    mood: visibleStart.mood,
    seedSummary: visibleStart.seedSummary,
    stillPrompt,
    stillImage,
    turnCount: 0,
    maxTurns: 3 + Math.floor(Math.random() * 6),
    lines
  };
  const sessions = [session, ...(state.meetingEventSessions || []).filter(item => item.id !== session.id)].slice(0, 50);
  let next: SNSGodState = { ...state, meetingEventSessions: sessions };
  next = appendMessage(next, roomId, {
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
  const character = findCharacter(state, session?.characterId);
  const room = findRoom(state, session?.roomId);
  if (!session || !character) return state;
  const userName = userNameFor(state, character, room);
  const transcript = session.lines
    .filter(item => item.speaker !== 'system')
    .map(item => `${item.speaker === 'user' ? userName : character.name}: ${item.text}`)
    .join('\n');
  let summary = '';
  try {
    const { text } = await callLLMText(state, [
      {
        role: 'system',
        content: [
          'Summarize a short fictional in-person meeting event into durable memory.',
          'Return raw JSON only: {"summary":"..."}.',
          'The summary must include when, where, why they met, mood, key conversation, user choices, relationship change, and follow-up hooks.',
          'Write Korean compact memory. Mention that this was a real in-person meeting, not a call or chat.'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          `Character: ${character.name}`,
          `User: ${userName}`,
          `Started: ${new Date(session.startedAt).toLocaleString()}`,
          `Location: ${session.location || '(unknown)'}`,
          `Reason: ${session.reason || '(unknown)'}`,
          `Mood: ${session.mood || '(unknown)'}`,
          `Seed context:\n${session.seedSummary || '(empty)'}`,
          `Meeting transcript:\n${transcript || '(empty)'}`
        ].join('\n\n')
      }
    ]);
    const parsed = parseJsonObject<{ summary?: string }>(text);
    summary = compactText(parsed?.summary || text, 900);
  } catch (error) {
    await appendDebugLog('meeting.summary', `meeting summary failed session=${sessionId}: ${error instanceof Error ? error.message : String(error)}`, 'warn');
  }
  if (!summary) {
    summary = compactText(`실제 만남: ${session.location || '장소 미상'}에서 ${session.reason || '대화 흐름상'} 만나 ${transcript || '짧게 대화했다.'}`, 900);
  }
  const endedAt = Date.now();
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
      endedAt,
      status: 'ended',
      summary
    } : item)
  };
  if (session.roomId) {
    next = appendMessage(next, session.roomId, {
      id: makeId('msg'),
      role: 'system',
      content: `만남 기록 저장됨: ${summary}`,
      createdAt: endedAt,
      meetingEventId: sessionId,
      meetingSummaryContext: summary,
      sourceMode: 'meeting'
    });
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
