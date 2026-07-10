import * as Crypto from 'expo-crypto';
import { BigInteger, KEYUTIL, KJUR, utf8tohex } from 'jsrsasign';

export type OracleTextGenerationEnvelope = {
  version: 1;
  keyId: string;
  encryptedKey: string;
  iv: string;
  ciphertext: string;
  mac: string;
};

const ORACLE_PROFILE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAydxE/lTjZkLNJIafzoSG
in7IQUg4y9Wo/uxEuE3glw6UXE8jbqKg6sKq7cQFWWRYVEs55w15HpB2r/wWnhNe
0s1O+DWX1Vp/kGiivrC+8N24NPqmQ1Lo4A02E3wCLHoIy5XoH6VgIAVnoeAXlcRh
7JEAgwNYb7DWV63rPs+cesDGpuNl6TN2o7cJaXTaJFzAd4ycA0aXT/8Psz4d6RbM
80DSRYVGrXQCT7Ca/aWPpwBzKQy0GsKR7z83aFN+g8qPYcxWkK7KvP3uIRnHxa2M
hRx/1H5eOMR0qyjYqrwK1aWQi8xI5F0uGbHXeyEtc+CKD5UePp24borT7w9rU9UG
Ah9lAGeeup55OuZbB4zROIWONKI0y61lJyCUUVvoFXcOWtHw9idV+LhxzATW7vZq
cDFZYMQIvFxPUNle+GfVrkyR4wyv5jfCEL1/Q5UXAdfri/36sKWv60nO0pFY2HI8
x0evp0gqkN+4j1Qga1a9ObIXkMzgWoTeLXtvOkCJ4GNDAgMBAAE=
-----END PUBLIC KEY-----`;

const ORACLE_PROFILE_KEY_ID = 'sha256:7217df5d626d06d38a969e8774190f55d9e7e9624d4f158f3a9d87a6d85e2c95';

function randomHex(byteCount: number): string {
  return Array.from(Crypto.getRandomBytes(byteCount), value => value.toString(16).padStart(2, '0')).join('');
}

function xorHex(left: string, right: string): string {
  if (left.length !== right.length || left.length % 2 !== 0) throw new Error('Oracle encryption mask length mismatch');
  let output = '';
  for (let index = 0; index < left.length; index += 2) {
    output += (Number.parseInt(left.slice(index, index + 2), 16) ^ Number.parseInt(right.slice(index, index + 2), 16))
      .toString(16)
      .padStart(2, '0');
  }
  return output;
}

function mgf1Sha256(seedHex: string, byteLength: number): string {
  let output = '';
  for (let counter = 0; output.length < byteLength * 2; counter += 1) {
    const counterHex = counter.toString(16).padStart(8, '0');
    output += KJUR.crypto.Util.hashHex(`${seedHex}${counterHex}`, 'sha256');
  }
  return output.slice(0, byteLength * 2);
}

function rsaOaepSha256Encrypt(message: string): string {
  const publicKey = KEYUTIL.getKey(ORACLE_PROFILE_PUBLIC_KEY);
  const rsa = publicKey as typeof publicKey & { n: { bitLength(): number }; doPublic(value: BigInteger): BigInteger };
  const modulusBytes = Math.ceil(rsa.n.bitLength() / 8);
  const messageHex = utf8tohex(message);
  const messageBytes = messageHex.length / 2;
  const hashBytes = 32;
  if (messageBytes > modulusBytes - hashBytes * 2 - 2) throw new Error('Oracle encryption key material is too large');
  const labelHash = KJUR.crypto.Util.hashHex('', 'sha256');
  const padding = '00'.repeat(modulusBytes - messageBytes - hashBytes * 2 - 2);
  const dataBlock = `${labelHash}${padding}01${messageHex}`;
  const seed = randomHex(hashBytes);
  const maskedDataBlock = xorHex(dataBlock, mgf1Sha256(seed, modulusBytes - hashBytes - 1));
  const maskedSeed = xorHex(seed, mgf1Sha256(maskedDataBlock, hashBytes));
  const encoded = `00${maskedSeed}${maskedDataBlock}`;
  const BigIntegerFromHex = BigInteger as unknown as new (value: string, radix: number) => BigInteger;
  return rsa.doPublic(new BigIntegerFromHex(encoded, 16)).toString(16).padStart(modulusBytes * 2, '0');
}

export function encryptOracleTextGenerationProfile(profile: unknown): OracleTextGenerationEnvelope {
  const encryptionKey = randomHex(32);
  const macKey = randomHex(32);
  const iv = randomHex(16);
  const plaintext = utf8tohex(JSON.stringify(profile));
  const cipher = KJUR.crypto.Cipher as unknown as {
    encrypt(data: string, key: string, algorithm: string, options: { iv: string }): string;
  };
  const ciphertext = cipher.encrypt(plaintext, encryptionKey, 'aes256-CBC', { iv });
  const hmac = new KJUR.crypto.Mac({ alg: 'HmacSHA256', pass: { hex: macKey } });
  const mac = hmac.doFinalString(`${iv}.${ciphertext}`);
  return {
    version: 1,
    keyId: ORACLE_PROFILE_KEY_ID,
    encryptedKey: rsaOaepSha256Encrypt(`${encryptionKey}${macKey}`),
    iv,
    ciphertext,
    mac
  };
}
