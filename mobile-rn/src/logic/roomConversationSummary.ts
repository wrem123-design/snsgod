import { callLLMText } from './api';
import { applyPrivateRoomLlmSummary, privateRoomNeedsLlmSummary, replaceAutoSummaryBlock } from './memoryBridge';
import { findCharacter, findRoom } from './stateHelpers';
import { SNSGodCharacter, SNSGodMessage, SNSGodRoom, SNSGodState } from '../types';

/**
 * Shared "현재 대화 요약" path used by:
 * - Room settings button
 * - Automatic relationship-summary refresh (same prompt/cleanup)
 */

export function buildPrivateRoomTranscript(
  state: SNSGodState,
  room: SNSGodRoom,
  character: SNSGodCharacter,
  options?: { userAlias?: string; limit?: number }
): string {
  const userName = String(options?.userAlias || room.userAlias || state.config.userName || '나');
  const limit = Math.max(20, Number(options?.limit || 220));
  return (state.messages[room.id] || []).slice(-limit).map(message => {
    const speaker = message.role === 'user' ? userName : message.role === 'character' ? character.name : '시스템';
    const pieces = [
      message.content,
      message.imageCaption ? `사진 설명: ${message.imageCaption}` : '',
      message.mediaData ? '사진/미디어 첨부 있음' : '',
      message.phoneLog ? phoneLogText(message) : ''
    ].map(value => String(value || '').trim()).filter(Boolean);
    return pieces.length ? `${speaker}: ${pieces.join(' / ')}` : '';
  }).filter(Boolean).join('\n');
}

export function cleanRoomSummaryText(value: string): string {
  const text = String(value || '')
    .replace(/```[\s\S]*?```/g, match => match.replace(/```[a-z]*|```/gi, '').trim())
    .replace(/^\s*(요약|summary)\s*[:：]\s*/i, '')
    .trim();
  return summaryFromJsonish(text) || normalizePlainSummary(text);
}

export function normalizeRoomPromptForSave(prompt: string): string {
  return String(prompt || '').replace(
    /\[자동 대화 요약\]([\s\S]*?)\[\/자동 대화 요약\]/g,
    (_match, body) => replaceAutoSummaryBlock('', cleanRoomSummaryText(String(body || '')))
  ).trim();
}

/** LLM messages identical for button + automatic refresh. */
export function buildPrivateRoomSummaryChatMessages(
  state: SNSGodState,
  room: SNSGodRoom,
  character: SNSGodCharacter,
  transcript: string,
  draft?: Partial<SNSGodRoom>
): Array<{ role: 'system' | 'user'; content: string }> {
  const relationshipNote = String(draft?.relationshipNote ?? room.relationshipNote ?? '').trim();
  const roomPrompt = String(draft?.roomPrompt ?? room.roomPrompt ?? '').trim();
  const userAlias = String(draft?.userAlias ?? room.userAlias ?? state.config.userName ?? '나');
  return [
    {
      role: 'system',
      content: [
        'Summarize this private chat room into durable relationship memory for future roleplay replies.',
        'Write in Korean. Return plain text only. No markdown table, no JSON.',
        'Focus on facts the characters should remember: relationship changes, promises, nicknames, boundaries, emotional events, unresolved topics, preferences, important phone-call memories, and recurring inside jokes.',
        'Every bullet must be a concise factual statement that remains useful outside the original scene.',
        'Never preserve scene prose, physical action narration, atmosphere, internal monologue, or direct dialogue. Do not imitate the transcript writing style.',
        'Do not include trivial line-by-line recap. Do not invent facts. If uncertain, phrase it as uncertain.',
        'Keep it compact but useful, around 8-16 bullet lines.'
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        `Room: ${room.name}`,
        `User visible name: ${userAlias}`,
        `Character: ${character.name}`,
        relationshipNote ? `Existing room relationship note:\n${relationshipNote}` : '',
        roomPrompt ? `Existing additional room prompt:\n${roomPrompt}` : '',
        `Current room conversation:\n${transcript}`
      ].filter(Boolean).join('\n\n')
    }
  ];
}

/**
 * Run the same LLM summary as the room-settings button and write it into
 * roomPrompt ([자동 대화 요약]) + roomSummaries / characterMemories.
 */
export async function summarizePrivateRoomWithLlm(
  state: SNSGodState,
  roomId: string,
  options?: { force?: boolean; draft?: Partial<SNSGodRoom> }
): Promise<{ state: SNSGodState; summary: string } | null> {
  if (!options?.force && !privateRoomNeedsLlmSummary(state, roomId)) return null;
  const room = findRoom(state, roomId);
  if (!room || room.type === 'random') return null;
  const character = findCharacter(state, room.characterId);
  if (!character) return null;
  const transcript = buildPrivateRoomTranscript(state, room, character, {
    userAlias: options?.draft?.userAlias != null ? String(options.draft.userAlias) : undefined
  });
  if (!transcript.trim()) return null;

  const { text, keyIndex } = await callLLMText(
    state,
    buildPrivateRoomSummaryChatMessages(state, room, character, transcript, options?.draft)
  );
  const summary = cleanRoomSummaryText(text);
  if (!summary) throw new Error('요약 결과가 비어 있습니다.');

  let next = applyPrivateRoomLlmSummary(state, roomId, summary, {
    draft: options?.draft
  });
  const activeProfile = next.config.apiProfiles[next.config.apiType] || {};
  next = {
    ...next,
    config: {
      ...next.config,
      apiProfiles: {
        ...next.config.apiProfiles,
        [next.config.apiType]: { ...activeProfile, apiKeyIndex: keyIndex }
      }
    }
  };
  return { state: next, summary };
}

/** Fire-and-forget safe refresh after chats; never throws to callers. */
export async function maybeRefreshPrivateRoomLlmSummary(
  state: SNSGodState,
  roomId: string
): Promise<SNSGodState | null> {
  try {
    const result = await summarizePrivateRoomWithLlm(state, roomId);
    return result?.state || null;
  } catch {
    return null;
  }
}

function phoneLogText(message: SNSGodMessage) {
  const summary = String(message.phoneSummaryContext || '').trim();
  const startedAt = Number(message.phoneStartedAt || 0);
  const endedAt = Number(message.phoneEndedAt || 0);
  const duration = startedAt && endedAt && endedAt > startedAt ? ` / 통화 시간: ${Math.round((endedAt - startedAt) / 1000)}초` : '';
  return [
    `통화 기록: ${String(message.content || message.phoneLog || '').trim()}`,
    summary ? `통화 대화 내용 요약: ${summary}` : '',
    duration.trim()
  ].filter(Boolean).join(' / ');
}

function normalizePlainSummary(value: string) {
  return String(value || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.replace(/^[-*•]\s*/, '- '))
    .join('\n')
    .trim();
}

function summaryFromJsonish(value: string) {
  const source = String(value || '').trim();
  const candidates = [
    source,
    sliceJsonCandidate(source, '[', ']'),
    sliceJsonCandidate(source, '{', '}')
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const lines = summaryValueToLines(JSON.parse(candidate)).filter(Boolean);
      if (lines.length) return lines.join('\n');
    } catch {
      // plain text fallback
    }
  }
  return '';
}

function sliceJsonCandidate(source: string, open: string, close: string) {
  const start = source.indexOf(open);
  const end = source.lastIndexOf(close);
  return start >= 0 && end > start ? source.slice(start, end + 1) : '';
}

function summaryValueToLines(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [toSummaryLine('', value)] : [];
  if (Array.isArray(value)) return value.flatMap(item => summaryValueToLines(item));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      return [toSummaryLine(key, String(item))];
    }
    return summaryValueToLines(item);
  });
}

function toSummaryLine(key: string, value: string) {
  const text = String(value || '').trim().replace(/[。]+$/g, '.');
  if (!text) return '';
  const label = summaryLabelFor(key);
  return label ? `- ${label}: ${text}` : `- ${text}`;
}

function summaryLabelFor(key: string) {
  const normalized = key.toLowerCase();
  if (!normalized || /^fact_\d+$/.test(normalized)) return '';
  if (normalized === 'summary') return '요약';
  if (/^preference/.test(normalized)) return '선호';
  if (/^promise/.test(normalized)) return '약속';
  if (/^boundary/.test(normalized)) return '경계';
  if (/^unresolved/.test(normalized)) return '미해결';
  if (/inside_joke|joke/.test(normalized)) return '둘만의 에피소드';
  if (/memory/.test(normalized)) return '기억';
  return '';
}
