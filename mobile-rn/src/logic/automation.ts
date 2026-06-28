import { callLLM } from './api';
import { makeId } from './ids';
import { DEFAULT_PROMPTS, userNameFor, userProfileFor } from './prompts';
import { appendMessage, findCharacter } from './stateHelpers';
import { generateSNSPost } from './sns';
import { GroupRoom, SNSGodCharacter, SNSGodMessage, SNSGodRoom, SNSGodState } from '../types';

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
    if (character.enabled === false || character.proactiveEnabled === false) continue;
    const rooms = state.chatRooms[character.id] || [];
    for (const room of rooms) {
      const messages = state.messages[room.id] || [];
      if (firstMessageOnly) {
        if (sent[room.id]) continue;
        if (messages.some(message => message.role === 'user')) continue;
      }
      const frequency = Math.max(1, Number(character.frequencyMinutes || 10));
      if (minutesSince(room.lastActivity || room.createdAt) < frequency) continue;
      const chance = Math.max(0, Math.min(100, Number(character.initiative ?? 40)));
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
    const participants = state.characters.filter(character => room.participantIds.includes(character.id) && character.enabled !== false && character.proactiveEnabled !== false);
    if (!participants.length) continue;
    const frequency = Math.max(1, Math.min(...participants.map(character => Number(character.frequencyMinutes || 10))));
    if (minutesSince(room.lastActivity || room.createdAt) < frequency) continue;
    const lastCharacterId = [...(state.messages[room.id] || [])].reverse().find(message => message.role === 'character')?.characterId;
    const pool = participants.filter(character => character.id !== lastCharacterId);
    const speakerPool = pool.length ? pool : participants;
    const speaker = speakerPool[Math.floor(Math.random() * speakerPool.length)];
    const chance = Math.max(0, Math.min(100, Number(speaker.initiative ?? 40)));
    if (Math.random() * 100 > chance) continue;
    pairs.push({ room, speaker, participants });
  }
  return pairs;
}

function appendGroupMessage(state: SNSGodState, roomId: string, message: SNSGodMessage): SNSGodState {
  return {
    ...state,
    messages: { ...state.messages, [roomId]: [...(state.messages[roomId] || []), message].slice(-180) },
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
    if (character.enabled === false) continue;
    const room = (state.chatRooms[character.id] || [])[0];
    if (!room) continue;
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
      __calendarSent: { ...sent, [marker]: new Date().toISOString() },
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
    return {
      ...next,
      unreadCounts: { ...next.unreadCounts, [room.id]: (next.unreadCounts[room.id] || 0) + 1 },
      notifications: [{
        id: makeId('noti'),
        type: 'chat' as const,
        title: `${character.name} · ${event.title}`,
        body: reply.messages[0]?.content || '기념일 메시지',
        roomId: room.id,
        characterId: character.id,
        createdAt: Date.now()
      }, ...(next.notifications || [])].slice(0, 100)
    };
  }
  return undefined;
}

function runPhoneInvite(state: SNSGodState): SNSGodState | undefined {
  if (state.config.autoEnabled === false || state.config.characterPhoneCallEnabled === false) return undefined;
  const sent = (state.__phoneInviteAt || {}) as Record<string, number>;
  const candidates = state.characters.filter(character => {
    if (character.enabled === false || character.proactiveEnabled === false) return false;
    const intervalMinutes = Math.max(60, Number(character.frequencyMinutes || 10) * 6);
    if (minutesSince(sent[character.id]) < intervalMinutes) return false;
    const chance = Math.max(0, Math.min(18, Number(character.initiative ?? 40) / 6));
    return Math.random() * 100 <= chance;
  });
  if (!candidates.length) return undefined;
  const character = candidates[Math.floor(Math.random() * candidates.length)];
  const roomId = (state.chatRooms[character.id] || [])[0]?.id;
  return {
    ...state,
    __phoneInviteAt: { ...sent, [character.id]: Date.now() },
    notifications: [{
      id: makeId('noti'),
      type: 'system' as const,
      title: `${character.name} 전화`,
      body: `${character.name}에게서 전화가 왔어요.`,
      roomId,
      characterId: character.id,
      createdAt: Date.now()
    }, ...(state.notifications || [])].slice(0, 100)
  };
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
    },
    ...(firstMessageOnly ? { __randomFirstSent: { ...((state.__randomFirstSent || {}) as Record<string, string>), [room.id]: new Date().toISOString() } } : {})
  };
  for (const bubble of reply.messages.length ? reply.messages : [{ content: '뭐해?' }]) {
    next = appendMessage(next, room.id, {
      id: makeId('msg'),
      role: 'character',
      characterId: character.id,
      content: bubble.content,
      createdAt: Date.now()
    });
  }
  const updatedCharacter = findCharacter(next, character.id);
  if (reply.newMemory?.trim() && updatedCharacter) {
    next = {
      ...next,
      characters: next.characters.map(item => item.id === character.id ? { ...item, memories: [...(item.memories || []), reply.newMemory?.trim()].filter(Boolean).slice(-80) as string[] } : item)
    };
  }
  return {
    ...next,
    unreadCounts: { ...next.unreadCounts, [room.id]: (next.unreadCounts[room.id] || 0) + 1 },
    notifications: [{
      id: makeId('noti'),
      type: 'chat' as const,
      title: character.name,
      body: reply.messages[0]?.content || '새 메시지',
      roomId: room.id,
      characterId: character.id,
      createdAt: Date.now()
    }, ...(next.notifications || [])].slice(0, 100)
  };
}

async function runGroupFirstMessage(state: SNSGodState): Promise<SNSGodState | undefined> {
  const candidates = eligibleGroupRooms(state);
  if (!candidates.length) return undefined;
  const { room, speaker, participants } = candidates[Math.floor(Math.random() * candidates.length)];
  const messages = (state.messages[room.id] || []).slice(-12);
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
  return {
    ...next,
    unreadCounts: { ...next.unreadCounts, [room.id]: (next.unreadCounts[room.id] || 0) + 1 },
    notifications: [{
      id: makeId('noti'),
      type: 'chat' as const,
      title: `${room.name} · ${speaker.name}`,
      body: reply.messages[0]?.content || '새 단톡 메시지',
      roomId: room.id,
      characterId: speaker.id,
      createdAt: Date.now()
    }, ...(next.notifications || [])].slice(0, 100)
  };
}

export async function runAutomationTick(state: SNSGodState): Promise<SNSGodState> {
  const calendarNext = await runCalendarEvent(state);
  if (calendarNext) return calendarNext;

  if (state.config.autoEnabled !== false && state.config.snsAutoPostEnabled !== false) {
    const chance = Math.max(0, Math.min(100, Number(state.config.snsAutoChance ?? 40)));
    const countNeeded = Math.max(1, Number(state.config.snsStartCount || 6));
    const eligibleCharacters = state.characters.filter(character => {
      if (character.enabled === false) return false;
      const rooms = state.chatRooms[character.id] || [];
      const messageCount = rooms.reduce((sum, room) => sum + (state.messages[room.id] || []).length, 0);
      const latestPost = state.snsPosts.filter(post => post.characterId === character.id).sort((a, b) => b.createdAt - a.createdAt)[0];
      return messageCount >= countNeeded && minutesSince(latestPost?.createdAt) >= 60;
    });
    if (eligibleCharacters.length && Math.random() * 100 <= chance) {
      const character = eligibleCharacters[Math.floor(Math.random() * eligibleCharacters.length)];
      const platform = Math.random() > 0.5 ? 'instagram' : 'twitter';
      return generateSNSPost(state, character, platform);
    }
  }

  const randomFirstNext = await runPrivateFirstMessage(state, true);
  if (randomFirstNext) return randomFirstNext;

  const privateNext = await runPrivateFirstMessage(state, false);
  if (privateNext) return privateNext;

  const groupNext = await runGroupFirstMessage(state);
  if (groupNext) return groupNext;

  return runPhoneInvite(state) || state;
}
