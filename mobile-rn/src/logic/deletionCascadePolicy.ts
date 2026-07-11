import type {
  DatingAppHistoryEntry,
  DatingAppProgress,
  MeetingEventSession,
  SNSGodMessage,
  SNSGodState,
} from '../types';

/** State result plus runtime chat jobs that the caller must cancel. */
export type StateDeletionCascadeResult = {
  state: SNSGodState;
  removedRoomIds: string[];
  cancelledJobRoomIds: string[];
};

type DeletionCriteria = {
  roomIds?: ReadonlySet<string>;
  characterIds?: ReadonlySet<string>;
  postIds?: ReadonlySet<string>;
  threadIds?: ReadonlySet<string>;
  cancelledJobRoomIds?: ReadonlySet<string>;
};

function deleteRecordKeys<Value>(
  source: Readonly<Record<string, Value>> | undefined,
  keys: ReadonlySet<string>,
): Record<string, Value> {
  const next = { ...(source || {}) };
  for (const key of keys) delete next[key];
  return next;
}

function sessionReferencesCharacter(
  session: MeetingEventSession,
  characterIds: ReadonlySet<string>,
): boolean {
  const directIds = [session.characterId, session.primaryCharacterId, session.lastSpeakerCharacterId];
  if (directIds.some(id => Boolean(id && characterIds.has(id)))) return true;
  const collections = [
    session.participantCharacterIds,
    session.presentCharacterIds,
    session.absentCharacterIds,
    session.speakerQueue,
  ];
  if (collections.some(ids => (ids || []).some(id => characterIds.has(id)))) return true;
  return (session.lines || []).some(line => (
    Boolean(line.characterId && characterIds.has(line.characterId))
    || Boolean(line.targetCharacterId && characterIds.has(line.targetCharacterId))
  ));
}

function clearInvalidDatingHistory(
  history: readonly DatingAppHistoryEntry[] | undefined,
  invalidRoomIds: ReadonlySet<string>,
  invalidCharacterIds: ReadonlySet<string>,
): DatingAppHistoryEntry[] | undefined {
  return history?.map(entry => {
    const invalid = Boolean(
      (entry.acceptedRoomId && invalidRoomIds.has(entry.acceptedRoomId))
      || (entry.acceptedCharacterId && invalidCharacterIds.has(entry.acceptedCharacterId)),
    );
    return invalid ? {
      ...entry,
      requestStatus: 'none',
      requestedAt: undefined,
      resolvedAt: undefined,
      rejectedReason: undefined,
      acceptedRoomId: undefined,
      acceptedCharacterId: undefined,
    } : entry;
  });
}

function clearInvalidDatingProgress(
  progress: DatingAppProgress | undefined,
  invalidRoomIds: ReadonlySet<string>,
  invalidCharacterIds: ReadonlySet<string>,
): DatingAppProgress | undefined {
  if (!progress) return progress;
  const invalid = Boolean(
    (progress.acceptedRoomId && invalidRoomIds.has(progress.acceptedRoomId))
    || (progress.acceptedCharacterId && invalidCharacterIds.has(progress.acceptedCharacterId)),
  );
  return {
    ...progress,
    ...(invalid ? {
      requestStatus: 'none' as const,
      requestedAt: undefined,
      resolveAt: undefined,
      resolvedAt: undefined,
      rejectedReason: undefined,
      acceptedRoomId: undefined,
      acceptedCharacterId: undefined,
    } : {}),
    history: clearInvalidDatingHistory(progress.history, invalidRoomIds, invalidCharacterIds),
  };
}

function pruneDeletionDependents(
  state: SNSGodState,
  criteria: DeletionCriteria,
): SNSGodState {
  const roomIds = criteria.roomIds || new Set<string>();
  const characterIds = criteria.characterIds || new Set<string>();
  const explicitPostIds = criteria.postIds || new Set<string>();
  const explicitThreadIds = criteria.threadIds || new Set<string>();
  const cancelledJobRoomIds = criteria.cancelledJobRoomIds || roomIds;
  const messages = deleteRecordKeys(state.messages, roomIds);
  if (characterIds.size) {
    for (const [roomId, roomMessages] of Object.entries(messages)) {
      messages[roomId] = roomMessages.filter(message => (
        !message.characterId || !characterIds.has(message.characterId)
      ));
    }
  }
  const unreadCounts = deleteRecordKeys(state.unreadCounts, roomIds);
  const pendingReplies = deleteRecordKeys(state.pendingReplies, cancelledJobRoomIds);
  const snsPosts = (state.snsPosts || []).filter(post => (
    !explicitPostIds.has(post.id)
    && !characterIds.has(post.characterId)
    && (!post.generationRoomId || !roomIds.has(post.generationRoomId))
  ));
  const retainedPostIds = new Set(snsPosts.map(post => post.id));
  const removedPostIds = new Set([
    ...explicitPostIds,
    ...(state.snsPosts || []).filter(post => !retainedPostIds.has(post.id)).map(post => post.id),
  ]);
  const snsDmThreads = (state.snsDmThreads || []).filter(thread => (
    !explicitThreadIds.has(thread.id)
    && !characterIds.has(thread.characterId)
    && (!thread.postId || !removedPostIds.has(thread.postId))
  ));
  const retainedThreadIds = new Set(snsDmThreads.map(thread => thread.id));
  const removedThreadIds = new Set([
    ...explicitThreadIds,
    ...(state.snsDmThreads || []).filter(thread => !retainedThreadIds.has(thread.id)).map(thread => thread.id),
  ]);
  const meetingEventSessions = (state.meetingEventSessions || []).filter(session => (
    !roomIds.has(session.roomId)
    && !sessionReferencesCharacter(session, characterIds)
  ));
  const retainedMeetingIds = new Set(meetingEventSessions.map(session => session.id));
  const serverMessaging = state.config.serverMessaging ? {
    ...state.config.serverMessaging,
    outbox: (state.config.serverMessaging.outbox || []).filter(item => !roomIds.has(item.roomId)),
  } : state.config.serverMessaging;
  const sumGodArchives = state.sumGod?.characterArchives?.filter(
    archive => !characterIds.has(archive.characterId),
  );
  const sumGod = state.sumGod ? (
    characterIds.has(state.sumGod.characterId)
      ? {
        ...state.sumGod,
        characterId: '',
        view: 'today' as const,
        questionOpen: false,
        entries: [],
        characterArchives: sumGodArchives,
      }
      : { ...state.sumGod, characterArchives: sumGodArchives }
  ) : state.sumGod;
  return {
    ...state,
    config: { ...state.config, serverMessaging },
    messages,
    unreadCounts,
    pendingReplies,
    snsPosts,
    snsDmThreads,
    meetingEventSessions,
    activeMeetingEventId: state.activeMeetingEventId
      && retainedMeetingIds.has(state.activeMeetingEventId)
      ? state.activeMeetingEventId
      : undefined,
    roomSummaries: (state.roomSummaries || []).filter(summary => (
      !roomIds.has(summary.roomId)
      && !summary.characterIds.some(characterId => characterIds.has(characterId))
    )),
    groupRoomSummaries: (state.groupRoomSummaries || []).filter(summary => (
      !roomIds.has(summary.roomId)
      && !summary.characterIds.some(characterId => characterIds.has(characterId))
    )),
    characterMemories: (state.characterMemories || []).filter(memory => (
      !roomIds.has(memory.sourceRoomId)
      && !characterIds.has(memory.characterId)
      && !memory.knownByCharacterIds.some(characterId => characterIds.has(characterId))
    )),
    characterEvents: (state.characterEvents || []).filter(
      event => !characterIds.has(event.characterId),
    ),
    loreEntries: (state.loreEntries || []).filter(entry => (
      (!entry.roomId || !roomIds.has(entry.roomId))
      && (!entry.characterId || !characterIds.has(entry.characterId))
    )),
    notifications: (state.notifications || []).filter(item => {
      const postId = item.target?.postId;
      const threadId = item.target?.threadId;
      return (!item.characterId || !characterIds.has(item.characterId))
        && (!item.target?.characterId || !characterIds.has(item.target.characterId))
        && (!item.roomId || !roomIds.has(item.roomId))
        && (!item.target?.roomId || !roomIds.has(item.target.roomId))
        && (!postId || !removedPostIds.has(postId))
        && (!threadId || !removedThreadIds.has(threadId));
    }),
    notificationEvents: Object.fromEntries(Object.entries(state.notificationEvents || {}).filter(([, receipt]) => (
      !(receipt.targetKind === 'room' && roomIds.has(receipt.targetId))
      && !(receipt.targetKind === 'snsdm' && removedThreadIds.has(receipt.targetId))
    ))),
    datingApp: clearInvalidDatingProgress(state.datingApp, roomIds, characterIds),
    sumGod,
    selectedRoomId: state.selectedRoomId && roomIds.has(state.selectedRoomId)
      ? undefined
      : state.selectedRoomId,
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/** Deletes a direct, group, or random room and every state record owned by it. */
export function deleteRoomCascade(
  state: SNSGodState,
  roomId: string,
): StateDeletionCascadeResult {
  const directExists = Object.values(state.chatRooms || {}).flat().some(room => room.id === roomId);
  const groupExists = (state.groupRooms || []).some(room => room.id === roomId);
  const randomExists = (state.randomChats || []).some(room => room.id === roomId);
  if (!directExists && !groupExists && !randomExists) {
    return { state, removedRoomIds: [], cancelledJobRoomIds: [] };
  }
  const chatRooms = Object.fromEntries(Object.entries(state.chatRooms || {}).map(
    ([characterId, rooms]) => [characterId, rooms.filter(room => room.id !== roomId)],
  ));
  const roomIds = new Set([roomId]);
  const next = pruneDeletionDependents({
    ...state,
    chatRooms,
    groupRooms: (state.groupRooms || []).filter(room => room.id !== roomId),
    randomChats: (state.randomChats || []).filter(room => room.id !== roomId),
  }, { roomIds });
  return { state: next, removedRoomIds: [roomId], cancelledJobRoomIds: [roomId] };
}

/** Deletes a character and all owned or invalidated room-level dependents. */
export function deleteCharacterCascade(
  state: SNSGodState,
  characterId: string,
): StateDeletionCascadeResult {
  const exists = state.characters.some(character => character.id === characterId)
    || (state.randomChats || []).some(room => (
      room.characterId === characterId || room.character.id === characterId
    ));
  if (!exists) return { state, removedRoomIds: [], cancelledJobRoomIds: [] };
  const directRoomIds = (state.chatRooms[characterId] || []).map(room => room.id);
  const randomRoomIds = (state.randomChats || [])
    .filter(room => room.characterId === characterId || room.character.id === characterId)
    .map(room => room.id);
  const collapsedGroupRoomIds: string[] = [];
  const retainedImpactedGroupRoomIds: string[] = [];
  const groupRooms = (state.groupRooms || []).flatMap(room => {
    if (!room.participantIds.includes(characterId)) return [room];
    const participantIds = room.participantIds.filter(id => id !== characterId);
    if (participantIds.length < 2) {
      collapsedGroupRoomIds.push(room.id);
      return [];
    }
    retainedImpactedGroupRoomIds.push(room.id);
    return [{ ...room, participantIds }];
  });
  const removedRoomIds = unique([...directRoomIds, ...randomRoomIds, ...collapsedGroupRoomIds]);
  const cancelledJobRoomIds = unique([...removedRoomIds, ...retainedImpactedGroupRoomIds]);
  const roomIds = new Set(removedRoomIds);
  const characterIds = new Set([characterId]);
  const next = pruneDeletionDependents({
    ...state,
    characters: state.characters.filter(character => character.id !== characterId),
    chatRooms: Object.fromEntries(
      Object.entries(state.chatRooms || {}).filter(([id]) => id !== characterId),
    ),
    groupRooms,
    randomChats: (state.randomChats || []).filter(room => (
      room.characterId !== characterId && room.character.id !== characterId
    )),
  }, {
    roomIds,
    characterIds,
    cancelledJobRoomIds: new Set(cancelledJobRoomIds),
  });
  return { state: next, removedRoomIds, cancelledJobRoomIds };
}

function latestUserMessageId(messages: readonly SNSGodMessage[]): string | undefined {
  return [...messages].reverse().find(message => message.role === 'user')?.id;
}

/** Deletes one message and cancels work only when it owned the latest pending reply. */
export function deleteMessageCascade(
  state: SNSGodState,
  roomId: string,
  messageId: string,
): StateDeletionCascadeResult {
  const roomMessages = state.messages[roomId] || [];
  const target = roomMessages.find(message => message.id === messageId);
  if (!target) return { state, removedRoomIds: [], cancelledJobRoomIds: [] };
  const cancelPendingReply = target.role === 'user'
    && latestUserMessageId(roomMessages) === target.id
    && Boolean(state.pendingReplies?.[roomId]);
  const meetingId = typeof target.meetingEventId === 'string' ? target.meetingEventId : undefined;
  const meetingEventSessions = meetingId ? (state.meetingEventSessions || []).filter(session => (
    session.id !== meetingId || session.status === 'active' || session.status === 'ended'
  )) : state.meetingEventSessions;
  const retainedMeetingIds = new Set((meetingEventSessions || []).map(session => session.id));
  const pendingReplies = cancelPendingReply
    ? deleteRecordKeys(state.pendingReplies, new Set([roomId]))
    : state.pendingReplies;
  return {
    state: {
      ...state,
      messages: {
        ...state.messages,
        [roomId]: roomMessages.filter(message => message.id !== messageId),
      },
      pendingReplies,
      meetingEventSessions,
      activeMeetingEventId: state.activeMeetingEventId
        && retainedMeetingIds.has(state.activeMeetingEventId)
        ? state.activeMeetingEventId
        : undefined,
    },
    removedRoomIds: [],
    cancelledJobRoomIds: cancelPendingReply ? [roomId] : [],
  };
}

/** Deletes an SNS post together with its derived DM and notification records. */
export function deleteSnsPostCascade(
  state: SNSGodState,
  postId: string,
): StateDeletionCascadeResult {
  if (!(state.snsPosts || []).some(post => post.id === postId)) {
    return { state, removedRoomIds: [], cancelledJobRoomIds: [] };
  }
  return {
    state: pruneDeletionDependents(state, { postIds: new Set([postId]) }),
    removedRoomIds: [],
    cancelledJobRoomIds: [],
  };
}

/** Deletes one SNS DM thread and its embedded post copy when present. */
export function deleteSnsDmThreadCascade(
  state: SNSGodState,
  threadId: string,
): StateDeletionCascadeResult {
  const thread = (state.snsDmThreads || []).find(item => item.id === threadId);
  if (!thread) return { state, removedRoomIds: [], cancelledJobRoomIds: [] };
  const snsPosts = (state.snsPosts || []).map(post => {
    if (post.id !== thread.postId || !post.dms?.length) return post;
    return {
      ...post,
      dms: post.dms.filter((dm, index) => {
        const generatedId = `postdmthread:${post.id}:${dm.id || index}`;
        return generatedId !== threadId && dm.id !== threadId;
      }),
    };
  });
  return {
    state: pruneDeletionDependents(
      { ...state, snsPosts },
      { threadIds: new Set([threadId]) },
    ),
    removedRoomIds: [],
    cancelledJobRoomIds: [],
  };
}
