import type {
  DatingAppProfile,
  SNSGodCharacter,
  SNSGodState,
  Sticker,
} from '../types';

export type StateMediaUriReplacement = {
  dataUri: string;
  fileUri: string;
};

export type StateMediaExternalizationTarget = {
  dataUri: string;
  hint: string;
  force: boolean;
};

/** One persisted state field that currently points at a media URI. */
export type StateMediaReference = {
  /** Stable logical path used for diagnostics and duplicate-reference counts. */
  key: string;
  /** URI stored in the state field. */
  uri: string;
  /** Whether persistence must externalize this reference regardless of size. */
  force: boolean;
};

export type StateMediaReplacementCache = {
  add(replacements: readonly StateMediaUriReplacement[], now: number): void;
  active(now: number, referencedUris?: ReadonlySet<string>): StateMediaUriReplacement[];
  clear(): void;
  retainedDataUriCharacters(): number;
};

export function createStateMediaReplacementCache(options: {
  ttlMs: number;
  maxEntries: number;
  maxDataUriCharacters: number;
}): StateMediaReplacementCache {
  const entries = new Map<string, { fileUri: string; expiresAt: number }>();

  const prune = (now: number, referencedUris?: ReadonlySet<string>): void => {
    for (const [dataUri, entry] of entries) {
      if (entry.expiresAt <= now || (referencedUris && !referencedUris.has(entry.fileUri))) {
        entries.delete(dataUri);
      }
    }
    let retainedCharacters = [...entries.keys()].reduce((total, dataUri) => total + dataUri.length, 0);
    while (
      entries.size > options.maxEntries
      || retainedCharacters > options.maxDataUriCharacters
    ) {
      const oldestDataUri = entries.keys().next().value as string | undefined;
      if (!oldestDataUri) break;
      retainedCharacters -= oldestDataUri.length;
      entries.delete(oldestDataUri);
    }
  };

  return {
    add(replacements, now) {
      prune(now);
      for (const replacement of replacements) {
        if (replacement.dataUri.length > options.maxDataUriCharacters) continue;
        entries.delete(replacement.dataUri);
        entries.set(replacement.dataUri, {
          fileUri: replacement.fileUri,
          expiresAt: now + options.ttlMs,
        });
      }
      prune(now);
    },
    active(now, referencedUris) {
      prune(now, referencedUris);
      return [...entries].map(([dataUri, entry]) => ({
        dataUri,
        fileUri: entry.fileUri,
      }));
    },
    clear() {
      entries.clear();
    },
    retainedDataUriCharacters() {
      return [...entries.keys()].reduce((total, dataUri) => total + dataUri.length, 0);
    },
  };
}

function replaceStickerMedia(
  sticker: Sticker,
  replace: (value: string | undefined) => string | undefined,
): Sticker {
  return {
    ...sticker,
    data: replace(sticker.data),
    mediaData: replace(sticker.mediaData),
  };
}

function replaceCharacterMedia(
  character: SNSGodCharacter,
  replace: (value: string | undefined) => string | undefined,
): SNSGodCharacter {
  return {
    ...character,
    avatar: replace(character.avatar),
    profileImage: replace(character.profileImage),
    coverImage: replace(character.coverImage),
    profileReferenceImage: replace(character.profileReferenceImage),
    profileReferenceImages: character.profileReferenceImages?.map(image => replace(image) ?? image),
    profileImageHistory: character.profileImageHistory?.map(item => ({
      ...item,
      image: replace(item.image) ?? item.image,
    })),
    stickers: character.stickers?.map(sticker => replaceStickerMedia(sticker, replace)),
  };
}

function replaceDatingAppProfileMedia(
  profile: DatingAppProfile,
  replace: (value: string | undefined) => string | undefined,
): DatingAppProfile {
  return {
    ...profile,
    photos: (profile.photos || []).map(photo => ({
      ...photo,
      uri: replace(photo.uri),
    })),
  };
}

type StateMediaVisitor = (value: string | undefined, hint: string, force?: boolean) => void;

function visitStateMediaValues(state: SNSGodState, visit: StateMediaVisitor): void {
  const addSticker = (sticker: Sticker, prefix: string): void => {
    visit(sticker.data, `${prefix}_${sticker.id}_data`);
    visit(sticker.mediaData, `${prefix}_${sticker.id}_media`);
  };
  const addCharacter = (character: SNSGodCharacter, prefix = character.id): void => {
    visit(character.avatar, `${prefix}_avatar`);
    visit(character.profileImage, `${prefix}_profile`);
    visit(character.coverImage, `${prefix}_cover`);
    visit(character.profileReferenceImage, `${prefix}_ref`);
    character.profileReferenceImages?.forEach((image, index) => visit(image, `${prefix}_ref_${index + 1}`));
    character.profileImageHistory?.forEach(item => visit(
      item.image,
      `${prefix}_${item.kind || 'history'}_${item.id}`,
    ));
    character.stickers?.forEach(sticker => addSticker(sticker, `${prefix}_sticker`));
  };
  const addDatingProfile = (profile: DatingAppProfile): void => {
    profile.photos?.forEach(photo => visit(photo.uri, `dating_app_${profile.id}_${photo.id}`));
  };

  state.characters.forEach(character => addCharacter(character));
  state.randomCharacters?.forEach(character => addCharacter(character, `random_character_${character.id}`));
  state.randomChats?.forEach(room => addCharacter(room.character, `random_chat_${room.id}_${room.character.id}`));
  Object.entries(state.messages || {}).forEach(([roomId, messages]) => {
    (Array.isArray(messages) ? messages : []).forEach(message => visit(
      message.mediaData,
      `${roomId}_${message.id}`,
    ));
  });
  state.userStickers?.forEach(sticker => addSticker(sticker, 'sticker'));
  state.snsPosts?.forEach(post => {
    visit(post.image, `sns_${post.id}`);
    post.dms?.forEach((dm, dmIndex) => dm.participants?.forEach(participant => visit(
      participant.avatar,
      `sns_${post.id}_dm_${dm.id || dmIndex}_${participant.id}`,
    )));
  });
  state.snsDmThreads?.forEach(thread => thread.participants?.forEach(participant => visit(
    participant.avatar,
    `sns_dm_${thread.id}_${participant.id}`,
  )));
  state.referenceFaceSlots?.forEach(slot => visit(
    slot.image,
    `reference_face_${slot.id}`,
    true,
  ));
  state.meetingEventSessions?.forEach(session => visit(session.stillImage, `meeting_${session.id}`));
  state.blindDate?.sessions?.forEach(session => session.candidates?.forEach(candidate => {
    visit(candidate.profileImageUri, `blind_date_${candidate.id}`);
    visit(candidate.faceReferenceImage, `blind_date_ref_${candidate.id}`, true);
  }));
  state.blindDate?.archives?.forEach(archive => {
    visit(archive.candidate.profileImageUri, `blind_date_${archive.candidate.id}`);
    visit(archive.candidate.faceReferenceImage, `blind_date_ref_${archive.candidate.id}`, true);
  });
  state.datingApp?.profiles?.forEach(addDatingProfile);
  if (state.datingApp?.currentProfile) addDatingProfile(state.datingApp.currentProfile);
  state.datingApp?.history?.forEach(item => addDatingProfile(item.finalProfile));
}

/** Returns each distinct data URI that persistence is responsible for externalizing. */
export function collectStateMediaExternalizationTargets(
  state: SNSGodState,
): StateMediaExternalizationTarget[] {
  const targets = new Map<string, StateMediaExternalizationTarget>();
  visitStateMediaValues(state, (value, hint, force = false) => {
    if (!value?.startsWith('data:')) return;
    const existing = targets.get(value);
    if (existing) {
      if (force && !existing.force) targets.set(value, { ...existing, force: true });
      return;
    }
    targets.set(value, { dataUri: value, hint, force });
  });
  return [...targets.values()];
}

/**
 * Returns every known state-to-media edge without deduplicating shared URIs.
 *
 * GC uses the full edge list so one remaining owner protects a shared asset and
 * diagnostics can report how many independent fields still reference it.
 */
export function collectStateMediaReferences(state: SNSGodState): StateMediaReference[] {
  const references: StateMediaReference[] = [];
  visitStateMediaValues(state, (value, key, force = false) => {
    if (!value) return;
    references.push({ key, uri: value, force });
  });
  return references;
}

/** Returns the distinct URIs currently referenced by known media-bearing state fields. */
export function collectStateMediaUris(state: SNSGodState): Set<string> {
  return new Set(collectStateMediaReferences(state).map(reference => reference.uri));
}

/**
 * Applies completed media writes to the newest in-memory state without replacing
 * unrelated state that may have changed while persistence was in progress.
 */
export function applyStateMediaUriReplacements(
  state: SNSGodState,
  replacements: readonly StateMediaUriReplacement[],
): SNSGodState {
  if (!replacements.length) return state;
  const replacementMap = new Map<string, string>();
  for (const replacement of replacements) {
    const existing = replacementMap.get(replacement.dataUri);
    if (existing && existing !== replacement.fileUri) {
      throw new Error('Conflicting canonical URI replacements for one data URI.');
    }
    replacementMap.set(replacement.dataUri, replacement.fileUri);
  }

  let changed = false;
  const replace = (value: string | undefined): string | undefined => {
    if (value === undefined) return value;
    const next = replacementMap.get(value);
    if (!next || next === value) return value;
    changed = true;
    return next;
  };

  const characters = state.characters.map(character => replaceCharacterMedia(character, replace));
  const randomCharacters = state.randomCharacters?.map(character => replaceCharacterMedia(character, replace));
  const randomChats = state.randomChats?.map(room => ({
    ...room,
    character: replaceCharacterMedia(room.character, replace),
  }));
  const messages = Object.fromEntries(Object.entries(state.messages || {}).map(([roomId, roomMessages]) => [
    roomId,
    (Array.isArray(roomMessages) ? roomMessages : []).map(message => ({
      ...message,
      mediaData: replace(message.mediaData),
    })),
  ]));
  const userStickers = state.userStickers?.map(sticker => replaceStickerMedia(sticker, replace));
  const snsPosts = state.snsPosts?.map(post => ({
    ...post,
    image: replace(post.image),
    dms: post.dms?.map(dm => ({
      ...dm,
      participants: dm.participants?.map(participant => ({
        ...participant,
        avatar: replace(participant.avatar),
      })),
    })),
  }));
  const snsDmThreads = state.snsDmThreads?.map(thread => ({
    ...thread,
    participants: thread.participants?.map(participant => ({
      ...participant,
      avatar: replace(participant.avatar),
    })),
  }));
  const referenceFaceSlots = state.referenceFaceSlots?.map(slot => ({
    ...slot,
    image: replace(slot.image) ?? slot.image,
  }));
  const meetingEventSessions = state.meetingEventSessions?.map(session => ({
    ...session,
    stillImage: replace(session.stillImage),
  }));

  const blindDate = state.blindDate ? {
    ...state.blindDate,
    sessions: (state.blindDate.sessions || []).map(session => ({
      ...session,
      candidates: (session.candidates || []).map(candidate => ({
        ...candidate,
        profileImageUri: replace(candidate.profileImageUri),
        faceReferenceImage: replace(candidate.faceReferenceImage),
      })),
    })),
    archives: (state.blindDate.archives || []).map(archive => ({
      ...archive,
      candidate: {
        ...archive.candidate,
        profileImageUri: replace(archive.candidate.profileImageUri),
        faceReferenceImage: replace(archive.candidate.faceReferenceImage),
      },
    })),
  } : state.blindDate;

  const datingApp = state.datingApp ? {
    ...state.datingApp,
    profiles: (state.datingApp.profiles || []).map(profile => replaceDatingAppProfileMedia(profile, replace)),
    currentProfile: state.datingApp.currentProfile
      ? replaceDatingAppProfileMedia(state.datingApp.currentProfile, replace)
      : state.datingApp.currentProfile,
    history: (state.datingApp.history || []).map(item => ({
      ...item,
      finalProfile: replaceDatingAppProfileMedia(item.finalProfile, replace),
    })),
  } : state.datingApp;

  if (!changed) return state;
  return {
    ...state,
    characters,
    randomCharacters,
    randomChats,
    messages,
    userStickers,
    snsPosts,
    snsDmThreads,
    referenceFaceSlots,
    meetingEventSessions,
    blindDate,
    datingApp,
  };
}
