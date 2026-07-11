import { SNSGodState } from '../types';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import JSZip from 'jszip';
import { prepareArchivedMediaAssets, readMediaManifest } from './media';
import { parseMediaManifestText, type MediaManifestEntry } from './mediaStoragePolicy';
import { applyStateMediaUriReplacements, collectStateMediaReferences } from './stateMediaPolicy';
import { buildFullBackupMediaPlan, type ArchivedMediaRecord } from './fullBackupPolicy';
import { stateWithoutStoredSecrets } from '../storage/secureSecrets';
import { decryptBackupBase64, encryptBackupBase64, isEncryptedBackupBase64 } from './backupEncryptionPolicy';

type FullBackupMetadata = {
  version: 'snsgod-full-backup-v2';
  exportedAt: number;
  mediaMode: 'full-media';
  media: Array<{
    mediaId: string;
    sourceFileUri: string;
    archivePath: string;
    type: string;
    contentHash?: string;
    characterId?: string;
    createdAt?: number;
  }>;
};

type FullBackupMediaMetadata = FullBackupMetadata['media'][number];
type ZipEntryInternals = {
  compressedSize?: unknown;
  uncompressedSize?: unknown;
};

const MAX_FULL_BACKUP_ZIP_BYTES = 512 * 1024 * 1024;
const MAX_FULL_BACKUP_MEDIA_ENTRIES = 5000;
const MAX_FULL_BACKUP_ARCHIVE_FILES = MAX_FULL_BACKUP_MEDIA_ENTRIES + 4;

export type PreparedFullBackupRestore = {
  state: SNSGodState;
  restoredMediaCount: number;
  rollback(): Promise<void>;
};

function stripProfileSecrets(profile: Record<string, unknown>) {
  return {
    ...profile,
    apiKey: '',
    apiKeys: [],
    serviceAccountJson: '',
    proxyAccessToken: ''
  };
}

export function stateWithoutSecrets(state: SNSGodState): SNSGodState {
  const apiProfiles = Object.fromEntries(Object.entries(state.config.apiProfiles || {}).map(([key, value]) => [
    key,
    stripProfileSecrets((value || {}) as Record<string, unknown>)
  ]));
  return stateWithoutStoredSecrets({
    ...state,
    config: {
      ...state.config,
      apiProfiles,
      imageGeneration: state.config.imageGeneration ? {
        ...state.config.imageGeneration,
        apiKey: ''
      } : state.config.imageGeneration,
      serverMessaging: state.config.serverMessaging ? {
        ...state.config.serverMessaging,
        pairingSecret: '',
        deviceId: '',
        deviceToken: '',
        syncCursor: 0,
        lastError: ''
      } : state.config.serverMessaging
    }
  });
}

export function createBackupPayload(state: SNSGodState, options: { includeMedia?: boolean } = {}) {
  return {
    version: 'snsgod-rn-backup-v1',
    exportedAt: Date.now(),
    mediaMode: options.includeMedia ? 'inline-or-file-ref' : 'state-only',
    state: stateWithoutSecrets(state)
  };
}

export async function exportFullBackupZip(state: SNSGodState, options: { password?: string } = {}): Promise<string> {
  const zip = new JSZip();
  const safeState = stateWithoutSecrets(state);
  const manifest = await readMediaManifest();
  const plan = buildFullBackupMediaPlan(collectStateMediaReferences(safeState), manifest);
  if (plan.unmanagedFileUris.length) {
    throw new Error(`manifest에 등록되지 않은 파일 참조가 ${plan.unmanagedFileUris.length}개 있어 전체 백업을 만들 수 없습니다.`);
  }
  if (plan.entries.length > MAX_FULL_BACKUP_MEDIA_ENTRIES) {
    throw new Error(`전체 백업 미디어는 최대 ${MAX_FULL_BACKUP_MEDIA_ENTRIES}개까지 저장할 수 있습니다.`);
  }
  const metadata: FullBackupMetadata = {
    version: 'snsgod-full-backup-v2',
    exportedAt: Date.now(),
    mediaMode: 'full-media',
    media: [],
  };
  zip.file('state.json', JSON.stringify(safeState, null, 2));
  zip.file('mediaManifest.json', JSON.stringify(plan.entries, null, 2));
  let totalMediaBytes = 0;
  for (const [index, entry] of plan.entries.entries()) {
    const info = await FileSystem.getInfoAsync(entry.fileUri);
    if (!info.exists) {
      throw new Error(`전체 백업에 필요한 미디어 파일이 없습니다: ${entry.mediaId}`);
    }
    const fileSize = 'size' in info && typeof info.size === 'number' ? info.size : entry.size || 0;
    totalMediaBytes += fileSize;
    if (totalMediaBytes > MAX_FULL_BACKUP_ZIP_BYTES) {
      throw new Error('전체 백업 미디어 용량이 512MB 제한을 넘었습니다. 앨범을 정리한 뒤 다시 시도해 주세요.');
    }
    const extension = extensionForBackupEntry(entry);
    const archivePath = `media/${String(index).padStart(6, '0')}.${extension}`;
    const base64 = await FileSystem.readAsStringAsync(entry.fileUri, { encoding: FileSystem.EncodingType.Base64 });
    zip.file(archivePath, base64, { base64: true });
    metadata.media.push({
      mediaId: entry.mediaId,
      sourceFileUri: entry.fileUri,
      archivePath,
      type: entry.type,
      contentHash: entry.contentHash,
      characterId: entry.characterId,
      createdAt: entry.createdAt,
    });
  }
  zip.file('backup.json', JSON.stringify(metadata, null, 2));
  const base64Zip = await zip.generateAsync({ type: 'base64' });
  if (Math.floor(base64Zip.length * 3 / 4) > MAX_FULL_BACKUP_ZIP_BYTES) {
    throw new Error('생성된 전체 백업 ZIP이 512MB 제한을 넘었습니다. 앨범을 정리한 뒤 다시 시도해 주세요.');
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const password = String(options.password || '');
  const encrypted = password
    ? await encryptBackupBase64(base64Zip, password, {
      salt: await Crypto.getRandomBytesAsync(16),
      nonce: await Crypto.getRandomBytesAsync(24),
    })
    : base64Zip;
  const extension = password ? 'sgbackup' : 'zip';
  const uri = `${FileSystem.cacheDirectory || FileSystem.documentDirectory || ''}snsgod-full-backup-${timestamp}.${extension}`;
  await FileSystem.writeAsStringAsync(uri, encrypted, { encoding: FileSystem.EncodingType.Base64 });
  return uri;
}

function extensionForBackupEntry(entry: MediaManifestEntry): string {
  if (entry.type.includes('png')) return 'png';
  if (entry.type.includes('webp')) return 'webp';
  if (entry.type.includes('gif')) return 'gif';
  if (entry.type.includes('mp4')) return 'mp4';
  return 'jpg';
}

function parseFullBackupMetadata(value: string): FullBackupMetadata {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object') throw new Error('backup.json 형식이 올바르지 않습니다.');
  const candidate = parsed as Partial<FullBackupMetadata>;
  if (
    candidate.version !== 'snsgod-full-backup-v2'
    || candidate.mediaMode !== 'full-media'
    || typeof candidate.exportedAt !== 'number'
    || !Array.isArray(candidate.media)
    || candidate.media.length > MAX_FULL_BACKUP_MEDIA_ENTRIES
  ) {
    throw new Error('사진 포함 전체 ZIP 백업 형식이 아닙니다.');
  }
  const seenMediaIds = new Set<string>();
  const seenArchivePaths = new Set<string>();
  const media = candidate.media.map((item: unknown, index): FullBackupMediaMetadata => {
    if (!item || typeof item !== 'object') {
      throw new Error(`backup.json 미디어 ${index + 1}번 항목이 올바르지 않습니다.`);
    }
    const mediaItem = item as Partial<FullBackupMediaMetadata>;
    if (
      typeof mediaItem.mediaId !== 'string' || !mediaItem.mediaId
      || typeof mediaItem.sourceFileUri !== 'string' || !mediaItem.sourceFileUri.startsWith('file:')
      || typeof mediaItem.archivePath !== 'string'
      || !/^media\/\d{6}\.(?:jpg|png|webp|gif|mp4)$/.test(mediaItem.archivePath)
      || typeof mediaItem.type !== 'string' || !mediaItem.type
      || (mediaItem.contentHash !== undefined && typeof mediaItem.contentHash !== 'string')
      || (mediaItem.characterId !== undefined && typeof mediaItem.characterId !== 'string')
      || (mediaItem.createdAt !== undefined && typeof mediaItem.createdAt !== 'number')
      || seenMediaIds.has(mediaItem.mediaId)
      || seenArchivePaths.has(mediaItem.archivePath)
    ) {
      throw new Error(`backup.json 미디어 ${index + 1}번 항목이 올바르지 않습니다.`);
    }
    seenMediaIds.add(mediaItem.mediaId);
    seenArchivePaths.add(mediaItem.archivePath);
    return mediaItem as FullBackupMediaMetadata;
  });
  return {
    version: 'snsgod-full-backup-v2',
    exportedAt: candidate.exportedAt,
    mediaMode: 'full-media',
    media,
  };
}

function declaredUncompressedSize(file: JSZip.JSZipObject): number {
  const internal = file as JSZip.JSZipObject & { _data?: ZipEntryInternals };
  return typeof internal._data?.uncompressedSize === 'number'
    ? internal._data.uncompressedSize
    : 0;
}

function declaredCompressedSize(file: JSZip.JSZipObject): number {
  const internal = file as JSZip.JSZipObject & { _data?: ZipEntryInternals };
  return typeof internal._data?.compressedSize === 'number'
    ? internal._data.compressedSize
    : 0;
}

function isSNSGodState(value: unknown): value is SNSGodState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Record<keyof SNSGodState, unknown>>;
  return Boolean(
    candidate.config && typeof candidate.config === 'object'
    && Array.isArray(candidate.characters)
    && candidate.chatRooms && typeof candidate.chatRooms === 'object'
    && candidate.messages && typeof candidate.messages === 'object'
    && candidate.unreadCounts && typeof candidate.unreadCounts === 'object'
    && Array.isArray(candidate.snsPosts)
    && Array.isArray(candidate.snsDmThreads),
  );
}

/** Prepares a validated full ZIP restore and a rollback for newly added media. */
export async function importFullBackupZip(uri: string, password = ''): Promise<PreparedFullBackupRestore> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new Error('선택한 전체 백업 ZIP 파일을 찾을 수 없습니다.');
  if ('size' in info && typeof info.size === 'number' && info.size > MAX_FULL_BACKUP_ZIP_BYTES + 4096) {
    throw new Error('전체 백업 ZIP은 최대 512MB까지 복원할 수 있습니다.');
  }
  const fileBase64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  if (Math.floor(fileBase64.length * 3 / 4) > MAX_FULL_BACKUP_ZIP_BYTES + 4096) {
    throw new Error('전체 백업 ZIP은 최대 512MB까지 복원할 수 있습니다.');
  }
  const encrypted = isEncryptedBackupBase64(fileBase64);
  if (encrypted && !password) throw new Error('암호화된 백업입니다. 복원 암호를 입력해 주세요.');
  const base64 = encrypted ? await decryptBackupBase64(fileBase64, password) : fileBase64;
  if (Math.floor(base64.length * 3 / 4) > MAX_FULL_BACKUP_ZIP_BYTES) throw new Error('복호화한 전체 백업 ZIP이 512MB 제한을 넘습니다.');
  const uncheckedZip = await JSZip.loadAsync(base64, { base64: true, checkCRC32: false });
  const uncheckedFiles = Object.values(uncheckedZip.files).filter(file => !file.dir);
  if (uncheckedFiles.length > MAX_FULL_BACKUP_ARCHIVE_FILES) {
    throw new Error('전체 백업 ZIP에 허용된 수보다 많은 파일이 들어 있습니다.');
  }
  const declaredBytes = uncheckedFiles.reduce((total, file) => total + declaredUncompressedSize(file), 0);
  const declaredCompressedBytes = uncheckedFiles.reduce((total, file) => total + declaredCompressedSize(file), 0);
  if (declaredBytes > MAX_FULL_BACKUP_ZIP_BYTES) {
    throw new Error('압축을 푼 전체 백업 용량이 512MB 제한을 넘습니다.');
  }
  if (declaredBytes > 1024 * 1024 && declaredBytes > Math.max(1, declaredCompressedBytes) * 100) {
    throw new Error('전체 백업 ZIP의 압축 비율이 비정상적으로 높습니다.');
  }
  const zip = await JSZip.loadAsync(base64, { base64: true, checkCRC32: true });
  const archiveFiles = Object.values(zip.files).filter(file => !file.dir);
  if (archiveFiles.length > MAX_FULL_BACKUP_ARCHIVE_FILES) {
    throw new Error('전체 백업 ZIP에 허용된 수보다 많은 파일이 들어 있습니다.');
  }
  const stateFile = zip.file('state.json');
  if (!stateFile) throw new Error('state.json이 없는 백업입니다.');
  const stateRaw = await stateFile.async('string');
  const parsed: unknown = JSON.parse(stateRaw);
  if (!isSNSGodState(parsed)) throw new Error('백업 state.json 형식이 올바르지 않습니다.');
  const manifestFile = zip.file('mediaManifest.json');
  if (!manifestFile) throw new Error('mediaManifest.json이 없는 전체 백업입니다.');
  const manifest = parseMediaManifestText(await manifestFile.async('string'));
  if (manifest.length > MAX_FULL_BACKUP_MEDIA_ENTRIES) {
    throw new Error(`전체 백업 미디어는 최대 ${MAX_FULL_BACKUP_MEDIA_ENTRIES}개까지 복원할 수 있습니다.`);
  }
  const metadataFile = zip.file('backup.json');
  if (!metadataFile) throw new Error('backup.json이 없는 이전 형식 ZIP입니다. 새 전체 백업을 사용해 주세요.');
  const metadata = parseFullBackupMetadata(await metadataFile.async('string'));
  if (metadata.media.length !== manifest.length) {
    throw new Error('백업 manifest와 media 항목 수가 일치하지 않습니다.');
  }
  const allowedArchivePaths = new Set([
    'state.json',
    'mediaManifest.json',
    'backup.json',
    ...metadata.media.map(item => item.archivePath),
  ]);
  if (archiveFiles.some(file => !allowedArchivePaths.has(file.name))) {
    throw new Error('전체 백업 ZIP에 알 수 없는 파일이 들어 있습니다.');
  }
  const statePlan = buildFullBackupMediaPlan(collectStateMediaReferences(parsed), manifest);
  if (statePlan.unmanagedFileUris.length || statePlan.entries.length !== manifest.length) {
    throw new Error('백업 상태와 media manifest의 파일 참조가 일치하지 않습니다.');
  }
  const metadataById = new Map(metadata.media.map(item => [item.mediaId, item]));
  const records: ArchivedMediaRecord[] = [];
  for (const entry of manifest) {
    const archived = metadataById.get(entry.mediaId);
    if (
      !archived
      || archived.sourceFileUri !== entry.fileUri
      || archived.type !== entry.type
      || archived.contentHash !== entry.contentHash
      || archived.characterId !== entry.characterId
      || archived.createdAt !== entry.createdAt
    ) {
      throw new Error(`백업 manifest와 media 목록이 일치하지 않습니다: ${entry.mediaId}`);
    }
    const mediaFile = zip.file(archived.archivePath);
    if (!mediaFile) throw new Error(`백업 ZIP에 미디어 파일이 없습니다: ${entry.mediaId}`);
    records.push({
      mediaId: entry.mediaId,
      sourceFileUri: entry.fileUri,
      type: entry.type,
      base64: await mediaFile.async('base64'),
      contentHash: entry.contentHash,
      characterId: entry.characterId,
      createdAt: entry.createdAt,
    });
  }
  const prepared = await prepareArchivedMediaAssets(records);
  try {
    const state = applyStateMediaUriReplacements(
      parsed as SNSGodState,
      prepared.replacements.map(item => ({
        dataUri: item.sourceFileUri,
        fileUri: item.targetFileUri,
      })),
    );
    return {
      state,
      restoredMediaCount: prepared.replacements.length,
      rollback: prepared.rollback,
    };
  } catch (error) {
    await prepared.rollback();
    throw error;
  }
}
