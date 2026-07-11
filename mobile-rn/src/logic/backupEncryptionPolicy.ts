import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';

const MAGIC = new TextEncoder().encode('SNSGODENC1');
const SALT_LENGTH = 16;
const NONCE_LENGTH = 24;
const TAG_LENGTH = 16;
const ITERATION_OFFSET = MAGIC.length;
const SALT_OFFSET = ITERATION_OFFSET + 4;
const NONCE_OFFSET = SALT_OFFSET + SALT_LENGTH;
const HEADER_LENGTH = NONCE_OFFSET + NONCE_LENGTH;
const BASE64_DECODE_CHUNK = 32768;
const BASE64_ENCODE_CHUNK = 24576;

export const BACKUP_PASSWORD_MIN_LENGTH = 10;
export const BACKUP_PASSWORD_MAX_LENGTH = 1024;
export const BACKUP_PBKDF2_ITERATIONS = 600_000;

export type BackupEncryptionParameters = {
  salt: Uint8Array;
  nonce: Uint8Array;
  iterations?: number;
};

function validatedPassword(password: string): string {
  if (password.length < BACKUP_PASSWORD_MIN_LENGTH) throw new Error(`백업 암호는 ${BACKUP_PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`);
  if (password.length > BACKUP_PASSWORD_MAX_LENGTH) throw new Error(`백업 암호는 ${BACKUP_PASSWORD_MAX_LENGTH}자 이하여야 합니다.`);
  return password;
}

function validatedIterations(iterations: number): number {
  if (!Number.isSafeInteger(iterations) || iterations < 100_000 || iterations > 2_000_000) {
    throw new Error('암호화 백업의 키 생성 반복 횟수가 허용 범위를 벗어났습니다.');
  }
  return iterations;
}

function validatedRandomBytes(value: Uint8Array, length: number, label: string): Uint8Array {
  if (!(value instanceof Uint8Array) || value.length !== length) throw new Error(`${label} 길이가 올바르지 않습니다.`);
  return new Uint8Array(value);
}

function writeUint32(target: Uint8Array, offset: number, value: number): void {
  new DataView(target.buffer, target.byteOffset, target.byteLength).setUint32(offset, value, false);
}

function readUint32(source: Uint8Array, offset: number): number {
  return new DataView(source.buffer, source.byteOffset, source.byteLength).getUint32(offset, false);
}

function concatBytes(...values: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(values.reduce((length, value) => length + value.length, 0));
  let offset = 0;
  for (const value of values) {
    result.set(value, offset);
    offset += value.length;
  }
  return result;
}

function normalizedBase64(value: string): string {
  const normalized = String(value || '').replace(/\s+/g, '');
  if (!normalized || normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) throw new Error('백업 데이터의 base64 형식이 올바르지 않습니다.');
  return normalized;
}

export function base64ToBytes(value: string): Uint8Array {
  const source = normalizedBase64(value);
  const padding = source.endsWith('==') ? 2 : source.endsWith('=') ? 1 : 0;
  const result = new Uint8Array((source.length / 4) * 3 - padding);
  let outputOffset = 0;
  for (let offset = 0; offset < source.length; offset += BASE64_DECODE_CHUNK) {
    const binary = atob(source.slice(offset, Math.min(source.length, offset + BASE64_DECODE_CHUNK)));
    for (let index = 0; index < binary.length; index += 1) result[outputOffset++] = binary.charCodeAt(index);
  }
  return result;
}

export function bytesToBase64(value: Uint8Array): string {
  const parts: string[] = [];
  for (let offset = 0; offset < value.length; offset += BASE64_ENCODE_CHUNK) {
    const chunk = value.subarray(offset, Math.min(value.length, offset + BASE64_ENCODE_CHUNK));
    let binary = '';
    for (let index = 0; index < chunk.length; index += 1) binary += String.fromCharCode(chunk[index]);
    parts.push(btoa(binary));
  }
  return parts.join('');
}

function hasMagic(value: Uint8Array): boolean {
  return value.length >= MAGIC.length && MAGIC.every((byte, index) => value[index] === byte);
}

export function isEncryptedBackupBase64(value: string): boolean {
  try {
    const source = normalizedBase64(value);
    const prefixLength = Math.ceil(MAGIC.length / 3) * 4;
    return hasMagic(base64ToBytes(source.slice(0, prefixLength)));
  } catch {
    return false;
  }
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  return pbkdf2Async(sha256, password, salt, { c: iterations, dkLen: 32, asyncTick: 8 });
}

export async function encryptBackupBase64(
  zipBase64: string,
  password: string,
  parameters: BackupEncryptionParameters,
): Promise<string> {
  const safePassword = validatedPassword(password);
  const salt = validatedRandomBytes(parameters.salt, SALT_LENGTH, '백업 salt');
  const nonce = validatedRandomBytes(parameters.nonce, NONCE_LENGTH, '백업 nonce');
  const iterations = validatedIterations(parameters.iterations ?? BACKUP_PBKDF2_ITERATIONS);
  const header = new Uint8Array(HEADER_LENGTH);
  header.set(MAGIC, 0);
  writeUint32(header, ITERATION_OFFSET, iterations);
  header.set(salt, SALT_OFFSET);
  header.set(nonce, NONCE_OFFSET);
  const key = await deriveKey(safePassword, salt, iterations);
  try {
    const ciphertext = xchacha20poly1305(key, nonce, header).encrypt(base64ToBytes(zipBase64));
    return bytesToBase64(concatBytes(header, ciphertext));
  } finally {
    key.fill(0);
  }
}

export async function decryptBackupBase64(encryptedBase64: string, password: string): Promise<string> {
  const safePassword = validatedPassword(password);
  const encrypted = base64ToBytes(encryptedBase64);
  if (!hasMagic(encrypted) || encrypted.length < HEADER_LENGTH + TAG_LENGTH) throw new Error('암호화 백업 형식이 올바르지 않습니다.');
  const header = encrypted.slice(0, HEADER_LENGTH);
  const iterations = validatedIterations(readUint32(header, ITERATION_OFFSET));
  const salt = header.slice(SALT_OFFSET, NONCE_OFFSET);
  const nonce = header.slice(NONCE_OFFSET, HEADER_LENGTH);
  const key = await deriveKey(safePassword, salt, iterations);
  try {
    const plaintext = xchacha20poly1305(key, nonce, header).decrypt(encrypted.slice(HEADER_LENGTH));
    return bytesToBase64(plaintext);
  } catch {
    throw new Error('백업 암호가 틀렸거나 파일이 손상되었습니다. 현재 데이터는 변경하지 않았습니다.');
  } finally {
    key.fill(0);
  }
}
