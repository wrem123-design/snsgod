import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const settingsSource = readFileSync(new URL('../src/screens/SettingsScreen.tsx', import.meta.url), 'utf8');

function providerPresets(provider, nextProvider) {
  const start = settingsSource.indexOf(`${provider}: [`);
  const end = settingsSource.indexOf(`${nextProvider}: [`, start);
  assert.ok(start >= 0 && end > start);
  return settingsSource.slice(start, end);
}

test('Gemini and Vertex presets expose the requested flash models', () => {
  const vertexPresets = providerPresets('vertex', 'gemini');
  const geminiPresets = providerPresets('gemini', 'openai');

  for (const presets of [vertexPresets, geminiPresets]) {
    assert.match(presets, /model: 'gemini-3\.6-flash'/);
    assert.match(presets, /model: 'gemini-3\.5-flash-lite'/);
  }
});

test('existing Gemini and Vertex presets remain available', () => {
  const vertexPresets = providerPresets('vertex', 'gemini');
  const geminiPresets = providerPresets('gemini', 'openai');

  for (const model of ['gemini-3-flash-preview', 'gemini-3.1-pro-preview', 'gemini-2.5-pro', 'gemini-3.5-flash']) {
    assert.match(vertexPresets, new RegExp(`model: '${model.replaceAll('.', '\\.')}'`));
  }
  for (const model of ['gemini-2.5-pro', 'gemini-2.5-flash-lite', 'gemini-3.5-flash', 'gemini-3-flash-preview']) {
    assert.match(geminiPresets, new RegExp(`model: '${model.replaceAll('.', '\\.')}'`));
  }
});

test('saved Vertex settings never substitute one model or location for another', () => {
  assert.doesNotMatch(settingsSource, /usesUnsupportedVertexAlias/);
  assert.doesNotMatch(settingsSource, /requestedModel\.toLowerCase\(\) === 'gemini-3\.5-flash'/);
});
