import type { SNSGodState } from '../types';

type StateScalar = string | number | boolean | null | undefined;
type StateNode = StateScalar | StateNode[] | StateObject;
type StateObject = { [key: string]: StateNode };
type MergeIntent = 'screen' | 'import';
type MergeContext = {
  preferLatestConflicts: boolean;
  preserveIncomingDeletionConflicts: boolean;
};

const SCALAR_SET_ARRAY_KEYS = new Set([
  'characterIds',
  'datingStyle',
  'dislikes',
  'facts',
  'hashtags',
  'hobbies',
  'interests',
  'knownByCharacterIds',
  'lifestyle',
  'likes',
  'memories',
  'participantIds',
  'selectedReferencePhotoIds',
  'toneTags',
  'traits',
  'worldcupByeCandidateIds',
]);

export type StaleStateMergeOptions = {
  conflict?: 'incoming' | 'latest';
  intent?: MergeIntent;
};

export type IdentifiedStateValue = {
  id?: unknown;
};

function isStateObject(value: StateNode): value is StateObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sameStateNode(left: StateNode, right: StateNode): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length
      && left.every((value, index) => sameStateNode(value, right[index]));
  }
  if (isStateObject(left) && isStateObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length
      && leftKeys.every(key => (
        Object.prototype.hasOwnProperty.call(right, key)
        && sameStateNode(left[key], right[key])
      ));
  }
  return false;
}

function stateArrayKey(value: StateNode): string | undefined {
  if (isStateObject(value)) {
    if (typeof value.id === 'string' && value.id.length > 0) return `id:${value.id}`;
    if (typeof value.profileId === 'string' && value.profileId.length > 0) {
      return `profileId:${value.profileId}`;
    }
    return undefined;
  }
  if (value === null) return 'scalar:null';
  if (value === undefined) return 'scalar:undefined';
  return `scalar:${typeof value}:${String(value)}`;
}

function hasUniqueMergeKeys(values: readonly StateNode[]): boolean {
  const keys = values.map(stateArrayKey);
  return keys.every(key => key !== undefined) && new Set(keys).size === keys.length;
}

function canMergeAsKeyedArrays(
  latest: readonly StateNode[],
  base: readonly StateNode[],
  incoming: readonly StateNode[],
): boolean {
  const combined = [...latest, ...base, ...incoming];
  return combined.length > 0
    && hasUniqueMergeKeys(latest)
    && hasUniqueMergeKeys(base)
    && hasUniqueMergeKeys(incoming);
}

function appendDistinct(target: StateNode[], value: StateNode): void {
  if (!target.some(existing => sameStateNode(existing, value))) target.push(value);
}

function isScalarArray(values: readonly StateNode[]): boolean {
  return values.every(value => !Array.isArray(value) && !isStateObject(value));
}

function uniqueScalarValues(values: readonly StateNode[]): StateNode[] {
  const unique: StateNode[] = [];
  for (const value of values) appendDistinct(unique, value);
  return unique;
}

function canMergeAsScalarSet(
  propertyKey: string | undefined,
  latest: readonly StateNode[],
  base: readonly StateNode[],
  incoming: readonly StateNode[],
): boolean {
  return Boolean(propertyKey && SCALAR_SET_ARRAY_KEYS.has(propertyKey))
    && isScalarArray(latest)
    && isScalarArray(base)
    && isScalarArray(incoming);
}

function mergeScalarSets(
  latest: readonly StateNode[],
  base: readonly StateNode[],
  incoming: readonly StateNode[],
  context: MergeContext,
): StateNode[] {
  return mergeKeyedArrays(
    uniqueScalarValues(latest),
    uniqueScalarValues(base),
    uniqueScalarValues(incoming),
    context,
  );
}

function mergePositionalArrays(
  latest: readonly StateNode[],
  base: readonly StateNode[],
  incoming: readonly StateNode[],
  context: MergeContext,
): StateNode[] {
  const merged: StateNode[] = [];
  for (let index = 0; index < base.length; index += 1) {
    const latestHas = index < latest.length;
    const incomingHas = index < incoming.length;
    if (!incomingHas) {
      if (
        context.preserveIncomingDeletionConflicts
        && latestHas
        && !sameStateNode(latest[index], base[index])
      ) {
        appendDistinct(merged, latest[index]);
      }
      continue;
    }
    if (!latestHas) continue;
    appendDistinct(
      merged,
      mergeStateNode(latest[index], base[index], incoming[index], context),
    );
  }
  for (let index = base.length; index < latest.length; index += 1) {
    appendDistinct(merged, latest[index]);
  }
  for (let index = base.length; index < incoming.length; index += 1) {
    appendDistinct(merged, incoming[index]);
  }
  return merged;
}

function mergeKeyedArrays(
  latest: readonly StateNode[],
  base: readonly StateNode[],
  incoming: readonly StateNode[],
  context: MergeContext,
): StateNode[] {
  const latestByKey = new Map(latest.map(value => [stateArrayKey(value) as string, value]));
  const baseByKey = new Map(base.map(value => [stateArrayKey(value) as string, value]));
  const incomingByKey = new Map(incoming.map(value => [stateArrayKey(value) as string, value]));
  const removedKeys = new Set(
    [...baseByKey.keys()].filter(key => !incomingByKey.has(key)),
  );
  const merged: StateNode[] = [];

  for (const latestValue of latest) {
    const key = stateArrayKey(latestValue) as string;
    const baseValue = baseByKey.get(key);
    const incomingValue = incomingByKey.get(key);
    if (removedKeys.has(key)) {
      if (
        context.preserveIncomingDeletionConflicts
        && baseByKey.has(key)
        && !sameStateNode(latestValue, baseValue)
      ) {
        merged.push(latestValue);
      }
      continue;
    }
    if (baseByKey.has(key) && incomingByKey.has(key)) {
      merged.push(mergeStateNode(latestValue, baseValue, incomingValue, context));
    } else {
      merged.push(latestValue);
    }
  }

  for (const incomingValue of incoming) {
    const key = stateArrayKey(incomingValue) as string;
    if (!baseByKey.has(key) && !latestByKey.has(key)) merged.push(incomingValue);
  }
  return merged;
}

function mergeStateObjects(
  latest: StateObject,
  base: StateObject,
  incoming: StateObject,
  context: MergeContext,
): StateObject {
  const merged: StateObject = {};
  const keys = new Set([
    ...Object.keys(latest),
    ...Object.keys(base),
    ...Object.keys(incoming),
  ]);

  for (const key of keys) {
    const latestHas = Object.prototype.hasOwnProperty.call(latest, key);
    const baseHas = Object.prototype.hasOwnProperty.call(base, key);
    const incomingHas = Object.prototype.hasOwnProperty.call(incoming, key);
    if (!incomingHas) {
      if (!baseHas && latestHas) {
        merged[key] = latest[key];
      } else if (
        context.preserveIncomingDeletionConflicts
        && latestHas
        && !sameStateNode(latest[key], base[key])
      ) {
        merged[key] = latest[key];
      }
      continue;
    }
    if (!baseHas) {
      merged[key] = latestHas
        ? mergeStateNode(latest[key], undefined, incoming[key], context, key)
        : incoming[key];
      continue;
    }
    if (Object.is(incoming[key], base[key])) {
      if (latestHas) merged[key] = latest[key];
      continue;
    }
    if (!latestHas) {
      // A deletion in the latest state wins over a stale edit.
      continue;
    }
    merged[key] = mergeStateNode(latest[key], base[key], incoming[key], context, key);
  }
  return merged;
}

function mergeStateNode(
  latest: StateNode,
  base: StateNode,
  incoming: StateNode,
  context: MergeContext,
  propertyKey?: string,
): StateNode {
  if (Object.is(incoming, base)) return latest;
  if (Object.is(latest, base)) return incoming;
  if (base === undefined) {
    if (Array.isArray(latest) && Array.isArray(incoming)) {
      if (sameStateNode(latest, incoming)) return latest;
      if (propertyKey === 'profileReferenceImages') {
        return mergePositionalArrays(latest, [], incoming, context).slice(0, 3);
      }
      if (canMergeAsScalarSet(propertyKey, latest, [], incoming)) {
        return mergeScalarSets(latest, [], incoming, context);
      }
      return canMergeAsKeyedArrays(latest, [], incoming)
        ? mergeKeyedArrays(latest, [], incoming, context)
        : latest;
    }
    if (isStateObject(latest) && isStateObject(incoming)) {
      return mergeStateObjects(latest, {}, incoming, context);
    }
  }
  if (Array.isArray(latest) && Array.isArray(base) && Array.isArray(incoming)) {
    if (sameStateNode(incoming, base)) return latest;
    if (sameStateNode(latest, base)) return incoming;
    if (propertyKey === 'profileReferenceImages') {
      return mergePositionalArrays(latest, base, incoming, context).slice(0, 3);
    }
    if (canMergeAsScalarSet(propertyKey, latest, base, incoming)) {
      return mergeScalarSets(latest, base, incoming, context);
    }
    return canMergeAsKeyedArrays(latest, base, incoming)
      ? mergeKeyedArrays(latest, base, incoming, context)
      : latest;
  }
  if (isStateObject(latest) && isStateObject(base) && isStateObject(incoming)) {
    return mergeStateObjects(latest, base, incoming, context);
  }
  return context.preferLatestConflicts ? latest : incoming;
}

function finiteNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function serverEndpoint(server: SNSGodState['config']['serverMessaging']): string {
  return String(server?.baseUrl || '').trim().replace(/\/+$/, '');
}

/**
 * Reports whether two states target the same messaging server endpoint.
 *
 * Registration details are intentionally excluded so an in-flight registration
 * can still commit after it receives a device identity for the requested URL.
 */
export function hasSameServerEndpoint(left: SNSGodState, right: SNSGodState): boolean {
  return serverEndpoint(left.config.serverMessaging) === serverEndpoint(right.config.serverMessaging);
}

function serverIdentity(server: SNSGodState['config']['serverMessaging']): string {
  return `${serverEndpoint(server)}\n${String(server?.deviceId || '')}\n${String(server?.connectionRequestId || '')}`;
}

export function hasSameServerIdentity(left: SNSGodState, right: SNSGodState): boolean {
  return serverIdentity(left.config.serverMessaging) === serverIdentity(right.config.serverMessaging);
}

function preserveServerSyncProgress(
  merged: SNSGodState,
  latest: SNSGodState,
  base: SNSGodState,
  incoming: SNSGodState,
): SNSGodState {
  const mergedServer = merged.config.serverMessaging;
  const latestServer = latest.config.serverMessaging;
  const baseServer = base.config.serverMessaging;
  const incomingServer = incoming.config.serverMessaging;
  if (!mergedServer || !latestServer || !baseServer || !incomingServer) return merged;
  const baseIdentity = serverIdentity(baseServer);
  const latestIdentity = serverIdentity(latestServer);
  const incomingIdentity = serverIdentity(incomingServer);
  if (
    latestIdentity !== baseIdentity
    && incomingIdentity !== baseIdentity
    && latestIdentity !== incomingIdentity
  ) {
    return {
      ...merged,
      config: {
        ...merged.config,
        serverMessaging: {
          ...mergedServer,
          baseUrl: latestServer.baseUrl,
          deviceId: latestServer.deviceId,
          deviceToken: latestServer.deviceToken,
          pairingSecret: latestServer.pairingSecret,
          syncCursor: latestServer.syncCursor,
          lastSyncAt: latestServer.lastSyncAt,
          lastError: latestServer.lastError,
          outbox: latestServer.outbox,
        },
      },
    };
  }
  const sameServer = serverIdentity(mergedServer) === serverIdentity(latestServer);
  if (!sameServer) return merged;
  const protectedFields = ['deviceToken', 'pairingSecret'] as const;
  const protectedServer = { ...mergedServer };
  for (const field of protectedFields) {
    if (
      !Object.is(latestServer[field], baseServer[field])
      && !Object.is(incomingServer[field], baseServer[field])
      && !Object.is(latestServer[field], incomingServer[field])
    ) {
      protectedServer[field] = latestServer[field];
    }
  }
  const mergedCursor = finiteNumber(protectedServer.syncCursor);
  const latestCursor = finiteNumber(latestServer.syncCursor);
  const mergedSyncAt = finiteNumber(mergedServer.lastSyncAt);
  const latestSyncAt = finiteNumber(latestServer.lastSyncAt);
  const syncCursor = mergedCursor === undefined
    ? latestCursor
    : latestCursor === undefined ? mergedCursor : Math.max(mergedCursor, latestCursor);
  const lastSyncAt = mergedSyncAt === undefined
    ? latestSyncAt
    : latestSyncAt === undefined ? mergedSyncAt : Math.max(mergedSyncAt, latestSyncAt);
  if (
    syncCursor === mergedCursor
    && lastSyncAt === mergedSyncAt
    && protectedServer.deviceToken === mergedServer.deviceToken
    && protectedServer.pairingSecret === mergedServer.pairingSecret
  ) return merged;
  return {
    ...merged,
    config: {
      ...merged.config,
      serverMessaging: {
        ...protectedServer,
        ...(syncCursor === undefined ? {} : { syncCursor }),
        ...(lastSyncAt === undefined ? {} : { lastSyncAt }),
      },
    },
  };
}

function enforceMergedStateInvariants(state: SNSGodState): SNSGodState {
  const referenceFaceSlots = state.referenceFaceSlots || [];
  if (referenceFaceSlots.length <= 50) return state;
  return { ...state, referenceFaceSlots: referenceFaceSlots.slice(0, 50) };
}

function stateRoomIds(state: SNSGodState): Set<string> {
  return new Set([
    ...Object.values(state.chatRooms || {}).flat().map(room => room.id),
    ...(state.groupRooms || []).map(room => room.id),
    ...(state.randomChats || []).map(room => room.id),
  ]);
}

/**
 * Rejects child records created by stale work after their character, room, or
 * source post was deleted from the current state.
 */
export function preserveLatestDeletionInvariants(
  candidate: SNSGodState,
  latest: SNSGodState,
  base: SNSGodState,
): SNSGodState {
  const latestCharacterIds = new Set(latest.characters.map(character => character.id));
  const deletedCharacterIds = new Set(
    base.characters
      .map(character => character.id)
      .filter(characterId => !latestCharacterIds.has(characterId)),
  );
  const latestRooms = stateRoomIds(latest);
  const deletedRoomIds = new Set(
    [...stateRoomIds(base)].filter(roomId => !latestRooms.has(roomId)),
  );
  const latestPostIds = new Set((latest.snsPosts || []).map(post => post.id));
  const deletedPostIds = new Set(
    (base.snsPosts || [])
      .map(post => post.id)
      .filter(postId => !latestPostIds.has(postId)),
  );
  if (!deletedCharacterIds.size && !deletedRoomIds.size && !deletedPostIds.size) {
    return candidate;
  }

  const messages = { ...(candidate.messages || {}) };
  const unreadCounts = { ...(candidate.unreadCounts || {}) };
  for (const roomId of deletedRoomIds) {
    delete messages[roomId];
    delete unreadCounts[roomId];
  }
  const snsPosts = (candidate.snsPosts || []).filter(
    post => !deletedCharacterIds.has(post.characterId)
      && (!post.generationRoomId || !deletedRoomIds.has(post.generationRoomId)),
  );
  const retainedPostIds = new Set(snsPosts.map(post => post.id));
  const rejectedPostIds = new Set(
    (candidate.snsPosts || [])
      .map(post => post.id)
      .filter(postId => !retainedPostIds.has(postId)),
  );
  const snsDmThreads = (candidate.snsDmThreads || []).filter(thread => (
    !deletedCharacterIds.has(thread.characterId)
    && !deletedPostIds.has(String(thread.postId || ''))
    && !rejectedPostIds.has(String(thread.postId || ''))
  ));
  const meetingEventSessions = (candidate.meetingEventSessions || []).filter(
    session => !deletedRoomIds.has(session.roomId),
  );
  return {
    ...candidate,
    messages,
    unreadCounts,
    snsPosts,
    snsDmThreads,
    meetingEventSessions,
    roomSummaries: (candidate.roomSummaries || []).filter(summary => (
      !deletedRoomIds.has(summary.roomId)
      && !summary.characterIds.some(characterId => deletedCharacterIds.has(characterId))
    )),
    groupRoomSummaries: (candidate.groupRoomSummaries || []).filter(summary => (
      !deletedRoomIds.has(summary.roomId)
      && !summary.characterIds.some(characterId => deletedCharacterIds.has(characterId))
    )),
    characterMemories: (candidate.characterMemories || []).filter(memory => (
      !deletedCharacterIds.has(memory.characterId)
      && !memory.knownByCharacterIds.some(characterId => deletedCharacterIds.has(characterId))
      && !deletedRoomIds.has(memory.sourceRoomId)
    )),
    loreEntries: (candidate.loreEntries || []).filter(entry => (
      !entry.characterId || !deletedCharacterIds.has(entry.characterId)
    )),
    notifications: (candidate.notifications || []).filter(item => {
      const characterId = String(item.characterId || item.target?.characterId || '');
      const roomId = String(item.roomId || item.target?.roomId || '');
      const postId = String(item.target?.postId || '');
      return !deletedCharacterIds.has(characterId)
        && !deletedRoomIds.has(roomId)
        && !deletedPostIds.has(postId)
        && !rejectedPostIds.has(postId);
    }),
    activeMeetingEventId: candidate.activeMeetingEventId
      && meetingEventSessions.some(session => session.id === candidate.activeMeetingEventId)
      ? candidate.activeMeetingEventId
      : undefined,
    selectedRoomId: candidate.selectedRoomId && deletedRoomIds.has(candidate.selectedRoomId)
      ? undefined
      : candidate.selectedRoomId,
  };
}

function sameUnknownSnapshot(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

/**
 * Applies changed and newly created background entities without reviving an
 * entity that the current state deleted after the background job started.
 */
export function mergeChangedIdentifiedArray<T extends IdentifiedStateValue>(
  latest: T[] = [],
  base: T[] = [],
  incoming: T[] = [],
): T[] {
  let changed = false;
  const baseById = new Map(base.map(item => [String(item.id || ''), item]));
  const incomingById = new Map(incoming.map(item => [String(item.id || ''), item]));
  const merged = latest.map(item => {
    const id = String(item.id || '');
    const incomingItem = incomingById.get(id);
    const baseItem = baseById.get(id);
    if (!incomingItem || sameUnknownSnapshot(incomingItem, baseItem)) return item;
    const mergedItem = mergeStateNode(
      item as object as StateObject,
      baseItem as object as StateObject,
      incomingItem as object as StateObject,
      {
        preferLatestConflicts: true,
        preserveIncomingDeletionConflicts: true,
      },
    ) as object as T;
    if (sameUnknownSnapshot(mergedItem, item)) return item;
    changed = true;
    return mergedItem;
  });
  const latestIds = new Set(latest.map(item => String(item.id || '')));
  for (const item of incoming) {
    const id = String(item.id || '');
    if (id && !baseById.has(id) && !latestIds.has(id)) {
      merged.push(item);
      latestIds.add(id);
      changed = true;
    }
  }
  return changed ? merged : latest;
}

/**
 * Replays only the changes made against a rendered base snapshot onto the latest
 * state. ID-addressable arrays preserve concurrent additions and deletions.
 */
export function mergeStaleState(
  latest: SNSGodState,
  base: SNSGodState,
  incoming: SNSGodState,
  options: StaleStateMergeOptions = {},
): SNSGodState {
  if (!Object.is(latest.__importedAt, base.__importedAt)) return latest;
  const context: MergeContext = {
    preferLatestConflicts: options.conflict === 'latest',
    preserveIncomingDeletionConflicts: options.intent === 'import' || options.conflict === 'latest',
  };
  const merged = mergeStateObjects(
    latest as object as StateObject,
    base as object as StateObject,
    incoming as object as StateObject,
    context,
  );
  const reconciled = preserveServerSyncProgress(
      merged as object as SNSGodState,
      latest,
      base,
      incoming,
  );
  return enforceMergedStateInvariants(
    preserveLatestDeletionInvariants(reconciled, latest, base),
  );
}

/** Applies a server connection result only to the exact user request that started it. */
export function mergeServerConnectionResult(
  current: SNSGodState,
  requested: SNSGodState,
  result: SNSGodState,
  requestId: string,
  options: { requireIdentity?: boolean } = {},
): SNSGodState {
  if (!requestId || current.config.serverMessaging?.connectionRequestId !== requestId) return current;
  if (!hasSameServerEndpoint(current, result)) return current;
  if (options.requireIdentity && !hasSameServerIdentity(current, result)) return current;
  return mergeStaleState(current, requested, result, { conflict: 'latest' });
}
