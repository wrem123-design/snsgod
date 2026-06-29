import { SNSGodCharacter, SNSGodState, SumGodEntry } from '../types';
import { userNameFor, userProfileFor } from './prompts';
import { isSoftNsfwSumGodQuestion } from './sumgodQuestions';

function stripDoneMarker(text: string): string {
  return String(text || '').replace(/\[\[SUMGOD_DONE\]\]/gi, '').trim();
}

export function cleanSumGodText(text: string, max = 1000): string {
  const value = stripDoneMarker(text).replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return value.length > max ? `${value.slice(0, max - 1).trim()}…` : value;
}

export function looksIncompleteSumGodText(text: string): boolean {
  const value = cleanSumGodText(text);
  if (!value) return true;
  if (/\[\[SUMGOD_DONE\]\]/i.test(text)) return false;
  return !/[.!?。！？…)"'’”\]]\s*$/.test(value);
}

function recentMessengerContext(state: SNSGodState, character: SNSGodCharacter): string {
  const roomIds = (state.chatRooms[character.id] || []).map(room => room.id);
  const lines = roomIds.flatMap(roomId => (state.messages[roomId] || []).slice(-8).map(message => {
    const speaker = message.role === 'user' ? userNameFor(state, character) : character.name;
    const body = String(message.content || message.imageCaption || message.imagePrompt || '').trim();
    return body ? `${speaker}: ${body}` : '';
  })).filter(Boolean).slice(-14);
  return lines.length ? lines.join('\n') : '(empty)';
}

function previousEntriesContext(state: SNSGodState, current: SumGodEntry): string {
  const entries = ((state.config.sumGod as { entries?: SumGodEntry[] } | undefined)?.entries || [])
    .filter(entry => entry.id !== current.id && entry.userAnswer && entry.characterAnswer)
    .slice(0, 6)
    .map(entry => `Q.${entry.number} ${entry.question}\nUser: ${entry.userAnswer}\nCharacter: ${entry.characterAnswer}`);
  return entries.length ? entries.join('\n\n') : '(empty)';
}

export function buildSumGodPrivateAnswerPrompt(state: SNSGodState, entry: SumGodEntry, character: SNSGodCharacter) {
  const intimacyNote = isSoftNsfwSumGodQuestion(entry.question)
    ? 'Adult intimacy note: keep the answer consensual, emotionally intimate, and adult. If age is unclear, stay romantic and non-explicit.'
    : '';
  const system = [
    `You are ${character.name}, writing in character for SumGod, a couple Q&A diary app.`,
    `User name: ${userNameFor(state, character)}.`,
    `User profile: ${userProfileFor(state, character) || state.config.userDescription || '(empty)'}`,
    `Character profile: ${character.prompt || '(empty)'}`,
    `Write in natural ${state.config.language || 'Korean'}.`,
    intimacyNote,
    'Critical SumGod rule: both people answer the same question privately first.',
    'You CANNOT see the user answer yet. Do not react to it, quote it, agree with it, comfort it, or ask a follow-up about it.',
    'Answer the question yourself from your own point of view as the character.',
    'Write only the character answer as plain text. No JSON, labels, markdown, metadata, or arrays.',
    'Answer length must be 10-1000 characters. End with natural sentence-final punctuation.',
    'Append [[SUMGOD_DONE]] at the very end after final punctuation.',
    `Recent messenger context, for general relationship tone only:\n${recentMessengerContext(state, character)}`,
    `Previous completed SumGod entries:\n${previousEntriesContext(state, entry)}`
  ].filter(Boolean).join('\n\n');
  const user = `Private question for ${character.name} only:\nQ.${entry.number}: ${entry.question}\n\nWrite ${character.name}'s private answer now. Remember: the user answer is hidden until after you finish.`;
  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user }
  ];
}

export function buildSumGodRevealCommentPrompt(state: SNSGodState, entry: SumGodEntry, character: SNSGodCharacter) {
  const system = [
    `You are ${character.name}. The private answers are now revealed in SumGod.`,
    `Character profile: ${character.prompt || '(empty)'}`,
    `Write in natural ${state.config.language || 'Korean'}.`,
    'Write one short, intimate comment after seeing both answers.',
    'Compare, notice overlap/difference, tease gently, or respond emotionally.',
    'Do not rewrite both answers. Do not output JSON. Append [[SUMGOD_DONE]] at the end.'
  ].join('\n\n');
  const user = [
    `Q.${entry.number}: ${entry.question}`,
    `User answer:\n${entry.userAnswer}`,
    `${character.name}'s private answer:\n${entry.characterAnswer}`,
    'Write the reveal comment.'
  ].join('\n\n');
  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user }
  ];
}

export function buildSumGodTalkPrompt(state: SNSGodState, entry: SumGodEntry, character: SNSGodCharacter, userText: string) {
  const conversation = (entry.conversation || []).slice(-12).map(line => `${line.role === 'user' ? userNameFor(state, character) : character.name}: ${line.text}`).join('\n');
  const system = [
    `You are ${character.name}, continuing a private SumGod diary conversation.`,
    `Character profile: ${character.prompt || '(empty)'}`,
    `Write in natural ${state.config.language || 'Korean'}.`,
    'Reply in 2-5 natural sentences. Do not use fixed fallback lines. Do not output JSON.',
    'Stay grounded in the question, both answers, and the user follow-up.',
    'Append [[SUMGOD_DONE]] at the end.'
  ].join('\n\n');
  const user = [
    `Q.${entry.number}: ${entry.question}`,
    `User answer:\n${entry.userAnswer}`,
    `${character.name}'s private answer:\n${entry.characterAnswer}`,
    conversation ? `Conversation so far:\n${conversation}` : '',
    `Latest user follow-up:\n${userText}`
  ].filter(Boolean).join('\n\n');
  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user }
  ];
}

export function buildSumGodContinuationPrompt(state: SNSGodState, partialText: string) {
  return [
    { role: 'system' as const, content: `Continue and finish this SumGod diary answer in natural ${state.config.language || 'Korean'}. Output only the continuation text and append [[SUMGOD_DONE]].` },
    { role: 'user' as const, content: partialText }
  ];
}
