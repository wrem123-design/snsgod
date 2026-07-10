import { CharacterEvent, CharacterRuntimeState, SNSGodCharacter, SNSGodMessage, SNSGodState } from '../types';

const WORLD_REFRESH_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type LocalClock = { dayKey: string; hour: number; weekday: number };

function localClock(timeZone: string, now: number): LocalClock {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      weekday: 'short', hour: '2-digit', hour12: false
    }).formatToParts(new Date(now));
    const value = (type: string) => parts.find(part => part.type === type)?.value || '';
    const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(value('weekday'));
    return {
      dayKey: `${value('year')}-${value('month')}-${value('day')}`,
      hour: Number(value('hour')) % 24,
      weekday: weekday >= 0 ? weekday : new Date(now).getDay()
    };
  } catch {
    const date = new Date(now);
    return {
      dayKey: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
      hour: date.getHours(),
      weekday: date.getDay()
    };
  }
}

function eventMatchesDay(date: string | undefined, dayKey: string): boolean {
  const value = String(date || '').trim();
  return value === dayKey || (/^\d{2}-\d{2}$/.test(value) && dayKey.endsWith(value));
}

function nextCalendarPlan(character: SNSGodCharacter, dayKey: string): string {
  const future = (character.calendarEvents || [])
    .filter(event => /^\d{4}-\d{2}-\d{2}$/.test(String(event.date || '')) && String(event.date) > dayKey)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
  return future ? `${future.date} ${future.title}` : '';
}

function defaultActivity(character: SNSGodCharacter, clock: LocalClock) {
  const rhythm = character.lifeRhythm || {};
  const weekend = clock.weekday === 0 || clock.weekday === 6;
  if (clock.hour < 6) return { activity: '잠들어 있거나 휴대폰을 보지 않는 중', availability: 'sleeping' as const, energy: 18 };
  if (clock.hour < 8) return { activity: '천천히 일어나 하루를 준비하는 중', availability: 'brief' as const, energy: 42 };
  if (clock.hour < 12) {
    if (!weekend && (rhythm.weekdayQuiet || rhythm.busySchedule)) return { activity: '오전 일정에 집중하는 중', availability: 'busy' as const, energy: 70 };
    return { activity: weekend ? '느긋하게 오전을 보내는 중' : '오전 일상을 보내는 중', availability: 'available' as const, energy: 74 };
  }
  if (clock.hour < 17) {
    if (!weekend && rhythm.busySchedule) return { activity: '낮 일정에 집중하는 중', availability: 'busy' as const, energy: 64 };
    return { activity: weekend && rhythm.weekendActive ? '주말 외출이나 취미를 즐기는 중' : '평범한 오후를 보내는 중', availability: 'brief' as const, energy: 65 };
  }
  if (clock.hour < 22) return {
    activity: rhythm.eveningActive ? '저녁 시간을 활발하게 보내는 중' : '하루 일정을 마치고 쉬는 중',
    availability: rhythm.eveningActive ? 'available' as const : 'brief' as const,
    energy: rhythm.eveningActive ? 72 : 54
  };
  if (rhythm.nightQuiet) return { activity: '휴대폰을 내려놓고 쉬는 중', availability: 'offline' as const, energy: 28 };
  return {
    activity: rhythm.lateNightMood ? '늦은 밤 혼자만의 시간을 보내는 중' : '잠들기 전 휴대폰을 확인하는 중',
    availability: 'brief' as const,
    energy: rhythm.lateNightMood ? 46 : 34
  };
}

export function resolveCharacterRuntimeState(state: SNSGodState, character: SNSGodCharacter, now = Date.now()): CharacterRuntimeState {
  const timeZone = String(character.timeZone || state.config.timeZone || 'Asia/Seoul');
  const clock = localClock(timeZone, now);
  const existing = character.runtimeState;
  const fresh = existing && existing.dayKey === clock.dayKey && now - Number(existing.lastUpdatedAt || 0) < WORLD_REFRESH_MS;
  if (fresh) return existing;

  const dailyEvent = (character.calendarEvents || []).find(event => eventMatchesDay(event.date, clock.dayKey));
  const base = defaultActivity(character, clock);
  const sameDayExisting = existing?.dayKey === clock.dayKey;
  const location = sameDayExisting && existing?.location
    ? existing.location
    : String(character.locationName || state.config.locationName || 'Seoul');
  const mood = dailyEvent
    ? `오늘의 ${dailyEvent.title}을 의식하는 상태`
    : sameDayExisting && existing?.mood ? existing.mood : '평온한 일상 기분';
  return {
    currentActivity: dailyEvent ? `${dailyEvent.title}과 관련된 하루를 보내는 중` : base.activity,
    location,
    mood,
    energy: base.energy,
    phoneAvailability: dailyEvent?.type === 'appointment' ? 'busy' : base.availability,
    currentOutfit: sameDayExisting && existing?.currentOutfit ? existing.currentOutfit : '현재 일정에 어울리는 자연스러운 일상복',
    hairStyle: sameDayExisting ? existing?.hairStyle : undefined,
    accessories: sameDayExisting ? existing?.accessories : undefined,
    activeEvent: dailyEvent?.title || (sameDayExisting ? existing?.activeEvent : undefined),
    nextPlan: nextCalendarPlan(character, clock.dayKey) || existing?.nextPlan,
    dayKey: clock.dayKey,
    lastUpdatedAt: now,
    source: dailyEvent ? 'calendar' : 'time_rhythm'
  };
}

export function runtimeStatePromptBlock(runtime: CharacterRuntimeState): string {
  const availability = {
    available: '휴대폰을 비교적 편하게 볼 수 있음',
    brief: '짧게 확인하고 답할 수 있음',
    busy: '일정 중이라 답이 늦거나 짧을 수 있음',
    offline: '휴대폰을 거의 보지 않음',
    sleeping: '자는 시간이라 먼저 연락하지 않음'
  }[runtime.phoneAvailability];
  return [
    '## Character current state (authoritative)',
    `Activity: ${runtime.currentActivity}`,
    `Location: ${runtime.location}`,
    `Mood: ${runtime.mood}`,
    `Energy: ${runtime.energy}/100`,
    `Phone availability: ${runtime.phoneAvailability} (${availability})`,
    runtime.currentOutfit ? `Current outfit continuity: ${runtime.currentOutfit}` : '',
    runtime.hairStyle ? `Current hair continuity: ${runtime.hairStyle}` : '',
    runtime.accessories ? `Current accessory continuity: ${runtime.accessories}` : '',
    runtime.activeEvent ? `Active event: ${runtime.activeEvent}` : '',
    runtime.nextPlan ? `Next plan: ${runtime.nextPlan}` : '',
    `State updated at: ${new Date(runtime.lastUpdatedAt).toISOString()}`,
    'Treat this as hidden grounding, not text to recite. Do not invent a completed event that conflicts with it.'
  ].filter(Boolean).join('\n');
}

export function imageContinuityPromptBlock(character: SNSGodCharacter, runtime: CharacterRuntimeState): string {
  const continuity = character.imageContinuity;
  const sameDay = continuity?.dayKey === runtime.dayKey;
  return [
    'Same-day visual continuity:',
    `- outfit: ${sameDay && continuity?.currentOutfit ? continuity.currentOutfit : runtime.currentOutfit || 'ordinary current outfit'}`,
    `- hair: ${sameDay && continuity?.hairStyle ? continuity.hairStyle : runtime.hairStyle || 'keep the established hairstyle'}`,
    `- accessories: ${sameDay && continuity?.accessories ? continuity.accessories : runtime.accessories || 'keep established accessories'}`,
    `- location: ${sameDay && continuity?.location ? continuity.location : runtime.location}`,
    'Do not change outfit, hair, accessories, or location within the same day unless the chat or an active event clearly explains the change.'
  ].join('\n');
}

export function applyMessageToCharacterWorld(
  state: SNSGodState,
  characterId: string,
  roomId: string,
  message: SNSGodMessage,
  now = Number(message.createdAt || Date.now())
): SNSGodState {
  const character = state.characters.find(item => item.id === characterId);
  const content = String(message.content || '').trim();
  if (!character || !content) return state;
  const runtime = resolveCharacterRuntimeState(state, character, now);
  const negative = /미안|속상|힘들|걱정|불안|서운|화나|sorry|worried|upset/i.test(content);
  const positive = /고마|좋아|설레|웃|ㅋㅋ|ㅎㅎ|thanks|love|happy/i.test(content);
  const planning = /약속|만나|보자|가자|예약|전화|통화|promise|meet|reservation|call/i.test(content);
  const mood = negative
    ? '상대의 감정을 신경 쓰며 조심스러운 상태'
    : positive ? '관계에 대해 따뜻하고 긍정적인 상태' : runtime.mood;
  const activeEvent = planning ? '최근 대화에서 약속이나 만남을 조율 중' : runtime.activeEvent;
  const nextRuntime: CharacterRuntimeState = {
    ...runtime,
    mood,
    activeEvent,
    lastUpdatedAt: now,
    source: 'conversation'
  };
  const characters = state.characters.map(item => item.id === characterId ? { ...item, runtimeState: nextRuntime } : item);
  if (!planning) return { ...state, characters };
  const event: CharacterEvent = {
    id: 'event_' + characterId + '_' + roomId + '_' + Math.floor(now / 60000),
    characterId,
    kind: 'conversation',
    title: activeEvent || 'active conversation plan',
    detail: content.slice(0, 240),
    status: 'active',
    startedAt: now,
    expiresAt: now + 2 * DAY_MS,
    importance: 7,
    source: message.role
  };
  return {
    ...state,
    characters,
    characterEvents: [...(state.characterEvents || []).filter(item => item.id !== event.id), event].slice(-300)
  };
}
function calendarCharacterEvent(character: SNSGodCharacter, runtime: CharacterRuntimeState, now: number): CharacterEvent | undefined {
  if (!runtime.activeEvent || runtime.source !== 'calendar') return undefined;
  return {
    id: `event_${character.id}_${runtime.dayKey}_${runtime.activeEvent}`.replace(/\s+/g, '_'),
    characterId: character.id,
    kind: runtime.source === 'calendar' ? 'calendar' : 'daily_state',
    title: runtime.activeEvent,
    detail: runtime.currentActivity,
    status: 'active',
    startedAt: now,
    expiresAt: now + DAY_MS,
    importance: runtime.source === 'calendar' ? 8 : 4,
    source: runtime.source
  };
}

export function refreshCharacterWorldState(state: SNSGodState, now = Date.now()): SNSGodState {
  const characters = state.characters.map(character => {
    const runtimeState = resolveCharacterRuntimeState(state, character, now);
    return character.runtimeState === runtimeState ? character : { ...character, runtimeState };
  });
  const activeEvents = (state.characterEvents || []).map(event => (
    event.status === 'active' && event.expiresAt && event.expiresAt <= now ? { ...event, status: 'resolved' as const } : event
  ));
  for (const character of characters) {
    const event = calendarCharacterEvent(character, character.runtimeState!, now);
    if (event && !activeEvents.some(item => item.id === event.id)) activeEvents.push(event);
  }
  return { ...state, characters, characterEvents: activeEvents.slice(-300) };
}
