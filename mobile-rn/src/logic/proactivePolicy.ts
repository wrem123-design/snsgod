import { CharacterRuntimeState, SNSGodCharacter, SNSGodMessage, SNSGodState } from '../types';
import { resolveCharacterRuntimeState } from './characterWorld';

export type ProactiveDecision = {
  allowed: boolean;
  stage: 1 | 2 | 3 | 4;
  unansweredBatches: number;
  dailyBatches: number;
  dailyBudget: number;
  maxWithoutReply: number;
  waitForUser: boolean;
  reason: string;
  recentTopics: string[];
  runtimeState: CharacterRuntimeState;
};

function proactiveMessage(message: SNSGodMessage): boolean {
  return ['proactive', 'proactive_catchup', 'server_proactive', 'group_autonomous', 'group_autonomous_catchup'].includes(String(message.sourceMode || ''));
}

function batchCount(messages: SNSGodMessage[]): number {
  const sorted = [...messages].sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
  let batches = 0;
  let lastAt = 0;
  let lastBatchId = '';
  for (const message of sorted) {
    const batchId = String(message.proactiveBatchId || '');
    const createdAt = Number(message.createdAt || 0);
    if ((batchId && batchId !== lastBatchId) || (!batchId && (!lastAt || createdAt - lastAt > 30_000))) batches += 1;
    lastBatchId = batchId;
    lastAt = createdAt;
  }
  return batches;
}

function localDayKey(timestamp: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toISOString().slice(0, 10);
  }
}

export function proactiveTopicFingerprint(value: string): string {
  return [...new Set(String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 2 && !['그냥', '진짜', '오늘', '지금', '근데', '나는', '너는'].includes(token))
    .slice(0, 8))].sort().join('|');
}

function dailyBudget(character: SNSGodCharacter): number {
  const initiative = Math.max(0, Math.min(100, Number(character.initiative ?? 40)));
  return initiative >= 90 ? 4 : initiative >= 60 ? 3 : initiative >= 25 ? 2 : 1;
}

export function proactiveDecision(state: SNSGodState, character: SNSGodCharacter, roomId: string, now = Date.now()): ProactiveDecision {
  const messages = state.messages[roomId] || [];
  const lastUserIndex = messages.reduce((found, message, index) => message.role === 'user' ? index : found, -1);
  const unanswered = messages.slice(lastUserIndex + 1).filter(proactiveMessage);
  const unansweredBatches = batchCount(unanswered);
  const timeZone = String(character.timeZone || state.config.timeZone || 'Asia/Seoul');
  const today = localDayKey(now, timeZone);
  const daily = messages.filter(message => proactiveMessage(message) && localDayKey(Number(message.createdAt || 0), timeZone) === today);
  const dailyBatches = batchCount(daily);
  const maxWithoutReply = Math.min(3, Math.max(1, 1 + Math.max(0, Number(character.proactivePatience ?? 1))));
  const budget = dailyBudget(character);
  const runtimeState = resolveCharacterRuntimeState(state, character, now);
  const stage = Math.min(4, unansweredBatches + 1) as 1 | 2 | 3 | 4;
  const recentTopics = messages.filter(proactiveMessage).slice(-6).map(message => proactiveTopicFingerprint(message.content)).filter(Boolean);
  const waitForUser = unansweredBatches >= maxWithoutReply || stage === 4 || dailyBatches >= budget;
  const unavailable = runtimeState.phoneAvailability === 'sleeping' || runtimeState.phoneAvailability === 'offline';
  const busyAndLowEnergy = runtimeState.phoneAvailability === 'busy' && runtimeState.energy < 45;
  const allowed = character.proactiveEnabled !== false && !waitForUser && !unavailable && !busyAndLowEnergy;
  const reason = waitForUser
    ? (dailyBatches >= budget ? '오늘의 먼저 연락하기 횟수를 모두 사용함' : '사용자 답장을 기다리는 단계')
    : unavailable ? '휴대폰을 보지 않는 현재 상태'
      : busyAndLowEnergy ? '바쁘고 에너지가 낮은 현재 상태'
        : '현재 단계에서 자연스럽게 먼저 연락 가능';
  return { allowed, stage, unansweredBatches, dailyBatches, dailyBudget: budget, maxWithoutReply, waitForUser, reason, recentTopics, runtimeState };
}

export function proactiveStageInstruction(decision: ProactiveDecision): string {
  const stageGuide = decision.stage === 1
    ? 'Stage 1: start one genuinely new, low-pressure topic grounded in current state or a real shared memory.'
    : decision.stage === 2
      ? 'Stage 2: send one short follow-up that does not demand an answer and does not repeat the previous question.'
      : decision.stage === 3
        ? 'Stage 3: if contacting once more, switch to a different everyday observation, small photo-worthy moment, or brief update. Do not guilt-trip.'
        : 'Stage 4: wait silently for the user. Do not generate another proactive message.';
  return [
    `Proactive stage: ${decision.stage}.`,
    stageGuide,
    `Today: ${decision.dailyBatches}/${decision.dailyBudget} proactive batches. Unanswered: ${decision.unansweredBatches}/${decision.maxWithoutReply}.`,
    decision.recentTopics.length ? `Forbidden recent topic fingerprints: ${decision.recentTopics.join(' / ')}` : '',
    'Never repeat the same question, greeting, topic, wording, or emotional pressure. A user reply resets the stage.'
  ].filter(Boolean).join('\n');
}
