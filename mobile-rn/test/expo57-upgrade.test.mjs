import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import test from 'node:test';

const root = new URL('../', import.meta.url);

function source(path) {
  return readFileSync(new URL(path, root), 'utf8');
}

function sourceFiles(directory) {
  return readdirSync(new URL(directory, root), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && ['.ts', '.tsx'].includes(extname(entry.name)))
    .map((entry) => join(entry.parentPath, entry.name));
}

test('Expo 57 dependency set and security override remain pinned', () => {
  const packageJson = JSON.parse(source('package.json'));

  assert.equal(packageJson.dependencies.expo, '~57.0.4');
  assert.equal(packageJson.dependencies['react-native'], '0.86.0');
  assert.equal(packageJson.dependencies.react, '19.2.3');
  assert.equal(packageJson.devDependencies.typescript, '~6.0.3');
  assert.equal(packageJson.overrides.uuid, '11.1.1');
});

test('deprecated native compatibility switches cannot return', () => {
  const gradleProperties = source('android/gradle.properties');
  const appGradle = source('android/app/build.gradle');
  const mainApplication = source(
    'android/app/src/main/java/com/snsgod/rn/MainApplication.kt',
  );

  assert.doesNotMatch(gradleProperties, /newArchEnabled\s*=\s*false/);
  assert.doesNotMatch(appGradle, /^\s*(?!\/\/)hermes(?:Command|ExecutableName)\s*=/m);
  assert.match(appGradle, /REACT_NATIVE_RELEASE_LEVEL/);
  assert.match(mainApplication, /ExpoReactHostFactory\.getDefaultReactHost/);
  assert.match(mainApplication, /add\(TermuxBridgePackage\(\)\)/);
  assert.match(mainApplication, /add\(AutomationKeepAlivePackage\(\)\)/);
  assert.match(mainApplication, /loadReactNative\(this\)/);
});

test('legacy file-system calls use the explicit Expo compatibility entry point', () => {
  for (const path of sourceFiles('src')) {
    const value = readFileSync(path, 'utf8');
    assert.doesNotMatch(value, /import \* as FileSystem from ['"]expo-file-system['"]/);
    assert.doesNotMatch(value, /StyleSheet\.absoluteFillObject/);
  }

  assert.match(source('src/logic/backup.ts'), /expo-file-system\/legacy/);
  assert.match(source('src/storage/persist.ts'), /expo-file-system\/legacy/);
  assert.match(source('src/logic/api.ts'), /import \* as FileSystem from 'expo-file-system\/legacy'/);
  assert.doesNotMatch(source('src/logic/api.ts'), /import \{ File as ExpoFile \} from 'expo-file-system'/);
});

test('Windows release build uses a short Gradle cache path', () => {
  const packageJson = JSON.parse(source('package.json'));
  assert.match(packageJson.scripts['android:release'], /GRADLE_USER_HOME=C:\\sg-gradle/);
  assert.match(packageJson.scripts['android:release'], /--max-workers=1/);
});
