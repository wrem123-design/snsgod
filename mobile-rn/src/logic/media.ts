import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { SNSGodState } from '../types';

const MEDIA_DIR = `${FileSystem.documentDirectory || ''}snsgod-media/`;
export const MEDIA_ROOT_DIR = MEDIA_DIR;
export const REFERENCE_MEDIA_DIR = `${MEDIA_DIR}reference/`;
export const MEDIA_MANIFEST_FILE = `${MEDIA_DIR}mediaManifest.json`;
const EXTERNALIZE_THRESHOLD = 180_000;

export type MediaManifestEntry = {
  mediaId: string;
  fileUri: string;
  type: string;
  characterId?: string;
  createdAt: number;
  size?: number;
};

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

function isDataUri(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:');
}

export function isRenderableMediaUri(value: unknown): value is string {
  return typeof value === 'string'
    && /^(data:|file:|content:|asset:|https?:\/\/)/i.test(value)
    && value.trim().length > 0;
}

function extensionFor(dataUri: string) {
  const mime = /^data:([^;]+);base64,/.exec(dataUri)?.[1] || 'image/jpeg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('mp4')) return 'mp4';
  return 'jpg';
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

export async function readMediaManifest(): Promise<MediaManifestEntry[]> {
  if (!FileSystem.documentDirectory) return [];
  try {
    const info = await FileSystem.getInfoAsync(MEDIA_MANIFEST_FILE);
    if (!info.exists) return [];
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(MEDIA_MANIFEST_FILE, { encoding: FileSystem.EncodingType.UTF8 }));
    return Array.isArray(parsed) ? parsed.filter(item => item && typeof item.fileUri === 'string') as MediaManifestEntry[] : [];
  } catch {
    return [];
  }
}

async function writeMediaManifest(entries: MediaManifestEntry[]): Promise<void> {
  const dir = await ensureMediaDir();
  if (!dir) return;
  await FileSystem.writeAsStringAsync(MEDIA_MANIFEST_FILE, JSON.stringify(entries, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
}

async function upsertMediaManifest(entry: MediaManifestEntry): Promise<void> {
  const entries = await readMediaManifest();
  const withoutSame = entries.filter(item => item.fileUri !== entry.fileUri && item.mediaId !== entry.mediaId);
  await writeMediaManifest([...withoutSame, entry]);
}

function extensionForMime(mimeType: string) {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('gif')) return 'gif';
  if (mimeType.includes('mp4')) return 'mp4';
  return 'jpg';
}

export async function copyMediaToPermanentStorage(uri: string, options: { type?: string; mediaKind?: string; characterId?: string } = {}): Promise<string> {
  const kind = options.mediaKind || 'misc';
  const dir = await ensureMediaSubdir(kind);
  if (!dir || uri.startsWith(dir)) return uri;
  const type = options.type || 'image/jpeg';
  const ext = uri.split('.').pop()?.split('?')[0]?.toLowerCase();
  const safeExt = ext && /^[a-z0-9]{2,5}$/.test(ext) ? ext : extensionForMime(type);
  const mediaId = `${kind}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
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

export async function externalizeDataUri(value: string, hint: string, force = false): Promise<string> {
  if (!force && !isLargeDataUri(value)) return value;
  const dir = await ensureMediaDir();
  if (!dir) return value;
  const ext = extensionFor(value);
  const base64 = value.replace(/^data:[^;]+;base64,/, '');
  const safeHint = hint.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) || 'media';
  const uri = `${dir}${safeHint}_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    throw new Error('미디어 파일 저장 후 파일을 찾을 수 없습니다.');
  }
  await upsertMediaManifest({
    mediaId: safeHint,
    fileUri: uri,
    type: /^data:([^;]+);base64,/.exec(value)?.[1] || 'image/jpeg',
    createdAt: Date.now(),
    size: 'size' in info ? info.size : undefined
  });
  return uri;
}

export async function externalizeStateMedia(state: SNSGodState): Promise<SNSGodState> {
  let next: SNSGodState = {
    ...state,
    characters: [...state.characters],
    messages: { ...state.messages },
    snsPosts: [...(state.snsPosts || [])],
    referenceFaceSlots: [...(state.referenceFaceSlots || [])],
    userStickers: [...(state.userStickers || [])]
  };

  next.characters = await Promise.all(next.characters.map(async character => ({
    ...character,
    avatar: isLargeDataUri(character.avatar) ? await externalizeDataUri(character.avatar, `${character.id}_avatar`) : character.avatar,
    profileImage: isLargeDataUri(character.profileImage) ? await externalizeDataUri(character.profileImage, `${character.id}_profile`) : character.profileImage,
    coverImage: isLargeDataUri(character.coverImage) ? await externalizeDataUri(character.coverImage, `${character.id}_cover`) : character.coverImage,
    profileReferenceImage: isLargeDataUri(character.profileReferenceImage) ? await externalizeDataUri(character.profileReferenceImage, `${character.id}_ref`) : character.profileReferenceImage,
    profileReferenceImages: await Promise.all((character.profileReferenceImages || []).slice(0, 3).map(async (image, index) =>
      isLargeDataUri(image) ? await externalizeDataUri(image, `${character.id}_ref_${index + 1}`) : image
    )),
    profileImageHistory: await Promise.all((character.profileImageHistory || []).map(async item => ({
      ...item,
      image: isLargeDataUri(item.image) ? await externalizeDataUri(item.image, `${character.id}_${item.kind || 'history'}`) : item.image
    })))
  })));

  const messageEntries = await Promise.all(Object.entries(next.messages || {}).map(async ([roomId, list]) => [
    roomId,
    await Promise.all((Array.isArray(list) ? list : []).map(async message => ({
      ...message,
      mediaData: isLargeDataUri(message.mediaData) ? await externalizeDataUri(message.mediaData, `${roomId}_${message.id}`) : message.mediaData
    })))
  ] as const));
  next.messages = Object.fromEntries(messageEntries);

  next.userStickers = await Promise.all((next.userStickers || []).map(async sticker => ({
    ...sticker,
    data: isLargeDataUri(sticker.data) ? await externalizeDataUri(sticker.data, `sticker_${sticker.id}`) : sticker.data,
    mediaData: isLargeDataUri(sticker.mediaData) ? await externalizeDataUri(sticker.mediaData, `sticker_${sticker.id}`) : sticker.mediaData
  })));

  next.snsPosts = await Promise.all((next.snsPosts || []).map(async post => ({
    ...post,
    image: isLargeDataUri(post.image) ? await externalizeDataUri(post.image, `sns_${post.id}`) : post.image
  })));

  next.referenceFaceSlots = await Promise.all((next.referenceFaceSlots || []).slice(0, 50).map(async slot => ({
    ...slot,
    image: isDataUri(slot.image) ? await externalizeDataUri(slot.image, `reference_face_${slot.id}`, true) : slot.image
  })));

  return next;
}
