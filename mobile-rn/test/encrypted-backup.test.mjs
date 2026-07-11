import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const {
  BACKUP_PASSWORD_MIN_LENGTH,
  BACKUP_PASSWORD_MAX_LENGTH,
  BACKUP_PBKDF2_ITERATIONS,
  base64ToBytes,
  bytesToBase64,
  decryptBackupBase64,
  encryptBackupBase64,
  isEncryptedBackupBase64,
} = await import('../src/logic/backupEncryptionPolicy.ts');

const TEST_ITERATIONS = 100_000;
const TEST_PASSWORD = 'correct horse battery staple';
const ZIP_BASE64 = bytesToBase64(new TextEncoder().encode('PK\u0003\u0004copied local backup bytes'));

function parameters(seed = 0) {
  return {
    salt: Uint8Array.from({ length: 16 }, (_, index) => (index + seed) % 256),
    nonce: Uint8Array.from({ length: 24 }, (_, index) => (index + seed + 32) % 256),
    iterations: TEST_ITERATIONS,
  };
}

test('password backup round-trips through PBKDF2 and authenticated XChaCha20', async () => {
  const encrypted = await encryptBackupBase64(ZIP_BASE64, TEST_PASSWORD, parameters());
  assert.equal(isEncryptedBackupBase64(encrypted), true);
  assert.notEqual(encrypted, ZIP_BASE64);
  assert.equal(await decryptBackupBase64(encrypted, TEST_PASSWORD), ZIP_BASE64);
  assert.equal(isEncryptedBackupBase64(ZIP_BASE64), false);
});

test('the production 600,000-round KDF envelope decrypts successfully', async () => {
  const encrypted = await encryptBackupBase64(ZIP_BASE64, TEST_PASSWORD, {
    ...parameters(9),
    iterations: BACKUP_PBKDF2_ITERATIONS,
  });
  assert.equal(await decryptBackupBase64(encrypted, TEST_PASSWORD), ZIP_BASE64);
});

test('the same password and backup get different ciphertext from unique salt and nonce', async () => {
  const first = await encryptBackupBase64(ZIP_BASE64, TEST_PASSWORD, parameters(1));
  const second = await encryptBackupBase64(ZIP_BASE64, TEST_PASSWORD, parameters(2));
  assert.notEqual(first, second);
});

test('wrong passwords and ciphertext tampering fail without returning plaintext', async () => {
  const encrypted = await encryptBackupBase64(ZIP_BASE64, TEST_PASSWORD, parameters(3));
  await assert.rejects(decryptBackupBase64(encrypted, 'different secure password'), /틀렸거나 파일이 손상/);
  const tampered = base64ToBytes(encrypted);
  tampered[tampered.length - 1] ^= 1;
  await assert.rejects(decryptBackupBase64(bytesToBase64(tampered), TEST_PASSWORD), /틀렸거나 파일이 손상/);
});

test('password, random input, and KDF metadata validation reject weak or malformed envelopes', async () => {
  await assert.rejects(encryptBackupBase64(ZIP_BASE64, 'short', parameters()), new RegExp(`${BACKUP_PASSWORD_MIN_LENGTH}자`));
  await assert.rejects(
    encryptBackupBase64(ZIP_BASE64, 'x'.repeat(BACKUP_PASSWORD_MAX_LENGTH + 1), parameters()),
    new RegExp(`${BACKUP_PASSWORD_MAX_LENGTH}자`),
  );
  await assert.rejects(encryptBackupBase64(ZIP_BASE64, TEST_PASSWORD, { ...parameters(), salt: new Uint8Array(15) }), /salt 길이/);
  await assert.rejects(encryptBackupBase64(ZIP_BASE64, TEST_PASSWORD, { ...parameters(), iterations: 99_999 }), /반복 횟수/);
  const encrypted = base64ToBytes(await encryptBackupBase64(ZIP_BASE64, TEST_PASSWORD, parameters(4)));
  encrypted[10] = 0;
  encrypted[11] = 0;
  encrypted[12] = 0;
  encrypted[13] = 1;
  await assert.rejects(decryptBackupBase64(bytesToBase64(encrypted), TEST_PASSWORD), /반복 횟수/);
});

test('production backup uses Expo CSPRNG, preserves plain ZIP, and decrypts before media preparation', () => {
  const backupSource = readFileSync(new URL('../src/logic/backup.ts', import.meta.url), 'utf8');
  assert.match(backupSource, /Crypto\.getRandomBytesAsync\(16\)/);
  assert.match(backupSource, /Crypto\.getRandomBytesAsync\(24\)/);
  assert.match(backupSource, /const extension = password \? 'sgbackup' : 'zip'/);
  assert.match(backupSource, /encrypted \? await decryptBackupBase64[\s\S]*JSZip\.loadAsync/);
  assert.match(backupSource, /encrypted && !password[\s\S]*암호화된 백업입니다/);
});

test('settings keeps passwords in component memory and offers explicit compatible or encrypted flows', () => {
  const settingsSource = [
    readFileSync(new URL('../src/screens/SettingsScreen.tsx', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/screens/settings/BackupSettingsSection.tsx', import.meta.url), 'utf8'),
  ].join('\n');
  assert.match(settingsSource, /useState\(false\)[\s\S]*backupPassword/);
  assert.match(settingsSource, /전체 백업 암호화/);
  assert.match(settingsSource, /새 백업 암호 확인/);
  assert.match(settingsSource, /암호는 기기·설정·로그에 저장하지 않으며/);
  assert.match(settingsSource, /일반 ZIP은 비워 두세요/);
  assert.doesNotMatch(settingsSource, /config:\s*\{[\s\S]{0,200}backupPassword/);
});
