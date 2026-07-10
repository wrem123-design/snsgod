/** Ordering metadata used to choose an authoritative persisted state. */
export interface RecoveryOrderStats {
  /** Monotonic application-state revision. */
  revision: number;
  /** Monotonic write sequence within a revision. */
  writeSeq: number;
  /** Wall-clock save time used only after monotonic metadata ties. */
  savedAt: number;
}

/** A persisted-state candidate considered during application hydration. */
export interface RecoveryCandidate<
  TState,
  TSource extends string = string,
  TStats extends RecoveryOrderStats = RecoveryOrderStats,
> {
  /** Storage location that produced the candidate. */
  source: TSource;
  /** Parsed state when parsing and validation succeeded. */
  state?: TState;
  /** Ordering metadata when the state could be inspected. */
  stats?: TStats;
  /** Validation failure that prevents automatic recovery from this candidate. */
  validationError?: string;
}

/** A recovery candidate whose state and ordering metadata passed validation. */
export type AuthoritativeRecoveryCandidate<
  TState,
  TSource extends string = string,
  TStats extends RecoveryOrderStats = RecoveryOrderStats,
> = RecoveryCandidate<TState, TSource, TStats> & {
  state: TState;
  stats: TStats;
};

function recoveryOrderStatsAreValid(stats: RecoveryOrderStats): boolean {
  return [stats.revision, stats.writeSeq, stats.savedAt].every(
    value => Number.isSafeInteger(value) && value >= 0,
  );
}

/** Storage metadata that determines whether an internal hash must exist. */
export interface RecoveryHashMetadata {
  /** Revision introduced together with content hashes. */
  revision?: number;
  /** Write sequence introduced together with content hashes. */
  writeSeq?: number;
  /** Save time that also exists in snapshots written before content hashes. */
  savedAt?: number;
}

/**
 * Determines whether a snapshot comes from a generation that always wrote hashes.
 *
 * @param metadata - Ordering metadata parsed from the snapshot
 * @returns Whether missing hash metadata invalidates the snapshot
 */
export function recoveryMetadataRequiresHash(
  metadata: RecoveryHashMetadata,
): boolean {
  return metadata.revision !== undefined || metadata.writeSeq !== undefined;
}

/**
 * Chooses the newest valid state without using record counts as a rollback signal.
 *
 * @description Intentional deletion makes a newer state smaller. Ordering therefore
 * relies only on monotonic revision/write metadata and finally the save time.
 * Invalid candidates are excluded so a verified prior snapshot remains available
 * when the newest file is damaged.
 *
 * @param candidates - Parsed candidates in storage preference order
 * @returns The authoritative candidate, or undefined when none are valid
 */
export function selectAuthoritativeCandidate<
  TState,
  TSource extends string,
  TStats extends RecoveryOrderStats,
>(
  candidates: readonly RecoveryCandidate<TState, TSource, TStats>[],
): AuthoritativeRecoveryCandidate<TState, TSource, TStats> | undefined {
  const valid = candidates.filter(
    (
      candidate,
    ): candidate is AuthoritativeRecoveryCandidate<TState, TSource, TStats> =>
      candidate.state !== undefined &&
      candidate.stats !== undefined &&
      recoveryOrderStatsAreValid(candidate.stats) &&
      !candidate.validationError,
  );

  return valid.slice().sort((left, right) => {
    if (right.stats.revision !== left.stats.revision) {
      return right.stats.revision - left.stats.revision;
    }
    if (right.stats.writeSeq !== left.stats.writeSeq) {
      return right.stats.writeSeq - left.stats.writeSeq;
    }
    return right.stats.savedAt - left.stats.savedAt;
  })[0];
}

/**
 * Restores an established critical-array backup only when the field is absent.
 *
 * @description An explicit empty array represents an intentional deletion and must
 * remain empty. Older installations that do not contain the field can still recover
 * its separately stored backup.
 *
 * @param current - Array stored in the selected state, or an absent value
 * @param backup - Separately stored compatibility backup
 * @param currentIsGeneratedDefault - Whether current came from a generated fallback
 * @returns A detached array that preserves explicit deletion intent
 */
export function mergeCriticalArrayBackup<T>(
  current: readonly T[] | null | undefined,
  backup: readonly T[] | null | undefined,
  currentIsGeneratedDefault = false,
): T[] {
  return !currentIsGeneratedDefault && current !== undefined && current !== null
    ? [...current]
    : [...(backup ?? [])];
}

/**
 * Checks that parsed JSON has the record shape required for application state.
 *
 * @param value - Parsed JSON value
 * @returns Whether the value contains the established core state fields
 */
export function isPersistedStateObject(
  value: unknown,
): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const isRecord = (item: unknown): item is Record<string, unknown> =>
    typeof item === 'object' && item !== null && !Array.isArray(item);
  return isRecord(record.config)
    && Array.isArray(record.characters)
    && isRecord(record.chatRooms)
    && isRecord(record.messages);
}

/**
 * Validates an optional content hash from a stored snapshot.
 *
 * @description Established snapshots without hash metadata remain importable. Once
 * a hash is present, it must match the calculated content hash before the snapshot
 * can participate in automatic recovery.
 *
 * @param storedHash - Hash persisted with the snapshot
 * @param calculatedHashes - Accepted current and established hash calculations
 * @param hashRequired - Whether ordering metadata proves the snapshot should have a hash
 * @returns Whether the snapshot passes internal hash validation
 */
export function storedContentHashMatches(
  storedHash: string | null | undefined,
  calculatedHashes: readonly string[],
  hashRequired = false,
): boolean {
  const normalizedStoredHash = storedHash?.trim();
  if (!normalizedStoredHash) return !hashRequired;
  return calculatedHashes.includes(normalizedStoredHash);
}

function jsonStableValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  const serialized = JSON.stringify(value);
  return serialized === undefined ? undefined : JSON.parse(serialized);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (!value || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableStringify(
      (value as Record<string, unknown>)[key],
    )}`)
    .join(',')}}`;
}

function fnv1aHash(raw: string): string {
  let hash = 2166136261;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16)}`;
}

/**
 * Calculates the content hash used by snapshots written before hash acceleration.
 *
 * @description The established algorithm first applies JSON serialization semantics,
 * then sorts object keys recursively before calculating FNV-1a. Keeping the exact
 * algorithm allows verified older snapshots to migrate without accepting arbitrary
 * hash mismatches.
 *
 * @param value - Snapshot value after storage metadata has been removed
 * @returns Established FNV-1a content hash
 */
export function calculateEstablishedContentHash(value: unknown): string {
  return fnv1aHash(stableStringify(jsonStableValue(value)));
}
