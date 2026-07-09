import { makeId } from './ids';
import { SNSGodCharacter, SNSGodMessage, SNSGodState } from '../types';
import { appendMessage, findCharacter } from './stateHelpers';
import { pushNotification } from './notifications';

export const PHONE_CALL_MARKER = '[[PHONE_CALL]]';

export type PhoneReplyLike = {
  content?: string;
  callInvite?: boolean;
  phoneCall?: boolean;
  callTitle?: string;
  callLine?: string;
  phoneTitle?: string;
  phoneLine?: string;
  call?: boolean | { callInvite?: boolean; phoneCall?: boolean; title?: string; line?: string };
  type?: string;
  intent?: string;
  action?: string;
  marker?: string;
};

const PHONE_MARKER_PATTERN = /\s*(\[\[\s*(?:PHONE_CALL|CALL)\s*\]\]|<\s*PHONE_CALL\s*>|\(\s*phone\s*call\s*\)|📞|☎️?)\s*$/i;

export function hasPhoneCallIntent(item: PhoneReplyLike): boolean {
  const text = String(item.content || '');
  const callRecord = typeof item.call === 'object' && item.call ? item.call : undefined;
  const intent = String(item.type || item.intent || item.action || item.marker || '').toLowerCase();
  return item.callInvite === true
    || item.phoneCall === true
    || item.call === true
    || callRecord?.callInvite === true
    || callRecord?.phoneCall === true
    || PHONE_MARKER_PATTERN.test(text)
    || /phone[_\s-]*call|incoming[_\s-]*call|call[_\s-]*(now|user|invite)/i.test(intent);
}

export function stripPhoneCallMarker(text: string): string {
  return String(text || '').replace(PHONE_MARKER_PATTERN, '').trim();
}

export function phoneInvitesAllowed(state: SNSGodState): boolean {
  return state.config.characterPhoneCallEnabled !== false;
}

export function phoneCardFromReply(
  state: SNSGodState,
  character: SNSGodCharacter,
  item: PhoneReplyLike,
  sourceMode: string,
  options?: { createdAt?: number }
): { textContent: string; card?: SNSGodMessage } {
  const rawContent = String(item.content || '');
  const cleanContent = stripPhoneCallMarker(rawContent);
  if (!hasPhoneCallIntent(item)) return { textContent: rawContent };
  if (!phoneInvitesAllowed(state)) return { textContent: cleanContent };
  const callRecord = typeof item.call === 'object' && item.call ? item.call : undefined;
  const line = stripPhoneCallMarker(String(item.callLine || item.phoneLine || callRecord?.line || cleanContent || '지금 통화할 수 있어?'));
  return {
    textContent: cleanContent,
    card: {
      id: makeId('msg'),
      role: 'character',
      characterId: character.id,
      content: '',
      createdAt: Number(options?.createdAt || Date.now()),
      mediaType: 'phone-call',
      mediaName: `${character.name} 전화`,
      callInvite: true,
      callTitle: String(item.callTitle || item.phoneTitle || callRecord?.title || `${character.name} 전화`).trim(),
      callLine: line || '지금 통화할 수 있어?',
      sourceMode,
      callStatus: undefined
    }
  };
}

export function formatPhoneDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${String(hours).padStart(2, '0')}시간 ${String(minutes).padStart(2, '0')}분 ${String(seconds).padStart(2, '0')}초`;
}

export function phoneSummaryFromLines(characterName: string, userName: string, lines: Array<{ speaker: string; text: string }>): string {
  const last = lines.slice(-8).map(line => `${line.speaker === 'user' ? userName : characterName}: ${line.text}`).join(' / ');
  if (!last) return `${characterName}와 ${userName}가 전화로 짧게 대화했다.`;
  return `${characterName}와 ${userName}가 전화로 대화했다. 주요 흐름: ${last}`;
}

export type IncomingPhoneCall = {
  roomId: string;
  messageId: string;
  characterId: string;
  title: string;
  line: string;
  createdAt: number;
};

const PENDING_PHONE_WINDOW_MS = 5 * 60 * 1000;

export function newestPendingPhoneCandidate(state: SNSGodState): IncomingPhoneCall | undefined {
  const now = Date.now();
  const candidates = Object.entries(state.messages || {}).flatMap(([roomId, messages]) =>
    (messages || [])
      .filter(message => {
        if (!message.callInvite && message.mediaType !== 'phone-call') return false;
        if (message.callStatus && message.callStatus !== 'ringing') return false;
        if (now - Number(message.createdAt || 0) > PENDING_PHONE_WINDOW_MS) return false;
        return true;
      })
      .map(message => {
        const character = findCharacter(state, String(message.characterId || ''));
        return {
          roomId,
          messageId: message.id,
          characterId: String(message.characterId || character?.id || ''),
          title: String(message.callTitle || message.mediaName || `${character?.name || '캐릭터'} 전화`),
          line: String(message.callLine || message.content || '지금 통화할 수 있어?'),
          createdAt: Number(message.createdAt || now)
        };
      })
  ).filter(item => item.characterId);
  return candidates.sort((a, b) => b.createdAt - a.createdAt)[0];
}

export function markPhoneCardStatus(
  state: SNSGodState,
  roomId: string,
  messageId: string,
  status: 'ringing' | 'accepted' | 'rejected' | 'missed'
): SNSGodState {
  const messages = state.messages[roomId] || [];
  if (!messages.some(message => message.id === messageId)) return state;
  return {
    ...state,
    messages: {
      ...state.messages,
      [roomId]: messages.map(message => message.id === messageId ? {
        ...message,
        callStatus: status,
        callHandledAt: status === 'ringing' ? message.callHandledAt : Date.now()
      } : message)
    }
  };
}

export function appendPhoneLog(
  state: SNSGodState,
  roomId: string,
  characterId: string,
  content: string,
  phoneLog: 'rejected' | 'missed' | 'ended'
): SNSGodState {
  return appendMessage(state, roomId, {
    id: makeId('msg'),
    role: 'character',
    characterId,
    content,
    createdAt: Date.now(),
    phoneLog,
    sourceMode: 'phone'
  });
}

export function rejectIncomingPhoneCall(state: SNSGodState, incoming: IncomingPhoneCall): SNSGodState {
  const next = markPhoneCardStatus(state, incoming.roomId, incoming.messageId, 'rejected');
  return appendPhoneLog(next, incoming.roomId, incoming.characterId, '통화 취소', 'rejected');
}

export function missIncomingPhoneCall(state: SNSGodState, incoming: IncomingPhoneCall): SNSGodState {
  let next = markPhoneCardStatus(state, incoming.roomId, incoming.messageId, 'missed');
  next = appendPhoneLog(next, incoming.roomId, incoming.characterId, '부재중 전화', 'missed');
  const character = findCharacter(state, incoming.characterId);
  return pushNotification(next, {
    type: 'system',
    title: `${character?.name || incoming.title} 부재중 전화`,
    body: incoming.line,
    app: 'messenger',
    roomId: incoming.roomId,
    characterId: incoming.characterId,
    target: { app: 'messenger', roomId: incoming.roomId, characterId: incoming.characterId },
    collapseKey: `phone-missed:${incoming.roomId}`
  });
}
