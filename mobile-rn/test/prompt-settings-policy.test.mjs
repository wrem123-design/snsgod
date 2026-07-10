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

const { HIDDEN_LEGACY_PROMPT_FIELDS, PROMPT_SETTING_DEFINITIONS } = await importPureTypeScript('src/logic/promptSettingsPolicy.ts');
const promptScreenSource = readFileSync(new URL('../src/screens/PromptSettingsScreen.tsx', import.meta.url), 'utf8');
const characterScreenSource = readFileSync(new URL('../src/screens/CharacterSettingsScreen.tsx', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../src/logic/api.ts', import.meta.url), 'utf8');

test('only prompt fields with real consumers remain visible', () => {
  const visible = PROMPT_SETTING_DEFINITIONS.map(item => item.key);
  assert.deepEqual(HIDDEN_LEGACY_PROMPT_FIELDS, ['roleObjective', 'language']);
  assert.equal(visible.includes('roleObjective'), false);
  assert.equal(visible.includes('language'), false);
  assert.equal(new Set(visible).size, visible.length);
  assert.ok(PROMPT_SETTING_DEFINITIONS.every(item => item.label && item.help && item.consumer));
});

test('hidden legacy prompt values remain in the saved draft for backup compatibility', () => {
  assert.match(promptScreenSource, /PROMPT_SETTING_DEFINITIONS/);
  assert.match(promptScreenSource, /\{ \.\.\.DEFAULT_PROMPTS, \.\.\.\(state\.config\.prompts \|\| \{\}\) \}/);
  assert.match(promptScreenSource, /prompts: draft/);
});

test('existing character settings hide inert firstMessage while keeping meaningful fields', () => {
  const promptSection = characterScreenSource.slice(
    characterScreenSource.indexOf("activeSection === 'prompt'"),
    characterScreenSource.indexOf("function Section("),
  );
  assert.doesNotMatch(promptSection, /label="첫 메시지"/);
  assert.match(promptSection, /label="삽화 외형 태그"/);
});

test('illustration tags are consumed by image prompt generation', () => {
  assert.match(apiSource, /characterVisualIdentity/);
  assert.match(apiSource, /character\?\.illustrationTags/);
  assert.match(apiSource, /Character visual identity tags:/);
});
