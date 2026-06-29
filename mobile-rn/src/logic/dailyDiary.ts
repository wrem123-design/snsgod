import { callLLMText } from './api';
import { makeId } from './ids';
import { normalizeLoreEntry } from './loreEngine';
import { GroupRoom, SNSGodCharacter, SNSGodMessage, SNSGodState } from '../types';

function dateKeyFor(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function todayKey(): string {
  return dateKeyFor(Date.now());
}

function diaryAllowed(now = new Date()): boolean {
  return now.getHours() > 23 || (now.getHours() === 23 && now.getMinutes() >= 59);
}

function speakerName(state: SNSGodState, message: SNSGodMessage, character: SNSGodCharacter) {
  if (message.role === 'user') return state.config.userName || '나';
  if (message.characterId === character.id) return character.name;
  return state.characters.find(item => item.id === message.characterId)?.name || '상대';
}

function collectRoomLines(state: SNSGodState, character: SNSGodCharacter, roomId: string, dateKey: string, label: string) {
  return (state.messages[roomId] || [])
    .filter(message => message.role !== 'system' && dateKeyFor(message.createdAt) === dateKey)
    .map(message => `[${label}] ${speakerName(state, message, character)}: ${message.content || (message.sticker ? '(스티커)' : message.mediaData ? '(미디어)' : '')}`)
    .filter(Boolean);
}

function collectTranscript(state: SNSGodState, character: SNSGodCharacter, dateKey: string): string {
  const lines: string[] = [];
  for (const room of state.chatRooms[character.id] || []) {
    lines.push(...collectRoomLines(state, character, room.id, dateKey, room.name || 'DM'));
  }
  for (const room of (state.groupRooms || []) as GroupRoom[]) {
    if (!room.participantIds.includes(character.id)) continue;
    lines.push(...collectRoomLines(state, character, room.id, dateKey, room.name || '단톡'));
  }
  return lines.slice(-80).join('\n');
}

export async function runDailyDiaryMemory(state: SNSGodState, now = new Date()): Promise<SNSGodState | undefined> {
  if (!diaryAllowed(now)) return undefined;
  const dateKey = todayKey();
  const done = (state.__dailyDiaryMemory || {}) as Record<string, string>;
  for (const character of state.characters) {
    if (character.randomTemporary === true || character.enabled === false) continue;
    const marker = `${character.id}:${dateKey}`;
    if (done[marker]) continue;
    const transcript = collectTranscript(state, character, dateKey);
    if (!transcript.trim()) {
      return { ...state, __dailyDiaryMemory: { ...done, [marker]: 'empty' } };
    }
    const prompt = [
      'You write compact private diary memory for a fictional chat character.',
      `Character: ${character.name}`,
      `Profile: ${character.prompt || '(empty)'}`,
      `Date: ${dateKey}`,
      'Summarize what the character would remember from today in Korean.',
      'Keep it factual, 3-5 bullet points, no UI artifacts, no JSON.'
    ].join('\n');
    const { text, keyIndex } = await callLLMText(state, [
      { role: 'system', content: prompt },
      { role: 'user', content: `Today's chat timeline:\n${transcript}` }
    ]);
    const memory = text.trim();
    if (!memory) return { ...state, __dailyDiaryMemory: { ...done, [marker]: 'empty' } };
    const loreEntry = normalizeLoreEntry({
      id: `daily_${character.id}_${dateKey}`,
      title: `${character.name} ${dateKey} 일기 메모리`,
      keys: [dateKey, '오늘', '어제', character.name],
      content: memory,
      enabled: true,
      alwaysActive: false,
      insertOrder: 20,
      characterId: character.id,
      dailyMemory: true,
      dateKey
    });
    const activeProfile = state.config.apiProfiles[state.config.apiType] || {};
    return {
      ...state,
      config: {
        ...state.config,
        apiProfiles: {
          ...state.config.apiProfiles,
          [state.config.apiType]: { ...activeProfile, apiKeyIndex: keyIndex }
        }
      },
      loreEntries: [loreEntry, ...(state.loreEntries || []).filter(entry => entry.id !== loreEntry.id)].slice(0, 300),
      __dailyDiaryMemory: { ...done, [marker]: new Date().toISOString() }
    };
  }
  return undefined;
}
