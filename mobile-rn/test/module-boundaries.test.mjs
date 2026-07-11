import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const app = source('../src/App.tsx');
const rootNavigation = source('../src/logic/rootNavigation.ts');
const settings = source('../src/screens/SettingsScreen.tsx');
const settingsNavigation = source('../src/screens/settings/SettingsNavigation.tsx');
const backupSettings = source('../src/screens/settings/BackupSettingsSection.tsx');
const backup = source('../src/logic/backup.ts');
const encryption = source('../src/logic/backupEncryptionPolicy.ts');
const secrets = source('../src/storage/secureSecrets.ts');
const remotePolicy = source('../src/logic/remoteServicePolicy.ts');

test('App delegates root-route mapping and visibility to one policy module', () => {
  assert.match(app, /rootForRouteName, routeForRoot, shouldShowBottomNavigation/);
  assert.match(app, /const showBottomNav = shouldShowBottomNavigation\(route\.name\)/);
  assert.match(rootNavigation, /export function routeForRoot/);
  assert.match(rootNavigation, /export function rootForRouteName/);
  assert.match(rootNavigation, /export function shouldShowBottomNavigation/);
  assert.doesNotMatch(app, /route\.name === 'chatList' \|\| route\.name === 'notifications'/);
});

test('settings composition delegates navigation and backup rendering through typed public props', () => {
  assert.match(settings, /from '\.\/settings\/SettingsNavigation'/);
  assert.match(settings, /from '\.\/settings\/BackupSettingsSection'/);
  assert.match(settingsNavigation, /export type SettingsMode/);
  assert.match(settingsNavigation, /export type SettingsSection/);
  assert.match(backupSettings, /export type BackupSettingsSectionProps/);
  assert.match(backupSettings, /All operations|without owning persistence/);
});

test('backup UI cannot perform persistence, crypto, file, or restore work directly', () => {
  assert.doesNotMatch(backupSettings, /expo-file-system|expo-crypto|JSZip|importFullBackupZip|exportFullBackupZip|writeAsStringAsync/);
  assert.match(backupSettings, /onExportFullBackup: \(\) => void/);
  assert.match(backupSettings, /onImportFullBackup: \(\) => void/);
  assert.match(backup, /from '\.\/backupEncryptionPolicy'/);
  assert.match(backup, /stateWithoutStoredSecrets/);
});

test('logic and storage policy boundaries never depend on App or screens', () => {
  for (const value of [rootNavigation, backup, encryption, secrets, remotePolicy]) {
    assert.doesNotMatch(value, /from ['"]\.\.\/App|from ['"][^'"]*screens\//);
  }
  assert.doesNotMatch(encryption, /react|react-native|expo-/);
  assert.doesNotMatch(remotePolicy, /react|react-native/);
});
