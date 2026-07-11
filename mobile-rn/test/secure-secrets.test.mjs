import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

async function importSecureSecrets() {
  const original = readFileSync(new URL('../src/storage/secureSecrets.ts', import.meta.url), 'utf8');
  const source = original.replace(
    "import * as SecureStore from 'expo-secure-store';",
    "const SecureStore = { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1, getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} };",
  );
  const transpiled = ts.transpileModule(source, {
    fileName: 'src/storage/secureSecrets.ts',
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  assert.equal(transpiled.diagnostics?.length ?? 0, 0);
  return import(`data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`);
}

function memoryStore(options = {}) {
  const values = new Map();
  return {
    values,
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) {
      if (options.failManifest && key.includes('manifest')) throw new Error('manifest failure');
      values.set(key, value);
    },
    async deleteItem(key) { values.delete(key); },
  };
}

function state(secrets = {}) {
  return {
    config: {
      apiType: 'openai',
      apiProfiles: {
        openai: { apiEndpoint: 'https://example.test', apiKey: secrets.apiKey || '', apiKeys: secrets.apiKeys || [] },
        vertex: { serviceAccountJson: secrets.serviceAccountJson || '', proxyAccessToken: secrets.proxyAccessToken || '' },
      },
      userName: '나', userDescription: '', roomName: '채팅', language: 'Korean',
      imageGeneration: { enabled: true, apiKey: secrets.imageApiKey || '' },
      serverMessaging: {
        enabled: true,
        baseUrl: 'https://server.test',
        pairingSecret: secrets.pairingSecret || '',
        deviceId: 'public-device-id',
        deviceToken: secrets.deviceToken || '',
      },
    },
    messages: { room: [{ id: 'message-1', content: 'local content' }] },
  };
}

const secretsModule = await importSecureSecrets();
const {
  applyStateSecrets,
  carryStateSecrets,
  extractStateSecrets,
  hydrateStateSecrets,
  loadStateSecrets,
  saveStateSecrets,
  stateWithoutStoredSecrets,
} = secretsModule;

test('ordinary state snapshots contain no provider, image, or server secrets', () => {
  const runtime = state({
    apiKey: 'api-primary', apiKeys: ['api-secondary'], serviceAccountJson: 'service-private',
    proxyAccessToken: 'proxy-secret', imageApiKey: 'image-secret', pairingSecret: 'pairing-secret', deviceToken: 'device-secret',
  });
  const safeJson = JSON.stringify(stateWithoutStoredSecrets(runtime));
  for (const secret of ['api-primary', 'api-secondary', 'service-private', 'proxy-secret', 'image-secret', 'pairing-secret', 'device-secret']) {
    assert.doesNotMatch(safeJson, new RegExp(secret));
  }
  assert.match(safeJson, /https:\/\/example\.test/);
  assert.match(safeJson, /public-device-id/);
  assert.match(safeJson, /local content/);
});

test('chunked secure storage round-trips credentials larger than one platform value', async () => {
  const store = memoryStore();
  const runtime = state({ apiKey: 'api-primary', serviceAccountJson: `private-${'x'.repeat(5200)}`, deviceToken: 'device-secret' });
  await saveStateSecrets(runtime, store);
  assert.ok([...store.values.keys()].filter(key => key.includes('chunk')).length >= 3);
  const loaded = await loadStateSecrets(store);
  assert.equal(loaded.apiProfiles.openai.apiKey, 'api-primary');
  assert.equal(loaded.apiProfiles.vertex.serviceAccountJson, `private-${'x'.repeat(5200)}`);
  assert.equal(loaded.serverDeviceToken, 'device-secret');
  const hydrated = applyStateSecrets(stateWithoutStoredSecrets(runtime), loaded);
  assert.equal(hydrated.config.apiProfiles.openai.apiKey, 'api-primary');
  assert.equal(hydrated.config.apiProfiles.vertex.serviceAccountJson.length, 5208);
  assert.equal(hydrated.config.serverMessaging.deviceToken, 'device-secret');
});

test('legacy plaintext is written securely before returning a redacted and hydrated runtime', async () => {
  const store = memoryStore();
  const legacy = state({ apiKey: 'legacy-key', pairingSecret: 'legacy-pairing' });
  const result = await hydrateStateSecrets(legacy, store);
  assert.equal(result.migratedPlaintext, true);
  assert.equal(result.state.config.apiProfiles.openai.apiKey, 'legacy-key');
  assert.equal(result.state.config.serverMessaging.pairingSecret, 'legacy-pairing');
  assert.equal((await loadStateSecrets(store)).apiProfiles.openai.apiKey, 'legacy-key');
  assert.doesNotMatch(JSON.stringify(stateWithoutStoredSecrets(result.state)), /legacy-key|legacy-pairing/);
});

test('a failed manifest replacement leaves the previous generation readable', async () => {
  const store = memoryStore();
  await saveStateSecrets(state({ apiKey: 'old-key' }), store);
  const failing = {
    values: store.values,
    getItem: store.getItem,
    deleteItem: store.deleteItem,
    async setItem(key, value) {
      if (key.includes('manifest')) throw new Error('manifest failure');
      store.values.set(key, value);
    },
  };
  await assert.rejects(saveStateSecrets(state({ apiKey: 'new-key' }), failing), /manifest failure/);
  assert.equal((await loadStateSecrets(store)).apiProfiles.openai.apiKey, 'old-key');
  assert.equal([...store.values.keys()].filter(key => key.includes('chunk')).length, 1);
});

test('backup restore carries current device secrets into the imported state', () => {
  const current = state({ apiKey: 'device-key', imageApiKey: 'image-key', deviceToken: 'device-token' });
  const imported = stateWithoutStoredSecrets(state());
  const carried = carryStateSecrets(current, imported);
  assert.equal(carried.config.apiProfiles.openai.apiKey, 'device-key');
  assert.equal(carried.config.imageGeneration.apiKey, 'image-key');
  assert.equal(carried.config.serverMessaging.deviceToken, 'device-token');
});

test('persistence prepares redacted data before committing secrets and returning the payload', () => {
  const persistSource = readFileSync(new URL('../src/storage/persist.ts', import.meta.url), 'utf8');
  assert.match(persistSource, /stateWithoutStoredSecrets\(state\)[\s\S]*externalizeStateMediaWithResult\(storageSafeState\)[\s\S]*await saveStateSecrets\(state\);[\s\S]*return \{/);
  assert.match(persistSource, /hydrateStateSecrets\(normalized\)/);
  assert.match(persistSource, /secure secret plaintext migration/);
});

test('backup and debug logging use the shared redaction boundaries', () => {
  const backupSource = readFileSync(new URL('../src/logic/backup.ts', import.meta.url), 'utf8');
  const debugSource = readFileSync(new URL('../src/logic/debugLog.ts', import.meta.url), 'utf8');
  assert.match(backupSource, /stateWithoutStoredSecrets/);
  assert.match(debugSource, /redactSecretText\(message\)/);
});

test('debug redaction removes bearer, JSON, array, and private-key credential shapes', async () => {
  const source = readFileSync(new URL('../src/logic/secretRedaction.ts', import.meta.url), 'utf8');
  const transpiled = ts.transpileModule(source, {
    fileName: 'src/logic/secretRedaction.ts',
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const { redactSecretText } = await import(`data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`);
  const privateKey = '-----BEGIN PRIVATE KEY-----\\nabc123\\n-----END PRIVATE KEY-----';
  const redacted = redactSecretText(`Bearer token.secret {"apiKey":"key-1","apiKeys":["key-2","key-3"],"serviceAccountJson":"${privateKey}","deviceToken":"device-1"}`);
  for (const secret of ['token.secret', 'key-1', 'key-2', 'key-3', 'abc123', 'device-1']) {
    assert.doesNotMatch(redacted, new RegExp(secret.replace('.', '\\.')));
  }
  assert.match(redacted, /REDACTED/);
});
