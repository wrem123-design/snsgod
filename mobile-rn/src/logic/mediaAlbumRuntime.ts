import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import JSZip from 'jszip';
import type {
  AlbumDeviceSaveAdapter,
  AlbumShareAdapter,
  MaterializedAlbumMedia,
} from './mediaAlbumActions';

const ALBUM_TEMP_DIR = `${FileSystem.cacheDirectory || ''}snsgod-album-actions/`;

async function ensureAlbumTempDirectory(): Promise<string> {
  if (!FileSystem.cacheDirectory) throw new Error('임시 파일 저장소를 사용할 수 없습니다.');
  const info = await FileSystem.getInfoAsync(ALBUM_TEMP_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(ALBUM_TEMP_DIR, { intermediates: true });
  return ALBUM_TEMP_DIR;
}

async function deleteAlbumTempFile(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // Cache cleanup is best-effort and must not replace the original action error.
  }
}

function extensionForUri(uri: string): string {
  const dataMime = uri.match(/^data:image\/([a-z0-9.+-]+);base64,/i)?.[1]?.toLowerCase();
  if (dataMime === 'jpeg') return 'jpg';
  if (dataMime && /^[a-z0-9]{2,5}$/.test(dataMime)) return dataMime;
  const extension = uri.split(/[?#]/)[0].match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  return extension && ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(extension)
    ? extension
    : 'jpg';
}

function mimeForUri(uri: string): string {
  const dataMime = uri.match(/^data:(image\/[a-z0-9.+-]+);base64,/i)?.[1];
  if (dataMime) return dataMime;
  const extension = extensionForUri(uri);
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'heic' || extension === 'heif') return 'image/heic';
  return 'image/jpeg';
}

async function materializeAlbumMedia(uri: string, index: number): Promise<MaterializedAlbumMedia | undefined> {
  const normalized = uri.trim();
  if (!/^(data:|file:|content:|asset:|https:\/\/)/i.test(normalized)) return undefined;
  if (normalized.startsWith('file:')) {
    const info = await FileSystem.getInfoAsync(normalized);
    if (!info.exists) throw new Error(`원본 파일을 찾지 못했습니다: ${index + 1}번째 이미지`);
    return { localUri: normalized };
  }

  const directory = await ensureAlbumTempDirectory();
  const localUri = `${directory}album_${Date.now()}_${index}_${Crypto.randomUUID()}.${extensionForUri(normalized)}`;
  try {
    if (normalized.startsWith('data:')) {
      const base64 = normalized.match(/^data:image\/[a-z0-9.+-]+;base64,([a-z0-9+/=\s]+)$/i)?.[1];
      if (!base64) return undefined;
      await FileSystem.writeAsStringAsync(localUri, base64.replace(/\s+/g, ''), {
        encoding: FileSystem.EncodingType.Base64,
      });
    } else if (/^https:\/\//i.test(normalized)) {
      const download = await FileSystem.downloadAsync(normalized, localUri);
      if (download.status < 200 || download.status >= 300) {
        throw new Error(`원격 이미지를 가져오지 못했습니다: HTTP ${download.status}`);
      }
    } else {
      await FileSystem.copyAsync({ from: normalized, to: localUri });
    }

    const info = await FileSystem.getInfoAsync(localUri);
    if (!info.exists) throw new Error(`이미지 준비에 실패했습니다: ${index + 1}번째 이미지`);
    return {
      localUri,
      cleanup: () => FileSystem.deleteAsync(localUri, { idempotent: true }),
    };
  } catch (error) {
    await deleteAlbumTempFile(localUri);
    throw error;
  }
}

async function createAlbumZip(localUris: readonly string[]): Promise<string> {
  const directory = await ensureAlbumTempDirectory();
  const zip = new JSZip();
  for (const [index, localUri] of localUris.entries()) {
    const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
    zip.file(`SNSGod_${String(index + 1).padStart(2, '0')}.${extensionForUri(localUri)}`, base64, { base64: true });
  }
  const zipUri = `${directory}SNSGod_album_${Date.now()}_${Crypto.randomUUID()}.zip`;
  const base64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  try {
    await FileSystem.writeAsStringAsync(zipUri, base64, { encoding: FileSystem.EncodingType.Base64 });
    return zipUri;
  } catch (error) {
    await deleteAlbumTempFile(zipUri);
    throw error;
  }
}

export const albumDeviceSaveAdapter: AlbumDeviceSaveAdapter = {
  async requestPermission() {
    const permission = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
    return permission.granted;
  },
  materialize: materializeAlbumMedia,
  async save(localUri) {
    await MediaLibrary.saveToLibraryAsync(localUri);
  },
};

export const albumShareAdapter: AlbumShareAdapter = {
  isAvailable: Sharing.isAvailableAsync,
  materialize: materializeAlbumMedia,
  async shareSingle(localUri) {
    await Sharing.shareAsync(localUri, {
      mimeType: mimeForUri(localUri),
      dialogTitle: 'SNSGod 앨범 이미지 공유',
    });
  },
  async shareBundle(localUris) {
    const zipUri = await createAlbumZip(localUris);
    try {
      await Sharing.shareAsync(zipUri, {
        mimeType: 'application/zip',
        dialogTitle: `SNSGod 앨범 이미지 ${localUris.length}개 공유`,
      });
    } finally {
      await deleteAlbumTempFile(zipUri);
    }
  },
};
