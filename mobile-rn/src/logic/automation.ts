import { callLLM, callLLMText, generateImageDataUri, parseJsonObject } from './api';
import { appendDebugLog } from './debugLog';
import { makeId } from './ids';
import { DEFAULT_COVER_BACKGROUND_DIRECTION, DEFAULT_PROMPTS, proactiveInstruction, userNameFor, userProfileFor } from './prompts';
import { buildTimeRealityInstruction, chatNowContext, isImplausibleCompletedActivity, repairTimeRealityInstruction, softenImplausibleCompletedActivity } from './timeReality';
import { appendMessage, findCharacter } from './stateHelpers';
import { MAX_GROUP_ROOM_MESSAGES, MAX_SNS_DM_CONTEXT_MESSAGES } from './limits';
import { GroupRoom, SNSGodCharacter, SNSGodMessage, SNSGodRoom, SNSGodState } from '../types';
import { isRoomBusy } from './chatJobs';
import { notifyRoomMessage, pushNotification } from './notifications';
import { runDailyDiaryMemory } from './dailyDiary';
import { characterReferenceImages, randomReferenceImage } from './imageReference';
import { characterWithConversationRhythm, conversationRhythmInstruction } from './conversationRhythm';

function minutesSince(timestamp?: number): number {
  if (!timestamp) return 9999;
  return (Date.now() - timestamp) / 60000;
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
      if (isRoomBusy(room.id)) continue;
      const messages = state.messages[room.id] || [];
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
    messages: { ...state.messages, [roomId]: [...(state.messages[roomId] || []), message].slice(-MAX_GROUP_ROOM_MESSAGES) },
    groupRooms: (state.groupRooms || []).map(room => room.id === roomId ? { ...room, lastActivity: message.createdAt } : room)
  };
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
  const sent = (state.__phoneInviteAt || {}) as Record<string, number>;
  const candidates = state.characters.filter(character => {
    if (character.randomTemporary === true || character.enabled === false || character.proactiveEnabled === false) return false;
    const rhythmCharacter = characterWithConversationRhythm(state, character);
    const intervalMinutes = Math.max(60, Number(rhythmCharacter.frequencyMinutes || 10) * 6);
    if (minutesSince(sent[character.id]) < intervalMinutes) return false;
    const chance = Math.max(0, Math.min(18, Number(rhythmCharacter.initiative ?? 40) / 6));
    return Math.random() * 100 <= chance;
  });
  if (!candidates.length) return undefined;
  const character = candidates[Math.floor(Math.random() * candidates.length)];
  const roomId = (state.chatRooms[character.id] || [])[0]?.id;
  if (roomId && isRoomBusy(roomId)) return undefined;
  let next: SNSGodState = {
    ...state,
    __phoneInviteAt: { ...sent, [character.id]: Date.now() }
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

async function recentCoverPromptFor(state: SNSGodState, character: SNSGodCharacter): Promise<string> {
  const recentContext = recentCharacterActivityContext(state, character);
  const extraDirection = String(character.profileCoverPrompt || DEFAULT_COVER_BACKGROUND_DIRECTION).trim();
  try {
    const { text } = await callLLMText(state, [
      {
        role: 'system',
        content: [
          'You write one concise English image-generation prompt for a fictional messenger profile cover.',
          'Return raw JSON only: {"prompt":"..."}. No markdown, no explanation.',
          'The cover must be based on the character\'s recent places, movements, errands, calls, chats, or implied current whereabouts.',
          'Do not create a static personality mood board. Prefer a plausible recent location or trace of activity.',
          'The image must be a personless wide cover/background: no humans, no face, no body, no silhouette, no character, no crowd, no text, no letters, no logo, no UI, no screenshot.',
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
    const canProfile = character.profilePhotoAutoChange === true && minutesSince(Number(character.lastProfilePhotoChangeAt || 0)) >= baseIntervalMinutes;
    const canCover = character.coverPhotoAutoChange === true && minutesSince(Number(character.lastCoverPhotoChangeAt || 0)) >= baseIntervalMinutes;
    const profileChance = Math.max(0, Math.min(100, Number(character.profilePhotoChangeChance ?? 5)));
    const coverChance = Math.max(0, Math.min(100, Number(character.coverPhotoChangeChance ?? 5)));
    const shouldProfile = canProfile && Math.random() * 100 <= profileChance;
    const shouldCover = canCover && Math.random() * 100 <= coverChance;
    if (!shouldProfile && !shouldCover) continue;
    const now = Date.now();
    try {
      if (shouldProfile) {
        const prompt = String(character.profileAvatarPrompt || `portrait profile photo, clear face, casual expression, messenger profile picture, ${character.name}. Character personality: ${character.prompt || ''}`);
        const image = await generateImageDataUri(state, prompt, character, { referenceImage: randomReferenceImage(characterReferenceImages(character)), kind: 'profile' });
        const historyItem = { id: makeId('profile_image'), image, prompt, createdAt: now, kind: 'profile' as const };
        return {
          ...state,
          characters: state.characters.map(item => item.id === character.id ? {
            ...item,
            avatar: image,
            profileImage: image,
            lastProfilePhotoChangeAt: now,
            profileImageHistory: [historyItem, ...(item.profileImageHistory || [])].slice(0, 60)
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
            profileImageHistory: [historyItem, ...(item.profileImageHistory || [])].slice(0, 60)
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
  for (const bubble of reply.messages.length ? reply.messages : [{ content: '뭐해?' }]) {
    next = appendMessage(next, room.id, {
      id: makeId('msg'),
      role: 'character',
      characterId: character.id,
      content: bubble.content,
      createdAt: Date.now(),
      sourceMode: firstMessageOnly ? 'random_first' : 'proactive'
    });
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
  const prompt = [
    { ...DEFAULT_PROMPTS, ...(state.config.prompts || {}) }.systemRules,
    'This is a private fictional group messenger. Stay in character and return JSON only.',
    `Group room: ${room.name}. Participants: ${participants.map(character => character.name).join(', ')}.`,
    `You are ${speaker.name}. Character profile: ${speaker.prompt || '(empty)'}`,
    `User profile: ${state.config.userDescription || '(empty)'}`,
    `Room-only relationship/context note: ${room.relationshipNote || '(empty)'}`,
    `Recent group chat:\n${transcript || '(empty)'}`,
    'Start a natural group chat message first. Reply as only your character.',
    'Return only JSON: {"reactionDelay":0,"messages":[{"content":"short Korean chat bubble"}]}.'
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
  for (const bubble of reply.messages.length ? reply.messages.slice(0, 2) : [{ content: '다들 뭐해?' }]) {
    next = appendGroupMessage(next, room.id, {
      id: makeId('msg'),
      role: 'character',
      characterId: speaker.id,
      content: bubble.content,
      createdAt: Date.now()
    });
  }
  return notifyRoomMessage(next, {
    roomId: room.id,
    characterId: speaker.id,
    title: `${room.name} · ${speaker.name}`,
    body: reply.messages[0]?.content || '새 단톡 메시지',
    app: 'messenger'
  });
}

export async function runAutomationTick(state: SNSGodState): Promise<SNSGodState> {
  const profileImageNext = await runProfileImageAutomation(state);
  if (profileImageNext) return profileImageNext;

  const diaryNext = await runDailyDiaryMemory(state);
  if (diaryNext) return diaryNext;

  const calendarNext = await runCalendarEvent(state);
  if (calendarNext) return calendarNext;

  const randomFirstNext = await runPrivateFirstMessage(state, true);
  if (randomFirstNext) return randomFirstNext;

  const privateNext = await runPrivateFirstMessage(state, false);
  if (privateNext) return privateNext;

  const groupNext = await runGroupFirstMessage(state);
  if (groupNext) return groupNext;

  return runPhoneInvite(state) || state;
}
