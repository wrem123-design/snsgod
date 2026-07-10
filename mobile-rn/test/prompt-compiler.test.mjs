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
  compilePromptBlocks,
  countExactPromptOccurrences,
  withoutLatestUserInput,
} = await importPureTypeScript('src/logic/promptCompiler.ts');

const directSource = readFileSync(new URL('../src/logic/prompts.ts', import.meta.url), 'utf8');
const groupSource = readFileSync(new URL('../src/screens/GroupChatRoomScreen.tsx', import.meta.url), 'utf8');

test('compiler reports stable block trace and excludes disabled or empty blocks', () => {
  const result = compilePromptBlocks([
    { id: 'policy', content: 'Policy', required: true, priority: 100 },
    { id: 'disabled', content: 'Never', enabled: false },
    { id: 'empty', content: '  ' },
    { id: 'context', content: 'Context', priority: 50 },
  ]);

  assert.equal(result.content, 'Policy\n\nContext');
  assert.deepEqual(result.includedBlockIds, ['policy', 'context']);
  assert.deepEqual(result.trace.map(item => [item.id, item.included, item.reason]), [
    ['policy', true, 'included'],
    ['disabled', false, 'disabled'],
    ['empty', false, 'empty'],
    ['context', true, 'included'],
  ]);
  assert.equal(result.totalCharacters, result.content.length);
});

test('compiler keeps required blocks and spends remaining budget by priority', () => {
  const result = compilePromptBlocks([
    { id: 'required', content: '12345', required: true },
    { id: 'low', content: 'low', priority: 1 },
    { id: 'high', content: 'HIGH', priority: 10 },
  ], { maxCharacters: 11, separator: '|' });

  assert.equal(result.content, '12345|HIGH');
  assert.deepEqual(result.includedBlockIds, ['required', 'high']);
  assert.equal(result.trace.find(item => item.id === 'low')?.reason, 'budget');
  assert.ok(result.totalCharacters <= 11);
});

test('only the final matching user message is removed from transcript context', () => {
  const messages = [
    { id: '1', role: 'user', content: 'same' },
    { id: '2', role: 'character', content: 'reply' },
    { id: '3', role: 'user', content: 'same' },
  ];
  const context = withoutLatestUserInput(messages, 'same');
  assert.deepEqual(context.map(item => item.id), ['1', '2']);
  assert.deepEqual(messages.map(item => item.id), ['1', '2', '3']);
  assert.equal(countExactPromptOccurrences('same\nlatest: same', 'same'), 2);
});

test('direct and group builders compile blocks and exclude latest input from transcript', () => {
  assert.match(directSource, /withoutLatestUserInput\(messages, latestUserText\)/);
  assert.match(directSource, /compilePromptBlocks\(/);
  assert.match(groupSource, /withoutLatestUserInput\(messages, latestUserText\)/);
  assert.match(groupSource, /compilePromptBlocks\(/);
});
