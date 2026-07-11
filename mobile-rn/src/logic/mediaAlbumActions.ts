import type { SNSGodCharacter, SNSGodState } from '../types';

export type AlbumBatchResult = {
  success: number;
  failed: number;
  skipped: number;
  errors: string[];
  permissionDenied?: boolean;
  unavailable?: boolean;
  usedBundleFallback?: boolean;
};

export type MaterializedAlbumMedia = {
  localUri: string;
  cleanup?: () => Promise<void>;
};

export type AlbumDeviceSaveAdapter = {
  requestPermission: () => Promise<boolean>;
  materialize: (uri: string, index: number) => Promise<MaterializedAlbumMedia | undefined>;
  save: (localUri: string) => Promise<void>;
};

export type AlbumShareAdapter = {
  isAvailable: () => Promise<boolean>;
  materialize: (uri: string, index: number) => Promise<MaterializedAlbumMedia | undefined>;
  shareSingle: (localUri: string) => Promise<void>;
  shareBundle: (localUris: readonly string[]) => Promise<void>;
};

export type AlbumRepresentativeTarget = 'profile' | 'cover' | 'reference';

export type AlbumRepresentativeAssignment = {
  characterId: string;
  uri: string;
  target: AlbumRepresentativeTarget;
  prompt?: string;
  now?: number;
};

export function toggleAlbumSelection(selectedIds: readonly string[], id: string): string[] {
  const unique = [...new Set(selectedIds)];
  return unique.includes(id) ? unique.filter(item => item !== id) : [...unique, id];
}

export function selectFilteredAlbumAssets(
  selectedIds: readonly string[],
  filteredIds: readonly string[],
  selected: boolean,
): string[] {
  const filtered = new Set(filteredIds);
  if (!selected) return [...new Set(selectedIds)].filter(id => !filtered.has(id));
  return [...new Set([...selectedIds, ...filteredIds])];
}

export function reconcileAlbumSelection(
  selectedIds: readonly string[],
  availableIds: readonly string[],
): string[] {
  const available = new Set(availableIds);
  return [...new Set(selectedIds)].filter(id => available.has(id));
}

function uniqueUris(uris: readonly string[]): string[] {
  return [...new Set(uris.map(uri => uri.trim()).filter(Boolean))];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function safelyCleanup(media: MaterializedAlbumMedia): Promise<void> {
  try {
    await media.cleanup?.();
  } catch {
    // Temporary cleanup is best-effort and must not overwrite the user-visible action result.
  }
}

/** Saves each selected image independently so one failure cannot cancel the remaining items. */
export async function runAlbumDeviceSave(
  uris: readonly string[],
  adapter: AlbumDeviceSaveAdapter,
): Promise<AlbumBatchResult> {
  const items = uniqueUris(uris);
  const result: AlbumBatchResult = { success: 0, failed: 0, skipped: 0, errors: [], permissionDenied: false };
  if (!items.length) return result;

  try {
    if (!await adapter.requestPermission()) {
      return { ...result, skipped: items.length, permissionDenied: true };
    }
  } catch (error) {
    return { ...result, failed: items.length, errors: [errorMessage(error)] };
  }

  for (const [index, uri] of items.entries()) {
    let media: MaterializedAlbumMedia | undefined;
    try {
      media = await adapter.materialize(uri, index);
      if (!media) {
        result.skipped += 1;
        continue;
      }
      await adapter.save(media.localUri);
      result.success += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push(errorMessage(error));
    } finally {
      if (media) await safelyCleanup(media);
    }
  }
  return result;
}

/** Shares one image directly and uses one bundled file when the platform cannot share many files. */
export async function runAlbumShare(
  uris: readonly string[],
  adapter: AlbumShareAdapter,
): Promise<AlbumBatchResult> {
  const items = uniqueUris(uris);
  const result: AlbumBatchResult = { success: 0, failed: 0, skipped: 0, errors: [], unavailable: false, usedBundleFallback: false };
  if (!items.length) return result;

  try {
    if (!await adapter.isAvailable()) {
      return { ...result, skipped: items.length, unavailable: true };
    }
  } catch (error) {
    return { ...result, failed: items.length, errors: [errorMessage(error)] };
  }

  const ready: MaterializedAlbumMedia[] = [];
  for (const [index, uri] of items.entries()) {
    try {
      const media = await adapter.materialize(uri, index);
      if (media) ready.push(media);
      else result.skipped += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push(errorMessage(error));
    }
  }

  if (!ready.length) return result;
  try {
    if (ready.length === 1) await adapter.shareSingle(ready[0].localUri);
    else {
      await adapter.shareBundle(ready.map(media => media.localUri));
      result.usedBundleFallback = true;
    }
    result.success += ready.length;
  } catch (error) {
    result.failed += ready.length;
    result.errors.push(errorMessage(error));
  } finally {
    await Promise.all(ready.map(safelyCleanup));
  }
  return result;
}

function normalizedReferences(character: SNSGodCharacter): string[] {
  return [...new Set([
    ...(character.profileReferenceImages || []),
    character.profileReferenceImage || '',
  ].map(uri => uri.trim()).filter(Boolean))];
}

function representativeHistory(
  character: SNSGodCharacter,
  current: { id: string; image: string; prompt?: string; createdAt: number; kind: 'profile' | 'cover' },
  previousUri: string | undefined,
): NonNullable<SNSGodCharacter['profileImageHistory']> {
  const existing = character.profileImageHistory || [];
  const previous = previousUri && !existing.some(item => item.image === previousUri && item.kind === current.kind)
    ? [{
        id: `${current.id}_previous`,
        image: previousUri,
        createdAt: Math.max(0, current.createdAt - 1),
        kind: current.kind,
      }]
    : [];
  return [current, ...previous, ...existing].slice(0, 60);
}

/** Assigns one album image while preserving bounded history and prior references. */
export function assignAlbumRepresentative(
  state: SNSGodState,
  assignment: AlbumRepresentativeAssignment,
): { state: SNSGodState; previousUri?: string } {
  const character = state.characters.find(item => item.id === assignment.characterId);
  if (!character) throw new Error('대표 이미지를 지정할 캐릭터를 찾지 못했습니다.');
  const uri = assignment.uri.trim();
  if (!uri) throw new Error('대표 이미지 파일이 비어 있습니다.');
  const now = assignment.now ?? Date.now();
  let previousUri: string | undefined;

  const characters = state.characters.map(item => {
    if (item.id !== assignment.characterId) return item;
    if (assignment.target === 'profile') {
      previousUri = item.avatar || item.profileImage;
      if (previousUri === uri) return item;
      const history = {
        id: `album_profile_${assignment.characterId}_${now}`,
        image: uri,
        prompt: assignment.prompt,
        createdAt: now,
        kind: 'profile' as const,
      };
      return {
        ...item,
        avatar: uri,
        profileImage: uri,
        profileImageHistory: representativeHistory(item, history, previousUri),
      };
    }
    if (assignment.target === 'cover') {
      previousUri = item.coverImage;
      if (previousUri === uri) return item;
      const history = {
        id: `album_cover_${assignment.characterId}_${now}`,
        image: uri,
        prompt: assignment.prompt,
        createdAt: now,
        kind: 'cover' as const,
      };
      return {
        ...item,
        coverImage: uri,
        profileImageHistory: representativeHistory(item, history, previousUri),
      };
    }
    const currentReferences = normalizedReferences(item);
    previousUri = currentReferences[0];
    const profileReferenceImages = [uri, ...currentReferences.filter(value => value !== uri)].slice(0, 3);
    if (
      item.profileReferenceImage === uri
      && profileReferenceImages.length === currentReferences.length
      && profileReferenceImages.every((value, index) => value === currentReferences[index])
    ) return item;
    return { ...item, profileReferenceImage: uri, profileReferenceImages };
  });

  const unchanged = characters.every((item, index) => item === state.characters[index]);
  return { state: unchanged ? state : { ...state, characters }, previousUri };
}
