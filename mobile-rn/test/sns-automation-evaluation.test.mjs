import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const evaluationUrl = new URL('../src/logic/snsAutomationEvaluation.ts', import.meta.url);
assert.equal(existsSync(evaluationUrl), true, 'snsAutomationEvaluation policy must exist');
const source = readFileSync(evaluationUrl, 'utf8');
const transpiled = ts.transpileModule(source, {
  fileName: 'src/logic/snsAutomationEvaluation.ts',
  reportDiagnostics: true,
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
assert.equal(transpiled.diagnostics?.length ?? 0, 0);
const { evaluateSnsAutomationCandidates, oneSnsRoomPerCharacter } = await import(
  `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`
);

test('SNS background evaluation reaches every character after earlier chance misses', async () => {
  const candidates = Array.from({ length: 8 }, (_, index) => ({ characterId: `character-${index}`, roomId: `room-${index}` }));
  const visited = [];
  const initial = { revision: 0, snsPosts: [] };
  const result = await evaluateSnsAutomationCandidates(initial, candidates, async (state, candidate) => {
    visited.push(candidate.characterId);
    if (candidate.characterId === 'character-7') {
      return { ...state, revision: state.revision + 1, snsPosts: [{ id: 'created-post' }] };
    }
    return { ...state, revision: state.revision + 1 };
  });

  assert.deepEqual(visited, candidates.map(candidate => candidate.characterId));
  assert.equal(result.revision, 8);
  assert.equal(result.snsPosts.length, 1);
});

test('SNS candidate selection keeps the highest-priority room once per character', () => {
  const result = oneSnsRoomPerCharacter([
    { characterId: 'a', roomId: 'a-high', priority: 9 },
    { characterId: 'a', roomId: 'a-low', priority: 2 },
    { characterId: 'b', roomId: 'b-only', priority: 7 },
  ]);

  assert.deepEqual(result.map(candidate => candidate.roomId), ['a-high', 'b-only']);
});
