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

const { canonicalPersonaBlocks, canonicalPersonaCoreBlocks } = await importPureTypeScript('src/logic/canonicalPersona.ts');
const directSource = readFileSync(new URL('../src/logic/prompts.ts', import.meta.url), 'utf8');
const groupSource = readFileSync(new URL('../src/screens/GroupChatRoomScreen.tsx', import.meta.url), 'utf8');
const automationSource = readFileSync(new URL('../src/logic/automation.ts', import.meta.url), 'utf8');
const callSource = readFileSync(new URL('../src/screens/CallScreen.tsx', import.meta.url), 'utf8');
const memorySource = readFileSync(new URL('../src/logic/memoryBridge.ts', import.meta.url), 'utf8');

const character = {
  id: 'char-1',
  name: '하린',
  handle: 'harin',
  prompt: '차분하지만 장난기가 있고 짧은 반말을 쓴다.',
  language: 'Japanese',
  messageStyle: 'burst',
  responseTime: 7,
  thinkingTime: 4,
  reactivity: 8,
  tone: 6,
};

test('canonical core is channel-independent and honors character language override', () => {
  const first = canonicalPersonaCoreBlocks(character, 'Korean');
  const second = canonicalPersonaCoreBlocks({ ...character }, 'English');
  assert.deepEqual(first, second);
  assert.deepEqual(first.map(block => block.id), ['persona.char-1.identity', 'persona.char-1.voice', 'persona.char-1.language']);
  assert.match(first[2].content, /Japanese/);
});

test('private and group-public memory boundaries compile different explicit guards', () => {
  const privateBlocks = canonicalPersonaBlocks(character, 'Korean', {
    userVisibleName: '민수',
    relationshipNote: '오래된 친구',
    memoryBlock: '둘만 아는 약속',
    memoryVisibility: 'private',
  });
  const groupBlocks = canonicalPersonaBlocks(character, 'Korean', {
    userVisibleName: '민수',
    relationshipNote: '동아리 단톡',
    memoryBlock: '모두가 아는 일정',
    memoryVisibility: 'group_public',
  });
  assert.match(privateBlocks.at(-1).content, /Private factual memory/);
  assert.match(groupBlocks.at(-1).content, /Group-public memory only/);
  assert.doesNotMatch(groupBlocks.at(-1).content, /둘만 아는 약속/);
});

test('direct, group, proactive, and phone paths use canonical Persona helpers', () => {
  assert.match(directSource, /canonicalPersonaBlocks\(/);
  assert.match(groupSource, /canonicalPersonaCoreBlocks\(/);
  assert.match(automationSource, /canonicalPersonaBlocks\(/);
  assert.match(callSource, /canonicalPersonaBlocks\(/);
  assert.match(memorySource, /includePrivateHints !== false/);
  assert.match(groupSource, /includePrivateHints: false/);
  assert.match(automationSource, /includePrivateHints: false/);
});
