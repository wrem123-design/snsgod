import { SNSGodCharacter, SNSGodState } from '../types';
import { makeId } from './ids';

type CompletionInput = {
  state: SNSGodState;
  source: string;
  modeLabel: string;
  personalitySummary?: string;
  speechStyle?: string;
  relationshipStyle?: string;
  likes?: string[];
  dislikes?: string[];
  hobbies?: string[];
  job?: string;
  locationName?: string;
  snsStyle?: string;
  phonePrompt?: string;
  appearancePrompt?: string;
  imageIdentityPrompt?: string;
  profileImage?: string;
  referenceImages?: string[];
  profileAvatarPrompt?: string;
  profileCoverPrompt?: string;
  firstMessage?: string;
  memory?: string;
};

type ReplyPreset = {
  id: string;
  values: Partial<SNSGodCharacter> & {
    uniqueBehavior: NonNullable<SNSGodCharacter['uniqueBehavior']>;
    lifeRhythm: NonNullable<SNSGodCharacter['lifeRhythm']>;
  };
};

const PRESETS: Record<string, ReplyPreset> = {
  chatty_burster: {
    id: 'chatty_burster',
    values: { proactivePatience: 4, responseDelayMin: 0, responseDelayMax: 40, messageGapMin: 1, messageGapMax: 2, responseTime: 8, thinkingTime: 3, reactivity: 9, tone: 7, frequencyMinutes: 30, initiative: 55, messageStyle: 'burst', lifeRhythm: { eveningActive: true, weekendActive: true }, uniqueBehavior: { proactiveTone: 'chatty' } }
  },
  reaction_rich: {
    id: 'reaction_rich',
    values: { proactivePatience: 5, responseDelayMin: 3, responseDelayMax: 50, messageGapMin: 1, messageGapMax: 3, responseTime: 8, thinkingTime: 3, reactivity: 10, tone: 8, frequencyMinutes: 35, initiative: 60, messageStyle: 'balanced', lifeRhythm: { eveningActive: true }, uniqueBehavior: { proactiveTone: 'cute' } }
  },
  steady_partner: {
    id: 'steady_partner',
    values: { proactivePatience: 2, responseDelayMin: 5, responseDelayMax: 90, messageGapMin: 1, messageGapMax: 4, responseTime: 7, thinkingTime: 5, reactivity: 7, tone: 7, frequencyMinutes: 50, initiative: 45, messageStyle: 'balanced', lifeRhythm: { eveningActive: true, weekendActive: true }, uniqueBehavior: { proactiveTone: 'stable_affection' } }
  },
  cool_direct: {
    id: 'cool_direct',
    values: { proactivePatience: 1, responseDelayMin: 5, responseDelayMax: 120, messageGapMin: 1, messageGapMax: 3, responseTime: 7, thinkingTime: 4, reactivity: 3, tone: 4, frequencyMinutes: 90, initiative: 15, messageStyle: 'balanced', lifeRhythm: {}, uniqueBehavior: { proactiveTone: 'cool' } }
  },
  anxious_attached: {
    id: 'anxious_attached',
    values: { proactivePatience: 7, responseDelayMin: 0, responseDelayMax: 90, messageGapMin: 1, messageGapMax: 4, responseTime: 8, thinkingTime: 5, reactivity: 8, tone: 7, frequencyMinutes: 20, initiative: 70, messageStyle: 'balanced', lifeRhythm: { eveningActive: true }, uniqueBehavior: { proactiveTone: 'anxious' } }
  },
  dry_caring: {
    id: 'dry_caring',
    values: { proactivePatience: 2, responseDelayMin: 20, responseDelayMax: 240, messageGapMin: 2, messageGapMax: 5, responseTime: 5, thinkingTime: 5, reactivity: 4, tone: 4, frequencyMinutes: 90, initiative: 25, messageStyle: 'balanced', lifeRhythm: { weekdayQuiet: true }, uniqueBehavior: { proactiveTone: 'dry_caring' } }
  },
  easygoing_friend: {
    id: 'easygoing_friend',
    values: { proactivePatience: 1, responseDelayMin: 60, responseDelayMax: 420, messageGapMin: 2, messageGapMax: 6, responseTime: 3, thinkingTime: 5, reactivity: 4, tone: 4, frequencyMinutes: 120, initiative: 15, messageStyle: 'balanced', lifeRhythm: { nightQuiet: true }, uniqueBehavior: { proactiveTone: 'easygoing' } }
  },
  thoughtful_listener: {
    id: 'thoughtful_listener',
    values: { proactivePatience: 1, responseDelayMin: 120, responseDelayMax: 600, messageGapMin: 3, messageGapMax: 8, responseTime: 3, thinkingTime: 9, reactivity: 4, tone: 5, frequencyMinutes: 180, initiative: 10, messageStyle: 'long', lifeRhythm: { nightQuiet: true }, uniqueBehavior: { proactiveTone: 'careful' } }
  },
  late_night_mood: {
    id: 'late_night_mood',
    values: { proactivePatience: 3, responseDelayMin: 180, responseDelayMax: 900, messageGapMin: 3, messageGapMax: 9, responseTime: 3, thinkingTime: 9, reactivity: 6, tone: 8, frequencyMinutes: 150, initiative: 18, messageStyle: 'long', lifeRhythm: { lateNightMood: true }, uniqueBehavior: { proactiveTone: 'late_night' } }
  },
  busy_real_life: {
    id: 'busy_real_life',
    values: { proactivePatience: 1, responseDelayMin: 180, responseDelayMax: 1800, messageGapMin: 3, messageGapMax: 10, responseTime: 2, thinkingTime: 5, reactivity: 5, tone: 5, frequencyMinutes: 240, initiative: 8, messageStyle: 'balanced', lifeRhythm: { weekdayQuiet: true, busySchedule: true }, uniqueBehavior: { proactiveTone: 'busy' } }
  }
};

export function completeGeneratedCharacter(character: SNSGodCharacter, input: CompletionInput): SNSGodCharacter {
  const profileText = [
    input.personalitySummary,
    input.speechStyle,
    input.relationshipStyle,
    input.snsStyle,
    input.phonePrompt,
    ...(input.likes || []),
    ...(input.dislikes || []),
    ...(input.hobbies || [])
  ].filter(Boolean).join(' ');
  const preset = presetFor(profileText, input.job);
  const referenceImages = uniqueList([
    ...(input.referenceImages || []),
    character.profileReferenceImage,
    ...(character.profileReferenceImages || []),
    input.profileImage,
    character.profileImage,
    character.avatar
  ]);
  const profileImage = character.profileImage || input.profileImage || character.avatar || referenceImages[0] || '';
  const avatarPrompt = character.profileAvatarPrompt || input.profileAvatarPrompt || input.imageIdentityPrompt || input.appearancePrompt || profileText;
  const coverPrompt = character.profileCoverPrompt || input.profileCoverPrompt || coverPromptFor(character, input);
  const completionMemory = completionMemoryFor(input);
  const prompt = enrichPrompt(character.prompt, input, completionMemory);

  return {
    ...preset.values,
    ...character,
    prompt,
    userName: character.userName || input.state.config.userName || '나',
    firstMessage: character.firstMessage || input.firstMessage || `${character.name}입니다. 천천히 이야기해봐요.`,
    replyPresetId: character.replyPresetId || preset.id,
    lifeRhythm: { ...preset.values.lifeRhythm, ...(character.lifeRhythm || {}) },
    uniqueBehavior: {
      ...preset.values.uniqueBehavior,
      ...(character.uniqueBehavior || {}),
      source: input.source,
      mode: input.modeLabel,
      generatedFrom: 'ai_match_feature',
      personalitySummary: input.personalitySummary,
      speechStyle: input.speechStyle,
      relationshipStyle: input.relationshipStyle
    },
    messageStyle: character.messageStyle || preset.values.messageStyle,
    responseDelayMin: character.responseDelayMin ?? preset.values.responseDelayMin,
    responseDelayMax: character.responseDelayMax ?? preset.values.responseDelayMax,
    messageGapMin: character.messageGapMin ?? preset.values.messageGapMin,
    messageGapMax: character.messageGapMax ?? preset.values.messageGapMax,
    responseTime: character.responseTime ?? preset.values.responseTime,
    thinkingTime: character.thinkingTime ?? preset.values.thinkingTime,
    reactivity: character.reactivity ?? preset.values.reactivity,
    tone: character.tone ?? preset.values.tone,
    frequencyMinutes: character.frequencyMinutes ?? preset.values.frequencyMinutes,
    initiative: character.initiative ?? preset.values.initiative,
    proactivePatience: character.proactivePatience ?? preset.values.proactivePatience,
    proactiveStyle: character.proactiveStyle || proactiveStyleFor(input),
    profileMessage: character.profileMessage || profileMessageFor(input),
    profileImage: profileImage || undefined,
    avatar: character.avatar || profileImage || undefined,
    profileReferenceImage: referenceImages[0] || '',
    profileReferenceImages: referenceImages,
    profileAvatarPrompt: avatarPrompt,
    profileCoverPrompt: coverPrompt,
    profilePhotoAutoChange: character.profilePhotoAutoChange ?? true,
    coverPhotoAutoChange: character.coverPhotoAutoChange ?? true,
    profilePhotoChangeChance: character.profilePhotoChangeChance ?? 8,
    coverPhotoChangeChance: character.coverPhotoChangeChance ?? 6,
    statusMessage: character.statusMessage || statusMessageFor(input),
    statusMessageAutoChange: character.statusMessageAutoChange ?? true,
    statusMessageChangeChance: character.statusMessageChangeChance ?? 35,
    calendarEvents: ensureCalendarEvents(character, input),
    memories: uniqueList([...(character.memories || []), completionMemory]),
    phonePrompt: character.phonePrompt || input.phonePrompt || input.relationshipStyle || input.speechStyle,
    appearancePrompt: character.appearancePrompt || input.appearancePrompt,
    imageIdentityPrompt: character.imageIdentityPrompt || input.imageIdentityPrompt || avatarPrompt,
    language: character.language || input.state.config.language || 'Korean'
  };
}

function presetFor(text: string, job = ''): ReplyPreset {
  const haystack = `${text} ${job}`;
  if (/바쁘|일정|직장|매니저|회사|업무|프로젝트/.test(haystack)) return PRESETS.busy_real_life;
  if (/질투|집착|불안|확인|소유|서운/.test(haystack)) return PRESETS.anxious_attached;
  if (/도발|관능|스킨십|플러팅|밤|끌림|케미|섹시/.test(haystack)) return PRESETS.late_night_mood;
  if (/차분|신중|깊|조심|생각|듣/.test(haystack)) return PRESETS.thoughtful_listener;
  if (/쿨|무심|건조|직설|담백|냉정/.test(haystack)) return PRESETS.dry_caring;
  if (/장난|수다|활발|밝|리액션|웃/.test(haystack)) return PRESETS.chatty_burster;
  if (/따뜻|다정|안정|배려|편안|성실/.test(haystack)) return PRESETS.steady_partner;
  if (/귀엽|감정|표현|애교/.test(haystack)) return PRESETS.reaction_rich;
  return PRESETS.easygoing_friend;
}

function profileMessageFor(input: CompletionInput) {
  return [
    input.personalitySummary,
    input.relationshipStyle,
    input.likes?.length ? `좋아하는 것: ${input.likes.join(', ')}` : '',
    input.hobbies?.length ? `취미: ${input.hobbies.join(', ')}` : ''
  ].filter(Boolean).join('\n');
}

function proactiveStyleFor(input: CompletionInput) {
  return [
    `${input.modeLabel}에서 이어진 관계를 기억하고 먼저 말을 걸 때 그 맥락을 자연스럽게 꺼낸다.`,
    input.speechStyle ? `말투는 ${input.speechStyle}` : '',
    input.relationshipStyle ? `관계 속도는 ${input.relationshipStyle}` : '',
    input.phonePrompt ? `전화나 음성 상황에서는 ${input.phonePrompt}` : ''
  ].filter(Boolean).join('\n');
}

function statusMessageFor(input: CompletionInput) {
  const topic = input.likes?.[0] || input.hobbies?.[0] || input.job || '일상';
  return `${topic} · ${compact(input.personalitySummary || input.relationshipStyle || input.modeLabel, 18)}`;
}

function coverPromptFor(character: SNSGodCharacter, input: CompletionInput) {
  return [
    `A realistic horizontal profile cover image for ${character.name}.`,
    input.locationName ? `Mood and place inspired by ${input.locationName}.` : '',
    input.hobbies?.length ? `Subtle lifestyle clues: ${input.hobbies.slice(0, 3).join(', ')}.` : '',
    'No person, no face, no text, no UI, no logo.'
  ].filter(Boolean).join(' ');
}

function completionMemoryFor(input: CompletionInput) {
  return [
    `[character_completion] source=${input.source}, mode=${input.modeLabel}`,
    input.personalitySummary ? `성격: ${input.personalitySummary}` : '',
    input.speechStyle ? `말투: ${input.speechStyle}` : '',
    input.relationshipStyle ? `관계 스타일: ${input.relationshipStyle}` : '',
    input.likes?.length ? `좋아하는 것: ${input.likes.join(', ')}` : '',
    input.dislikes?.length ? `싫어하는 것: ${input.dislikes.join(', ')}` : '',
    input.hobbies?.length ? `취미: ${input.hobbies.join(', ')}` : '',
    input.memory || ''
  ].filter(Boolean).join('\n');
}

function enrichPrompt(prompt: string | undefined, input: CompletionInput, memory: string) {
  const base = String(prompt || '').trim();
  if (base.includes('[character_completion]')) return base;
  return [base, memory].filter(Boolean).join('\n\n');
}

function ensureCalendarEvents(character: SNSGodCharacter, input: CompletionInput) {
  const current = character.calendarEvents || [];
  if (current.length) return current;
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return [{
    id: makeId('event'),
    title: `${input.modeLabel} 첫 연결`,
    date: `${yyyy}-${mm}-${dd}`,
    type: 'relationship',
    prompt: `${input.modeLabel}에서 처음 이어진 날. 대화 흐름이 맞으면 이 만남을 자연스럽게 기억한다.`
  }];
}

function uniqueList(values: Array<string | undefined>) {
  return Array.from(new Set(values.map(value => String(value || '').trim()).filter(Boolean)));
}

function compact(value: string, limit: number) {
  const text = String(value || '').trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}
