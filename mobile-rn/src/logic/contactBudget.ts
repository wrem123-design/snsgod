import type { ContactChannel, ContactLedgerEntry, SNSGodCharacter, SNSGodState } from '../types';
import { resolveCharacterRuntimeState } from './characterWorld';

export type ContactBudgetDecision = {
  allowed: boolean;
  ledgerKey: string;
  dayKey: string;
  used: number;
  dailyBudget: number;
  remaining: number;
  unansweredCount: number;
  maxWithoutReply: number;
  channelPriority: number;
  reason: string;
};

const BASE_PRIORITY: Record<ContactChannel, number> = {
  calendar: 110,
  private: 100,
  phone: 85,
  sns_dm: 80,
  group: 70,
  sns: 55,
};
const LEDGER_RETENTION_MS = 45 * 24 * 60 * 60 * 1000;

/** Returns a stable YYYY-MM-DD key in the character's local timezone. */
export function contactDayKey(timestamp: number, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(timestamp));
    const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  } catch {
    return new Date(timestamp).toISOString().slice(0, 10);
  }
}

function keyFor(characterId: string, dayKey: string): string {
  return `${characterId}:${dayKey}`;
}

function baseBudget(character: SNSGodCharacter): number {
  const initiative = Math.max(0, Math.min(100, Number(character.initiative ?? 40)));
  return initiative >= 90 ? 4 : initiative >= 60 ? 3 : initiative >= 25 ? 2 : 1;
}

function emptyEntry(characterId: string, dayKey: string, now: number): ContactLedgerEntry {
  return { characterId, dayKey, used: 0, byChannel: {}, events: [], unansweredCount: 0, updatedAt: now };
}

/** Computes budget and channel preference without mutating state. */
export function contactBudgetDecision(
  state: SNSGodState,
  character: SNSGodCharacter,
  channel: ContactChannel,
  now = Date.now(),
): ContactBudgetDecision {
  const timeZone = String(character.timeZone || state.config.timeZone || 'Asia/Seoul');
  const dayKey = contactDayKey(now, timeZone);
  const ledgerKey = keyFor(character.id, dayKey);
  const entry = state.contactLedger?.[ledgerKey] || emptyEntry(character.id, dayKey, now);
  const uniqueEvents = [...new Map(entry.events.map(event => [event.eventId, event])).values()];
  const used = uniqueEvents.length;
  const unansweredCount = uniqueEvents.filter(event => event.createdAt > Number(entry.lastUserReplyAt || 0)).length;
  const runtime = resolveCharacterRuntimeState(state, character, now);
  const unavailable = runtime.phoneAvailability === 'sleeping' || runtime.phoneAvailability === 'offline';
  const busyLowEnergy = runtime.phoneAvailability === 'busy' && runtime.energy < 45;
  const energetic = runtime.phoneAvailability === 'available' && runtime.energy >= 75;
  const dailyBudget = unavailable ? 0 : busyLowEnergy ? Math.min(1, baseBudget(character)) : Math.min(5, baseBudget(character) + (energetic ? 1 : 0));
  const maxWithoutReply = Math.min(3, Math.max(1, 1 + Math.max(0, Number(character.proactivePatience ?? 1))));
  const lowPressureChannel = channel === 'sns' || channel === 'group' || channel === 'sns_dm';
  const silenceAdjustment = lowPressureChannel ? unansweredCount * 20 : -unansweredCount * 35;
  const stateAdjustment = runtime.phoneAvailability === 'busy'
    ? (channel === 'sns' || channel === 'group' ? 20 : channel === 'phone' ? -45 : -20)
    : 0;
  const channelPriority = Math.max(0, BASE_PRIORITY[channel] + silenceAdjustment + stateAdjustment);
  const exhausted = used >= dailyBudget;
  const waiting = unansweredCount >= maxWithoutReply;
  const allowed = character.proactiveEnabled !== false && !unavailable && !exhausted && !waiting && channelPriority > 0;
  const reason = character.proactiveEnabled === false ? 'proactive-disabled'
    : unavailable ? 'character-unavailable'
      : exhausted ? 'daily-budget-exhausted'
        : waiting ? 'waiting-for-user-reply'
          : 'contact-allowed';
  return {
    allowed,
    ledgerKey,
    dayKey,
    used,
    dailyBudget,
    remaining: Math.max(0, dailyBudget - used),
    unansweredCount,
    maxWithoutReply,
    channelPriority,
    reason,
  };
}

/** Atomically consumes one idempotent cross-channel contact event. */
export function consumeContactBudget(
  state: SNSGodState,
  character: SNSGodCharacter,
  channel: ContactChannel,
  event: { eventId: string; roomId?: string },
  now = Date.now(),
): { state: SNSGodState; consumed: boolean; decision: ContactBudgetDecision } {
  const decision = contactBudgetDecision(state, character, channel, now);
  const existing = state.contactLedger?.[decision.ledgerKey];
  if (existing?.events.some(item => item.eventId === event.eventId)) return { state, consumed: false, decision };
  if (!decision.allowed) return { state, consumed: false, decision };
  const entry = existing || emptyEntry(character.id, decision.dayKey, now);
  const events = [...entry.events, { id: event.eventId, eventId: event.eventId, channel, createdAt: now, roomId: event.roomId }].slice(-32);
  const byChannel = events.reduce<Partial<Record<ContactChannel, number>>>((counts, item) => ({
    ...counts,
    [item.channel]: Number(counts[item.channel] || 0) + 1,
  }), {});
  const nextEntry: ContactLedgerEntry = {
    ...entry,
    used: events.length,
    byChannel,
    events,
    unansweredCount: decision.unansweredCount + 1,
    updatedAt: now,
  };
  const retainedLedger = Object.fromEntries(Object.entries(state.contactLedger || {}).filter(([, item]) => (
    Number(item.updatedAt || 0) >= now - LEDGER_RETENTION_MS
  )));
  const next = { ...state, contactLedger: { ...retainedLedger, [decision.ledgerKey]: nextEntry } };
  return { state: next, consumed: true, decision: contactBudgetDecision(next, character, channel, now) };
}

/** Resets silence pressure for replied-to characters without refunding daily use. */
export function recordContactUserReply(
  state: SNSGodState,
  characterIds: readonly string[],
  now = Date.now(),
): SNSGodState {
  const targetIds = new Set(characterIds);
  if (!targetIds.size || !state.contactLedger) return state;
  const currentKeys = new Set([...targetIds].map(characterId => {
    const character = (state.characters || []).find(item => item.id === characterId)
      || (state.randomChats || []).find(room => room.characterId === characterId)?.character;
    const timeZone = String(character?.timeZone || state.config.timeZone || 'Asia/Seoul');
    return keyFor(characterId, contactDayKey(now, timeZone));
  }));
  let changed = false;
  const contactLedger = Object.fromEntries(Object.entries(state.contactLedger).map(([key, entry]) => {
    const hasUnansweredContact = entry.events.some(event => event.createdAt > Number(entry.lastUserReplyAt || 0));
    if (!currentKeys.has(key) || !hasUnansweredContact) return [key, entry];
    changed = true;
    return [key, { ...entry, unansweredCount: 0, lastUserReplyAt: now, updatedAt: now }];
  }));
  return changed ? { ...state, contactLedger } : state;
}
