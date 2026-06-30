import { SNSGodCharacter, SNSGodState } from '../types';

type RhythmModifier = {
  replyDelayMultiplier?: number;
  proactiveChanceMultiplier?: number;
  proactiveIntervalMultiplier?: number;
};

type RhythmSnapshot = {
  hour: number;
  weekday: boolean;
  weekend: boolean;
  label: string;
};

type ActiveRhythm = {
  character: SNSGodCharacter;
  snapshot: RhythmSnapshot;
  activeLabels: string[];
  replyDelayMultiplier: number;
  proactiveChanceMultiplier: number;
  proactiveIntervalMultiplier: number;
};

const RHYTHM_LABELS: Record<string, string> = {
  weekdayQuiet: '평일 낮엔 조용함',
  eveningActive: '저녁엔 더 활발함',
  lateNightMood: '밤엔 말이 깊어짐',
  weekendActive: '주말엔 더 자주 연락',
  nightQuiet: '늦은 밤엔 조용함',
  busySchedule: '일정이 많음'
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function multiply(value: unknown, fallback: number, multiplier: number, min: number, max: number) {
  const number = Number(value);
  const base = Number.isFinite(number) ? number : fallback;
  return clamp(Math.round(base * multiplier), min, max);
}

function timeZoneFor(state: SNSGodState | undefined, character: SNSGodCharacter) {
  return String(character.timeZone || state?.config.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul');
}

function rhythmSnapshot(state: SNSGodState | undefined, character: SNSGodCharacter, now = new Date()): RhythmSnapshot {
  const timeZone = timeZoneFor(state, character);
  let hour = now.getHours();
  let weekdayName = '';
  try {
    hour = Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hour12: false }).format(now)) || hour;
    weekdayName = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(now);
  } catch {
    weekdayName = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(now);
  }
  const weekend = weekdayName === 'Sat' || weekdayName === 'Sun';
  const weekday = !weekend;
  const label = hour < 5 ? '새벽' : hour < 12 ? '오전' : hour < 18 ? '오후' : hour < 22 ? '저녁' : '밤';
  return { hour, weekday, weekend, label };
}

function isLateNight(hour: number) {
  return hour >= 23 || hour < 7;
}

function isMoodNight(hour: number) {
  return hour >= 22 || hour < 3;
}

function combine(current: Required<RhythmModifier>, next: RhythmModifier): Required<RhythmModifier> {
  return {
    replyDelayMultiplier: current.replyDelayMultiplier * (next.replyDelayMultiplier ?? 1),
    proactiveChanceMultiplier: current.proactiveChanceMultiplier * (next.proactiveChanceMultiplier ?? 1),
    proactiveIntervalMultiplier: current.proactiveIntervalMultiplier * (next.proactiveIntervalMultiplier ?? 1)
  };
}

export function activeConversationRhythm(state: SNSGodState | undefined, character: SNSGodCharacter, now = new Date()): ActiveRhythm {
  const flags = character.lifeRhythm || {};
  const snapshot = rhythmSnapshot(state, character, now);
  let modifier: Required<RhythmModifier> = {
    replyDelayMultiplier: 1,
    proactiveChanceMultiplier: 1,
    proactiveIntervalMultiplier: 1
  };
  const activeLabels: string[] = [];

  const apply = (key: keyof NonNullable<SNSGodCharacter['lifeRhythm']>, value: RhythmModifier) => {
    activeLabels.push(RHYTHM_LABELS[key] || String(key));
    modifier = combine(modifier, value);
  };

  if (flags.busySchedule && snapshot.weekday && snapshot.hour >= 9 && snapshot.hour < 20) {
    apply('busySchedule', { replyDelayMultiplier: 2.2, proactiveChanceMultiplier: 0.35, proactiveIntervalMultiplier: 2.2 });
  }
  if (flags.nightQuiet && isLateNight(snapshot.hour)) {
    apply('nightQuiet', { replyDelayMultiplier: 1.8, proactiveChanceMultiplier: 0.35, proactiveIntervalMultiplier: 2 });
  }
  if (flags.lateNightMood && isMoodNight(snapshot.hour)) {
    apply('lateNightMood', { replyDelayMultiplier: 1.1, proactiveChanceMultiplier: 1.1, proactiveIntervalMultiplier: 0.9 });
  }
  if (flags.weekdayQuiet && snapshot.weekday && snapshot.hour >= 9 && snapshot.hour < 18) {
    apply('weekdayQuiet', { replyDelayMultiplier: 1.6, proactiveChanceMultiplier: 0.55, proactiveIntervalMultiplier: 1.5 });
  }
  if (flags.eveningActive && snapshot.hour >= 18 && snapshot.hour < 23) {
    apply('eveningActive', { replyDelayMultiplier: 0.75, proactiveChanceMultiplier: 1.35, proactiveIntervalMultiplier: 0.8 });
  }
  if (flags.weekendActive && snapshot.weekend) {
    apply('weekendActive', { replyDelayMultiplier: 0.85, proactiveChanceMultiplier: 1.3, proactiveIntervalMultiplier: 0.8 });
  }

  const responseDelayMin = multiply(character.responseDelayMin, 1, modifier.replyDelayMultiplier, 0, 120);
  const responseDelayMax = Math.max(responseDelayMin, multiply(character.responseDelayMax, 8, modifier.replyDelayMultiplier, 0, 2700));
  const frequencyMinutes = multiply(character.frequencyMinutes, 10, modifier.proactiveIntervalMultiplier, 1, 720);
  const initiative = multiply(character.initiative, 40, modifier.proactiveChanceMultiplier, 0, 100);

  return {
    character: {
      ...character,
      responseDelayMin,
      responseDelayMax,
      frequencyMinutes,
      initiative
    },
    snapshot,
    activeLabels,
    ...modifier
  };
}

export function characterWithConversationRhythm(state: SNSGodState | undefined, character: SNSGodCharacter, now = new Date()): SNSGodCharacter {
  return activeConversationRhythm(state, character, now).character;
}

export function conversationRhythmInstruction(state: SNSGodState, character: SNSGodCharacter): string {
  const rhythm = activeConversationRhythm(state, character);
  const tone = String(character.uniqueBehavior?.proactiveTone || '');
  const toneLine = tone ? contactPatternToneInstruction(tone) : '';
  const lines = [
    '## Contact Pattern / 연락 패턴',
    'Apply this only to how the character checks, replies, and initiates messages. Do not rewrite the character personality, relationship, values, or core speech style from the profile.',
    toneLine ? `Contact habit: ${toneLine}` : '',
    rhythm.activeLabels.length
      ? `Current rhythm: ${rhythm.snapshot.label}; active modifiers: ${rhythm.activeLabels.join(', ')}. Let availability feel natural, but do not explain the setting itself.`
      : `Current rhythm: ${rhythm.snapshot.label}; no special rhythm modifier is active.`,
    'Reality guard: do not invent completed activities that are unrealistic for the current time and contact rhythm. During quiet or busy periods, prefer waiting, commuting, resting, checking messages late, preparing, or planning instead of claiming completed outings.'
  ].filter(Boolean);
  return lines.join('\n');
}

export function contactPatternToneInstruction(tone: string): string {
  const map: Record<string, string> = {
    quick: 'checks messages easily and replies casually without making the conversation feel heavy.',
    chatty: 'likes light back-and-forth conversation and may send small follow-up bubbles.',
    cute: 'shows affection and playful attention through contact, without becoming childish.',
    stable_affection: 'checks in warmly and steadily, like someone who naturally cares about the user.',
    cool: 'keeps contact concise and dry, initiating only when there is a clear reason.',
    anxious: 'can become a little worried or clingy when ignored, but stays realistic and not excessive.',
    dry_caring: 'does not say much, but practical reminders and blunt care feel natural.',
    easygoing: 'is relaxed about late replies and does not pressure the user.',
    careful: 'takes time to answer thoughtfully and avoids pushing too hard.',
    late_night: 'becomes more reflective and emotionally open at night, with fewer shallow greetings.',
    busy: 'keeps contact brief during busy hours and becomes more available later.',
    public_figure: 'contacts carefully and politely, with schedule-aware distance and low frequency.'
  };
  return map[tone] || '';
}
