import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

async function importPureTypeScript(relativePath) {
  const source = readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
  const transpiled = ts.transpileModule(source, {
    fileName: relativePath,
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  assert.equal(transpiled.diagnostics?.length ?? 0, 0);
  return import(`data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`);
}

const {
  buildFullBackupMediaPlan,
  createFullBackupRestoreCoordinator,
} = await importPureTypeScript('src/logic/fullBackupPolicy.ts');
const { applyStateMediaUriReplacements } = await importPureTypeScript('src/logic/stateMediaPolicy.ts');
const backupSource = readFileSync(new URL('../src/logic/backup.ts', import.meta.url), 'utf8');
const mediaSource = readFileSync(new URL('../src/logic/media.ts', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const settingsSource = readFileSync(new URL('../src/screens/SettingsScreen.tsx', import.meta.url), 'utf8');
const debugSource = readFileSync(new URL('../src/screens/DebugScreen.tsx', import.meta.url), 'utf8');
const persistSource = readFileSync(new URL('../src/storage/persist.ts', import.meta.url), 'utf8');

function manifestEntry(mediaId, fileUri, type = 'image/jpeg') {
  return { mediaId, fileUri, type, createdAt: 1, size: 10 };
}

test('full backup exports only reachable manifest assets and reports unmanaged file references', () => {
  const shared = manifestEntry('shared', 'file:///media/shared.jpg');
  const orphan = manifestEntry('orphan', 'file:///media/orphan.jpg');
  const plan = buildFullBackupMediaPlan([
    { key: 'avatar', uri: shared.fileUri, force: false },
    { key: 'message', uri: shared.fileUri, force: false },
    { key: 'inline', uri: 'data:image/png;base64,AA==', force: false },
    { key: 'legacy-file', uri: 'file:///legacy/outside.jpg', force: false },
  ], [shared, orphan]);
  assert.deepEqual(plan.entries.map(entry => entry.mediaId), ['shared']);
  assert.deepEqual(plan.unmanagedFileUris, ['file:///legacy/outside.jpg']);
  assert.equal(plan.referenceCounts[shared.fileUri], 2);
});

test('restore coordinator rolls back only assets added by this restore', async () => {
  const restored = [];
  const rolledBack = [];
  const coordinator = createFullBackupRestoreCoordinator({
    async restore(record) {
      restored.push(record.mediaId);
      return {
        sourceFileUri: record.sourceFileUri,
        targetFileUri: `file:///media/assets/${record.mediaId}.jpg`,
        mediaId: record.mediaId,
        added: record.mediaId !== 'existing',
      };
    },
    async rollback(mediaIds) { rolledBack.push(...mediaIds); },
  });
  const prepared = await coordinator.prepare([
    { mediaId: 'existing', sourceFileUri: 'file:///old/existing.jpg', type: 'image/jpeg', base64: 'AA==' },
    { mediaId: 'added', sourceFileUri: 'file:///old/added.jpg', type: 'image/jpeg', base64: 'AQ==' },
  ]);
  assert.deepEqual(restored, ['existing', 'added']);
  assert.deepEqual(prepared.addedMediaIds, ['added']);
  await prepared.rollback();
  assert.deepEqual(rolledBack, ['added']);
});

test('restore coordinator automatically rolls back partial media on failure', async () => {
  const rolledBack = [];
  const coordinator = createFullBackupRestoreCoordinator({
    async restore(record) {
      if (record.mediaId === 'broken') throw new Error('archive media is corrupt');
      return {
        sourceFileUri: record.sourceFileUri,
        targetFileUri: `file:///media/assets/${record.mediaId}.jpg`,
        mediaId: record.mediaId,
        added: true,
      };
    },
    async rollback(mediaIds) { rolledBack.push(...mediaIds); },
  });
  await assert.rejects(coordinator.prepare([
    { mediaId: 'first', sourceFileUri: 'file:///old/first.jpg', type: 'image/jpeg', base64: 'AA==' },
    { mediaId: 'broken', sourceFileUri: 'file:///old/broken.jpg', type: 'image/jpeg', base64: 'AQ==' },
  ]), /archive media is corrupt/);
  assert.deepEqual(rolledBack, ['first']);
});

test('export-delete-import round trip restores state references to registered media', async () => {
  const original = {
    config: { apiType: 'openai', apiProfiles: {} },
    characters: [{ id: 'character', name: '하나', avatar: 'file:///old/avatar.jpg' }],
    chatRooms: {}, messages: {}, unreadCounts: {}, snsPosts: [], snsDmThreads: [],
    __revision: 2,
  };
  const coordinator = createFullBackupRestoreCoordinator({
    async restore(record) {
      return {
        sourceFileUri: record.sourceFileUri,
        targetFileUri: 'file:///media/assets/canonical.jpg',
        mediaId: 'canonical',
        added: true,
      };
    },
    async rollback() {},
  });
  const prepared = await coordinator.prepare([
    { mediaId: 'canonical', sourceFileUri: 'file:///old/avatar.jpg', type: 'image/jpeg', base64: 'AA==' },
  ]);
  const restored = applyStateMediaUriReplacements(original, prepared.replacements.map(item => ({
    dataUri: item.sourceFileUri,
    fileUri: item.targetFileUri,
  })));
  assert.equal(restored.characters[0].avatar, 'file:///media/assets/canonical.jpg');
  assert.equal(restored.__revision, 2, 'explicit older backup is not rejected by the archive layer');
});

test('production ZIP restore registers media, distinguishes payloads, and restores original state on failure', () => {
  assert.match(backupSource, /version:\s*'snsgod-full-backup-v2'/);
  assert.match(backupSource, /mediaMode:\s*'full-media'/);
  assert.match(backupSource, /backup\.json/);
  assert.match(backupSource, /prepareArchivedMediaAssets/);
  assert.match(backupSource, /checkCRC32:\s*true/);
  assert.match(backupSource, /MAX_FULL_BACKUP_ZIP_BYTES/);
  assert.match(backupSource, /MAX_FULL_BACKUP_MEDIA_ENTRIES/);
  assert.match(backupSource, /String\(index\)\.padStart\(6, '0'\)/);
  assert.doesNotMatch(backupSource, /media\/\$\{entry\.mediaId\}/);
  assert.doesNotMatch(backupSource, /Missing media should not block exporting/);
  assert.match(mediaSource, /export async function prepareArchivedMediaAssets/);
  assert.match(mediaSource, /mediaManifestStore\.mutate/);
  assert.match(mediaSource, /await rollbackImportedMediaAssets\(\[restored\.mediaId\]\)/);
  assert.match(appSource, /async function restoreFullBackup/);
  assert.match(appSource, /await importState\(currentBeforeRestore, JSON\.stringify\(currentBeforeRestore\)\)/);
  assert.match(settingsSource, /상태만 JSON/);
  assert.match(settingsSource, /사진 포함 전체 ZIP/);
  assert.match(settingsSource, /onRestoreFullBackup/);
  assert.match(settingsSource, /Alert\.alert\('전체 ZIP 복원 실패'/);
  assert.match(debugSource, /onRestoreFullBackup/);
  assert.match(debugSource, /Alert\.alert\('전체 백업 복구 실패'/);
  assert.match(persistSource, /Math\.max\(Number\(state\.__revision \|\| 0\), persistedRevision\) \+ 1/);
});
