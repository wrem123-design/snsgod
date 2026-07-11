import type { MediaAlbumAsset, MediaAlbumReference } from './mediaAlbum';
import type {
  DatingAppProfile,
  MediaAlbumTrashRecord,
  SNSGodCharacter,
  SNSGodState,
} from '../types';

export type MediaAlbumUnlinkResult = {
  state: SNSGodState;
  removedReferences: MediaAlbumReference[];
  missingReferenceIds: string[];
};

function removeCharacterReferences(
  character: SNSGodCharacter,
  prefix: string,
  uri: string,
  targets: ReadonlySet<string>,
  removed: Set<string>,
): SNSGodCharacter {
  const remove = (id: string, value: string | undefined): boolean => {
    if (!targets.has(id) || value !== uri) return false;
    removed.add(id);
    return true;
  };
  return {
    ...character,
    avatar: remove(`${prefix}:avatar`, character.avatar) ? undefined : character.avatar,
    profileImage: remove(`${prefix}:profile`, character.profileImage) ? undefined : character.profileImage,
    coverImage: remove(`${prefix}:cover`, character.coverImage) ? undefined : character.coverImage,
    profileReferenceImage: remove(`${prefix}:reference:primary`, character.profileReferenceImage) ? undefined : character.profileReferenceImage,
    profileReferenceImages: (character.profileReferenceImages || []).filter((value, index) => (
      !remove(`${prefix}:reference:${index}`, value)
    )),
    profileImageHistory: (character.profileImageHistory || []).filter(history => (
      !remove(`${prefix}:history:${history.id}`, history.image)
    )),
  };
}

/** Removes only the requested state-to-asset edges and leaves every shared owner intact. */
export function unlinkMediaAlbumReferences(
  state: SNSGodState,
  asset: MediaAlbumAsset,
  referenceIds: readonly string[],
): MediaAlbumUnlinkResult {
  const targets = new Set(referenceIds);
  const removed = new Set<string>();
  const remove = (id: string, value: string | undefined): boolean => {
    if (!targets.has(id) || value !== asset.uri) return false;
    removed.add(id);
    return true;
  };
  const characters = state.characters.map(character => removeCharacterReferences(character, character.id, asset.uri, targets, removed));
  const randomCharacters = state.randomCharacters?.map(character => removeCharacterReferences(
    character, `random-character:${character.id}`, asset.uri, targets, removed,
  ));
  const randomChats = state.randomChats?.map(room => ({
    ...room,
    character: removeCharacterReferences(
      room.character, `random-room:${room.id}:${room.character.id}`, asset.uri, targets, removed,
    ),
  }));
  const messages = Object.fromEntries(Object.entries(state.messages || {}).map(([roomId, roomMessages]) => [
    roomId,
    roomMessages.map(message => remove(`message:${roomId}:${message.id}`, message.mediaData) ? {
      ...message,
      mediaData: undefined,
      mediaType: undefined,
      imagePrompt: undefined,
      imageCaption: undefined,
    } : message),
  ]));
  const snsPosts = (state.snsPosts || []).map(post => remove(`sns:${post.id}`, post.image) ? {
    ...post,
    image: undefined,
    imagePrompt: undefined,
    imageCaption: undefined,
  } : post);
  const referenceFaceSlots = (state.referenceFaceSlots || []).map(slot => (
    remove(`reference:${slot.id}`, slot.image) ? { ...slot, image: '' } : slot
  ));
  const meetingEventSessions = (state.meetingEventSessions || []).map(session => (
    remove(`meeting:${session.id}`, session.stillImage)
      ? { ...session, stillImage: undefined, stillPrompt: undefined }
      : session
  ));
  const blindDate = state.blindDate ? {
    ...state.blindDate,
    sessions: state.blindDate.sessions.map(session => ({
      ...session,
      candidates: session.candidates.map(candidate => ({
        ...candidate,
        profileImageUri: remove(`blind:${session.id}:${candidate.id}:profile`, candidate.profileImageUri) ? undefined : candidate.profileImageUri,
        faceReferenceImage: remove(`blind:${session.id}:${candidate.id}:reference`, candidate.faceReferenceImage) ? undefined : candidate.faceReferenceImage,
      })),
    })),
    archives: (state.blindDate.archives || []).map(archive => ({
      ...archive,
      candidate: {
        ...archive.candidate,
        profileImageUri: remove(`blind-archive:${archive.id}:${archive.candidate.id}:profile`, archive.candidate.profileImageUri) ? undefined : archive.candidate.profileImageUri,
        faceReferenceImage: remove(`blind-archive:${archive.id}:${archive.candidate.id}:reference`, archive.candidate.faceReferenceImage) ? undefined : archive.candidate.faceReferenceImage,
      },
    })),
  } : state.blindDate;
  const removeDatingProfile = (profile: DatingAppProfile, prefix: string): DatingAppProfile => ({
    ...profile,
    photos: profile.photos.map(photo => (
      remove(`${prefix}:${photo.id}`, photo.uri) ? { ...photo, uri: undefined } : photo
    )),
  });
  const datingApp = state.datingApp ? {
    ...state.datingApp,
    profiles: (state.datingApp.profiles || []).map(profile => removeDatingProfile(profile, `dating:${profile.id}`)),
    currentProfile: state.datingApp.currentProfile
      ? removeDatingProfile(state.datingApp.currentProfile, `dating-current:${state.datingApp.currentProfile.id}`)
      : state.datingApp.currentProfile,
    history: (state.datingApp.history || []).map(history => ({
      ...history,
      finalProfile: removeDatingProfile(history.finalProfile, `dating-history:${history.id}:${history.finalProfile.id}`),
    })),
  } : state.datingApp;
  const removedReferences = asset.references.filter(reference => removed.has(reference.id));
  const missingReferenceIds = referenceIds.filter(id => !removed.has(id));
  if (!removed.size) return { state, removedReferences, missingReferenceIds };
  return {
    state: {
      ...state,
      characters,
      randomCharacters,
      randomChats,
      messages,
      snsPosts,
      referenceFaceSlots,
      meetingEventSessions,
      blindDate,
      datingApp,
    },
    removedReferences,
    missingReferenceIds,
  };
}

export function trashMediaAlbumAssets(
  state: SNSGodState,
  assets: readonly MediaAlbumAsset[],
  options: { now: number; managedMediaIds?: Readonly<Record<string, string>> },
): { state: SNSGodState; records: MediaAlbumTrashRecord[]; missingReferenceIds: string[] } {
  let next = state;
  const records: MediaAlbumTrashRecord[] = [];
  const missingReferenceIds: string[] = [];
  const seenUris = new Set<string>();
  for (const asset of assets) {
    if (seenUris.has(asset.uri) || (next.mediaAlbumTrash || []).some(record => record.uri === asset.uri)) continue;
    seenUris.add(asset.uri);
    const result = unlinkMediaAlbumReferences(next, asset, asset.references.map(reference => reference.id));
    next = result.state;
    missingReferenceIds.push(...result.missingReferenceIds);
    if (!result.removedReferences.length) continue;
    const record: MediaAlbumTrashRecord = {
      id: `album_trash_${asset.id}_${options.now}_${records.length}`,
      assetId: asset.id,
      uri: asset.uri,
      title: asset.title,
      sourceLabel: asset.sourceLabel,
      trashedAt: options.now,
      favorite: asset.favorite,
      references: result.removedReferences,
      managedMediaId: options.managedMediaIds?.[asset.uri],
    };
    records.push(record);
    next = {
      ...next,
      mediaAlbumTrash: [...(next.mediaAlbumTrash || []), record],
      mediaAlbumFavoriteUris: (next.mediaAlbumFavoriteUris || []).filter(uri => uri !== asset.uri),
    };
  }
  return { state: next, records, missingReferenceIds };
}

function restoreCharacterReferences(
  character: SNSGodCharacter,
  prefix: string,
  record: MediaAlbumTrashRecord,
  restored: Set<string>,
): SNSGodCharacter {
  const references = new Map(record.references.map(reference => [reference.id, reference]));
  const restoreScalar = (id: string, current: string | undefined): string | undefined => {
    if (!references.has(id)) return current;
    if (current && current !== record.uri) return current;
    restored.add(id);
    return record.uri;
  };
  let profileReferenceImages = [...(character.profileReferenceImages || [])];
  for (const reference of record.references) {
    if (!reference.id.startsWith(`${prefix}:reference:`) || reference.id === `${prefix}:reference:primary`) continue;
    if (!profileReferenceImages.includes(record.uri)) profileReferenceImages.push(record.uri);
    restored.add(reference.id);
  }
  let profileImageHistory = [...(character.profileImageHistory || [])];
  for (const reference of record.references) {
    if (!reference.id.startsWith(`${prefix}:history:`)) continue;
    if (!profileImageHistory.some(item => item.id === reference.ownerId)) {
      profileImageHistory.push({
        id: reference.ownerId,
        image: record.uri,
        prompt: reference.prompt,
        createdAt: reference.createdAt,
        kind: reference.sourceLabel.includes('커버') ? 'cover' : 'profile',
      });
    }
    restored.add(reference.id);
  }
  return {
    ...character,
    avatar: restoreScalar(`${prefix}:avatar`, character.avatar),
    profileImage: restoreScalar(`${prefix}:profile`, character.profileImage),
    coverImage: restoreScalar(`${prefix}:cover`, character.coverImage),
    profileReferenceImage: restoreScalar(`${prefix}:reference:primary`, character.profileReferenceImage),
    profileReferenceImages: profileReferenceImages.slice(0, 3),
    profileImageHistory: profileImageHistory.sort((left, right) => right.createdAt - left.createdAt).slice(0, 60),
  };
}

/** Restores only empty/original owners and keeps conflicting newer values unresolved in trash. */
export function restoreMediaAlbumTrashRecord(
  state: SNSGodState,
  recordId: string,
): { state: SNSGodState; restoredReferenceIds: string[]; skippedReferenceIds: string[] } {
  const record = (state.mediaAlbumTrash || []).find(item => item.id === recordId);
  if (!record) return { state, restoredReferenceIds: [], skippedReferenceIds: [] };
  const restored = new Set<string>();
  const references = new Map(record.references.map(reference => [reference.id, reference]));
  const restoreScalar = (id: string, current: string | undefined): string | undefined => {
    if (!references.has(id)) return current;
    if (current && current !== record.uri) return current;
    restored.add(id);
    return record.uri;
  };
  const characters = state.characters.map(character => restoreCharacterReferences(character, character.id, record, restored));
  const randomCharacters = state.randomCharacters?.map(character => restoreCharacterReferences(character, `random-character:${character.id}`, record, restored));
  const randomChats = state.randomChats?.map(room => ({
    ...room,
    character: restoreCharacterReferences(room.character, `random-room:${room.id}:${room.character.id}`, record, restored),
  }));
  const messages = Object.fromEntries(Object.entries(state.messages || {}).map(([roomId, roomMessages]) => [
    roomId,
    roomMessages.map(message => {
      const id = `message:${roomId}:${message.id}`;
      const reference = references.get(id);
      if (!reference || (message.mediaData && message.mediaData !== record.uri)) return message;
      restored.add(id);
      return { ...message, mediaData: record.uri, mediaType: 'image' as const, imagePrompt: reference.prompt, imageCaption: reference.caption };
    }),
  ]));
  const snsPosts = (state.snsPosts || []).map(post => {
    const id = `sns:${post.id}`;
    const reference = references.get(id);
    if (!reference || (post.image && post.image !== record.uri)) return post;
    restored.add(id);
    return { ...post, image: record.uri, imagePrompt: reference.prompt, imageCaption: reference.caption };
  });
  const referenceFaceSlots = (state.referenceFaceSlots || []).map(slot => ({
    ...slot,
    image: restoreScalar(`reference:${slot.id}`, slot.image) || '',
  }));
  const meetingEventSessions = (state.meetingEventSessions || []).map(session => {
    const id = `meeting:${session.id}`;
    const reference = references.get(id);
    if (!reference || (session.stillImage && session.stillImage !== record.uri)) return session;
    restored.add(id);
    return { ...session, stillImage: record.uri, stillPrompt: reference.prompt };
  });
  const blindDate = state.blindDate ? {
    ...state.blindDate,
    sessions: state.blindDate.sessions.map(session => ({
      ...session,
      candidates: session.candidates.map(candidate => ({
        ...candidate,
        profileImageUri: restoreScalar(`blind:${session.id}:${candidate.id}:profile`, candidate.profileImageUri),
        faceReferenceImage: restoreScalar(`blind:${session.id}:${candidate.id}:reference`, candidate.faceReferenceImage),
      })),
    })),
    archives: (state.blindDate.archives || []).map(archive => ({
      ...archive,
      candidate: {
        ...archive.candidate,
        profileImageUri: restoreScalar(`blind-archive:${archive.id}:${archive.candidate.id}:profile`, archive.candidate.profileImageUri),
        faceReferenceImage: restoreScalar(`blind-archive:${archive.id}:${archive.candidate.id}:reference`, archive.candidate.faceReferenceImage),
      },
    })),
  } : state.blindDate;
  const restoreDatingProfile = (profile: DatingAppProfile, prefix: string): DatingAppProfile => ({
    ...profile,
    photos: profile.photos.map(photo => ({
      ...photo,
      uri: restoreScalar(`${prefix}:${photo.id}`, photo.uri),
    })),
  });
  const datingApp = state.datingApp ? {
    ...state.datingApp,
    profiles: (state.datingApp.profiles || []).map(profile => restoreDatingProfile(profile, `dating:${profile.id}`)),
    currentProfile: state.datingApp.currentProfile
      ? restoreDatingProfile(state.datingApp.currentProfile, `dating-current:${state.datingApp.currentProfile.id}`)
      : state.datingApp.currentProfile,
    history: (state.datingApp.history || []).map(history => ({
      ...history,
      finalProfile: restoreDatingProfile(history.finalProfile, `dating-history:${history.id}:${history.finalProfile.id}`),
    })),
  } : state.datingApp;
  const restoredReferenceIds = record.references.filter(reference => restored.has(reference.id)).map(reference => reference.id);
  const skippedReferences = record.references.filter(reference => !restored.has(reference.id));
  const mediaAlbumTrash = skippedReferences.length
    ? (state.mediaAlbumTrash || []).map(item => item.id === record.id ? { ...item, references: skippedReferences, managedMediaId: undefined } : item)
    : (state.mediaAlbumTrash || []).filter(item => item.id !== record.id);
  const mediaAlbumFavoriteUris = record.favorite && restoredReferenceIds.length
    ? [...new Set([...(state.mediaAlbumFavoriteUris || []), record.uri])]
    : state.mediaAlbumFavoriteUris;
  return {
    state: {
      ...state,
      characters,
      randomCharacters,
      randomChats,
      messages,
      snsPosts,
      referenceFaceSlots,
      meetingEventSessions,
      blindDate,
      datingApp,
      mediaAlbumTrash,
      mediaAlbumFavoriteUris,
    },
    restoredReferenceIds,
    skippedReferenceIds: skippedReferences.map(reference => reference.id),
  };
}
