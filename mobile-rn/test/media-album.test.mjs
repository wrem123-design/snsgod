import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const gallerySource = readFileSync(new URL('../src/screens/GalleryScreen.tsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

async function importAlbum() {
  const source = readFileSync(new URL('../src/logic/mediaAlbum.ts', import.meta.url), 'utf8');
  const transpiled = ts.transpileModule(source, {
    fileName: 'src/logic/mediaAlbum.ts',
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  assert.equal(transpiled.diagnostics?.length ?? 0, 0);
  return import(`data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`);
}

const {
  collectMediaAlbumAssets,
  filterMediaAlbumAssets,
  mediaAlbumFilterActive,
  toggleMediaAlbumFavorite,
} = await importAlbum();

function state(overrides = {}) {
  const shared = 'file:///media/assets/asset_shared.jpg';
  return {
    config: { apiType: 'openai', apiProfiles: {}, userName: '나', userDescription: '', roomName: '', language: 'ko' },
    characters: [{
      id: 'character-1',
      name: '하나',
      avatar: shared,
      profileImage: shared,
      coverImage: 'file:///media/cover.jpg',
      profileReferenceImage: 'file:///media/character-reference.jpg',
      profileReferenceImages: ['file:///media/character-reference-2.jpg'],
      profileImageHistory: [{ id: 'history-1', image: 'file:///media/history.jpg', prompt: 'history prompt', createdAt: 120, kind: 'profile' }],
    }],
    chatRooms: { 'character-1': [{ id: 'room-1', characterId: 'character-1', name: '하나 방' }] },
    groupRooms: [{ id: 'group-1', name: '모임방', participantIds: ['character-1'], createdAt: 1 }],
    messages: {
      'room-1': [
        { id: 'user-photo', role: 'user', content: '', createdAt: 200, mediaData: 'file:///media/user.jpg' },
        { id: 'character-photo', role: 'character', characterId: 'character-1', content: '', createdAt: 210, mediaData: shared, imagePrompt: 'generated prompt' },
      ],
      'group-1': [{ id: 'group-photo', role: 'character', characterId: 'character-1', content: '', createdAt: 220, mediaData: 'file:///media/group.jpg' }],
    },
    unreadCounts: {},
    snsPosts: [{ id: 'post-1', characterId: 'character-1', platform: 'instagram', content: '', createdAt: 300, image: 'file:///media/sns.jpg', imagePrompt: 'sns prompt' }],
    snsDmThreads: [],
    referenceFaceSlots: [{ id: 'slot-1', image: 'file:///media/reference.jpg', name: '기준 얼굴', createdAt: 400 }],
    meetingEventSessions: [{ id: 'meeting-1', roomId: 'room-1', characterId: 'character-1', status: 'finished', startedAt: 500, turnCount: 1, maxTurns: 1, lines: [], stillImage: 'file:///media/meeting.jpg', stillPrompt: 'meeting prompt' }],
    blindDate: {
      sessions: [{ id: 'blind-1', mode: 'profile', status: 'active', candidateCount: 1, rounds: [], createdAt: 600, candidates: [{ id: 'candidate-1', name: '후보', profileImageUri: 'file:///media/blind.jpg', faceReferenceImage: 'file:///media/blind-reference.jpg', imagePrompt: 'blind prompt', createdAt: 610 }] }],
      archives: [],
    },
    datingApp: {
      profiles: [{ id: 'dating-1', name: '데이트', createdAt: 700, photos: [{ id: 'photo-1', uri: 'file:///media/dating.jpg', prompt: 'dating prompt', label: '대표', createdAt: 710 }] }],
    },
    ...overrides,
  };
}

test('inventory includes every album source even without prompts', () => {
  const assets = collectMediaAlbumAssets(state());
  const sources = new Set(assets.flatMap(asset => asset.references.map(reference => reference.source)));

  for (const source of ['profile', 'cover', 'profile_history', 'character_reference', 'chat', 'sns', 'reference', 'meeting', 'blind_date', 'dating_app']) {
    assert.equal(sources.has(source), true, `missing source ${source}`);
  }
  assert.ok(assets.some(asset => asset.uri.endsWith('/user.jpg')));
  assert.ok(assets.some(asset => asset.uri.endsWith('/group.jpg')));
});

test('one shared URI produces one stable tile with every independent reference', () => {
  const first = collectMediaAlbumAssets(state());
  const second = collectMediaAlbumAssets(JSON.parse(JSON.stringify(state())));
  const shared = first.find(asset => asset.uri.includes('asset_shared'));

  assert.ok(shared);
  assert.equal(shared.references.length, 3);
  assert.equal(second.find(asset => asset.uri.includes('asset_shared'))?.id, shared.id);
  assert.deepEqual(new Set(shared.characterIds), new Set(['character-1']));
  assert.deepEqual(new Set(shared.roomIds), new Set(['room-1']));
});

test('filters compose by character, room, source, origin, date, and favorite', () => {
  const favoriteUri = 'file:///media/sns.jpg';
  const snapshot = state({ mediaAlbumFavoriteUris: [favoriteUri] });
  const assets = collectMediaAlbumAssets(snapshot);
  const filtered = filterMediaAlbumAssets(assets, {
    characterId: 'character-1',
    source: 'sns',
    origin: 'generated',
    favoriteOnly: true,
    dateFrom: 250,
    dateTo: 350,
  });

  assert.deepEqual(filtered.map(asset => asset.uri), [favoriteUri]);
  assert.equal(mediaAlbumFilterActive({ roomId: 'room-1' }), true);
  assert.equal(mediaAlbumFilterActive({}), false);
});

test('favorite toggle is idempotent and survives a JSON restart', () => {
  const uri = 'file:///media/user.jpg';
  const added = toggleMediaAlbumFavorite(state(), uri);
  const duplicate = toggleMediaAlbumFavorite(added, uri, true);
  const restarted = JSON.parse(JSON.stringify(duplicate));
  const asset = collectMediaAlbumAssets(restarted).find(item => item.uri === uri);

  assert.deepEqual(restarted.mediaAlbumFavoriteUris, [uri]);
  assert.equal(asset?.favorite, true);
  assert.deepEqual(toggleMediaAlbumFavorite(restarted, uri, false).mediaAlbumFavoriteUris, []);
});

test('invalid values are ignored while local content URIs remain visible', () => {
  const snapshot = state({
    characters: [{ id: 'character-1', name: '하나', avatar: 'H', profileImage: '', coverImage: 'content://local/image' }],
    messages: { 'room-1': [{ id: 'broken', role: 'user', content: '', createdAt: 1, mediaData: 'not-a-uri' }] },
  });

  const uris = collectMediaAlbumAssets(snapshot).map(asset => asset.uri);
  assert.equal(uris.includes('H'), false);
  assert.equal(uris.includes(''), false);
  assert.equal(uris.includes('content://local/image'), true);
  assert.equal(uris.includes('not-a-uri'), false);
});

test('gallery connects all filter controls, favorites, and safe missing-file states', () => {
  for (const label of ['즐겨찾기', '생성', '직접 추가', '오늘', '7일', '30일', '프로필', '채팅', 'SNS', '만남', '발견', '데이트 앱']) {
    assert.match(gallerySource, new RegExp(label));
  }
  assert.match(gallerySource, /collectMediaAlbumAssets\(state\)/);
  assert.match(gallerySource, /filterMediaAlbumAssets\(assets, filter\)/);
  assert.match(gallerySource, /onError=\{\(\) => markMissing/);
  assert.match(gallerySource, /프롬프트 정보가 없는 직접 추가 이미지입니다/);
  assert.doesNotMatch(gallerySource, /tileDelete|타일 삭제/);
  assert.match(appSource, /<GalleryScreen[\s\S]*onCommitCurrent=\{commitRenderedCurrentForScreen\}/);
});
