import * as SecureStore from 'expo-secure-store';
import type { ApiProfile, SNSGodState } from '../types';

const MANIFEST_KEY = 'snsgod.secure-secrets.manifest.v1';
const CHUNK_PREFIX = 'snsgod.secure-secrets.chunk.v1';
const CHUNK_LENGTH = 1800;

type ProfileSecrets = Pick<ApiProfile, 'apiKey' | 'apiKeys' | 'serviceAccountJson' | 'proxyAccessToken'>;

export type StateSecretEnvelope = {
  version: 1;
  apiProfiles: Record<string, ProfileSecrets>;
  imageApiKey?: string;
  serverPairingSecret?: string;
  serverDeviceToken?: string;
};

type SecretManifest = {
  version: 1;
  generation: string;
  chunks: number;
  length: number;
};

export type SecureKeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
};

const nativeStore: SecureKeyValueStore = {
  getItem: key => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  }),
  deleteItem: key => SecureStore.deleteItemAsync(key),
};

let lastStoredFingerprint = '';

function meaningful(value: unknown): string | undefined {
  const text = String(value || '').trim();
  return text || undefined;
}

function profileSecrets(profile: ApiProfile | undefined): ProfileSecrets | undefined {
  const apiKey = meaningful(profile?.apiKey);
  const apiKeys = (profile?.apiKeys || []).map(meaningful).filter((value): value is string => Boolean(value));
  const serviceAccountJson = meaningful(profile?.serviceAccountJson);
  const proxyAccessToken = meaningful(profile?.proxyAccessToken);
  if (!apiKey && !apiKeys.length && !serviceAccountJson && !proxyAccessToken) return undefined;
  return { apiKey, apiKeys, serviceAccountJson, proxyAccessToken };
}

/** Extracts only values that must never enter the ordinary state stores. */
export function extractStateSecrets(state: SNSGodState): StateSecretEnvelope {
  const apiProfiles: Record<string, ProfileSecrets> = {};
  for (const [provider, profile] of Object.entries(state.config.apiProfiles || {})) {
    const secrets = profileSecrets(profile);
    if (secrets) apiProfiles[provider] = secrets;
  }
  return {
    version: 1,
    apiProfiles,
    imageApiKey: meaningful(state.config.imageGeneration?.apiKey),
    serverPairingSecret: meaningful(state.config.serverMessaging?.pairingSecret),
    serverDeviceToken: meaningful(state.config.serverMessaging?.deviceToken),
  };
}

/** Removes secrets while preserving provider choice, endpoints, and runtime indices. */
export function stateWithoutStoredSecrets(state: SNSGodState): SNSGodState {
  const apiProfiles = Object.fromEntries(Object.entries(state.config.apiProfiles || {}).map(([provider, profile]) => [
    provider,
    {
      ...(profile || {}),
      apiKey: '',
      apiKeys: [],
      serviceAccountJson: '',
      proxyAccessToken: '',
    },
  ]));
  return {
    ...state,
    config: {
      ...state.config,
      apiProfiles,
      imageGeneration: state.config.imageGeneration ? { ...state.config.imageGeneration, apiKey: '' } : state.config.imageGeneration,
      serverMessaging: state.config.serverMessaging ? {
        ...state.config.serverMessaging,
        pairingSecret: '',
        deviceToken: '',
      } : state.config.serverMessaging,
    },
  };
}

/** Hydrates a redacted state with a validated secret envelope. */
export function applyStateSecrets(state: SNSGodState, secrets: StateSecretEnvelope): SNSGodState {
  const apiProfiles = { ...(state.config.apiProfiles || {}) };
  for (const [provider, values] of Object.entries(secrets.apiProfiles || {})) {
    apiProfiles[provider as keyof typeof apiProfiles] = {
      ...(apiProfiles[provider as keyof typeof apiProfiles] || {}),
      ...values,
      apiKeys: [...(values.apiKeys || [])],
    };
  }
  return {
    ...state,
    config: {
      ...state.config,
      apiProfiles,
      imageGeneration: state.config.imageGeneration ? {
        ...state.config.imageGeneration,
        apiKey: secrets.imageApiKey || '',
      } : state.config.imageGeneration,
      serverMessaging: state.config.serverMessaging ? {
        ...state.config.serverMessaging,
        pairingSecret: secrets.serverPairingSecret || '',
        deviceToken: secrets.serverDeviceToken || '',
      } : state.config.serverMessaging,
    },
  };
}

function mergeSecretEnvelopes(base: StateSecretEnvelope, override: StateSecretEnvelope): StateSecretEnvelope {
  return {
    version: 1,
    apiProfiles: { ...base.apiProfiles, ...override.apiProfiles },
    imageApiKey: override.imageApiKey || base.imageApiKey,
    serverPairingSecret: override.serverPairingSecret || base.serverPairingSecret,
    serverDeviceToken: override.serverDeviceToken || base.serverDeviceToken,
  };
}

function chunkKey(generation: string, index: number): string {
  return `${CHUNK_PREFIX}.${generation}.${index}`;
}

function parseManifest(raw: string | null): SecretManifest | undefined {
  if (!raw) return undefined;
  const parsed = JSON.parse(raw) as Partial<SecretManifest>;
  if (parsed.version !== 1 || !/^[a-z0-9]+$/i.test(String(parsed.generation || ''))) throw new Error('보안 저장소 manifest가 올바르지 않습니다.');
  const chunks = Number(parsed.chunks);
  const length = Number(parsed.length);
  if (!Number.isSafeInteger(chunks) || chunks < 1 || chunks > 128 || !Number.isSafeInteger(length) || length < 1 || length > chunks * CHUNK_LENGTH || length <= (chunks - 1) * CHUNK_LENGTH) {
    throw new Error('보안 저장소 manifest 크기가 올바르지 않습니다.');
  }
  return { version: 1, generation: String(parsed.generation), chunks, length };
}

function parseEnvelope(raw: string): StateSecretEnvelope {
  const parsed = JSON.parse(raw) as Partial<StateSecretEnvelope>;
  if (parsed.version !== 1 || !parsed.apiProfiles || typeof parsed.apiProfiles !== 'object' || Array.isArray(parsed.apiProfiles)) {
    throw new Error('보안 저장소 자격정보 형식이 올바르지 않습니다.');
  }
  const entries = Object.entries(parsed.apiProfiles);
  if (entries.length > 32) throw new Error('보안 저장소 provider 개수가 올바르지 않습니다.');
  const apiProfiles: Record<string, ProfileSecrets> = {};
  for (const [provider, value] of entries) {
    if (!provider || provider.length > 64 || !value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('보안 저장소 provider 자격정보가 올바르지 않습니다.');
    }
    const record = value as Partial<ProfileSecrets>;
    if (record.apiKeys !== undefined && !Array.isArray(record.apiKeys)) throw new Error('보안 저장소 API 키 목록이 올바르지 않습니다.');
    apiProfiles[provider] = {
      apiKey: meaningful(record.apiKey),
      apiKeys: (record.apiKeys || []).map(meaningful).filter((item): item is string => Boolean(item)).slice(0, 16),
      serviceAccountJson: meaningful(record.serviceAccountJson),
      proxyAccessToken: meaningful(record.proxyAccessToken),
    };
  }
  return {
    version: 1,
    apiProfiles,
    imageApiKey: meaningful(parsed.imageApiKey),
    serverPairingSecret: meaningful(parsed.serverPairingSecret),
    serverDeviceToken: meaningful(parsed.serverDeviceToken),
  };
}

export async function loadStateSecrets(store: SecureKeyValueStore = nativeStore): Promise<StateSecretEnvelope> {
  const manifest = parseManifest(await store.getItem(MANIFEST_KEY));
  if (!manifest) return { version: 1, apiProfiles: {} };
  const chunks = await Promise.all(Array.from({ length: manifest.chunks }, (_, index) => store.getItem(chunkKey(manifest.generation, index))));
  if (chunks.some(chunk => chunk === null)) throw new Error('보안 저장소 자격정보 일부를 읽지 못했습니다.');
  const raw = chunks.join('');
  if (raw.length !== manifest.length) throw new Error('보안 저장소 자격정보 길이가 일치하지 않습니다.');
  const envelope = parseEnvelope(raw);
  lastStoredFingerprint = JSON.stringify(envelope);
  return envelope;
}

export async function saveStateSecrets(state: SNSGodState, store: SecureKeyValueStore = nativeStore): Promise<void> {
  const envelope = extractStateSecrets(state);
  const raw = JSON.stringify(envelope);
  if (store === nativeStore && raw === lastStoredFingerprint) return;
  const previous = parseManifest(await store.getItem(MANIFEST_KEY));
  const generation = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const chunks = Array.from({ length: Math.max(1, Math.ceil(raw.length / CHUNK_LENGTH)) }, (_, index) => raw.slice(index * CHUNK_LENGTH, (index + 1) * CHUNK_LENGTH));
  await Promise.all(chunks.map((chunk, index) => store.setItem(chunkKey(generation, index), chunk)));
  try {
    await store.setItem(MANIFEST_KEY, JSON.stringify({ version: 1, generation, chunks: chunks.length, length: raw.length } satisfies SecretManifest));
  } catch (error) {
    await Promise.all(chunks.map((_, index) => store.deleteItem(chunkKey(generation, index))).map(task => task.catch(() => undefined)));
    throw error;
  }
  lastStoredFingerprint = raw;
  if (previous && previous.generation !== generation) {
    await Promise.all(Array.from({ length: previous.chunks }, (_, index) => store.deleteItem(chunkKey(previous.generation, index))).map(task => task.catch(() => undefined)));
  }
}

/** Reads SecureStore, migrates any legacy plaintext values, and hydrates runtime state. */
export async function hydrateStateSecrets(state: SNSGodState, store: SecureKeyValueStore = nativeStore): Promise<{ state: SNSGodState; migratedPlaintext: boolean }> {
  const legacy = extractStateSecrets(state);
  const migratedPlaintext = JSON.stringify(legacy) !== JSON.stringify({ version: 1, apiProfiles: {} });
  const stored = await loadStateSecrets(store);
  const merged = mergeSecretEnvelopes(stored, legacy);
  if (migratedPlaintext) await saveStateSecrets(applyStateSecrets(stateWithoutStoredSecrets(state), merged), store);
  return { state: applyStateSecrets(stateWithoutStoredSecrets(state), merged), migratedPlaintext };
}

/** Keeps current device credentials when importing a backup that excludes them. */
export function carryStateSecrets(source: SNSGodState, target: SNSGodState): SNSGodState {
  return applyStateSecrets(stateWithoutStoredSecrets(target), extractStateSecrets(source));
}
