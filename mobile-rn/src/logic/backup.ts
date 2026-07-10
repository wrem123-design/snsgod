import { SNSGodState } from '../types';
import * as FileSystem from 'expo-file-system';
import JSZip from 'jszip';
import { MEDIA_ROOT_DIR, readMediaManifest } from './media';

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
  return {
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
  };
}

export function createBackupPayload(state: SNSGodState, options: { includeMedia?: boolean } = {}) {
  return {
    version: 'snsgod-rn-backup-v1',
    exportedAt: Date.now(),
    mediaMode: options.includeMedia ? 'inline-or-file-ref' : 'state-only',
    state: stateWithoutSecrets(state)
  };
}

export async function exportFullBackupZip(state: SNSGodState): Promise<string> {
  const zip = new JSZip();
  const safeState = stateWithoutSecrets(state);
  zip.file('state.json', JSON.stringify(safeState, null, 2));
  const manifest = await readMediaManifest();
  zip.file('mediaManifest.json', JSON.stringify(manifest, null, 2));
  for (const entry of manifest) {
    try {
      const info = await FileSystem.getInfoAsync(entry.fileUri);
      if (!info.exists) continue;
      const name = entry.fileUri.split('/').pop() || `${entry.mediaId}.bin`;
      const base64 = await FileSystem.readAsStringAsync(entry.fileUri, { encoding: FileSystem.EncodingType.Base64 });
      zip.file(`media/${name}`, base64, { base64: true });
    } catch {
      // Missing media should not block exporting the rest of the backup.
    }
  }
  const base64Zip = await zip.generateAsync({ type: 'base64' });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const uri = `${FileSystem.cacheDirectory || FileSystem.documentDirectory || ''}snsgod-full-backup-${timestamp}.zip`;
  await FileSystem.writeAsStringAsync(uri, base64Zip, { encoding: FileSystem.EncodingType.Base64 });
  return uri;
}

export async function importFullBackupZip(uri: string): Promise<SNSGodState> {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const zip = await JSZip.loadAsync(base64, { base64: true });
  const stateFile = zip.file('state.json');
  if (!stateFile) throw new Error('state.json이 없는 백업입니다.');
  let stateRaw = await stateFile.async('string');
  const manifestFile = zip.file('mediaManifest.json');
  const manifest = manifestFile ? JSON.parse(await manifestFile.async('string')) as { fileUri?: string }[] : [];
  const mediaDir = `${MEDIA_ROOT_DIR}imported/`;
  if (FileSystem.documentDirectory) {
    const info = await FileSystem.getInfoAsync(mediaDir);
    if (!info.exists) await FileSystem.makeDirectoryAsync(mediaDir, { intermediates: true });
  }
  for (const entry of manifest) {
    if (!entry.fileUri) continue;
    const name = entry.fileUri.split('/').pop();
    const mediaFile = name ? zip.file(`media/${name}`) : undefined;
    if (!mediaFile) continue;
    const target = `${mediaDir}${Date.now()}_${name}`;
    const mediaBase64 = await mediaFile.async('base64');
    await FileSystem.writeAsStringAsync(target, mediaBase64, { encoding: FileSystem.EncodingType.Base64 });
    stateRaw = stateRaw.split(entry.fileUri).join(target);
  }
  const parsed = JSON.parse(stateRaw);
  if (!parsed || typeof parsed !== 'object') throw new Error('백업 state.json 형식이 올바르지 않습니다.');
  return parsed as SNSGodState;
}
