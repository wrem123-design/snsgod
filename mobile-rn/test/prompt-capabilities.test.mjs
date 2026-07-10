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

const { hasPromptWeather, resolvePromptCapabilities } = await importPureTypeScript('src/logic/promptCapabilities.ts');
const directSource = readFileSync(new URL('../src/logic/prompts.ts', import.meta.url), 'utf8');
const groupSource = readFileSync(new URL('../src/screens/GroupChatRoomScreen.tsx', import.meta.url), 'utf8');

const base = {
  latestUserText: '그냥 안부 물어봤어',
  mode: 'reply',
  timeEnabled: false,
  weatherEnabled: false,
  hasWeather: false,
  imageEnabled: false,
  hasImageInput: false,
  phoneEnabled: false,
  hasStickers: false,
};

test('unrelated chat contains no capability blocks', () => {
  assert.deepEqual(resolvePromptCapabilities(base).includedBlockIds, []);
});

test('date, time, and weather activate only from their settings and context', () => {
  assert.deepEqual(resolvePromptCapabilities({ ...base, latestUserText: '이번 토요일이 몇 일이야?' }).includedBlockIds, ['capability.date']);
  assert.deepEqual(resolvePromptCapabilities({ ...base, timeEnabled: true }).includedBlockIds, ['capability.time']);
  assert.deepEqual(resolvePromptCapabilities({ ...base, weatherEnabled: true, hasWeather: true }).includedBlockIds, ['capability.weather']);
  assert.deepEqual(resolvePromptCapabilities({ ...base, weatherEnabled: true, hasWeather: false }).includedBlockIds, []);
  assert.equal(hasPromptWeather({}), false);
  assert.equal(hasPromptWeather({ condition: '맑음' }), true);
});

test('image and phone require both enabled capability and relevant input', () => {
  assert.deepEqual(resolvePromptCapabilities({ ...base, imageEnabled: true, latestUserText: '사진 보여줘' }).includedBlockIds, ['capability.image']);
  assert.deepEqual(resolvePromptCapabilities({ ...base, imageEnabled: false, latestUserText: '사진 보여줘' }).includedBlockIds, []);
  assert.deepEqual(resolvePromptCapabilities({ ...base, imageEnabled: true, hasImageInput: true }).includedBlockIds, ['capability.image']);
  assert.deepEqual(resolvePromptCapabilities({ ...base, phoneEnabled: true, latestUserText: '지금 통화할래?' }).includedBlockIds, ['capability.phone']);
  assert.deepEqual(resolvePromptCapabilities({ ...base, phoneEnabled: false, latestUserText: '지금 통화할래?' }).includedBlockIds, []);
});

test('sticker block exists only when the chat has usable stickers', () => {
  assert.deepEqual(resolvePromptCapabilities({ ...base, hasStickers: true }).includedBlockIds, ['capability.stickers']);
});

test('direct and group builders consume the shared capability resolver', () => {
  assert.match(directSource, /resolvePromptCapabilities\(/);
  assert.match(groupSource, /resolvePromptCapabilities\(/);
  assert.doesNotMatch(directSource, /Image sending is disabled\. Do not include imagePrompt/);
  assert.doesNotMatch(groupSource, /Image sending is disabled\. Do not include imagePrompt/);
  assert.doesNotMatch(directSource, /Available stickers: none/);
  assert.doesNotMatch(groupSource, /Available stickers: none/);
  for (const id of ['capability.date', 'capability.time', 'capability.weather', 'capability.image', 'capability.stickers']) {
    assert.match(directSource, new RegExp(`id: '${id.replace('.', '\\.')}'`));
    assert.match(groupSource, new RegExp(`id: '${id.replace('.', '\\.')}'`));
  }
  assert.match(directSource, /id: 'capability\.phone'/);
});
