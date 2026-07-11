import type { SNSGodState } from '../types';

/** Identifies one eligible room without retaining a stale character snapshot. */
export type SnsAutomationCandidate = {
  characterId: string;
  roomId: string;
  priority: number;
};

/** Keeps the highest-ranked room for each character from an already sorted list. */
export function oneSnsRoomPerCharacter(candidates: SnsAutomationCandidate[]): SnsAutomationCandidate[] {
  const seen = new Set<string>();
  return candidates.filter(candidate => {
    if (seen.has(candidate.characterId)) return false;
    seen.add(candidate.characterId);
    return true;
  });
}

/**
 * Evaluates every character until one creates a post. State changes caused by
 * chance misses are retained without preventing later characters from trying.
 */
export async function evaluateSnsAutomationCandidates(
  state: SNSGodState,
  candidates: SnsAutomationCandidate[],
  evaluate: (current: SNSGodState, candidate: SnsAutomationCandidate) => Promise<SNSGodState>,
): Promise<SNSGodState | undefined> {
  let current = state;
  for (const candidate of candidates) {
    const previousPostIds = new Set((current.snsPosts || []).map(post => post.id));
    const next = await evaluate(current, candidate);
    if (next === current) continue;
    current = next;
    if ((current.snsPosts || []).some(post => !previousPostIds.has(post.id))) return current;
  }
  return current === state ? undefined : current;
}
