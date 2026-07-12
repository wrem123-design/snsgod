import type { SNSGodMessage } from '../types';

const NON_REPLY_SOURCE_MODES = new Set([
  'proactive',
  'proactive_catchup',
  'server_proactive',
  'group_autonomous',
  'group_autonomous_catchup',
]);

function isCharacterReply(message: SNSGodMessage): boolean {
  const sourceMode = String(message.sourceMode || '');
  return message.role === 'character'
    && !NON_REPLY_SOURCE_MODES.has(sourceMode)
    && (Boolean(message.replyJobId) || sourceMode.includes('reply'));
}

function firstReplyAtOrAfter(sortedReplyTimes: number[], messageCreatedAt: number): number | undefined {
  let low = 0;
  let high = sortedReplyTimes.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (sortedReplyTimes[middle] < messageCreatedAt) low = middle + 1;
    else high = middle;
  }
  return sortedReplyTimes[low];
}

/**
 * Marks outgoing messages read when a real character reply reaches the room.
 *
 * Messages created after a delayed reply keep their unread receipt, preventing
 * an old Oracle response from acknowledging a newer concurrent user message.
 */
export function markUserMessagesReadBeforeReply(
  messages: SNSGodMessage[],
  reply: SNSGodMessage,
): SNSGodMessage[] {
  if (!isCharacterReply(reply)) return messages;

  const readAt = Number(reply.createdAt);
  if (!Number.isFinite(readAt) || readAt <= 0) return messages;
  let changed = false;
  const next = messages.map(message => {
    if (message.role !== 'user' || message.readAt || Number(message.createdAt) > readAt) return message;
    changed = true;
    return { ...message, readAt };
  });
  return changed ? next : messages;
}

/** Repairs legacy histories whose Oracle replies arrived without read receipts. */
export function reconcileMessageReadReceipts(messages: SNSGodMessage[]): SNSGodMessage[] {
  const replyTimes = messages
    .filter(isCharacterReply)
    .map(message => Number(message.createdAt))
    .filter(createdAt => Number.isFinite(createdAt) && createdAt > 0)
    .sort((left, right) => left - right);
  if (replyTimes.length === 0) return messages;

  let changed = false;
  const next = messages.map(message => {
    if (message.role !== 'user' || message.readAt) return message;
    const createdAt = Number(message.createdAt);
    const replyAt = firstReplyAtOrAfter(replyTimes, createdAt);
    if (!replyAt) return message;
    changed = true;
    return { ...message, readAt: replyAt };
  });
  return changed ? next : messages;
}
