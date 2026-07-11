import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const gallerySource = readFileSync(new URL('../src/screens/GalleryScreen.tsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

async function importTrash() {
  const source = readFileSync(new URL('../src/logic/mediaAlbumTrash.ts', import.meta.url), 'utf8');
  const transpiled = ts.transpileModule(source, {
    fileName: 'src/logic/mediaAlbumTrash.ts',
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  assert.equal(transpiled.diagnostics?.length ?? 0, 0);
  return import(`data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`);
}

const {
  restoreMediaAlbumTrashRecord,
  trashMediaAlbumAssets,
  unlinkMediaAlbumReferences,
} = await importTrash();

function baseState() {
  const shared = 'file:///media/assets/shared.jpg';
  return {
    characters: [{ id: 'character-1', name: '하나', avatar: shared, profileImage: shared, profileReferenceImage: 'file:///ref.jpg', profileReferenceImages: ['file:///ref.jpg'] }],
    randomCharacters: [], randomChats: [], chatRooms: {}, groupRooms: [],
    messages: { room: [{ id: 'message-1', role: 'character', characterId: 'character-1', content: '', createdAt: 20, mediaData: shared, mediaType: 'image', imagePrompt: 'prompt' }] },
    snsPosts: [{ id: 'post-1', characterId: 'character-1', platform: 'instagram', content: '', createdAt: 30, image: shared, imagePrompt: 'sns prompt' }],
    referenceFaceSlots: [], meetingEventSessions: [],
    mediaAlbumFavoriteUris: [shared],
  };
}

function sharedAsset() {
  const uri = 'file:///media/assets/shared.jpg';
  return {
    id: 'asset-shared', uri, title: '하나', sourceLabel: 'Instagram', createdAt: 30, favorite: true,
    characterIds: ['character-1'], roomIds: ['room'], sources: ['profile', 'chat', 'sns'],
    references: [
      { id: 'character-1:avatar', source: 'profile', sourceLabel: '프로필', ownerId: 'character-1', title: '하나', createdAt: 0, generated: false, characterId: 'character-1' },
      { id: 'character-1:profile', source: 'profile', sourceLabel: '프로필', ownerId: 'character-1', title: '하나', createdAt: 0, generated: false, characterId: 'character-1' },
      { id: 'message:room:message-1', source: 'chat', sourceLabel: '채팅', ownerId: 'message-1', title: '하나', createdAt: 20, generated: true, characterId: 'character-1', roomId: 'room', prompt: 'prompt' },
      { id: 'sns:post-1', source: 'sns', sourceLabel: 'Instagram', ownerId: 'post-1', title: '하나', createdAt: 30, generated: true, characterId: 'character-1', prompt: 'sns prompt' },
    ],
  };
}

test('one-reference unlink leaves every other shared owner intact and reports exact impact', () => {
  const result = unlinkMediaAlbumReferences(baseState(), sharedAsset(), ['message:room:message-1']);

  assert.equal(result.state.messages.room[0].mediaData, undefined);
  assert.equal(result.state.characters[0].avatar, sharedAsset().uri);
  assert.equal(result.state.snsPosts[0].image, sharedAsset().uri);
  assert.deepEqual(result.removedReferences.map(reference => reference.id), ['message:room:message-1']);
  assert.deepEqual(result.missingReferenceIds, []);
});

test('asset trash unlinks every reference once, removes favorite, and survives JSON restart', () => {
  const result = trashMediaAlbumAssets(baseState(), [sharedAsset(), sharedAsset()], {
    now: 100,
    managedMediaIds: { [sharedAsset().uri]: 'asset_shared' },
  });
  const restarted = JSON.parse(JSON.stringify(result.state));

  assert.equal(restarted.characters[0].avatar, undefined);
  assert.equal(restarted.characters[0].profileImage, undefined);
  assert.equal(restarted.messages.room[0].mediaData, undefined);
  assert.equal(restarted.snsPosts[0].image, undefined);
  assert.deepEqual(restarted.mediaAlbumFavoriteUris, []);
  assert.equal(restarted.mediaAlbumTrash.length, 1);
  assert.equal(restarted.mediaAlbumTrash[0].managedMediaId, 'asset_shared');
  assert.equal(restarted.mediaAlbumTrash[0].references.length, 4);
});

test('restore fills empty owners, preserves newer conflicts, and keeps only unresolved references', () => {
  const trashed = trashMediaAlbumAssets(baseState(), [sharedAsset()], { now: 100 }).state;
  trashed.snsPosts[0].image = 'file:///newer.jpg';
  const recordId = trashed.mediaAlbumTrash[0].id;
  const restored = restoreMediaAlbumTrashRecord(trashed, recordId);

  assert.equal(restored.state.characters[0].avatar, sharedAsset().uri);
  assert.equal(restored.state.messages.room[0].mediaData, sharedAsset().uri);
  assert.equal(restored.state.snsPosts[0].image, 'file:///newer.jpg');
  assert.deepEqual(restored.skippedReferenceIds, ['sns:post-1']);
  assert.deepEqual(restored.state.mediaAlbumTrash[0].references.map(reference => reference.id), ['sns:post-1']);
});

test('reference restore never evicts three newer reference images', () => {
  const referenceAsset = {
    id: 'old-ref', uri: 'file:///old-ref.jpg', title: '하나', sourceLabel: '캐릭터 레퍼런스', createdAt: 1, favorite: false,
    characterIds: ['character-1'], roomIds: [], sources: ['character_reference'],
    references: [{ id: 'character-1:reference:0', source: 'character_reference', sourceLabel: '캐릭터 레퍼런스', ownerId: 'character-1', title: '하나', createdAt: 1, generated: false, characterId: 'character-1' }],
  };
  const state = baseState();
  state.characters[0].profileReferenceImages = ['file:///old-ref.jpg'];
  const trashed = trashMediaAlbumAssets(state, [referenceAsset], { now: 100 }).state;
  trashed.characters[0].profileReferenceImages = ['file:///new-1.jpg', 'file:///new-2.jpg', 'file:///new-3.jpg'];
  const restored = restoreMediaAlbumTrashRecord(trashed, trashed.mediaAlbumTrash[0].id);

  assert.deepEqual(restored.state.characters[0].profileReferenceImages, ['file:///new-1.jpg', 'file:///new-2.jpg', 'file:///new-3.jpg']);
  assert.deepEqual(restored.skippedReferenceIds, ['character-1:reference:0']);
});

test('gallery separates unlink, recoverable trash, restore, and confirmed permanent delete', () => {
  for (const label of ['이 사용처에서만 제거', '앨범 휴지통으로 이동', '되돌리기', '복원', '영구 삭제', '정말 영구 삭제할까요?']) {
    assert.match(gallerySource, new RegExp(label));
  }
  assert.match(gallerySource, /onTrashAlbumAssets\(selectedAssets\)/);
  assert.match(gallerySource, /onRestoreAlbumTrash\(record\.id\)/);
  assert.match(gallerySource, /onPurgeAlbumTrash\(record\.id\)/);
  assert.match(gallerySource, /restoreTrashRecords\(result\.records\)/);
  assert.match(gallerySource, /충돌\/누락/);
});

test('App flushes state before physical trash and restores the file before reference snapshots', () => {
  assert.match(appSource, /async function trashCurrentAlbumAssets[\s\S]*flushSaveState[\s\S]*trashUnreachableMedia/);
  assert.match(appSource, /async function restoreCurrentAlbumTrash[\s\S]*restoreMediaTrash[\s\S]*restoreMediaAlbumTrashRecord/);
  assert.match(appSource, /async function purgeCurrentAlbumTrash[\s\S]*purgeSelectedMediaTrash/);
  assert.match(appSource, /onUnlinkAlbumReference=\{unlinkCurrentAlbumReference\}/);
  assert.match(appSource, /onTrashAlbumAssets=\{trashCurrentAlbumAssets\}/);
});
