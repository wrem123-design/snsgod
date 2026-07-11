import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/screens/SettingsScreen.tsx', import.meta.url), 'utf8');
const navigationSource = readFileSync(new URL('../src/screens/settings/SettingsNavigation.tsx', import.meta.url), 'utf8');
const backupSource = readFileSync(new URL('../src/screens/settings/BackupSettingsSection.tsx', import.meta.url), 'utf8');

test('daily and expert settings are split into explicit, bounded navigation groups', () => {
  assert.match(navigationSource, /BASIC_SETTINGS_SECTIONS[\s\S]*'user'[\s\S]*'characters'[\s\S]*'stickers'[\s\S]*'screen'[\s\S]*'backup'/);
  assert.match(navigationSource, /ADVANCED_SETTINGS_SECTIONS[\s\S]*'api'[\s\S]*'image'[\s\S]*'prompts'[\s\S]*'lorebook'/);
  assert.match(navigationSource, /'기본 설정' : '고급 설정'/);
  assert.match(navigationSource, /accessibilityRole="tab"[\s\S]*accessibilityState=\{\{ selected:/);
  assert.match(source, /useState<SettingsSection>\('user'\)[\s\S]*useState<SettingsMode>\('basic'\)/);
});

test('local data boundary is the first basic card and backup has a dedicated section', () => {
  const localBoundary = source.indexOf('<Text style={styles.cardTitle}>로컬 데이터 기준</Text>');
  const profile = source.indexOf('<Text style={styles.cardTitle}>내 기본 프로필</Text>');
  assert.ok(localBoundary >= 0 && localBoundary < profile);
  assert.match(source, /<BackupSettingsSection[\s\S]*visible=\{activeSection === 'backup'\}/);
  assert.match(backupSource, /<Text style=\{styles\.cardTitle\}>백업<\/Text>/);
  assert.match(source, /외부 푸시 초기화를 수행하지 않습니다/);
});

test('provider, Oracle, image rules, and raw prompts remain behind the advanced entry', () => {
  assert.match(source, /settingsMode === 'advanced' \? <AdvancedSettingsNotice/);
  assert.match(navigationSource, /직접 연결과 원문 편집/);
  assert.match(source, /activeSection !== 'api'[\s\S]*AI Provider 직접 설정/);
  assert.match(source, /activeSection !== 'api'[\s\S]*Oracle 메시지 서버/);
  assert.match(source, /activeSection !== 'image'[\s\S]*AI 생성 금지 프롬프트 및 규칙/);
  assert.match(source, /section === 'prompts' && onOpenPrompts[\s\S]*onOpenPrompts\(\)/);
});

test('obsolete duplicate prompt cards are absent while stored values remain untouched on entry', () => {
  assert.doesNotMatch(source, /<Text style=\{styles\.cardTitle\}>SNS 생성 설정<\/Text>/);
  assert.doesNotMatch(source, /<Text style=\{styles\.cardTitle\}>프롬프트<\/Text>[\s\S]{0,200}프롬프트 관리/);
  assert.match(navigationSource, /기존 값은 그대로 유지됩니다/);
  assert.doesNotMatch(source, /openSettingsMode[\s\S]{0,240}onChange\(/);
});
