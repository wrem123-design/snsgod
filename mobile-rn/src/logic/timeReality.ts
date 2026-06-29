import { SNSGodCharacter, SNSGodState } from '../types';

export type ChatTimeMode = 'reply' | 'proactive';

export type ChatNowContext = {
  timeZone: string;
  localDateTime: string;
  timeBucket: 'early_morning' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'late_night' | 'deep_night';
  hour: number;
  weekday: string;
};

export function getTimeBucket(hour: number): ChatNowContext['timeBucket'] {
  if (hour >= 5 && hour < 8) return 'early_morning';
  if (hour >= 8 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 14) return 'midday';
  if (hour >= 14 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  if (hour >= 22 || hour < 1) return 'late_night';
  return 'deep_night';
}

export function chatNowContext(state: SNSGodState, character: SNSGodCharacter): ChatNowContext {
  const timeZone = String(character.timeZone || state.config.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul');
  const now = new Date();
  let localDateTime = now.toLocaleString();
  let weekday = '';
  let hour = now.getHours();
  try {
    localDateTime = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(now);
    weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(now);
    hour = Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hour12: false }).format(now)) || hour;
  } catch {
    // Keep local fallbacks when an invalid timezone is configured.
  }
  return { timeZone, localDateTime, timeBucket: getTimeBucket(hour), hour, weekday };
}

export function buildTimeRealityInstruction(state: SNSGodState, character: SNSGodCharacter, mode: ChatTimeMode): string {
  const nowContext = chatNowContext(state, character);
  return [
    'Time realism rules:',
    `Current local time for the character is ${nowContext.localDateTime}.`,
    `Current time bucket is ${nowContext.timeBucket}.`,
    'The character must obey realistic daily time constraints.',
    'Do not invent completed off-screen activities that are implausible for the current time.',
    'If the current time is early morning or late night, do not say the character has already visited shops, popup stores, cafes, salons, exhibitions, bars, restaurants, or other public places unless recent conversation explicitly established it.',
    'When mentioning time-sensitive places such as popup stores, cafes, restaurants, schools, work, subway, buses, shops, salons, or events, distinguish clearly between past, current, and planned activities.',
    'If the activity would not realistically be open or completed at this time, phrase it as a plan, wish, notification, memory, or later schedule instead of a completed action.',
    'Avoid saying “I just came back from…”, “I already went to…”, “I visited…”, or “I saw it in person…” unless the current time and recent context make it plausible.',
    mode === 'proactive'
      ? 'Because this is a spontaneous first message, be extra strict: use small realistic current activities like waking up, commuting, getting ready, checking notifications, thinking, planning to go somewhere later, eating breakfast, being unable to sleep, or remembering something. Do not invent major completed outings.'
      : 'For direct replies, follow the user’s latest message, but still keep time and real-world plausibility.'
  ].filter(Boolean).join('\n');
}

export function repairTimeRealityInstruction(nowContext: ChatNowContext): string {
  return [
    'Your previous response included an implausible completed activity for the current time.',
    `Current time: ${nowContext.localDateTime}.`,
    'Rewrite the response naturally without claiming completed visits or outings that could not realistically have happened.',
    'If mentioning that place/activity, make it a plan, wish, notification, memory, or later schedule instead.',
    'Keep the same character voice and emotional intent.',
    'Return valid JSON only with the same schema.'
  ].join('\n');
}

export function isImplausibleCompletedActivity(text: string, nowContext: ChatNowContext, mode: ChatTimeMode, latestUserText = ''): boolean {
  const value = String(text || '');
  const hour = nowContext.hour;
  const early = hour >= 5 && hour < 9;
  const late = hour >= 22 || hour < 5;
  if (!(early || late)) return false;

  const recent = String(latestUserText || '');
  const completedVisitPattern = /(다녀왔|갔다\s*왔|보고\s*왔|먹고\s*왔|마시고\s*왔|쇼핑하고\s*왔|구경하고\s*왔|방금\s*.*왔|just got back|went to|visited|came back from)/i;
  const publicPlacePattern = /(팝업|매장|스토어|카페|술집|바\s|bar|클럽|전시|백화점|쇼핑몰|미용실|네일|식당|레스토랑|성수|홍대|강남|압구정|popup|store|cafe|restaurant|exhibition|mall|salon)/i;
  const explicitPastPattern = /(어제|전에|지난번|저번|예전|낮에|오후에|아까|earlier|yesterday|last time|before)/i;

  if (!completedVisitPattern.test(value) || !publicPlacePattern.test(value)) return false;
  if (mode !== 'proactive' && (explicitPastPattern.test(value) || explicitPastPattern.test(recent) || completedVisitPattern.test(recent))) {
    return false;
  }
  return true;
}

export function softenImplausibleCompletedActivity(text: string): string {
  return String(text || '')
    .replace(/방금\s*([^.\n!?]*?)\s*다녀왔어/g, '$1 가보고 싶어')
    .replace(/방금\s*([^.\n!?]*?)\s*갔다\s*왔어/g, '$1 갈까 생각 중이야')
    .replace(/방금\s*([^.\n!?]*?)\s*보고\s*왔어/g, '$1 알림 보고 생각났어')
    .replace(/다녀왔어/g, '가보고 싶어')
    .replace(/갔다\s*왔어/g, '갈까 생각 중이야')
    .replace(/보고\s*왔어/g, '알림 보고 생각났어')
    .replace(/먹고\s*왔어/g, '먹으러 가보고 싶어')
    .replace(/마시고\s*왔어/g, '마시러 가보고 싶어');
}
