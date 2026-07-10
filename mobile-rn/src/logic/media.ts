import * as DocumentPicker from 'expo-document-picker';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { SNSGodState } from '../types';
import {
  createCanonicalMediaAssetStore,
  createMediaGarbageCollector,
  createSerializedMediaManifestStore,
  decodeBase64Bytes,
  isUriWithinRoot,
  parseMediaManifestText,
  replaceTextFileAtomically,
  type MediaGarbageCollectionResult,
  type MediaManifestEntry,
  type MediaTrashEntry,
} from './mediaStoragePolicy';
import {
  applyStateMediaUriReplacements,
  collectStateMediaExternalizationTargets,
  type StateMediaReference,
  type StateMediaUriReplacement,
} from './stateMediaPolicy';

export type { MediaGarbageCollectionResult, MediaManifestEntry } from './mediaStoragePolicy';

const MEDIA_DIR = `${FileSystem.documentDirectory || ''}snsgod-media/`;
export const MEDIA_ROOT_DIR = MEDIA_DIR;
export const REFERENCE_MEDIA_DIR = `${MEDIA_DIR}reference/`;
export const MEDIA_MANIFEST_FILE = `${MEDIA_DIR}mediaManifest.json`;
const MEDIA_MANIFEST_TEMP_FILE = `${MEDIA_DIR}mediaManifest.tmp.json`;
const MEDIA_MANIFEST_PREVIOUS_FILE = `${MEDIA_DIR}mediaManifest.previous.json`;
const MEDIA_TRASH_DIR = `${MEDIA_DIR}.trash/`;
const MEDIA_TRASH_MANIFEST_FILE = `${MEDIA_DIR}mediaTrashManifest.json`;
const MEDIA_TRASH_MANIFEST_TEMP_FILE = `${MEDIA_DIR}mediaTrashManifest.tmp.json`;
const MEDIA_TRASH_MANIFEST_PREVIOUS_FILE = `${MEDIA_DIR}mediaTrashManifest.previous.json`;
const EXTERNALIZE_THRESHOLD = 180_000;

export async function pickImageDataUri(): Promise<string | undefined> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.length) return undefined;
  const asset = result.assets[0];
  const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
  return `data:${asset.mimeType || 'image/jpeg'};base64,${base64}`;
}

export async function pickImageDataUris(limit = 0): Promise<string[] | undefined> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync(false);
  if (!permission.granted) return undefined;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: Math.max(0, Math.floor(limit || 0)),
    quality: 1,
    base64: true
  });
  if (result.canceled || !result.assets?.length) return undefined;
  return Promise.all(result.assets.map(async asset => {
    const mimeType = asset.mimeType || 'image/jpeg';
    const base64 = asset.base64 || await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
    return `data:${mimeType};base64,${base64}`;
  }));
}

export async function pickPersistentReferenceImageUris(limit = 0): Promise<string[] | undefined> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync(false);
  if (!permission.granted) return undefined;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: Math.max(0, Math.floor(limit || 0)),
    quality: 1
  });
  if (result.canceled || !result.assets?.length) return undefined;
  return Promise.all(result.assets.map(asset => copyMediaToPermanentStorage(asset.uri, {
    type: asset.mimeType || 'image/jpeg',
    mediaKind: 'reference'
  })));
}

export async function pickStickerDataUri(): Promise<{ data: string; name: string; type?: string } | undefined> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'video/*', 'audio/*'], copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.length) return undefined;
  const asset = result.assets[0];
  const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
  const type = asset.mimeType || 'image/jpeg';
  return {
    data: `data:${type};base64,${base64}`,
    name: asset.name?.replace(/\.[^.]+$/, '') || '스티커',
    type
  };
}

function isLargeDataUri(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:') && value.length > EXTERNALIZE_THRESHOLD;
}

export function isRenderableMediaUri(value: unknown): value is string {
  return typeof value === 'string'
    && /^(data:|file:|content:|asset:|https?:\/\/)/i.test(value)
    && value.trim().length > 0;
}

async function ensureMediaDir() {
  if (!FileSystem.documentDirectory) return undefined;
  const info = await FileSystem.getInfoAsync(MEDIA_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(MEDIA_DIR, { intermediates: true });
  return MEDIA_DIR;
}

async function ensureMediaSubdir(subdir?: string) {
  const root = await ensureMediaDir();
  if (!root) return undefined;
  if (!subdir) return root;
  const dir = `${root}${subdir.replace(/^\/+|\/+$/g, '')}/`;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  return dir;
}

async function readMediaManifestFromDisk(): Promise<MediaManifestEntry[]> {
  if (!FileSystem.documentDirectory) return [];
  let foundManifestFile = false;
  for (const fileUri of [MEDIA_MANIFEST_FILE, MEDIA_MANIFEST_TEMP_FILE, MEDIA_MANIFEST_PREVIOUS_FILE]) {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) continue;
    foundManifestFile = true;
    try {
      return parseMediaManifestText(await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.UTF8,
      }));
    } catch {
      // Continue to the next recoverable manifest generation.
    }
  }
  if (foundManifestFile) {
    throw new Error('복구 가능한 미디어 manifest를 찾지 못했습니다.');
  }
  return [];
}

async function replaceMediaManifestAtomically(entries: MediaManifestEntry[]): Promise<void> {
  const dir = await ensureMediaDir();
  if (!dir) return;
  await replaceTextFileAtomically({
    async exists(path) {
      return (await FileSystem.getInfoAsync(path)).exists;
    },
    async read(path) {
      return FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.UTF8 });
    },
    async write(path, value) {
      await FileSystem.writeAsStringAsync(path, value, { encoding: FileSystem.EncodingType.UTF8 });
    },
    async move(from, to) {
      await FileSystem.moveAsync({ from, to });
    },
    async remove(path) {
      await FileSystem.deleteAsync(path, { idempotent: true });
    },
  }, {
    primary: MEDIA_MANIFEST_FILE,
    temporary: MEDIA_MANIFEST_TEMP_FILE,
    previous: MEDIA_MANIFEST_PREVIOUS_FILE,
  }, JSON.stringify(entries, null, 2), parseMediaManifestText);
}

const mediaManifestStore = createSerializedMediaManifestStore({
  read: readMediaManifestFromDisk,
  replaceAtomically: replaceMediaManifestAtomically,
});

function parseMediaTrashManifestText(value: string): MediaTrashEntry[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error('Media trash manifest must be an array.');
  const trashUris = new Set<string>();
  return parsed.map(item => {
    if (!item || typeof item !== 'object') {
      throw new Error('Media trash manifest contains an invalid entry.');
    }
    const candidate = item as Partial<MediaTrashEntry>;
    if (
      !candidate.entry
      || typeof candidate.trashFileUri !== 'string'
      || !isUriWithinRoot(candidate.trashFileUri, MEDIA_TRASH_DIR)
      || typeof candidate.trashedAt !== 'number'
      || !Number.isFinite(candidate.trashedAt)
      || candidate.trashedAt < 0
      || (candidate.status !== 'prepared' && candidate.status !== 'committed')
      || trashUris.has(candidate.trashFileUri)
    ) {
      throw new Error('Media trash manifest contains an invalid entry.');
    }
    const [entry] = parseMediaManifestText(JSON.stringify([candidate.entry]));
    trashUris.add(candidate.trashFileUri);
    return {
      entry,
      trashFileUri: candidate.trashFileUri,
      trashedAt: candidate.trashedAt,
      status: candidate.status,
    };
  });
}

async function readMediaTrashManifestFromDisk(): Promise<MediaTrashEntry[]> {
  let foundManifest = false;
  for (const fileUri of [
    MEDIA_TRASH_MANIFEST_FILE,
    MEDIA_TRASH_MANIFEST_TEMP_FILE,
    MEDIA_TRASH_MANIFEST_PREVIOUS_FILE,
  ]) {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) continue;
    foundManifest = true;
    try {
      return parseMediaTrashManifestText(await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.UTF8,
      }));
    } catch {
      // Continue to the next recoverable manifest generation.
    }
  }
  if (foundManifest) throw new Error('복구 가능한 미디어 휴지통 manifest를 찾지 못했습니다.');
  return [];
}

async function replaceMediaTrashManifestAtomically(
  entries: readonly MediaTrashEntry[],
): Promise<void> {
  await ensureMediaDir();
  await replaceTextFileAtomically({
    async exists(path) {
      return (await FileSystem.getInfoAsync(path)).exists;
    },
    async read(path) {
      return FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.UTF8 });
    },
    async write(path, contents) {
      await FileSystem.writeAsStringAsync(path, contents, { encoding: FileSystem.EncodingType.UTF8 });
    },
    async move(from, to) {
      await FileSystem.moveAsync({ from, to });
    },
    async remove(path) {
      await FileSystem.deleteAsync(path, { idempotent: true });
    },
  }, {
    primary: MEDIA_TRASH_MANIFEST_FILE,
    temporary: MEDIA_TRASH_MANIFEST_TEMP_FILE,
    previous: MEDIA_TRASH_MANIFEST_PREVIOUS_FILE,
  }, JSON.stringify(entries, null, 2), parseMediaTrashManifestText);
}

const mediaGarbageCollector = createMediaGarbageCollector({
  manifestStore: mediaManifestStore,
  readTrashManifest: readMediaTrashManifestFromDisk,
  replaceTrashManifest: replaceMediaTrashManifestAtomically,
  async fileExists(fileUri) {
    return (await FileSystem.getInfoAsync(fileUri)).exists;
  },
  async moveFile(from, to) {
    await FileSystem.moveAsync({ from, to });
  },
  async removeFile(fileUri) {
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
  },
  trashFileUri(entry, now) {
    const fileName = entry.fileUri.split('/').pop() || `${entry.mediaId}.bin`;
    const extension = fileName.includes('.') ? fileName.split('.').pop() || 'bin' : 'bin';
    return `${MEDIA_TRASH_DIR}${entry.mediaId}-${now}-${Crypto.randomUUID()}.${extension}`;
  },
});

export async function readMediaManifest(): Promise<MediaManifestEntry[]> {
  return mediaManifestStore.read();
}

async function upsertMediaManifest(entry: MediaManifestEntry): Promise<void> {
  await mediaManifestStore.upsert(entry);
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyCanonicalAsset(
  fileUri: string,
  expectedHash: string,
): Promise<{ size?: number } | undefined> {
  const info = await FileSystem.getInfoAsync(fileUri);
  if (!info.exists) return undefined;
  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = decodeBase64Bytes(base64);
  if (!bytes?.length || await sha256Bytes(bytes) !== expectedHash) return undefined;
  return { size: 'size' in info ? info.size : undefined };
}

async function writeCanonicalAssetAtomically(
  fileUri: string,
  base64: string,
  expectedHash: string,
): Promise<{ size?: number }> {
  const temporaryUri = `${fileUri}.${Crypto.randomUUID()}.tmp`;
  try {
    await FileSystem.writeAsStringAsync(temporaryUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (!await verifyCanonicalAsset(temporaryUri, expectedHash)) {
      throw new Error('미디어 임시 파일의 내용 검증에 실패했습니다.');
    }
    try {
      await FileSystem.moveAsync({ from: temporaryUri, to: fileUri });
    } catch (moveError) {
      const concurrentWinner = await verifyCanonicalAsset(fileUri, expectedHash);
      if (concurrentWinner) return concurrentWinner;
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
      try {
        await FileSystem.moveAsync({ from: temporaryUri, to: fileUri });
      } catch {
        throw moveError;
      }
    }
    const verified = await verifyCanonicalAsset(fileUri, expectedHash);
    if (!verified) {
      throw new Error('미디어 최종 파일의 내용 검증에 실패했습니다.');
    }
    return verified;
  } finally {
    await FileSystem.deleteAsync(temporaryUri, { idempotent: true });
  }
}

const canonicalMediaAssets = createCanonicalMediaAssetStore({
  sha256: sha256Bytes,
  readManifest: readMediaManifest,
  verifyAsset: verifyCanonicalAsset,
  writeAssetAtomically: writeCanonicalAssetAtomically,
  upsertManifest: upsertMediaManifest,
  now: Date.now,
});

function extensionForMime(mimeType: string) {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('gif')) return 'gif';
  if (mimeType.includes('mp4')) return 'mp4';
  return 'jpg';
}

export async function copyMediaToPermanentStorage(uri: string, options: { type?: string; mediaKind?: string; characterId?: string } = {}): Promise<string> {
  const kind = (options.mediaKind || 'misc').replace(/[^a-zA-Z0-9_-]/g, '_');
  const dir = await ensureMediaSubdir(kind);
  if (!dir || uri.startsWith(dir)) return uri;
  const type = options.type || 'image/jpeg';
  const ext = uri.split('.').pop()?.split('?')[0]?.toLowerCase();
  const safeExt = ext && /^[a-z0-9]{2,5}$/.test(ext) ? ext : extensionForMime(type);
  const mediaId = `${kind}_${Crypto.randomUUID()}`;
  const fileUri = `${dir}${mediaId}.${safeExt}`;
  await FileSystem.copyAsync({ from: uri, to: fileUri });
  const info = await FileSystem.getInfoAsync(fileUri);
  if (!info.exists) {
    throw new Error('미디어 파일 복사 후 파일을 찾을 수 없습니다.');
  }
  await upsertMediaManifest({
    mediaId,
    fileUri,
    type,
    characterId: options.characterId,
    createdAt: Date.now(),
    size: 'size' in info ? info.size : undefined
  });
  return fileUri;
}

export async function inspectMediaFiles(): Promise<{ manifest: MediaManifestEntry[]; checked: number; existing: number; missing: string[]; mediaDir: string; manifestFile: string }> {
  const manifest = await readMediaManifest();
  const results = await Promise.all(manifest.map(async entry => ({ entry, info: await FileSystem.getInfoAsync(entry.fileUri) })));
  return {
    manifest,
    checked: results.length,
    existing: results.filter(item => item.info.exists).length,
    missing: results.filter(item => !item.info.exists).map(item => item.entry.fileUri),
    mediaDir: MEDIA_DIR,
    manifestFile: MEDIA_MANIFEST_FILE
  };
}

/** Previews unreachable app-owned media without changing files or manifests. */
export async function previewMediaGarbageCollection(
  references: readonly StateMediaReference[],
): Promise<MediaGarbageCollectionResult> {
  return mediaGarbageCollector.collect(references, {
    dryRun: true,
    mediaRootUri: MEDIA_ROOT_DIR,
    now: Date.now(),
  });
}

/** Moves unreachable app-owned media into the recoverable local trash. */
export async function trashUnreachableMedia(
  references: readonly StateMediaReference[],
): Promise<MediaGarbageCollectionResult> {
  await ensureMediaSubdir('.trash');
  return mediaGarbageCollector.collect(references, {
    dryRun: false,
    mediaRootUri: MEDIA_ROOT_DIR,
    now: Date.now(),
  });
}

/** Permanently removes committed trash entries older than the given timestamp. */
export async function purgeMediaTrash(before: number): Promise<{
  deletedCount: number;
  failedCount: number;
}> {
  const result = await mediaGarbageCollector.purge({ before, dryRun: false });
  return { deletedCount: result.deletedCount, failedCount: result.failedEntries.length };
}

/** Recovers a media move interrupted between trash preparation and manifest commit. */
export async function recoverInterruptedMediaGarbageCollection(): Promise<{
  restoredCount: number;
  committedCount: number;
}> {
  return mediaGarbageCollector.recoverInterruptedCollection();
}

export async function externalizeDataUri(value: string, hint: string, force = false): Promise<string> {
  if (!force && !isLargeDataUri(value)) return value;
  const dir = await ensureMediaSubdir('assets');
  if (!dir) return value;
  const safeHint = hint.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) || 'media';
  return await canonicalMediaAssets.externalize(value, {
    assetDirectory: dir,
    hint: safeHint,
  }) || value;
}

export type ExternalizedStateMediaResult = {
  state: SNSGodState;
  replacements: StateMediaUriReplacement[];
};

export async function externalizeStateMediaWithResult(
  state: SNSGodState,
): Promise<ExternalizedStateMediaResult> {
  const targets = collectStateMediaExternalizationTargets(state);
  const resolved = await Promise.all(targets.map(async target => ({
    dataUri: target.dataUri,
    fileUri: await externalizeDataUri(target.dataUri, target.hint, target.force),
  })));
  const replacements = resolved.filter(result => result.fileUri !== result.dataUri);
  return {
    state: applyStateMediaUriReplacements(state, replacements),
    replacements,
  };
}

export async function externalizeStateMedia(state: SNSGodState): Promise<SNSGodState> {
  return (await externalizeStateMediaWithResult(state)).state;
}
