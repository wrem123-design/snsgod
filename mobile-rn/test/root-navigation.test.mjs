import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

async function importNavigation() {
  const source = readFileSync(new URL('../src/logic/rootNavigation.ts', import.meta.url), 'utf8');
  const transpiled = ts.transpileModule(source, {
    fileName: 'src/logic/rootNavigation.ts',
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  assert.equal(transpiled.diagnostics?.length ?? 0, 0);
  return import(`data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`);
}

const { ROOT_FEATURE_ROUTES, rootForRouteName, routeForRoot } = await importNavigation();
const navSource = readFileSync(new URL('../src/components/BottomNav.tsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const feedSource = readFileSync(new URL('../src/screens/FeedHubScreen.tsx', import.meta.url), 'utf8');
const menuSource = readFileSync(new URL('../src/screens/MenuHubScreen.tsx', import.meta.url), 'utf8');
const chatListSource = readFileSync(new URL('../src/screens/ChatListScreen.tsx', import.meta.url), 'utf8');
const snsSource = readFileSync(new URL('../src/screens/SNSScreen.tsx', import.meta.url), 'utf8');

test('four roots map to one stable root route and own every required feature', () => {
  assert.deepEqual(['contacts', 'feed', 'discover', 'archive'].map(routeForRoot), ['chatList', 'feedHub', 'discoverHub', 'archiveHub']);
  assert.equal(rootForRouteName('notifications'), 'contacts');
  assert.equal(rootForRouteName('sns'), 'feed');
  assert.equal(rootForRouteName('blindDate'), 'discover');
  assert.equal(rootForRouteName('gallery'), 'archive');
  assert.equal(rootForRouteName('call'), 'contacts');
  assert.equal(rootForRouteName('meeting'), 'contacts');
  assert.equal(new Set(Object.values(ROOT_FEATURE_ROUTES).flat()).size, Object.values(ROOT_FEATURE_ROUTES).flat().length);
});

test('bottom navigation has four visible Korean labels, tab semantics, and selected state', () => {
  for (const label of ['연락', '피드', '발견', '보관함']) assert.match(navSource, new RegExp(`label: '${label}'`));
  assert.equal((navSource.match(/key: '/g) || []).length, 4);
  assert.match(navSource, /accessibilityRole="tab"/);
  assert.match(navSource, /accessibilityState=\{\{ selected \}\}/);
  assert.match(navSource, /<Text style=\{\[styles\.label/);
});

test('required root features are reachable from the feed, discovery, and archive hubs', () => {
  for (const label of ['Instagram', 'X']) assert.match(feedSource, new RegExp(label));
  for (const label of ['랜덤 대화', '블라인드 데이트', '데이트 앱', '앨범', '레퍼런스', '백업·설정']) assert.match(menuSource, new RegExp(label));
  assert.match(appSource, /navigate\(\{ name: routeForRoot\(tab\) \}, \{ replace: true \}\)/);
  assert.match(appSource, /function openBottomTab[\s\S]*routeHistoryRef\.current = \[\]/);
});

test('notification deep links and call or meeting return routes remain typed routes', () => {
  assert.match(appSource, /openNotificationRequest/);
  assert.match(appSource, /name: 'call'[\s\S]*returnRoute\?: Route/);
  assert.match(appSource, /name: 'meeting'[\s\S]*returnRoute\?: Route/);
});

test('notifications and settings are exposed by only their owning roots', () => {
  assert.match(chatListSource, /label: '알림'/);
  assert.doesNotMatch(chatListSource, /label: '설정'/);
  assert.doesNotMatch(snsSource, /accessibilityLabel="(?:알림|설정)"/);
});
