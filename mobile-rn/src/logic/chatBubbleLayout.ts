import { SNSGodMessage } from '../types';
import { isSameMessageMinute } from './time';

export type ChatBubbleLayout = {
  showAvatar: boolean;
  showTime: boolean;
  showRead: boolean;
  clusterStart: boolean;
  clusterEnd: boolean;
  tightTop: boolean;
};

/** KakaoTalk-style speaker grouping for messenger bubbles. */
export function sameChatSpeaker(a?: SNSGodMessage, b?: SNSGodMessage): boolean {
  if (!a || !b) return false;
  if (a.role === 'system' || b.role === 'system') return false;
  if (a.role !== b.role) return false;
  if (a.role === 'user') return true;
  return String(a.characterId || '') === String(b.characterId || '');
}

/**
 * Build layout flags for chronological message order (oldest → newest).
 * FlatList may reverse for inverted display; flags stay based on conversation order.
 */
export function chatBubbleLayoutFor(message: SNSGodMessage, previous?: SNSGodMessage, next?: SNSGodMessage): ChatBubbleLayout {
  if (message.role === 'system') {
    return {
      showAvatar: false,
      showTime: false,
      showRead: false,
      clusterStart: true,
      clusterEnd: true,
      tightTop: false
    };
  }
  const mine = message.role === 'user';
  const samePrev = sameChatSpeaker(previous, message);
  const sameNext = sameChatSpeaker(message, next);
  const clusterStart = !samePrev;
  const clusterEnd = !sameNext;
  const showAvatar = !mine && clusterStart;
  // Time on last bubble of a same-speaker/minute run (Kakao collapses middle times).
  const showTime = clusterEnd || !next || !isSameMessageMinute(message.createdAt, next.createdAt) || !sameNext;
  // Unread "1": every outgoing bubble the other person has not read yet (not only cluster end).
  const showRead = mine && !message.readAt;
  return {
    showAvatar,
    showTime,
    showRead,
    clusterStart,
    clusterEnd,
    tightTop: samePrev
  };
}
