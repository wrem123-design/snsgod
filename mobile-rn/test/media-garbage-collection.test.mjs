import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

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
  return import(`data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`);
}

const {
  createMediaGarbageCollector,
  createSerializedMediaManifestStore,
  isUriWithinRoot,
  planMediaGarbageCollection,
} = await importPureTypeScript('src/logic/mediaStoragePolicy.ts');
const { collectStateMediaReferences } = await importPureTypeScript('src/logic/stateMediaPolicy.ts');
const mediaSource = readFileSync(new URL('../src/logic/media.ts', import.meta.url), 'utf8');
const gallerySource = readFileSync(new URL('../src/screens/GalleryScreen.tsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

function manifestEntry(mediaId, fileUri, size = 10) {
  return { mediaId, fileUri, type: 'image/jpeg', createdAt: 100, size };
}

function baseState(overrides = {}) {
  return {
    config: { apiType: 'openai', apiProfiles: {}, userName: '나', userDescription: '', roomName: '', language: 'ko' },
    characters: [], chatRooms: {}, messages: {}, unreadCounts: {}, snsPosts: [], snsDmThreads: [],
    ...overrides,
  };
}

function createHarness({ manifest, trash = [], files, failManifestReplace = false, failMoveFrom } = {}) {
  let storedManifest = structuredClone(manifest || []);
  let storedTrash = structuredClone(trash);
  let shouldFailManifestReplace = failManifestReplace;
  const storedFiles = new Set(files || storedManifest.map(entry => entry.fileUri));
  const calls = { manifestWrites: 0, trashWrites: 0, moves: [], removes: [] };
  const manifestStore = createSerializedMediaManifestStore({
    async read() { return structuredClone(storedManifest); },
    async replaceAtomically(entries) {
      calls.manifestWrites += 1;
      if (shouldFailManifestReplace) {
        shouldFailManifestReplace = false;
        throw new Error('manifest replace failed');
      }
      storedManifest = structuredClone(entries);
    },
  });
  const collector = createMediaGarbageCollector({
    manifestStore,
    async readTrashManifest() { return structuredClone(storedTrash); },
    async replaceTrashManifest(entries) { calls.trashWrites += 1; storedTrash = structuredClone(entries); },
    async fileExists(fileUri) { return storedFiles.has(fileUri); },
    async moveFile(from, to) {
      calls.moves.push([from, to]);
      if (from === failMoveFrom) throw new Error(`move failed: ${from}`);
      if (!storedFiles.has(from)) throw new Error(`missing: ${from}`);
      storedFiles.delete(from);
      storedFiles.add(to);
    },
    async removeFile(fileUri) { calls.removes.push(fileUri); storedFiles.delete(fileUri); },
    trashFileUri(entry, now) {
      const extension = entry.fileUri.split('.').pop() || 'bin';
      return `file:///media/.trash/${entry.mediaId}-${now}.${extension}`;
    },
  });
  return {
    calls, collector, files: storedFiles,
    get manifest() { return storedManifest; },
    get trash() { return storedTrash; },
  };
}

test('the state media graph keeps every owner and references beyond the UI limit', () => {
  const shared = 'file:///media/shared.jpg';
  const referenceSlots = Array.from({ length: 51 }, (_, index) => ({ id: `reference-${index}`, image: `file:///media/reference-${index}.jpg`, createdAt: index }));
  const state = baseState({
    characters: [{ id: 'character-1', name: '하나', avatar: shared, stickers: [{ id: 'sticker-1', name: '스티커', data: 'file:///media/sticker.png' }] }],
    randomCharacters: [{ id: 'random-1', name: '랜덤', coverImage: 'file:///media/random-cover.jpg' }],
    randomChats: [{ id: 'random-room', characterId: 'random-2', name: '랜덤방', type: 'random', createdAt: 1, character: { id: 'random-2', name: '둘', profileImage: 'file:///media/random-profile.jpg' } }],
    messages: { room: [{ id: 'message-1', role: 'character', characterId: 'character-1', content: '', createdAt: 1, mediaData: shared }] },
    userStickers: [{ id: 'user-sticker', name: '내 스티커', mediaData: 'file:///media/user-sticker.png' }],
    snsPosts: [{ id: 'post-1', characterId: 'character-1', platform: 'instagram', content: '', createdAt: 1, image: 'file:///media/post.jpg', dms: [{ id: 'dm-1', title: '', participants: [{ id: 'third', name: '셋', role: 'thirdParty', avatar: 'file:///media/post-dm-avatar.jpg' }], messages: [] }] }],
    snsDmThreads: [{ id: 'thread-1', characterId: 'character-1', title: '', createdAt: 1, messages: [], participants: [{ id: 'third', name: '넷', role: 'thirdParty', avatar: 'file:///media/thread-avatar.jpg' }] }],
    referenceFaceSlots: referenceSlots,
    meetingEventSessions: [{ id: 'meeting-1', roomId: 'room', status: 'ended', startedAt: 1, turnCount: 1, maxTurns: 1, lines: [], stillImage: 'file:///media/meeting.jpg' }],
    blindDate: { sessions: [{ id: 'blind-1', mode: 'profile', status: 'active', candidateCount: 1, candidates: [{ id: 'candidate-1', name: '다섯', age: 20, nationality: 'Korean', koreanFluency: 'native', job: '', locationBase: '', personalitySummary: '', speechStyle: '', relationshipStyle: '', likes: [], dislikes: [], hobbies: [], firstDm: '', contactPresetId: '', snsStyle: '', appearance: {}, imagePrompt: '', profileImageUri: 'file:///media/blind.jpg', faceReferenceImage: 'file:///media/blind-reference.jpg', answers: [], score: 0, selectedCount: 0, createdAt: 1 }], rounds: [], createdAt: 1 }], archives: [] },
    datingApp: { profiles: [{ id: 'dating-1', photos: [{ id: 'dating-photo', uri: 'file:///media/dating.jpg', prompt: '', label: '', createdAt: 1 }] }] },
  });
  const references = collectStateMediaReferences(state);
  const counts = references.reduce((map, reference) => map.set(reference.uri, (map.get(reference.uri) || 0) + 1), new Map());
  assert.equal(counts.get(shared), 2);
  assert.equal(counts.get('file:///media/reference-50.jpg'), 1);
  assert.equal(counts.get('file:///media/post-dm-avatar.jpg'), 1);
  assert.equal(counts.get('file:///media/thread-avatar.jpg'), 1);
  assert.equal(counts.get('file:///media/dating.jpg'), 1);
});

test('GC planning retains shared assets until their final reference disappears', () => {
  const shared = manifestEntry('shared', 'file:///media/shared.jpg', 40);
  const orphan = manifestEntry('orphan', 'file:///media/orphan.jpg', 25);
  const outside = manifestEntry('outside', 'file:///downloads/outside.jpg', 30);
  const references = [
    { key: 'character_avatar', uri: shared.fileUri, force: false },
    { key: 'message_media', uri: shared.fileUri, force: false },
    { key: 'unmanaged', uri: 'file:///media/unmanaged.jpg', force: false },
  ];
  const plan = planMediaGarbageCollection(references, [shared, orphan, outside], 'file:///media/');
  assert.equal(plan.referenceCounts[shared.fileUri], 2);
  assert.deepEqual(plan.reachableEntries.map(entry => entry.mediaId), ['shared']);
  assert.deepEqual(plan.candidateEntries.map(entry => entry.mediaId), ['orphan']);
  assert.deepEqual(plan.protectedEntries.map(entry => entry.mediaId), ['outside']);
  assert.deepEqual(plan.unmanagedReferenceUris, ['file:///media/unmanaged.jpg']);
  assert.equal(plan.totalCandidateBytes, 25);
  assert.equal(planMediaGarbageCollection(references.slice(1), [shared], 'file:///media/').candidateEntries.length, 0);
  assert.deepEqual(planMediaGarbageCollection([], [shared], 'file:///media/').candidateEntries.map(entry => entry.mediaId), ['shared']);
});

test('GC ownership rejects traversal and encoded traversal outside the media root', () => {
  const traversal = manifestEntry('traversal', 'file:///media/../private/state.json');
  const encodedTraversal = manifestEntry('encoded', 'file:///media/%2e%2e/private/state.json');
  const owned = manifestEntry('owned', 'file:///media/assets/owned.jpg');
  const plan = planMediaGarbageCollection([], [traversal, encodedTraversal, owned], 'file:///media/');
  assert.equal(isUriWithinRoot(owned.fileUri, 'file:///media/'), true);
  assert.equal(isUriWithinRoot(traversal.fileUri, 'file:///media/'), false);
  assert.equal(isUriWithinRoot(encodedTraversal.fileUri, 'file:///media/'), false);
  assert.deepEqual(plan.candidateEntries.map(entry => entry.mediaId), ['owned']);
  assert.deepEqual(plan.protectedEntries.map(entry => entry.mediaId), ['traversal', 'encoded']);
});

test('dry-run reports missing files without moving or rewriting anything', async () => {
  const reachable = manifestEntry('reachable', 'file:///media/reachable.jpg');
  const orphan = manifestEntry('orphan', 'file:///media/orphan.jpg');
  const missingReachable = manifestEntry('missing-reachable', 'file:///media/missing-reachable.jpg');
  const missingOrphan = manifestEntry('missing-orphan', 'file:///media/missing-orphan.jpg');
  const harness = createHarness({ manifest: [reachable, orphan, missingReachable, missingOrphan], files: [reachable.fileUri, orphan.fileUri] });
  const result = await harness.collector.collect([
    { key: 'reachable', uri: reachable.fileUri, force: false },
    { key: 'missing', uri: missingReachable.fileUri, force: false },
  ], { dryRun: true, mediaRootUri: 'file:///media/', now: 200 });
  assert.equal(result.dryRun, true);
  assert.deepEqual(result.missingReachableEntries.map(entry => entry.mediaId), ['missing-reachable']);
  assert.deepEqual(result.missingCandidateEntries.map(entry => entry.mediaId), ['missing-orphan']);
  assert.equal(harness.calls.moves.length, 0);
  assert.equal(harness.calls.manifestWrites, 0);
  assert.equal(harness.calls.trashWrites, 0);
  assert.equal(harness.manifest.length, 4);
});

test('collection moves only existing unreachable files to trash and removes missing orphan entries', async () => {
  const reachable = manifestEntry('reachable', 'file:///media/reachable.jpg');
  const orphan = manifestEntry('orphan', 'file:///media/orphan.jpg');
  const missingOrphan = manifestEntry('missing-orphan', 'file:///media/missing-orphan.jpg');
  const harness = createHarness({ manifest: [reachable, orphan, missingOrphan], files: [reachable.fileUri, orphan.fileUri] });
  const result = await harness.collector.collect([{ key: 'reachable', uri: reachable.fileUri, force: false }], { dryRun: false, mediaRootUri: 'file:///media/', now: 200 });
  assert.deepEqual(harness.manifest.map(entry => entry.mediaId), ['reachable']);
  assert.equal(result.trashedEntries.length, 1);
  assert.deepEqual(result.missingCandidateEntries.map(entry => entry.mediaId), ['missing-orphan']);
  assert.equal(harness.files.has(orphan.fileUri), false);
  assert.equal(harness.files.has(result.trashedEntries[0].trashFileUri), true);
  assert.equal(harness.trash[0].status, 'committed');
});

test('a move failure restores earlier files and keeps both manifests unchanged', async () => {
  const first = manifestEntry('first', 'file:///media/first.jpg');
  const second = manifestEntry('second', 'file:///media/second.jpg');
  const harness = createHarness({ manifest: [first, second], failMoveFrom: second.fileUri });
  await assert.rejects(harness.collector.collect([], { dryRun: false, mediaRootUri: 'file:///media/', now: 200 }), /move failed/);
  assert.deepEqual(harness.manifest.map(entry => entry.mediaId), ['first', 'second']);
  assert.deepEqual(harness.trash, []);
  assert.equal(harness.files.has(first.fileUri), true);
  assert.equal(harness.files.has(second.fileUri), true);
});

test('a manifest replacement failure rolls trash moves back to their original paths', async () => {
  const orphan = manifestEntry('orphan', 'file:///media/orphan.jpg');
  const harness = createHarness({ manifest: [orphan], failManifestReplace: true });
  await assert.rejects(harness.collector.collect([], { dryRun: false, mediaRootUri: 'file:///media/', now: 200 }), /manifest replace failed/);
  assert.deepEqual(harness.manifest.map(entry => entry.mediaId), ['orphan']);
  assert.deepEqual(harness.trash, []);
  assert.equal(harness.files.has(orphan.fileUri), true);
});

test('recovery restores prepared trash when the active manifest still owns the asset', async () => {
  const entry = manifestEntry('recover', 'file:///media/recover.jpg');
  const trashFileUri = 'file:///media/.trash/recover-200.jpg';
  const harness = createHarness({ manifest: [entry], trash: [{ entry, trashFileUri, trashedAt: 200, status: 'prepared' }], files: [trashFileUri] });
  const result = await harness.collector.recoverInterruptedCollection();
  assert.equal(result.restoredCount, 1);
  assert.equal(harness.files.has(entry.fileUri), true);
  assert.deepEqual(harness.trash, []);
});

test('recovery commits prepared trash when the active manifest already removed the asset', async () => {
  const entry = manifestEntry('commit', 'file:///media/commit.jpg');
  const trashFileUri = 'file:///media/.trash/commit-200.jpg';
  const harness = createHarness({ manifest: [], trash: [{ entry, trashFileUri, trashedAt: 200, status: 'prepared' }], files: [trashFileUri] });
  const result = await harness.collector.recoverInterruptedCollection();
  assert.equal(result.committedCount, 1);
  assert.equal(harness.trash[0].status, 'committed');
});

test('committed trash restores its file and manifest atomically and repeated restore is safe', async () => {
  const entry = manifestEntry('restore', 'file:///media/restore.jpg');
  const trashFileUri = 'file:///media/.trash/restore-200.jpg';
  const harness = createHarness({
    manifest: [],
    trash: [{ entry, trashFileUri, trashedAt: 200, status: 'committed' }],
    files: [trashFileUri],
  });

  const restored = await harness.collector.restore(['restore']);
  const repeated = await harness.collector.restore(['restore']);

  assert.deepEqual(restored.restoredEntries.map(item => item.entry.mediaId), ['restore']);
  assert.deepEqual(restored.missingMediaIds, []);
  assert.deepEqual(repeated.restoredEntries, []);
  assert.deepEqual(repeated.missingMediaIds, ['restore']);
  assert.deepEqual(harness.manifest.map(item => item.mediaId), ['restore']);
  assert.deepEqual(harness.trash, []);
  assert.equal(harness.files.has(entry.fileUri), true);
  assert.equal(harness.files.has(trashFileUri), false);
});

test('a failed restore move keeps committed trash and the inactive manifest unchanged', async () => {
  const entry = manifestEntry('restore-fail', 'file:///media/restore-fail.jpg');
  const trashFileUri = 'file:///media/.trash/restore-fail-200.jpg';
  const harness = createHarness({
    manifest: [],
    trash: [{ entry, trashFileUri, trashedAt: 200, status: 'committed' }],
    files: [trashFileUri],
    failMoveFrom: trashFileUri,
  });

  await assert.rejects(harness.collector.restore(['restore-fail']), /move failed/);
  assert.deepEqual(harness.manifest, []);
  assert.equal(harness.trash[0].status, 'committed');
  assert.equal(harness.files.has(trashFileUri), true);
  assert.equal(harness.files.has(entry.fileUri), false);
});

test('purge deletes only committed trash older than the retention boundary', async () => {
  const oldEntry = manifestEntry('old', 'file:///media/old.jpg');
  const recentEntry = manifestEntry('recent', 'file:///media/recent.jpg');
  const preparedEntry = manifestEntry('prepared', 'file:///media/prepared.jpg');
  const oldTrash = 'file:///media/.trash/old.jpg';
  const recentTrash = 'file:///media/.trash/recent.jpg';
  const preparedTrash = 'file:///media/.trash/prepared.jpg';
  const harness = createHarness({
    manifest: [],
    trash: [
      { entry: oldEntry, trashFileUri: oldTrash, trashedAt: 100, status: 'committed' },
      { entry: recentEntry, trashFileUri: recentTrash, trashedAt: 290, status: 'committed' },
      { entry: preparedEntry, trashFileUri: preparedTrash, trashedAt: 50, status: 'prepared' },
    ],
    files: [oldTrash, recentTrash, preparedTrash],
  });
  const preview = await harness.collector.purge({ before: 250, dryRun: true });
  assert.deepEqual(preview.candidateEntries.map(item => item.entry.mediaId), ['old']);
  assert.equal(harness.calls.removes.length, 0);
  const result = await harness.collector.purge({ before: 250, dryRun: false });
  assert.equal(result.deletedCount, 1);
  assert.equal(harness.files.has(oldTrash), false);
  assert.equal(harness.files.has(recentTrash), true);
  assert.equal(harness.files.has(preparedTrash), true);
  assert.deepEqual(harness.trash.map(item => item.entry.mediaId), ['recent', 'prepared']);
});

test('selected purge never deletes another committed trash asset', async () => {
  const first = manifestEntry('first', 'file:///media/first.jpg');
  const second = manifestEntry('second', 'file:///media/second.jpg');
  const firstTrash = 'file:///media/.trash/first.jpg';
  const secondTrash = 'file:///media/.trash/second.jpg';
  const harness = createHarness({
    manifest: [],
    trash: [
      { entry: first, trashFileUri: firstTrash, trashedAt: 100, status: 'committed' },
      { entry: second, trashFileUri: secondTrash, trashedAt: 100, status: 'committed' },
    ],
    files: [firstTrash, secondTrash],
  });

  const result = await harness.collector.purge({ before: Number.MAX_SAFE_INTEGER, dryRun: false, mediaIds: ['first'] });
  assert.equal(result.deletedCount, 1);
  assert.equal(harness.files.has(firstTrash), false);
  assert.equal(harness.files.has(secondTrash), true);
  assert.deepEqual(harness.trash.map(item => item.entry.mediaId), ['second']);
});

test('manifest mutation and a parallel upsert share one lossless queue', async () => {
  let stored = [manifestEntry('remove', 'file:///media/remove.jpg')];
  let releaseMutation;
  const mutationGate = new Promise(resolve => { releaseMutation = resolve; });
  const mutationStarted = Promise.withResolvers();
  const store = createSerializedMediaManifestStore({
    async read() { return structuredClone(stored); },
    async replaceAtomically(entries) { stored = structuredClone(entries); },
  });
  const mutation = store.mutate(async entries => {
    mutationStarted.resolve();
    await mutationGate;
    return { entries: entries.filter(entry => entry.mediaId !== 'remove'), result: 'collected' };
  });
  await mutationStarted.promise;
  const upsert = store.upsert(manifestEntry('new', 'file:///media/new.jpg'));
  releaseMutation();
  assert.equal(await mutation, 'collected');
  await upsert;
  assert.deepEqual(stored.map(entry => entry.mediaId), ['new']);
});

test('production cleanup shares the manifest queue and runs only after the latest state is flushed', () => {
  assert.match(mediaSource, /createMediaGarbageCollector\(\{[\s\S]*manifestStore:\s*mediaManifestStore/);
  assert.match(mediaSource, /export async function previewMediaGarbageCollection/);
  assert.match(mediaSource, /export async function trashUnreachableMedia/);
  assert.match(mediaSource, /export async function purgeMediaTrash/);
  assert.match(mediaSource, /mediaTrashManifest\.json/);
  assert.match(appSource, /purgeMediaTrash\(Date\.now\(\) - MEDIA_TRASH_RETENTION_MS\)/);
  assert.match(appSource, /reason:\s*'before media garbage collection'/);
  assert.match(appSource, /collectStateMediaReferences\(stateRef\.current/);
  assert.match(gallerySource, /onPreviewMediaCleanup/);
  assert.match(gallerySource, /onTrashMediaCleanup/);
  assert.match(gallerySource, /공유 중인 파일은 유지/);
});
