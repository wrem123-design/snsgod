import { callLLM, callLLMText, generateImageDataUri, parseJsonObject } from './api';
import { appendDebugLog } from './debugLog';
import { makeId } from './ids';
import { DEFAULT_COVER_BACKGROUND_DIRECTION, DEFAULT_PROMPTS, LEGACY_COVER_BACKGROUND_DIRECTION, proactiveInstruction, userNameFor, userProfileFor } from './prompts';
import { buildTimeRealityInstruction, chatNowContext, isImplausibleCompletedActivity, repairTimeRealityInstruction, softenImplausibleCompletedActivity } from './timeReality';
import { appendMessage, findCharacter, isRoomDisabled } from './stateHelpers';
import { MAX_SNS_DM_CONTEXT_MESSAGES } from './limits';
import { appendMessageToHistory } from './messageHistoryPolicy';
import { GroupRoom, SNSGodCharacter, SNSGodMessage, SNSGodRoom, SNSGodState } from '../types';
import { isRoomBusy } from './chatJobs';
import { notifyRoomMessage, pushNotification } from './notifications';
import { runDailyDiaryMemory } from './dailyDiary';
import { characterReferenceImages, randomReferenceImage } from './imageReference';
import { characterWithConversationRhythm, conversationRhythmInstruction } from './conversationRhythm';
import { groupMemoryPromptBlock } from './memoryBridge';
import { maybeCreateBackgroundAutoSNSPost } from './sns';
import { refreshCharacterWorldState, resolveCharacterRuntimeState } from './characterWorld';
import { proactiveDecision } from './proactivePolicy';

type GroupAutonomousMessage = {
  characterId?: string;
  speakerId?: string;
  name?: string;
  handle?: string;
  content?: string;
  delay?: number;
};

type GroupAutonomousPayload = {
  topic?: string;
  conversationMode?: 'one_person' | 'side_chat' | 'everyone' | 'topic_drift' | string;
  messages?: GroupAutonomousMessage[];
};

type NormalizedGroupAutonomousItem = {
  speaker: SNSGodCharacter;
  content: string;
  delay?: number;
};

function minutesSince(timestamp?: number): number {
  if (!timestamp) return 9999;
  return (Date.now() - timestamp) / 60000;
}

const DEFAULT_PHONE_INVITE_RARITY_LEVEL = 0;
const DEFAULT_PHONE_INVITE_GLOBAL_COOLDOWN_MINUTES = 180;
const DEFAULT_PHONE_INVITE_CHARACTER_MIN_COOLDOWN_MINUTES = 360;

function phoneInviteMultiplierFromRarity(level: number): number {
  const rarity = Math.max(0, Math.min(10, Math.round(Number.isFinite(level) ? level : DEFAULT_PHONE_INVITE_RARITY_LEVEL)));
  return Math.max(0.1, 1 - rarity * 0.09);
}

function phoneInviteChanceMultiplier(state: SNSGodState): number {
  if (state.config.characterPhoneCallRarityLevel !== undefined) {
    return phoneInviteMultiplierFromRarity(Number(state.config.characterPhoneCallRarityLevel));
  }
  const legacyPercent = Number(state.config.characterPhoneCallChancePercent ?? 33);
  return Math.max(0, Math.min(1, Number.isFinite(legacyPercent) ? legacyPercent / 33 : 1));
}

function phoneInviteGlobalCooldownMinutes(state: SNSGodState): number {
  const minutes = state.config.characterPhoneCallGlobalCooldownMinutes;
  if (minutes !== undefined) {
    const value = Number(minutes);
    return Math.max(0, Math.min(10080, Number.isFinite(value) ? value : DEFAULT_PHONE_INVITE_GLOBAL_COOLDOWN_MINUTES));
  }
  const hours = Number(state.config.characterPhoneCallGlobalCooldownHours);
  return Math.max(0, Math.min(10080, Number.isFinite(hours) ? hours * 60 : DEFAULT_PHONE_INVITE_GLOBAL_COOLDOWN_MINUTES));
}

function phoneInviteCharacterCooldownMinutes(state: SNSGodState): number {
  const minutes = state.config.characterPhoneCallMinCooldownMinutes;
  if (minutes !== undefined) {
    const value = Number(minutes);
    return Math.max(1, Math.min(10080, Number.isFinite(value) ? value : DEFAULT_PHONE_INVITE_CHARACTER_MIN_COOLDOWN_MINUTES));
  }
  const hours = Number(state.config.characterPhoneCallMinCooldownHours);
  return Math.max(1, Math.min(10080, Number.isFinite(hours) ? hours * 60 : DEFAULT_PHONE_INVITE_CHARACTER_MIN_COOLDOWN_MINUTES));
}

function eligiblePrivateRooms(state: SNSGodState, firstMessageOnly: boolean): { character: SNSGodCharacter; room: SNSGodRoom }[] {
  if (state.config.autoEnabled === false) return [];
  if (firstMessageOnly && state.config.randomDmEnabled === false) return [];
  if (!firstMessageOnly && state.config.privateFirst !== true) return [];
  const sent = (state.__randomFirstSent || {}) as Record<string, string>;
  const pairs: { character: SNSGodCharacter; room: SNSGodRoom }[] = [];
  for (const character of state.characters) {
    if (character.randomTemporary === true || character.enabled === false || character.proactiveEnabled === false) continue;
    const rooms = state.chatRooms[character.id] || [];
    for (const room of rooms) {
      if (room.disabled === true) continue;
      if (isRoomBusy(room.id)) continue;
      const messages = state.messages[room.id] || [];
      const decision = proactiveDecision(state, character, room.id);
      if (!decision.allowed) continue;
      if (firstMessageOnly) {
        if (sent[room.id]) continue;
        if (messages.some(message => message.role === 'user')) continue;
      }
      const rhythmCharacter = characterWithConversationRhythm(state, character);
      const frequency = Math.max(1, Number(rhythmCharacter.frequencyMinutes || 10));
      if (minutesSince(room.lastActivity || room.createdAt) < frequency) continue;
      const chance = adjustedInitiative(rhythmCharacter);
      if (Math.random() * 100 > chance) continue;
      pairs.push({ character, room });
    }
  }
  return pairs;
}

function eligibleGroupRooms(state: SNSGodState): { room: GroupRoom; speaker: SNSGodCharacter; participants: SNSGodCharacter[] }[] {
  if (state.config.autoEnabled === false || state.config.groupFirst !== true) return [];
  const pairs: { room: GroupRoom; speaker: SNSGodCharacter; participants: SNSGodCharacter[] }[] = [];
  for (const room of state.groupRooms || []) {
    if (room.disabled === true) continue;
    if (isRoomBusy(room.id)) continue;
    const participants = state.characters.filter(character => character.randomTemporary !== true && room.participantIds.includes(character.id) && character.enabled !== false && character.proactiveEnabled !== false);
    if (!participants.length) continue;
    const rhythmParticipants = participants.map(character => characterWithConversationRhythm(state, character));
    const frequency = Math.max(1, Math.min(...rhythmParticipants.map(character => Number(character.frequencyMinutes || 10))));
    if (minutesSince(room.lastActivity || room.createdAt) < frequency) continue;
    const lastCharacterId = [...(state.messages[room.id] || [])].reverse().find(message => message.role === 'character')?.characterId;
    const pool = participants.filter(character => character.id !== lastCharacterId);
    const speakerPool = pool.length ? pool : participants;
    const speaker = speakerPool[Math.floor(Math.random() * speakerPool.length)];
    if (!proactiveDecision(state, speaker, room.id).allowed) continue;
    const rhythmSpeaker = characterWithConversationRhythm(state, speaker);
    const chance = Math.max(0, Math.min(100, Number(rhythmSpeaker.initiative ?? 40)));
    if (Math.random() * 100 > chance) continue;
    pairs.push({ room, speaker, participants });
  }
  return pairs;
}

function appendGroupMessage(state: SNSGodState, roomId: string, message: SNSGodMessage): SNSGodState {
  return {
    ...state,
    messages: { ...state.messages, [roomId]: appendMessageToHistory(state.messages[roomId], message) },
    groupRooms: (state.groupRooms || []).map(room => room.id === roomId ? { ...room, lastActivity: message.createdAt } : room)
  };
}

function resolveGroupAutonomousSpeaker(participants: SNSGodCharacter[], item: GroupAutonomousMessage): SNSGodCharacter | undefined {
  const raw = String(item.characterId || item.speakerId || '').trim();
  if (raw) {
    const byId = participants.find(character => character.id === raw || character.handle === raw.replace(/^@/, ''));
    if (byId) return byId;
  }
  const name = String(item.name || item.handle || '').replace(/^@/, '').trim();
  if (!name) return undefined;
  return participants.find(character => character.name === name || character.handle === name || character.id === name);
}

function fallbackGroupAutonomousMessages(speaker: SNSGodCharacter, participants: SNSGodCharacter[], messages: SNSGodMessage[]): NormalizedGroupAutonomousItem[] {
  const other = participants.find(character => character.id !== speaker.id);
  const hasRecentUserTopic = [...messages].reverse().some(message => message.role === 'user' && String(message.content || '').trim());
  if (other && Math.random() < 0.55) {
    return [
      { speaker, content: hasRecentUserTopic ? '아까 얘기하던 거 생각해봤는데, 은근히 계속 남네.' : '갑자기 조용해지니까 우리끼리 뭐라도 얘기해야 할 것 같지 않아?' },
      { speaker: other, content: '그러게. 근데 이런 조용한 타이밍에 나온 말이 더 오래 남을 때 있더라.' }
    ];
  }
  return [
    { speaker, content: hasRecentUserTopic ? '그 얘기, 나중에 다시 이어가도 괜찮을 것 같아.' : '나 혼자 말하는 것 같긴 한데, 오늘 방 분위기 좀 묘하게 편하다.' }
  ];
}

function normalizeGroupAutonomousItems(payload: GroupAutonomousPayload | undefined, speaker: SNSGodCharacter, participants: SNSGodCharacter[], recentMessages: SNSGodMessage[]): NormalizedGroupAutonomousItem[] {
  const seen = new Set<string>();
  const items = (payload?.messages || [])
    .slice(0, 6)
    .map(item => {
      const resolved = resolveGroupAutonomousSpeaker(participants, item);
      const content = String(item.content || '').replace(/\s+/g, ' ').trim();
      if (!resolved || !content || seen.has(`${resolved.id}:${content}`)) return undefined;
      seen.add(`${resolved.id}:${content}`);
      const delay = Number(item.delay || 0) || undefined;
      return { speaker: resolved, content: content.slice(0, 420), ...(delay ? { delay } : {}) };
    })
    .filter((item): item is NormalizedGroupAutonomousItem => Boolean(item));
  return items.length ? items : fallbackGroupAutonomousMessages(speaker, participants, recentMessages);
}

function todayKey(): string {
  const now = new Date();
  return `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function eventMatchesToday(date?: string): boolean {
  if (!date) return false;
  const value = String(date);
  return value.slice(5, 10) === todayKey() || value === todayKey();
}

function calendarEventsFor(state: SNSGodState, character: SNSGodCharacter) {
  const userEvents = Array.isArray(state.config.userCalendarEvents) ? state.config.userCalendarEvents : [];
  return [...(character.calendarEvents || []), ...userEvents].filter(event => event && typeof event === 'object') as NonNullable<SNSGodCharacter['calendarEvents']>;
}

async function runCalendarEvent(state: SNSGodState): Promise<SNSGodState | undefined> {
  const sent = (state.__calendarSent || {}) as Record<string, string>;
  for (const character of state.characters) {
    if (character.randomTemporary === true || character.enabled === false) continue;
    const room = (state.chatRooms[character.id] || [])[0];
    if (!room) continue;
    if (isRoomDisabled(state, room.id)) continue;
    if (isRoomBusy(room.id)) continue;
    const event = calendarEventsFor(state, character).find(item => eventMatchesToday(item.date));
    if (!event) continue;
    const marker = `${character.id}:${event.id || event.title}:${todayKey()}`;
    if (sent[marker]) continue;
    const prompt = [
      { ...DEFAULT_PROMPTS, ...(state.config.prompts || {}) }.systemRules,
      `Act as ${character.name}. Today is this event: ${event.title}.`,
      event.prompt || 'Start a private DM that naturally acknowledges the event.',
      `User visible name: ${userNameFor(state, character, room)}.`,
      `Character profile: ${character.prompt || '(empty)'}`,
      'Return only JSON: {"reactionDelay":0,"messages":[{"content":"short natural Korean message"}]}.'
    ].join('\n\n');
    const { reply, keyIndex } = await callLLM(state, [{ role: 'system', content: prompt }]);
    let next: SNSGodState = {
      ...state,
      config: {
        ...state.config,
        apiProfiles: {
          ...state.config.apiProfiles,
          [state.config.apiType]: { ...(state.config.apiProfiles[state.config.apiType] || {}), apiKeyIndex: keyIndex }
        }
      }
    };
    for (const bubble of reply.messages.length ? reply.messages : [{ content: `${event.title} 생각나서 연락했어.` }]) {
      next = appendMessage(next, room.id, {
        id: makeId('msg'),
        role: 'character',
        characterId: character.id,
        content: bubble.content,
        createdAt: Date.now()
      });
    }
    next = { ...next, __calendarSent: { ...sent, [marker]: new Date().toISOString() } };
    return notifyRoomMessage(next, {
      roomId: room.id,
      characterId: character.id,
      title: `${character.name} · ${event.title}`,
      body: reply.messages[0]?.content || '기념일 메시지',
      app: 'messenger'
    });
  }
  return undefined;
}

function runPhoneInvite(state: SNSGodState): SNSGodState | undefined {
  if (state.config.autoEnabled === false || state.config.characterPhoneCallEnabled === false) return undefined;
  if (minutesSince(Number(state.__phoneGlobalInviteAt || 0)) < phoneInviteGlobalCooldownMinutes(state)) return undefined;
  const sent = (state.__phoneInviteAt || {}) as Record<string, number>;
  const chanceMultiplier = phoneInviteChanceMultiplier(state);
  const candidates = state.characters.filter(character => {
    if (character.randomTemporary === true || character.enabled === false || character.proactiveEnabled === false) return false;
    const rhythmCharacter = characterWithConversationRhythm(state, character);
    const intervalMinutes = Math.max(phoneInviteCharacterCooldownMinutes(state), Number(rhythmCharacter.frequencyMinutes || 10) * 12);
    if (minutesSince(sent[character.id]) < intervalMinutes) return false;
    const chance = Math.max(0, Math.min(18, Number(rhythmCharacter.initiative ?? 40) / 6)) * chanceMultiplier;
    return Math.random() * 100 <= chance;
  });
  if (!candidates.length) return undefined;
  const character = candidates[Math.floor(Math.random() * candidates.length)];
  const roomId = (state.chatRooms[character.id] || [])[0]?.id;
  if (isRoomDisabled(state, roomId)) return undefined;
  if (roomId && isRoomBusy(roomId)) return undefined;
  let next: SNSGodState = {
    ...state,
    __phoneInviteAt: { ...sent, [character.id]: Date.now() },
    __phoneGlobalInviteAt: Date.now()
  };
  if (roomId) {
    next = appendMessage(next, roomId, {
      id: makeId('msg'),
      role: 'character',
      characterId: character.id,
      content: `${character.name}에게서 전화가 왔어요.`,
      createdAt: Date.now(),
      callInvite: true,
      sourceMode: 'phone'
    });
  }
  return pushNotification(next, {
      type: 'system',
      title: `${character.name} 전화`,
      body: `${character.name}에게서 전화가 왔어요.`,
      app: 'messenger',
      roomId,
      characterId: character.id,
      target: { app: 'call', roomId, characterId: character.id },
      collapseKey: `call:${character.id}`
    });
}

function unansweredProactiveCount(state: SNSGodState, roomId: string): number {
  const messages = state.messages[roomId] || [];
  const lastUserIndex = [...messages].map((message, index) => ({ message, index })).reverse().find(item => item.message.role === 'user')?.index ?? -1;
  return messages.slice(lastUserIndex + 1).filter(message => message.role === 'character' && message.sourceMode === 'proactive').length;
}

function adjustedInitiative(character: SNSGodCharacter): number {
  const base = Math.max(0, Math.min(100, Number(character.initiative ?? 40)));
  return base;
}

function cleanStatusMessage(value: string): string {
  return String(value || '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .replace(/^\s*["']?(statusMessage|status|message)["']?\s*[:=]\s*/i, '')
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 42);
}

async function runStatusMessageAutomation(state: SNSGodState): Promise<SNSGodState | undefined> {
  if (state.config.autoEnabled === false) return undefined;
  for (const character of state.characters) {
    if (character.randomTemporary === true || character.enabled === false) continue;
    if (character.statusMessageAutoChange === false) continue;
    const intervalMinutes = Math.max(45, Number(character.frequencyMinutes || 10) * 6);
    if (minutesSince(Number(character.lastStatusMessageChangeAt || 0)) < intervalMinutes) continue;
    const chance = Math.max(0, Math.min(100, Number(character.statusMessageChangeChance ?? 40)));
    if (Math.random() * 100 > chance) continue;
    const recentContext = recentCharacterActivityContext(state, character);
    try {
      const { text, keyIndex } = await callLLMText(state, [
        {
          role: 'system',
          content: [
            'You write one short Korean messenger profile status message for a fictional character.',
            'Return raw JSON only: {"statusMessage":"..."}. No markdown, no explanation.',
            'It should feel like a real messenger status line: brief, casual, current, and in-character.',
            'Base it on recent chats, calls, mood, weather, time, or ordinary activity. Do not invent completed events not in context.',
            'Keep it 4-22 Korean characters when possible. No hashtags, no quotes, no UI labels.'
          ].join('\n')
        },
        {
          role: 'user',
          content: [
            `Character name: ${character.name}`,
            `Current status message: ${character.statusMessage || '(empty)'}`,
            `Character profile:\n${character.prompt || '(empty)'}`,
            'Current unified state: ' + JSON.stringify(resolveCharacterRuntimeState(state, character)),
            `Recent activity context:\n${recentContext || '(no recent activity)'}`
          ].join('\n\n')
        }
      ]);
      const parsed = parseJsonObject<{ statusMessage?: string; status?: string; message?: string }>(text);
      const statusMessage = cleanStatusMessage(parsed?.statusMessage || parsed?.status || parsed?.message || text);
      if (!statusMessage || statusMessage === String(character.statusMessage || '').trim()) continue;
      const now = Date.now();
      return {
        ...state,
        config: {
          ...state.config,
          apiProfiles: {
            ...state.config.apiProfiles,
            [state.config.apiType]: { ...(state.config.apiProfiles[state.config.apiType] || {}), apiKeyIndex: keyIndex }
          }
        },
        characters: state.characters.map(item => item.id === character.id ? {
          ...item,
          statusMessage,
          lastStatusMessageChangeAt: now
        } : item)
      };
    } catch (error) {
      await appendDebugLog('automation.status', `status message update failed for ${character.name}: ${error instanceof Error ? error.message : String(error)}`, 'warn');
      return undefined;
    }
  }
  return undefined;
}

async function recentCoverPromptFor(state: SNSGodState, character: SNSGodCharacter): Promise<string> {
  const recentContext = recentCharacterActivityContext(state, character);
  const savedDirection = String(character.profileCoverPrompt || '').trim();
  const extraDirection = !savedDirection || savedDirection === LEGACY_COVER_BACKGROUND_DIRECTION
    ? DEFAULT_COVER_BACKGROUND_DIRECTION
    : savedDirection;
  try {
    const { text } = await callLLMText(state, [
      {
        role: 'system',
        content: [
          'You write one concise English image-generation prompt for a fictional messenger profile cover.',
          'Return raw JSON only: {"prompt":"..."}. No markdown, no explanation.',
          'The cover must be based on the character\'s recent places, movements, errands, calls, chats, or implied current whereabouts.',
          'Do not create a static personality mood board. Prefer a plausible recent location or trace of activity.',
          'The image must be a personless wide cover/background: no humans, no face, no body, no silhouette, no character, no portrait, no selfie, no crowd, no text, no letters, no logo, no UI, no screenshot.',
          'Do not describe the character\'s appearance, clothing, pose, eyes, hair, face, body, or likeness. The prompt must contain only environment, scenery, objects, weather, light, and atmosphere.',
          'Use grounded environmental details. If recent activity is unclear, infer a subtle ordinary place from the latest chat/location instead of inventing a dramatic scene.',
          'Prompt should be 35-80 words.'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          `Character name: ${character.name}`,
          `Character profile:\n${character.prompt || '(empty)'}`,
          `Character base location: ${character.locationName || state.config.locationName || 'Seoul'}`,
          extraDirection ? `User cover direction:\n${extraDirection}` : '',
            'Current unified state: ' + JSON.stringify(resolveCharacterRuntimeState(state, character)),
          `Recent activity context:\n${recentContext || '(no recent activity)'}`
        ].filter(Boolean).join('\n\n')
      }
    ]);
    const parsed = parseJsonObject<{ prompt?: string; imagePrompt?: string }>(text);
    const prompt = cleanCoverPrompt(parsed?.prompt || parsed?.imagePrompt || text);
    if (prompt) return prompt;
  } catch {
    // Fall through to deterministic prompt so automation can still run.
  }
  return cleanCoverPrompt([
    `personless wide messenger profile cover background based on ${character.name}'s recent whereabouts`,
    recentContext || `ordinary place near ${character.locationName || state.config.locationName || 'Seoul'}`,
    extraDirection,
    'environmental still life, grounded recent activity trace, no people, no face, no body, no silhouette, no text, no logo, no UI'
  ].filter(Boolean).join(', '));
}

function recentCharacterActivityContext(state: SNSGodState, character: SNSGodCharacter): string {
  const rooms = state.chatRooms[character.id] || [];
  const lines: string[] = [];
  for (const room of rooms) {
    if (room.disabled === true) continue;
    const messages = (state.messages[room.id] || []).slice(-18);
    for (const message of messages) {
      if (message.callInvite) continue;
      const who = message.role === 'user' ? userNameFor(state, character, room) : character.name;
      const phone = message.phoneLog ? ` [phone: ${String(message.phoneLog)}${message.phoneSummaryContext ? `, ${String(message.phoneSummaryContext)}` : ''}]` : '';
      const body = String(message.content || message.imageCaption || message.imagePrompt || '').replace(/\s+/g, ' ').trim();
      if (body || phone) lines.push(`${who}: ${body}${phone}`.trim());
    }
  }
  const logs = Array.isArray(state.callLogs) ? state.callLogs.slice(0, 6) : [];
  for (const raw of logs) {
    if (!raw || typeof raw !== 'object') continue;
    const log = raw as Record<string, unknown>;
    if (String(log.characterId || '') !== character.id) continue;
    lines.push(`Call log: ${String(log.summary || log.title || log.status || '').replace(/\s+/g, ' ').trim()}`);
  }
  return lines.slice(-24).join('\n').slice(-2800);
}

function cleanCoverPrompt(value: string): string {
  return String(value || '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .replace(/^\s*["']?(prompt|imagePrompt)["']?\s*[:=]\s*/i, '')
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 900);
}

async function runProfileImageAutomation(state: SNSGodState): Promise<SNSGodState | undefined> {
  if (state.config.autoEnabled === false || state.config.imageGeneration?.enabled !== true) return undefined;
  for (const character of state.characters) {
    if (character.randomTemporary === true || character.enabled === false) continue;
    const baseIntervalMinutes = Math.max(180, Number(character.frequencyMinutes || 10) * 30);
    const runtimeState = resolveCharacterRuntimeState(state, character);
    const eventDriven = Boolean(runtimeState.activeEvent);
    const locationChanged = character.imageContinuity?.dayKey !== runtimeState.dayKey
      || character.imageContinuity?.location !== runtimeState.location;
    const canProfile = character.profilePhotoAutoChange === true && eventDriven
      && minutesSince(Number(character.lastProfilePhotoChangeAt || 0)) >= baseIntervalMinutes;
    const canCover = character.coverPhotoAutoChange === true && (eventDriven || locationChanged)
      && minutesSince(Number(character.lastCoverPhotoChangeAt || 0)) >= baseIntervalMinutes;
    const profileChance = Math.max(0, Math.min(100, Number(character.profilePhotoChangeChance ?? 5)));
    const coverChance = Math.max(0, Math.min(100, Number(character.coverPhotoChangeChance ?? 5)));
    const shouldProfile = canProfile && Math.random() * 100 <= profileChance;
    const shouldCover = canCover && Math.random() * 100 <= coverChance;
    if (!shouldProfile && !shouldCover) continue;
    const now = Date.now();
    try {
      if (shouldProfile) {
        const prompt = 'SNS profile photo';
        const image = await generateImageDataUri(state, prompt, character, { referenceImage: randomReferenceImage(characterReferenceImages(character)), kind: 'profile' });
        const historyItem = { id: makeId('profile_image'), image, prompt, createdAt: now, kind: 'profile' as const };
        return {
          ...state,
          characters: state.characters.map(item => item.id === character.id ? {
            ...item,
            avatar: image,
            profileImage: image,
            lastProfilePhotoChangeAt: now,
            profileImageHistory: [historyItem, ...(item.profileImageHistory || [])].slice(0, 60),
            imageContinuity: {
              dayKey: runtimeState.dayKey,
              currentOutfit: runtimeState.currentOutfit,
              hairStyle: runtimeState.hairStyle,
              accessories: runtimeState.accessories,
              location: runtimeState.location,
              lastImageAt: now,
              lastImagePrompt: prompt
            }
          } : item)
        };
      }
      if (shouldCover) {
        const prompt = await recentCoverPromptFor(state, character);
        const image = await generateImageDataUri(state, prompt, character, { kind: 'cover' });
        const historyItem = { id: makeId('profile_image'), image, prompt, createdAt: now, kind: 'cover' as const };
        return {
          ...state,
          characters: state.characters.map(item => item.id === character.id ? {
            ...item,
            coverImage: image,
            lastCoverPhotoChangeAt: now,
            profileImageHistory: [historyItem, ...(item.profileImageHistory || [])].slice(0, 60),
            imageContinuity: {
              dayKey: runtimeState.dayKey,
              currentOutfit: runtimeState.currentOutfit,
              hairStyle: runtimeState.hairStyle,
              accessories: runtimeState.accessories,
              location: runtimeState.location,
              lastImageAt: now,
              lastImagePrompt: prompt
            }
          } : item)
        };
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

async function runPrivateFirstMessage(state: SNSGodState, firstMessageOnly: boolean): Promise<SNSGodState | undefined> {
  const candidates = eligiblePrivateRooms(state, firstMessageOnly);
  if (!candidates.length) return undefined;
  const { character, room } = candidates[Math.floor(Math.random() * candidates.length)];
  const messages = (state.messages[room.id] || []).slice(-8);
  const transcript = messages.map(message => `${message.role === 'user' ? userNameFor(state, character, room) : character.name}: ${message.content}`).join('\n');
  const prompt = [
    { ...DEFAULT_PROMPTS, ...(state.config.prompts || {}) }.systemRules,
    firstMessageOnly
      ? `Act as ${character.name}. Send the first natural private DM before the user starts the conversation.`
      : `Act as ${character.name}. Start a natural private DM first, without waiting for the user.`,
    `User visible name: ${userNameFor(state, character, room)}.`,
    `User profile: ${userProfileFor(state, character) || '(empty)'}`,
    `Character profile: ${character.prompt || '(empty)'}`,
    `Recent chat:\n${transcript || '(empty)'}`,
    firstMessageOnly ? '' : proactiveInstruction(state, character, room.id),
    conversationRhythmInstruction(state, character),
    buildTimeRealityInstruction(state, character, 'proactive'),
    'Return only JSON: {"reactionDelay":0,"messages":[{"content":"short natural Korean message"}]}.'
  ].join('\n\n');
  let { reply, keyIndex } = await callLLM(state, [{ role: 'system', content: prompt }]);
  const nowContext = chatNowContext(state, character);
  const replyText = () => reply.messages.map(message => message.content || '').join('\n');
  if (isImplausibleCompletedActivity(replyText(), nowContext, 'proactive')) {
    await appendDebugLog('time-reality.retry', `room=${room.id} mode=proactive\n${replyText()}`, 'warn');
    const repaired = await callLLM(state, [
      { role: 'system', content: prompt },
      { role: 'system', content: repairTimeRealityInstruction(nowContext) }
    ]);
    reply = repaired.reply;
    keyIndex = repaired.keyIndex;
  }
  if (isImplausibleCompletedActivity(replyText(), nowContext, 'proactive')) {
    await appendDebugLog('time-reality.softened', `room=${room.id} mode=proactive\n${replyText()}`, 'warn');
    reply = {
      ...reply,
      messages: reply.messages.map(message => ({ ...message, content: softenImplausibleCompletedActivity(message.content) }))
    };
  }
  let next: SNSGodState = {
    ...state,
    config: {
      ...state.config,
      apiProfiles: {
        ...state.config.apiProfiles,
        [state.config.apiType]: { ...(state.config.apiProfiles[state.config.apiType] || {}), apiKeyIndex: keyIndex }
      }
    },
    ...(firstMessageOnly ? { __randomFirstSent: { ...((state.__randomFirstSent || {}) as Record<string, string>), [room.id]: new Date().toISOString() } } : {})
  };
  // If the app was dead past the contact interval, stamp the message as if it
  // arrived then — not at the moment the user reopened the app.
  const lastAt = Number(room.lastActivity || room.createdAt || Date.now()) || Date.now();
  const frequencyMs = Math.max(1, Number(characterWithConversationRhythm(state, character).frequencyMinutes || 10)) * 60000;
  const plannedAt = lastAt + frequencyMs;
  const overdue = Date.now() > plannedAt + 15000;
  let bubbleAt = overdue ? Math.min(Date.now(), Math.max(lastAt + 1000, plannedAt)) : Date.now();
  if (overdue) {
    void appendDebugLog('proactive.catchup', `room=${room.id} plannedAt=${new Date(bubbleAt).toISOString()} overdueMs=${Date.now() - plannedAt}`);
  }
  for (const bubble of reply.messages.length ? reply.messages : [{ content: '뭐해?' }]) {
    next = appendMessage(next, room.id, {
      id: makeId('msg'),
      role: 'character',
      characterId: character.id,
      content: bubble.content,
      createdAt: bubbleAt,
      sourceMode: firstMessageOnly ? 'random_first' : overdue ? 'proactive_catchup' : 'proactive',
      proactiveBatchId: 'local_' + room.id + '_' + bubbleAt,
      generationInfo: {
        provider: state.config.apiType,
        model: String(state.config.apiProfiles[state.config.apiType]?.apiModel || ''),
        mode: firstMessageOnly ? 'random_first' : 'proactive',
        generatedAt: Date.now(),
        proactiveStage: proactiveDecision(state, character, room.id).stage,
        stateUpdatedAt: Number(resolveCharacterRuntimeState(state, character).lastUpdatedAt || 0)
      }
    });
    bubbleAt = Math.min(Date.now(), bubbleAt + 900 + Math.floor(Math.random() * 1600));
  }
  const updatedCharacter = findCharacter(next, character.id);
  if (reply.newMemory?.trim() && updatedCharacter) {
    next = {
      ...next,
      characters: next.characters.map(item => item.id === character.id ? { ...item, memories: [...(item.memories || []), reply.newMemory?.trim()].filter(Boolean).slice(-80) as string[] } : item)
    };
  }
  return notifyRoomMessage(next, {
    roomId: room.id,
    characterId: character.id,
    title: character.name,
    body: reply.messages[0]?.content || '새 메시지',
    app: 'messenger'
  });
}

async function runGroupFirstMessage(state: SNSGodState): Promise<SNSGodState | undefined> {
  const candidates = eligibleGroupRooms(state);
  if (!candidates.length) return undefined;
  const { room, speaker, participants } = candidates[Math.floor(Math.random() * candidates.length)];
  const messages = (state.messages[room.id] || []).slice(-MAX_SNS_DM_CONTEXT_MESSAGES);
  const transcript = messages.map(message => {
    if (message.role === 'user') return `${state.config.userName || '나'}: ${message.content}`;
    const character = participants.find(item => item.id === message.characterId);
    return `${character?.name || 'Character'}: ${message.content}`;
  }).join('\n');
  const memoryBlock = groupMemoryPromptBlock(state, room.id, participants, transcript || room.relationshipNote || room.name);
  const lastCharacterId = [...messages].reverse().find(message => message.role === 'character')?.characterId;
  const speakerHint = lastCharacterId === speaker.id
    ? 'The initially suggested speaker spoke recently, so it is okay to let someone else start if that feels more natural.'
    : `${speaker.name} is a good candidate to start, but not mandatory.`;
  const prompt = [
    { ...DEFAULT_PROMPTS, ...(state.config.prompts || {}) }.systemRules,
    'This is a private fictional group messenger. Stay in character and return JSON only.',
    `Group room: ${room.name}.`,
    `Allowed participants:\n${participants.map(character => `- ${character.id} (@${character.handle || character.id}) ${character.name}: ${character.prompt || '(empty)'}`).join('\n')}`,
    `User profile: ${state.config.userDescription || '(empty)'}`,
    `Room-only relationship/context note: ${room.relationshipNote || '(empty)'}`,
    memoryBlock,
    `Recent group chat:\n${transcript || '(empty)'}`,
    speakerHint,
    'The user may be absent. The group can talk without directly addressing the user.',
    'Start or continue a natural group chat from the room mood, recent topic, current time, shared public memory, or one participant noticing something.',
    'The conversation may be one person talking twice, two people chatting with each other, several people reacting, or a topic drifting naturally. Not everyone needs to speak.',
    'Do not force every message to mention the user. Do not wait for the user. Do not narrate actions outside chat bubbles.',
    'Write 1 to 6 Korean chat bubbles. Keep each bubble casual and messenger-like, with distinct voices.',
    'Every message must include characterId from the allowed participants. Return raw JSON only: {"topic":"","conversationMode":"one_person|side_chat|everyone|topic_drift","messages":[{"characterId":"allowed id","content":"Korean chat bubble","delay":0}]}'
  ].join('\n\n');
  const { text, keyIndex } = await callLLMText(state, [{ role: 'system', content: prompt }]);
  const parsed = parseJsonObject<GroupAutonomousPayload>(text);
  const normalizedItems = normalizeGroupAutonomousItems(parsed, speaker, participants, messages);
  let next: SNSGodState = {
    ...state,
    config: {
      ...state.config,
      apiProfiles: {
        ...state.config.apiProfiles,
        [state.config.apiType]: { ...(state.config.apiProfiles[state.config.apiType] || {}), apiKeyIndex: keyIndex }
      }
    }
  };
  let deliveredCount = 0;
  let firstDelivered: { speaker: SNSGodCharacter; content: string } | undefined;
  const groupLastAt = Number(room.lastActivity || room.createdAt || Date.now()) || Date.now();
  const groupFrequencyMs = Math.max(1, Math.min(...participants.map(character => Number(characterWithConversationRhythm(state, character).frequencyMinutes || 10)))) * 60000;
  const groupPlannedAt = groupLastAt + groupFrequencyMs;
  const groupOverdue = Date.now() > groupPlannedAt + 15000;
  let groupBubbleAt = groupOverdue ? Math.min(Date.now(), Math.max(groupLastAt + 1000, groupPlannedAt)) : Date.now();
  for (const item of normalizedItems) {
    const createdAt = groupOverdue
      ? Math.min(Date.now(), groupBubbleAt + Math.max(0, Math.min(4000, Number(item.delay || 0) * 1000)))
      : Date.now() + deliveredCount * 900 + Math.max(0, Math.min(4000, Number(item.delay || 0) * 1000));
    next = appendGroupMessage(next, room.id, {
      id: makeId('msg'),
      role: 'character',
      characterId: item.speaker.id,
      content: item.content,
      createdAt,
      sourceMode: groupOverdue ? 'group_autonomous_catchup' : 'group_autonomous',
      proactiveBatchId: 'local_group_' + room.id + '_' + groupBubbleAt,
      generationInfo: {
        provider: state.config.apiType,
        model: String(state.config.apiProfiles[state.config.apiType]?.apiModel || ''),
        mode: 'group_autonomous',
        generatedAt: Date.now(),
        proactiveStage: proactiveDecision(state, item.speaker, room.id).stage,
        stateUpdatedAt: resolveCharacterRuntimeState(state, item.speaker).lastUpdatedAt
      }
    });
    firstDelivered = firstDelivered || item;
    deliveredCount += 1;
    if (groupOverdue) groupBubbleAt = Math.min(Date.now(), groupBubbleAt + 900 + Math.floor(Math.random() * 1400));
  }
  if (!firstDelivered) return undefined;
  return notifyRoomMessage(next, {
    roomId: room.id,
    characterId: firstDelivered.speaker.id,
    title: deliveredCount > 1 ? `${room.name} · ${deliveredCount}개 새 메시지` : `${room.name} · ${firstDelivered.speaker.name}`,
    body: `${firstDelivered.speaker.name}: ${firstDelivered.content}`,
    app: 'messenger'
  });
}

export async function runAutomationTick(state: SNSGodState): Promise<SNSGodState> {
  const worldState = refreshCharacterWorldState(state);

  const statusNext = await runStatusMessageAutomation(worldState);
  if (statusNext) return statusNext;

  const profileImageNext = await runProfileImageAutomation(worldState);
  if (profileImageNext) return profileImageNext;

  const diaryNext = await runDailyDiaryMemory(worldState);
  if (diaryNext) return diaryNext;

  const calendarNext = await runCalendarEvent(worldState);
  if (calendarNext) return calendarNext;

  // SNS, chat, profile and calls now consume the same refreshed character state.
  const snsNext = await maybeCreateBackgroundAutoSNSPost(worldState);
  if (snsNext) return snsNext;

  const randomFirstNext = await runPrivateFirstMessage(worldState, true);
  if (randomFirstNext) return randomFirstNext;

  const privateNext = await runPrivateFirstMessage(worldState, false);
  if (privateNext) return privateNext;

  const groupNext = await runGroupFirstMessage(worldState);
  if (groupNext) return groupNext;

  return runPhoneInvite(worldState) || worldState;
}
