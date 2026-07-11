import type {
  BlindDateCandidate,
  DatingAppProfile,
  SNSGodCharacter,
  SNSGodState,
} from '../types';

export type MediaAlbumSource =
  | 'profile'
  | 'cover'
  | 'profile_history'
  | 'character_reference'
  | 'chat'
  | 'sns'
  | 'reference'
  | 'meeting'
  | 'blind_date'
  | 'dating_app';

export type MediaAlbumReference = {
  id: string;
  source: MediaAlbumSource;
  sourceLabel: string;
  ownerId: string;
  title: string;
  createdAt: number;
  generated: boolean;
  characterId?: string;
  roomId?: string;
  prompt?: string;
  caption?: string;
};

export type MediaAlbumAsset = {
  id: string;
  uri: string;
  title: string;
  sourceLabel: string;
  createdAt: number;
  prompt?: string;
  caption?: string;
  favorite: boolean;
  references: MediaAlbumReference[];
  characterIds: string[];
  roomIds: string[];
  sources: MediaAlbumSource[];
};

export type MediaAlbumFilter = {
  characterId?: string;
  roomId?: string;
  source?: MediaAlbumSource;
  origin?: 'generated' | 'manual';
  favoriteOnly?: boolean;
  dateFrom?: number;
  dateTo?: number;
};

function renderableImageUri(value: string | undefined): value is string {
  return Boolean(value && /^(data:|file:|content:|asset:|https?:\/\/)/i.test(value) && value.trim().length > 0);
}

function stableUriHash(uri: string): string {
  const canonical = uri.match(/(?:^|\/)asset_([a-f0-9]{64})(?:\.|$)/i)?.[1];
  if (canonical) return `asset_${canonical.toLowerCase()}`;
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < uri.length; index += 1) {
    const code = uri.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ (code + index), 0x85ebca6b);
  }
  return `uri_${(first >>> 0).toString(16).padStart(8, '0')}_${(second >>> 0).toString(16).padStart(8, '0')}_${uri.length}`;
}

function compact(value: unknown): string | undefined {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text || undefined;
}

/** Builds the complete album read model without treating favorites as ownership references. */
export function collectMediaAlbumAssets(state: SNSGodState): MediaAlbumAsset[] {
  const assets = new Map<string, MediaAlbumAsset>();
  const favoriteUris = new Set(state.mediaAlbumFavoriteUris || []);
  const characterNames = new Map(state.characters.map(character => [character.id, character.name]));
  const roomNames = new Map<string, string>();
  Object.values(state.chatRooms || {}).flat().forEach(room => roomNames.set(room.id, room.name));
  (state.groupRooms || []).forEach(room => roomNames.set(room.id, room.name));
  (state.randomChats || []).forEach(room => roomNames.set(room.id, room.name));

  const add = (uri: string | undefined, reference: MediaAlbumReference): void => {
    if (!renderableImageUri(uri)) return;
    const existing = assets.get(uri);
    if (existing) {
      if (!existing.references.some(item => item.id === reference.id)) existing.references.push(reference);
      if (reference.createdAt >= existing.createdAt) {
        existing.createdAt = reference.createdAt;
        existing.title = reference.title;
        existing.sourceLabel = reference.sourceLabel;
      }
      existing.prompt ||= reference.prompt;
      existing.caption ||= reference.caption;
      if (reference.characterId && !existing.characterIds.includes(reference.characterId)) existing.characterIds.push(reference.characterId);
      if (reference.roomId && !existing.roomIds.includes(reference.roomId)) existing.roomIds.push(reference.roomId);
      if (!existing.sources.includes(reference.source)) existing.sources.push(reference.source);
      return;
    }
    assets.set(uri, {
      id: stableUriHash(uri),
      uri,
      title: reference.title,
      sourceLabel: reference.sourceLabel,
      createdAt: reference.createdAt,
      prompt: reference.prompt,
      caption: reference.caption,
      favorite: favoriteUris.has(uri),
      references: [reference],
      characterIds: reference.characterId ? [reference.characterId] : [],
      roomIds: reference.roomId ? [reference.roomId] : [],
      sources: [reference.source],
    });
  };

  const addCharacter = (character: SNSGodCharacter, ownerPrefix = character.id): void => {
    const profilePrompt = compact(character.profileAvatarPrompt);
    const coverPrompt = compact(character.profileCoverPrompt);
    const profileCreatedAt = Number(character.lastProfilePhotoChangeAt || 0);
    const coverCreatedAt = Number(character.lastCoverPhotoChangeAt || 0);
    add(character.avatar, {
      id: `${ownerPrefix}:avatar`, source: 'profile', sourceLabel: '프로필', ownerId: ownerPrefix,
      title: character.name, createdAt: profileCreatedAt, generated: Boolean(profilePrompt), characterId: character.id, prompt: profilePrompt,
    });
    add(character.profileImage, {
      id: `${ownerPrefix}:profile`, source: 'profile', sourceLabel: '프로필', ownerId: ownerPrefix,
      title: character.name, createdAt: profileCreatedAt, generated: Boolean(profilePrompt), characterId: character.id, prompt: profilePrompt,
    });
    add(character.coverImage, {
      id: `${ownerPrefix}:cover`, source: 'cover', sourceLabel: '커버', ownerId: ownerPrefix,
      title: character.name, createdAt: coverCreatedAt, generated: Boolean(coverPrompt), characterId: character.id, prompt: coverPrompt,
    });
    add(character.profileReferenceImage, {
      id: `${ownerPrefix}:reference:primary`, source: 'character_reference', sourceLabel: '캐릭터 레퍼런스', ownerId: ownerPrefix,
      title: character.name, createdAt: 0, generated: false, characterId: character.id,
    });
    (character.profileReferenceImages || []).forEach((uri, index) => add(uri, {
      id: `${ownerPrefix}:reference:${index}`, source: 'character_reference', sourceLabel: '캐릭터 레퍼런스', ownerId: ownerPrefix,
      title: character.name, createdAt: 0, generated: false, characterId: character.id,
    }));
    (character.profileImageHistory || []).forEach(history => add(history.image, {
      id: `${ownerPrefix}:history:${history.id}`, source: 'profile_history', sourceLabel: history.kind === 'cover' ? '커버 기록' : '프로필 기록', ownerId: history.id,
      title: character.name, createdAt: Number(history.createdAt || 0), generated: Boolean(compact(history.prompt)), characterId: character.id, prompt: compact(history.prompt),
    }));
  };

  state.characters.forEach(character => addCharacter(character));
  (state.randomCharacters || []).forEach(character => addCharacter(character, `random-character:${character.id}`));
  (state.randomChats || []).forEach(room => addCharacter(room.character, `random-room:${room.id}:${room.character.id}`));

  Object.entries(state.messages || {}).forEach(([roomId, messages]) => {
    (messages || []).forEach(message => {
      const characterName = message.characterId ? characterNames.get(message.characterId) : undefined;
      const title = message.role === 'user' ? '내가 보낸 사진' : characterName || roomNames.get(roomId) || '채팅 이미지';
      const prompt = compact(message.imagePrompt);
      add(typeof message.mediaData === 'string' ? message.mediaData : undefined, {
        id: `message:${roomId}:${message.id}`, source: 'chat', sourceLabel: message.role === 'user' ? '내 사진' : '채팅', ownerId: message.id,
        title, createdAt: Number(message.createdAt || 0), generated: Boolean(prompt), characterId: message.characterId, roomId, prompt, caption: compact(message.imageCaption),
      });
    });
  });

  (state.snsPosts || []).forEach(post => {
    const prompt = compact(post.imagePrompt);
    add(post.image, {
      id: `sns:${post.id}`, source: 'sns', sourceLabel: post.platform === 'instagram' ? 'Instagram' : 'X', ownerId: post.id,
      title: characterNames.get(post.characterId) || post.displayName || 'SNS', createdAt: Number(post.createdAt || 0), generated: Boolean(prompt), characterId: post.characterId, roomId: post.generationRoomId, prompt, caption: compact(post.imageCaption),
    });
  });

  (state.referenceFaceSlots || []).forEach(slot => add(slot.image, {
    id: `reference:${slot.id}`, source: 'reference', sourceLabel: '레퍼런스', ownerId: slot.id,
    title: slot.name || '레퍼런스', createdAt: Number(slot.createdAt || 0), generated: false,
  }));

  (state.meetingEventSessions || []).forEach(session => {
    const prompt = compact(session.stillPrompt);
    add(session.stillImage, {
      id: `meeting:${session.id}`, source: 'meeting', sourceLabel: session.mode === 'group' || session.roomType === 'group' ? '단톡 만남' : '만남', ownerId: session.id,
      title: roomNames.get(session.roomId) || characterNames.get(String(session.characterId || session.primaryCharacterId || '')) || '만남 이미지',
      createdAt: Number(session.startedAt || 0), generated: Boolean(prompt), characterId: session.characterId || session.primaryCharacterId, roomId: session.roomId, prompt,
    });
  });

  const addBlindCandidate = (candidate: BlindDateCandidate, ownerPrefix: string, createdAt: number): void => {
    const prompt = compact(candidate.imagePrompt || candidate.internalImagePrompt);
    add(candidate.profileImageUri, {
      id: `${ownerPrefix}:profile`, source: 'blind_date', sourceLabel: '발견', ownerId: candidate.id,
      title: candidate.name, createdAt, generated: Boolean(prompt), prompt,
    });
    add(candidate.faceReferenceImage, {
      id: `${ownerPrefix}:reference`, source: 'blind_date', sourceLabel: '발견 레퍼런스', ownerId: candidate.id,
      title: candidate.name, createdAt, generated: false,
    });
  };
  (state.blindDate?.sessions || []).forEach(session => session.candidates.forEach(candidate => addBlindCandidate(candidate, `blind:${session.id}:${candidate.id}`, Number(session.createdAt || 0))));
  (state.blindDate?.archives || []).forEach(archive => addBlindCandidate(archive.candidate, `blind-archive:${archive.id}:${archive.candidate.id}`, Number(archive.archivedAt || 0)));

  const addDatingProfile = (profile: DatingAppProfile, ownerPrefix: string): void => {
    (profile.photos || []).forEach(photo => {
      const prompt = compact(photo.prompt);
      add(photo.uri, {
        id: `${ownerPrefix}:${photo.id}`, source: 'dating_app', sourceLabel: '데이트 앱', ownerId: photo.id,
        title: profile.name, createdAt: Number(photo.createdAt || profile.createdAt || 0), generated: Boolean(prompt), prompt,
      });
    });
  };
  (state.datingApp?.profiles || []).forEach(profile => addDatingProfile(profile, `dating:${profile.id}`));
  if (state.datingApp?.currentProfile) addDatingProfile(state.datingApp.currentProfile, `dating-current:${state.datingApp.currentProfile.id}`);
  (state.datingApp?.history || []).forEach(history => addDatingProfile(history.finalProfile, `dating-history:${history.id}:${history.finalProfile.id}`));

  return [...assets.values()]
    .map(asset => ({ ...asset, references: asset.references.sort((left, right) => right.createdAt - left.createdAt) }))
    .sort((left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id));
}

export function filterMediaAlbumAssets(assets: readonly MediaAlbumAsset[], filter: MediaAlbumFilter): MediaAlbumAsset[] {
  return assets.filter(asset => {
    if (filter.favoriteOnly && !asset.favorite) return false;
    return asset.references.some(reference => (
      (!filter.characterId || reference.characterId === filter.characterId)
      && (!filter.roomId || reference.roomId === filter.roomId)
      && (!filter.source || reference.source === filter.source)
      && (!filter.origin || (filter.origin === 'generated' ? reference.generated : !reference.generated))
      && (filter.dateFrom === undefined || reference.createdAt >= filter.dateFrom)
      && (filter.dateTo === undefined || reference.createdAt <= filter.dateTo)
    ));
  });
}

export function mediaAlbumFilterActive(filter: MediaAlbumFilter): boolean {
  return Boolean(
    filter.characterId
    || filter.roomId
    || filter.source
    || filter.origin
    || filter.favoriteOnly
    || filter.dateFrom !== undefined
    || filter.dateTo !== undefined,
  );
}

/** Adds or removes one asset URI without duplicating favorites. */
export function toggleMediaAlbumFavorite(state: SNSGodState, uri: string, force?: boolean): SNSGodState {
  const current = [...new Set(state.mediaAlbumFavoriteUris || [])];
  const favorite = current.includes(uri);
  const shouldFavorite = force ?? !favorite;
  const mediaAlbumFavoriteUris = shouldFavorite
    ? favorite ? current : [...current, uri]
    : current.filter(item => item !== uri);
  if (mediaAlbumFavoriteUris.length === current.length && mediaAlbumFavoriteUris.every((item, index) => item === current[index])) return state;
  return { ...state, mediaAlbumFavoriteUris };
}
