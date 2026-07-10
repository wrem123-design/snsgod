/**
 * Durable room history is intentionally unbounded by model context limits.
 * Rendering remains virtualized and prompt builders select their own windows.
 */
export function appendMessageToHistory<T>(
  history: readonly T[] | undefined,
  message: T,
): T[] {
  return [...(history || []), message];
}

/** Preserves every valid room array while normalizing malformed entries to empty history. */
export function normalizeMessageHistoryRecord<T>(
  histories: Readonly<Record<string, readonly T[] | undefined>> | undefined,
): Record<string, T[]> {
  return Object.fromEntries(Object.entries(histories || {}).map(([roomId, messages]) => [
    roomId,
    Array.isArray(messages) ? messages : [],
  ]));
}

export type MessageHistoryWritePlan = {
  mode: 'unchanged' | 'append' | 'replace';
  appendFrom: number;
};

/** Chooses the safe SQLite write mode using immutable message object identity. */
export function planMessageHistoryWrite<T>(
  previous: readonly T[] | undefined,
  next: readonly T[],
): MessageHistoryWritePlan {
  if (previous === next) return { mode: 'unchanged', appendFrom: next.length };
  if (!previous || next.length < previous.length) return { mode: 'replace', appendFrom: 0 };
  for (let index = 0; index < previous.length; index += 1) {
    if (previous[index] !== next[index]) return { mode: 'replace', appendFrom: 0 };
  }
  return { mode: 'append', appendFrom: previous.length };
}

/** Compares persisted room contents while treating an omitted empty room as empty. */
export function messageHistoryRecordsMatch<T>(
  expected: Readonly<Record<string, readonly T[] | undefined>>,
  actual: Readonly<Record<string, readonly T[] | undefined>>,
): boolean {
  const roomIds = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  for (const roomId of roomIds) {
    if (JSON.stringify(expected[roomId] || []) !== JSON.stringify(actual[roomId] || [])) return false;
  }
  return true;
}

/** Returns a bounded copy for one model request without mutating durable history. */
export function selectPromptContext<T>(
  history: readonly T[] | undefined,
  requestedLimit: number,
): T[] {
  const numericLimit = Number(requestedLimit);
  const finiteLimit = Number.isFinite(numericLimit) ? numericLimit : 24;
  const limit = Math.min(80, Math.max(1, Math.floor(finiteLimit)));
  return (history || []).slice(-limit);
}
