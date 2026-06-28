import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

export async function pickImageDataUri(): Promise<string | undefined> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.length) return undefined;
  const asset = result.assets[0];
  const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
  return `data:${asset.mimeType || 'image/jpeg'};base64,${base64}`;
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
