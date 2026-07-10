import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const policySource = readFileSync(
  new URL('../src/storage/stateRecoveryPolicy.ts', import.meta.url),
  'utf8',
);
const persistSource = readFileSync(
  new URL('../src/storage/persist.ts', import.meta.url),
  'utf8',
);
const transpiledPolicy = ts.transpileModule(policySource, {
  fileName: 'src/storage/stateRecoveryPolicy.ts',
  reportDiagnostics: true,
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
assert.equal(transpiledPolicy.diagnostics?.length ?? 0, 0);
const policyJavaScript = transpiledPolicy.outputText;
const {
  calculateEstablishedContentHash,
  isPersistedStateObject,
  mergeCriticalArrayBackup,
  recoveryMetadataRequiresHash,
  selectAuthoritativeCandidate,
  storedContentHashMatches,
} = await import(
  `data:text/javascript;base64,${Buffer.from(policyJavaScript).toString('base64')}`
);

const candidate = ({
  source,
  revision,
  writeSeq = revision,
  savedAt = revision,
  messageCount = 0,
  characterCount = 0,
  referenceImageCount = 0,
  mediaCount = 0,
  lastMessageAt = 0,
  validationError,
}) => ({
  source,
  state: { source },
  stats: {
    revision,
    writeSeq,
    savedAt,
    messageCount,
    characterCount,
    referenceImageCount,
    mediaCount,
    lastMessageAt,
  },
  validationError,
});

test('a higher valid revision remains authoritative even when an older state contains more data', () => {
  const latest = candidate({
    source: 'backupLatest',
    revision: 12,
    characterCount: 1,
  });
  const previous = candidate({
    source: 'backupPrevious',
    revision: 11,
    messageCount: 1_000,
    characterCount: 30,
    referenceImageCount: 50,
    mediaCount: 500,
    lastMessageAt: 9_999_999,
  });

  assert.equal(
    selectAuthoritativeCandidate([previous, latest]),
    latest,
  );
});

test('write sequence and save time break ties without considering data counts', () => {
  const newerWrite = candidate({
    source: 'sqlite',
    revision: 12,
    writeSeq: 9,
    savedAt: 100,
    characterCount: 1,
  });
  const richerOldWrite = candidate({
    source: 'backupLatest',
    revision: 12,
    writeSeq: 8,
    savedAt: 200,
    characterCount: 30,
  });

  assert.equal(
    selectAuthoritativeCandidate([richerOldWrite, newerWrite]),
    newerWrite,
  );
});

test('save time breaks a tie after revision and write sequence match', () => {
  const olderSave = candidate({
    source: 'backupLatest',
    revision: 12,
    writeSeq: 9,
    savedAt: 100,
  });
  const newerSave = candidate({
    source: 'sqlite',
    revision: 12,
    writeSeq: 9,
    savedAt: 200,
  });

  assert.equal(
    selectAuthoritativeCandidate([olderSave, newerSave]),
    newerSave,
  );
});

test('an invalid higher revision falls back to the highest valid candidate', () => {
  const invalidLatest = candidate({
    source: 'backupLatest',
    revision: 12,
    validationError: 'content hash mismatch',
  });
  const validPrevious = candidate({
    source: 'backupPrevious',
    revision: 11,
  });

  assert.equal(
    selectAuthoritativeCandidate([invalidLatest, validPrevious]),
    validPrevious,
  );
});

test('non-finite or negative ordering metadata cannot become authoritative', () => {
  const malformedLatest = candidate({
    source: 'backupLatest',
    revision: Number.NaN,
    writeSeq: -1,
    savedAt: Number.POSITIVE_INFINITY,
  });
  const validPrevious = candidate({
    source: 'backupPrevious',
    revision: 11,
  });

  assert.equal(
    selectAuthoritativeCandidate([malformedLatest, validPrevious]),
    validPrevious,
  );
});

test('fractional or unsafe ordering metadata cannot outrank valid snapshots', () => {
  const fractionalLatest = candidate({
    source: 'backupLatest',
    revision: 12.5,
    writeSeq: 12,
    savedAt: 200,
  });
  const unsafeLatest = candidate({
    source: 'sqlite',
    revision: Number.MAX_SAFE_INTEGER + 1,
    writeSeq: 12,
    savedAt: 200,
  });
  const validPrevious = candidate({
    source: 'backupPrevious',
    revision: 11,
  });

  assert.equal(
    selectAuthoritativeCandidate(
      [fractionalLatest, unsafeLatest, validPrevious],
    ),
    validPrevious,
  );
});

test('an explicit empty critical array is preserved instead of restoring an old backup', () => {
  assert.deepEqual(
    mergeCriticalArrayBackup([], [{ id: 'old-reference' }]),
    [],
  );
});

test('an explicit empty meeting array is also preserved', () => {
  assert.deepEqual(
    mergeCriticalArrayBackup([], [{ id: 'old-meeting' }]),
    [],
  );
});

test('a missing critical array can still be recovered from an established backup', () => {
  assert.deepEqual(
    mergeCriticalArrayBackup(undefined, [{ id: 'old-reference' }]),
    [{ id: 'old-reference' }],
  );
});

test('the generated default state does not mask the only established critical backup', () => {
  assert.deepEqual(
    mergeCriticalArrayBackup([], [{ id: 'old-reference' }], true),
    [{ id: 'old-reference' }],
  );
});

test('only JSON objects with the established core state shape can be recovered', () => {
  assert.equal(isPersistedStateObject({
    config: {},
    characters: [],
    chatRooms: {},
    messages: {},
  }), true);
  assert.equal(isPersistedStateObject({ schemaVersion: 5 }), false);
  assert.equal(isPersistedStateObject([]), false);
  assert.equal(isPersistedStateObject(null), false);
  assert.equal(isPersistedStateObject('state'), false);
});

test('storage pointers are recognized before full application-state shape validation', () => {
  const pointerCheck = persistSource.indexOf('__storagePointer)');
  const stateShapeCheck = persistSource.indexOf('isPersistedStateObject(parsed)');

  assert.notEqual(pointerCheck, -1);
  assert.notEqual(stateShapeCheck, -1);
  assert.ok(pointerCheck < stateShapeCheck);
});

test('stored hashes are optional for established snapshots but must match when present', () => {
  const calculatedHashes = ['fnv1a-current', 'fnv1a-established'];
  assert.equal(storedContentHashMatches(undefined, calculatedHashes), true);
  assert.equal(storedContentHashMatches('', calculatedHashes), true);
  assert.equal(storedContentHashMatches(undefined, calculatedHashes, true), false);
  assert.equal(storedContentHashMatches('fnv1a-current', calculatedHashes), true);
  assert.equal(storedContentHashMatches('fnv1a-established', calculatedHashes), true);
  assert.equal(storedContentHashMatches('fnv1a-damaged', calculatedHashes), false);
});

test('save time alone does not require a hash from pre-hash snapshots', () => {
  assert.equal(recoveryMetadataRequiresHash({ savedAt: 123 }), false);
  assert.equal(recoveryMetadataRequiresHash({ revision: 0 }), true);
  assert.equal(recoveryMetadataRequiresHash({ writeSeq: 0 }), true);
});

test('the established hash stays stable across object key order and JSON-omitted values', () => {
  const first = calculateEstablishedContentHash({
    second: 2,
    omitted: undefined,
    first: 1,
  });
  const second = calculateEstablishedContentHash({ first: 1, second: 2 });

  assert.equal(first, second);
  assert.match(first, /^fnv1a-[0-9a-f]+$/);
});
