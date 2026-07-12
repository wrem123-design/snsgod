import assert from 'node:assert/strict';
import test from 'node:test';

import { markUserMessagesReadBeforeReply, reconcileMessageReadReceipts } from '../src/logic/messageReadReceipts.ts';

test('a character reply reads every earlier user message but not a later concurrent message', () => {
  const messages = [
    { id: 'user-old-1', role: 'user', content: '첫 메시지', createdAt: 100 },
    { id: 'user-old-2', role: 'user', content: '두 번째 메시지', createdAt: 200 },
    { id: 'character-reply', role: 'character', content: '답장', createdAt: 300, sourceMode: 'server_reply' },
    { id: 'user-new', role: 'user', content: '답장 뒤 메시지', createdAt: 400 },
  ];

  const result = markUserMessagesReadBeforeReply(messages, messages[2]);

  assert.equal(result[0].readAt, 300);
  assert.equal(result[1].readAt, 300);
  assert.equal(result[2].readAt, undefined);
  assert.equal(result[3].readAt, undefined);
});

test('proactive and system messages do not fabricate read receipts', () => {
  const messages = [{ id: 'user', role: 'user', content: '대기', createdAt: 100 }];

  assert.equal(markUserMessagesReadBeforeReply(messages, {
    id: 'proactive', role: 'character', content: '선톡', createdAt: 200, sourceMode: 'server_proactive',
  }), messages);
  assert.equal(markUserMessagesReadBeforeReply(messages, {
    id: 'system', role: 'system', content: '안내', createdAt: 200,
  }), messages);
});

test('loading legacy history repairs old unread markers after an existing reply', () => {
  const messages = [
    { id: 'user-1', role: 'user', content: '대기 1', createdAt: 100 },
    { id: 'user-2', role: 'user', content: '대기 2', createdAt: 200 },
    { id: 'reply', role: 'character', content: '늦은 답장', createdAt: 300, sourceMode: 'server_reply' },
  ];

  const result = reconcileMessageReadReceipts(messages);

  assert.equal(result[0].readAt, 300);
  assert.equal(result[1].readAt, 300);
});
