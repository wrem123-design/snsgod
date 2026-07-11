import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const gallerySource = readFileSync(new URL('../src/screens/GalleryScreen.tsx', import.meta.url), 'utf8');

async function importActions() {
  const source = readFileSync(new URL('../src/logic/mediaAlbumActions.ts', import.meta.url), 'utf8');
  const transpiled = ts.transpileModule(source, {
    fileName: 'src/logic/mediaAlbumActions.ts',
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  assert.equal(transpiled.diagnostics?.length ?? 0, 0);
  return import(`data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`);
}

const {
  assignAlbumRepresentative,
  reconcileAlbumSelection,
  runAlbumDeviceSave,
  runAlbumShare,
  selectFilteredAlbumAssets,
  toggleAlbumSelection,
} = await importActions();

test('selection toggles deterministically and filtered select-all preserves off-filter choices', () => {
  assert.deepEqual(toggleAlbumSelection([], 'a'), ['a']);
  assert.deepEqual(toggleAlbumSelection(['a', 'b'], 'a'), ['b']);
  assert.deepEqual(selectFilteredAlbumAssets(['outside'], ['a', 'b'], true), ['outside', 'a', 'b']);
  assert.deepEqual(selectFilteredAlbumAssets(['outside', 'a', 'b'], ['a', 'b'], false), ['outside']);
  assert.deepEqual(reconcileAlbumSelection(['missing', 'b', 'b'], ['a', 'b']), ['b']);
});

test('device save requests permission once at action time and reports partial failure without mutating input', async () => {
  const selected = ['file:///a.jpg', 'file:///broken.jpg', 'file:///skip.jpg'];
  let permissionRequests = 0;
  const result = await runAlbumDeviceSave(selected, {
    async requestPermission() { permissionRequests += 1; return true; },
    async materialize(uri) {
      if (uri.includes('skip')) return undefined;
      return { localUri: uri, cleanup: async () => undefined };
    },
    async save(localUri) {
      if (localUri.includes('broken')) throw new Error('save failed');
    },
  });

  assert.equal(permissionRequests, 1);
  assert.deepEqual(selected, ['file:///a.jpg', 'file:///broken.jpg', 'file:///skip.jpg']);
  assert.deepEqual({ success: result.success, failed: result.failed, skipped: result.skipped }, { success: 1, failed: 1, skipped: 1 });
  assert.equal(result.permissionDenied, false);
});

test('device save denial skips every item and performs no file work', async () => {
  let materialized = 0;
  const result = await runAlbumDeviceSave(['file:///a.jpg', 'file:///b.jpg'], {
    async requestPermission() { return false; },
    async materialize() { materialized += 1; return undefined; },
    async save() { throw new Error('must not run'); },
  });

  assert.equal(materialized, 0);
  assert.deepEqual({ success: result.success, failed: result.failed, skipped: result.skipped }, { success: 0, failed: 0, skipped: 2 });
  assert.equal(result.permissionDenied, true);
});

test('sharing uses one image directly, bundles multiple images, and safely reports unavailable or partial inputs', async () => {
  const calls = [];
  const adapter = {
    async isAvailable() { return true; },
    async materialize(uri) { return uri.includes('broken') ? undefined : { localUri: uri, cleanup: async () => undefined }; },
    async shareSingle(uri) { calls.push(['single', uri]); },
    async shareBundle(uris) { calls.push(['bundle', ...uris]); },
  };

  const single = await runAlbumShare(['file:///one.jpg'], adapter);
  const multiple = await runAlbumShare(['file:///one.jpg', 'file:///two.jpg', 'file:///broken.jpg'], adapter);
  const unavailable = await runAlbumShare(['file:///one.jpg'], { ...adapter, async isAvailable() { return false; } });

  assert.deepEqual(calls, [['single', 'file:///one.jpg'], ['bundle', 'file:///one.jpg', 'file:///two.jpg']]);
  assert.deepEqual({ success: single.success, failed: single.failed, skipped: single.skipped }, { success: 1, failed: 0, skipped: 0 });
  assert.deepEqual({ success: multiple.success, failed: multiple.failed, skipped: multiple.skipped }, { success: 2, failed: 0, skipped: 1 });
  assert.equal(multiple.usedBundleFallback, true);
  assert.equal(unavailable.unavailable, true);
  assert.equal(unavailable.skipped, 1);
});

test('representative assignment updates profile, cover, or primary reference with history and bounded references', () => {
  const base = {
    characters: [{
      id: 'character-1', name: '하나', avatar: 'old-profile', profileImage: 'old-profile', coverImage: 'old-cover',
      profileReferenceImage: 'old-ref-1', profileReferenceImages: ['old-ref-1', 'old-ref-2', 'old-ref-3'], profileImageHistory: [],
    }],
  };
  const profile = assignAlbumRepresentative(base, { characterId: 'character-1', uri: 'new-profile', target: 'profile', prompt: 'portrait', now: 100 });
  const cover = assignAlbumRepresentative(profile.state, { characterId: 'character-1', uri: 'new-cover', target: 'cover', now: 200 });
  const reference = assignAlbumRepresentative(cover.state, { characterId: 'character-1', uri: 'new-ref', target: 'reference', now: 300 });
  const character = reference.state.characters[0];

  assert.equal(profile.previousUri, 'old-profile');
  assert.equal(cover.previousUri, 'old-cover');
  assert.equal(reference.previousUri, 'old-ref-1');
  assert.equal(character.avatar, 'new-profile');
  assert.equal(character.profileImage, 'new-profile');
  assert.equal(character.coverImage, 'new-cover');
  assert.deepEqual(character.profileReferenceImages, ['new-ref', 'old-ref-1', 'old-ref-2']);
  assert.equal(character.profileReferenceImage, 'new-ref');
  assert.deepEqual(character.profileImageHistory.map(item => item.kind), ['cover', 'cover', 'profile', 'profile']);
  assert.deepEqual(character.profileImageHistory.map(item => item.image), ['new-cover', 'old-cover', 'new-profile', 'old-profile']);
});

test('gallery exposes explicit selection mode and keeps selection after batch result reporting', () => {
  for (const label of ['선택', '전체 선택', '선택 해제', '기기에 저장', '공유', '대표 이미지']) {
    assert.match(gallerySource, new RegExp(label));
  }
  assert.match(gallerySource, /onLongPress=/);
  assert.match(gallerySource, /runAlbumDeviceSave/);
  assert.match(gallerySource, /runAlbumShare/);
  assert.match(gallerySource, /assignAlbumRepresentative/);
  assert.doesNotMatch(gallerySource, /setSelectedIds\(\[\]\)[\s\S]{0,120}(runAlbumDeviceSave|runAlbumShare)/);
});
