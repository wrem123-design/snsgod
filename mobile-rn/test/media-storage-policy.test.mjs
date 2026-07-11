import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const persistSource = readFileSync(new URL('../src/storage/persist.ts', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

async function importPureTypeScript(relativePath) {
  const source = readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
  const transpiled = ts.transpileModule(source, {
    fileName: relativePath,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  assert.equal(transpiled.diagnostics?.length ?? 0, 0);
  return import(
    `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`
  );
}

const {
  canonicalAssetFileUri,
  canonicalMediaDescriptor,
  createAsyncSingleFlight,
  createCanonicalMediaAssetStore,
  createSerializedMediaManifestStore,
  parseBase64DataUri,
  parseMediaManifestText,
  replaceTextFileAtomically,
  upsertMediaManifestEntry,
} = await importPureTypeScript('src/logic/mediaStoragePolicy.ts');

const {
  applyStateMediaUriReplacements,
  collectStateMediaExternalizationTargets,
  createStateMediaReplacementCache,
} = await importPureTypeScript('src/logic/stateMediaPolicy.ts');

const sha256 = base64 => createHash('sha256').update(Buffer.from(base64, 'base64')).digest('hex');

function entry(mediaId, fileUri = `file:///media/${mediaId}.jpg`, createdAt = 100) {
  return {
    mediaId,
    fileUri,
    type: 'image/jpeg',
    createdAt,
  };
}

function mapTextFileAdapter(files, options = {}) {
  return {
    async exists(path) {
      return files.has(path);
    },
    async read(path) {
      const value = files.get(path);
      if (value === undefined) throw new Error(`missing ${path}`);
      return value;
    },
    async write(path, value) {
      files.set(path, value);
    },
    async move(from, to) {
      if (options.failMove?.(from, to)) throw new Error(`move failed: ${from} -> ${to}`);
      const value = files.get(from);
      if (value === undefined) throw new Error(`missing ${from}`);
      files.set(to, value);
      files.delete(from);
    },
    async remove(path) {
      files.delete(path);
    },
  };
}

test('canonical descriptors use normalized media content instead of MIME, hints, or timestamps', () => {
  const firstDataUri = 'data:image/JPEG;base64, YWJjZA==\n';
  const secondDataUri = 'data:image/png;base64,YWJjZA==';
  const digest = sha256('YWJjZA==');

  const first = canonicalMediaDescriptor(firstDataUri, digest);
  const second = canonicalMediaDescriptor(secondDataUri, digest);

  assert.equal(first?.mediaId, second?.mediaId);
  assert.equal(first?.mediaId, `asset_${digest}`);
  assert.equal(first?.extension, 'jpg');
  assert.equal(first?.base64, 'YWJjZA==');
  assert.deepEqual([...first.bytes], [...Buffer.from('YWJjZA==', 'base64')]);
});

test('non-canonical base64 padding bits normalize to the same decoded content', () => {
  const canonical = parseBase64DataUri('data:application/octet-stream;base64,YQ==');
  const alternatePaddingBits = parseBase64DataUri('data:application/octet-stream;base64,YR==');

  assert.equal(canonical?.base64, 'YQ==');
  assert.equal(alternatePaddingBits?.base64, 'YQ==');
  assert.deepEqual([...canonical.bytes], [...alternatePaddingBits.bytes]);
});

test('different content remains distinct even when the logical hint is the same', () => {
  const first = canonicalMediaDescriptor(
    'data:image/jpeg;base64,YQ==',
    sha256('YQ=='),
  );
  const second = canonicalMediaDescriptor(
    'data:image/jpeg;base64,Yg==',
    sha256('Yg=='),
  );

  assert.notEqual(first?.mediaId, second?.mediaId);
});

test('an existing content asset keeps one URI even when a later MIME hint differs', () => {
  const digest = sha256('YWJjZA==');
  const jpeg = canonicalMediaDescriptor('data:image/jpeg;base64,YWJjZA==', digest);
  const png = canonicalMediaDescriptor('data:image/png;base64,YWJjZA==', digest);
  assert.ok(jpeg && png);
  const existingUri = `file:///media/assets/${jpeg.mediaId}.jpg`;

  assert.equal(
    canonicalAssetFileUri([entry(jpeg.mediaId, existingUri)], png, 'file:///media/assets/'),
    existingUri,
  );
});

test('parallel work for one canonical asset is single-flight and can run again after completion', async () => {
  const singleFlight = createAsyncSingleFlight();
  let writes = 0;
  const write = async () => {
    writes += 1;
    await new Promise(resolve => setImmediate(resolve));
    return 'file:///media/shared.jpg';
  };

  const [first, second, third] = await Promise.all([
    singleFlight.run('asset', write),
    singleFlight.run('asset', write),
    singleFlight.run('asset', write),
  ]);
  assert.deepEqual([first, second, third], Array(3).fill('file:///media/shared.jpg'));
  assert.equal(writes, 1);

  await singleFlight.run('asset', write);
  assert.equal(writes, 2);
});

test('composed canonical storage writes one asset for repeated equivalent data URIs', async () => {
  let manifest = [];
  const files = new Map();
  let writes = 0;
  const store = createCanonicalMediaAssetStore({
    async sha256(bytes) {
      return createHash('sha256').update(bytes).digest('hex');
    },
    async readManifest() {
      return structuredClone(manifest);
    },
    async verifyAsset(fileUri, expectedHash) {
      const file = files.get(fileUri);
      return file?.hash === expectedHash ? { size: file.size } : undefined;
    },
    async writeAssetAtomically(fileUri, base64, expectedHash) {
      writes += 1;
      const bytes = Buffer.from(base64, 'base64');
      assert.equal(createHash('sha256').update(bytes).digest('hex'), expectedHash);
      files.set(fileUri, { hash: expectedHash, size: bytes.length });
      return { size: bytes.length };
    },
    async upsertManifest(nextEntry) {
      manifest = upsertMediaManifestEntry(manifest, nextEntry);
    },
    now: () => 123,
  });

  const inputs = Array.from({ length: 10 }, (_, index) => (
    index % 2
      ? 'data:image/jpeg;base64,YQ=='
      : 'data:application/octet-stream;base64,YR=='
  ));
  const uris = await Promise.all(inputs.map((dataUri, index) => store.externalize(dataUri, {
    assetDirectory: 'file:///media/assets/',
    hint: `same-content-${index}`,
  })));

  assert.equal(new Set(uris).size, 1);
  assert.equal(writes, 1);
  assert.equal(files.size, 1);
  assert.equal(manifest.length, 1);
});

test('composed canonical storage replaces a corrupt deterministic file before reuse', async () => {
  const bytes = Buffer.from('valid image bytes');
  const base64 = bytes.toString('base64');
  const contentHash = createHash('sha256').update(bytes).digest('hex');
  const mediaId = `asset_${contentHash}`;
  const fileUri = `file:///media/assets/${mediaId}.jpg`;
  let manifest = [entry(mediaId, fileUri)];
  const files = new Map([[fileUri, { hash: '0'.repeat(64), size: bytes.length }]]);
  let writes = 0;
  const store = createCanonicalMediaAssetStore({
    async sha256(value) {
      return createHash('sha256').update(value).digest('hex');
    },
    async readManifest() {
      return structuredClone(manifest);
    },
    async verifyAsset(uri, expectedHash) {
      const file = files.get(uri);
      return file?.hash === expectedHash ? { size: file.size } : undefined;
    },
    async writeAssetAtomically(uri, storedBase64, expectedHash) {
      writes += 1;
      const storedBytes = Buffer.from(storedBase64, 'base64');
      const storedHash = createHash('sha256').update(storedBytes).digest('hex');
      assert.equal(storedHash, expectedHash);
      files.set(uri, { hash: storedHash, size: storedBytes.length });
      return { size: storedBytes.length };
    },
    async upsertManifest(nextEntry) {
      manifest = upsertMediaManifestEntry(manifest, nextEntry);
    },
    now: () => 456,
  });

  const result = await store.externalize(`data:image/jpeg;base64,${base64}`, {
    assetDirectory: 'file:///media/assets/',
    hint: 'recovery',
  });

  assert.equal(result, fileUri);
  assert.equal(writes, 1);
  assert.equal(files.get(fileUri).hash, contentHash);
});

test('malformed or non-base64 data URIs are not externalized', () => {
  assert.equal(canonicalMediaDescriptor('https://example.com/image.jpg', 'a'.repeat(64)), undefined);
  assert.equal(canonicalMediaDescriptor('data:image/jpeg,plain-text', 'a'.repeat(64)), undefined);
  assert.equal(canonicalMediaDescriptor('data:image/jpeg;base64,%%%', 'a'.repeat(64)), undefined);
});

test('manifest upserts deduplicate one asset without deleting unrelated legacy entries', () => {
  const original = [
    entry('legacy_profile', 'file:///media/old-profile.jpg', 10),
    entry(`asset_${'a'.repeat(64)}`, 'file:///media/a.jpg', 20),
  ];
  const replacement = entry(`asset_${'a'.repeat(64)}`, 'file:///media/a.jpg', 999);

  const next = upsertMediaManifestEntry(original, replacement);

  assert.equal(next.length, 2);
  assert.equal(next.find(item => item.mediaId === replacement.mediaId)?.createdAt, 20);
  assert.ok(next.some(item => item.mediaId === 'legacy_profile'));
});

test('a structurally damaged manifest is rejected instead of being filtered into data loss', () => {
  assert.throws(
    () => parseMediaManifestText(JSON.stringify([
      entry('valid'),
      { fileUri: 'file:///media/orphan.jpg' },
    ])),
    /invalid entry/i,
  );
});

test('manifest validation rejects malformed optional metadata and canonical identity mismatches', () => {
  assert.throws(
    () => parseMediaManifestText(JSON.stringify([{ ...entry('legacy'), size: 'large' }])),
    /invalid entry/i,
  );
  assert.throws(
    () => parseMediaManifestText(JSON.stringify([{
      ...entry(`asset_${'c'.repeat(64)}`),
      contentHash: 'd'.repeat(64),
    }])),
    /identity/i,
  );
  assert.throws(
    () => parseMediaManifestText(JSON.stringify([entry('duplicate'), entry('duplicate')])),
    /duplicate/i,
  );
});

test('a media ID collision cannot silently point at different files', () => {
  const original = [entry(`asset_${'b'.repeat(64)}`, 'file:///media/first.jpg')];
  assert.throws(
    () => upsertMediaManifestEntry(
      original,
      entry(`asset_${'b'.repeat(64)}`, 'file:///media/second.jpg'),
    ),
    /collision/i,
  );
});

test('parallel manifest upserts are serialized without lost entries', async () => {
  let persisted = [];
  let activeWrites = 0;
  let maximumActiveWrites = 0;
  const store = createSerializedMediaManifestStore({
    async read() {
      const snapshot = structuredClone(persisted);
      await Promise.resolve();
      return snapshot;
    },
    async replaceAtomically(next) {
      activeWrites += 1;
      maximumActiveWrites = Math.max(maximumActiveWrites, activeWrites);
      await new Promise(resolve => setImmediate(resolve));
      persisted = structuredClone(next);
      activeWrites -= 1;
    },
  });

  await Promise.all([
    store.upsert(entry('first')),
    store.upsert(entry('second')),
    store.upsert(entry('third')),
  ]);

  assert.deepEqual(
    persisted.map(item => item.mediaId).sort(),
    ['first', 'second', 'third'],
  );
  assert.equal(maximumActiveWrites, 1);
});

test('one failed manifest write does not poison later updates', async () => {
  let persisted = [];
  let failNextWrite = true;
  const store = createSerializedMediaManifestStore({
    async read() {
      return structuredClone(persisted);
    },
    async replaceAtomically(next) {
      if (failNextWrite) {
        failNextWrite = false;
        throw new Error('simulated write failure');
      }
      persisted = structuredClone(next);
    },
  });

  await assert.rejects(store.upsert(entry('failed')), /simulated write failure/);
  await store.upsert(entry('recovered'));

  assert.deepEqual(persisted.map(item => item.mediaId), ['recovered']);
});

test('atomic text replacement keeps the previous valid generation after success', async () => {
  const files = new Map([['manifest.json', '["old"]']]);
  const adapter = {
    async exists(path) {
      return files.has(path);
    },
    async read(path) {
      const value = files.get(path);
      if (value === undefined) throw new Error(`missing ${path}`);
      return value;
    },
    async write(path, value) {
      files.set(path, value);
    },
    async move(from, to) {
      const value = files.get(from);
      if (value === undefined) throw new Error(`missing ${from}`);
      files.set(to, value);
      files.delete(from);
    },
    async remove(path) {
      files.delete(path);
    },
  };

  await replaceTextFileAtomically(adapter, {
    primary: 'manifest.json',
    temporary: 'manifest.tmp.json',
    previous: 'manifest.previous.json',
  }, '["new"]', value => JSON.parse(value));

  assert.equal(files.get('manifest.json'), '["new"]');
  assert.equal(files.has('manifest.tmp.json'), false);
  assert.equal(files.get('manifest.previous.json'), '["old"]');
});

test('atomic text replacement preserves a valid previous generation when current is corrupt', async () => {
  const files = new Map([
    ['manifest.json', '{broken'],
    ['manifest.previous.json', '["recoverable"]'],
  ]);
  const adapter = mapTextFileAdapter(files);

  await replaceTextFileAtomically(adapter, {
    primary: 'manifest.json',
    temporary: 'manifest.tmp.json',
    previous: 'manifest.previous.json',
  }, '["new"]', value => JSON.parse(value));

  assert.equal(files.get('manifest.json'), '["new"]');
  assert.equal(files.get('manifest.previous.json'), '["recoverable"]');
});

test('atomic text replacement restores current and removes temp after installation failure', async () => {
  const files = new Map([['manifest.json', '["old"]']]);
  const adapter = mapTextFileAdapter(files, {
    failMove: (from, to) => from === 'manifest.tmp.json' && to === 'manifest.json',
  });

  await assert.rejects(replaceTextFileAtomically(adapter, {
    primary: 'manifest.json',
    temporary: 'manifest.tmp.json',
    previous: 'manifest.previous.json',
  }, '["new"]', value => JSON.parse(value)));

  assert.equal(files.get('manifest.json'), '["old"]');
  assert.equal(files.has('manifest.tmp.json'), false);
  assert.equal(files.has('manifest.previous.json'), false);
});

test('runtime replacement patches only matching media values in the latest state', () => {
  const originalDataUri = 'data:image/jpeg;base64,YWJj';
  const canonicalUri = 'file:///media/asset_a.jpg';
  const latest = {
    __revision: 8,
    config: { theme: 'latest' },
    characters: [{
      id: 'character-1',
      name: 'A',
      avatar: originalDataUri,
      profileImage: 'data:image/jpeg;base64,bmV3ZXI=',
      profileImageHistory: [{ id: 'history-1', image: originalDataUri, createdAt: 1 }],
    }],
    messages: {
      room: [
        { id: 'message-1', role: 'user', content: 'kept', createdAt: 1, mediaData: originalDataUri },
        { id: 'message-2', role: 'user', content: 'new', createdAt: 2 },
      ],
    },
    snsPosts: [],
    referenceFaceSlots: [],
    userStickers: [],
    meetingEventSessions: [],
  };

  const patched = applyStateMediaUriReplacements(latest, [
    { dataUri: originalDataUri, fileUri: canonicalUri },
  ]);

  assert.notEqual(patched, latest);
  assert.equal(patched.__revision, 8);
  assert.equal(patched.config.theme, 'latest');
  assert.equal(patched.characters[0].avatar, canonicalUri);
  assert.equal(patched.characters[0].profileImage, 'data:image/jpeg;base64,bmV3ZXI=');
  assert.equal(patched.characters[0].profileImageHistory[0].image, canonicalUri);
  assert.equal(patched.messages.room[0].mediaData, canonicalUri);
  assert.equal(patched.messages.room[1].content, 'new');
  assert.equal(latest.characters[0].avatar, originalDataUri);
});

test('album favorites follow canonical URI replacement without becoming ownership references', () => {
  const originalDataUri = 'data:image/jpeg;base64,YWJj';
  const canonicalUri = 'file:///media/assets/asset_a.jpg';
  const latest = {
    config: {},
    characters: [{ id: 'character-1', name: 'A', avatar: originalDataUri }],
    messages: {},
    snsPosts: [],
    snsDmThreads: [],
    referenceFaceSlots: [],
    userStickers: [],
    meetingEventSessions: [],
    mediaAlbumFavoriteUris: [originalDataUri],
  };

  const patched = applyStateMediaUriReplacements(latest, [
    { dataUri: originalDataUri, fileUri: canonicalUri },
  ]);

  assert.deepEqual(patched.mediaAlbumFavoriteUris, [canonicalUri]);
  assert.equal(collectStateMediaExternalizationTargets(latest).length, 1);
});

test('a stale runtime replacement never restores deleted or newly changed media', () => {
  const oldDataUri = 'data:image/jpeg;base64,b2xk';
  const latest = {
    characters: [{ id: 'character-1', name: 'A', avatar: undefined, profileImage: 'data:image/jpeg;base64,bmV3' }],
    messages: {},
    snsPosts: [],
    referenceFaceSlots: [],
    userStickers: [],
    meetingEventSessions: [],
  };

  const patched = applyStateMediaUriReplacements(latest, [
    { dataUri: oldDataUri, fileUri: 'file:///media/old.jpg' },
  ]);

  assert.equal(patched, latest);
  assert.equal(patched.characters[0].avatar, undefined);
  assert.equal(patched.characters[0].profileImage, 'data:image/jpeg;base64,bmV3');
});

test('state target collection deduplicates shared assets and preserves force semantics', () => {
  const shared = 'data:image/jpeg;base64,c2hhcmVk';
  const state = {
    characters: [{
      id: 'character-1',
      name: 'A',
      avatar: shared,
      stickers: [{ id: 'sticker-1', name: 'S', data: shared }],
    }],
    randomCharacters: [{ id: 'random-1', name: 'R', profileImage: shared }],
    messages: {},
    snsPosts: [],
    snsDmThreads: [],
    referenceFaceSlots: [{ id: 'reference-1', image: shared, createdAt: 1 }],
    userStickers: [],
    meetingEventSessions: [],
  };

  const targets = collectStateMediaExternalizationTargets(state);

  assert.equal(targets.length, 1);
  assert.equal(targets[0].dataUri, shared);
  assert.equal(targets[0].force, true);
});

test('runtime replacement cache is bounded, expires, and drops unreferenced files', () => {
  const cache = createStateMediaReplacementCache({
    ttlMs: 100,
    maxEntries: 2,
    maxDataUriCharacters: 30,
  });
  const first = { dataUri: 'data:first', fileUri: 'file:///first' };
  const second = { dataUri: 'data:second', fileUri: 'file:///second' };
  const oversized = { dataUri: `data:${'x'.repeat(40)}`, fileUri: 'file:///oversized' };

  cache.add([first, second, oversized], 1_000);
  assert.deepEqual(cache.active(1_000), [first, second]);
  assert.ok(cache.retainedDataUriCharacters() <= 30);

  assert.deepEqual(cache.active(1_001, new Set([second.fileUri])), [second]);
  assert.deepEqual(cache.active(1_101), []);
  assert.equal(cache.retainedDataUriCharacters(), 0);
});

test('persistence publishes media replacements only after a successful current revision write', () => {
  const writeStateSource = persistSource.slice(
    persistSource.indexOf('async function writeStateNow'),
    persistSource.indexOf('export async function saveState'),
  );
  const staleGuard = writeStateSource.indexOf('prepared.stats.revision < persistedRevision');
  const bundleWrite = writeStateSource.indexOf("perf.measure('SQLite bundle write'");
  const revisionCommit = writeStateSource.lastIndexOf('persistedRevision = prepared.stats.revision');
  const runtimePublish = writeStateSource.indexOf('options.onMediaExternalized(prepared.mediaReplacements)');

  assert.ok(staleGuard >= 0 && staleGuard < runtimePublish);
  assert.ok(bundleWrite >= 0 && bundleWrite < runtimePublish);
  assert.ok(revisionCommit >= 0 && revisionCommit < runtimePublish);
  assert.match(
    writeStateSource,
    /writeSqliteBundle\(\s*prepared\.payload,\s*prepared\.snapshot,\s*prepared\.normalizedState\.messages/s,
  );
  assert.match(
    writeStateSource,
    /pendingState = applyStateMediaUriReplacements\(pendingState, prepared\.mediaReplacements\)/,
  );
});

test('the App patches the latest state directly without creating a persistence loop', () => {
  const helperSource = appSource.slice(
    appSource.indexOf('function applyPersistedMediaUris'),
    appSource.indexOf('async function commitFromRenderedSnapshot'),
  );

  assert.match(helperSource, /const current = stateRef\.current/);
  assert.match(helperSource, /persistedMediaUrisRef\.current\.add/);
  assert.match(helperSource, /applyStateMediaUriReplacements\(current, replacements\)/);
  assert.match(helperSource, /stateRef\.current = patched/);
  assert.match(helperSource, /setState\(patched\)/);
  assert.doesNotMatch(helperSource, /saveState|commit\(/);
  assert.match(appSource, /onMediaExternalized: applyPersistedMediaUris/);
  assert.match(appSource, /applyStateMediaUriReplacements\(next, knownMediaReplacements\)/);
});
