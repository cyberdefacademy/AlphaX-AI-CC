import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getSetting, setSetting } from './db';

const PERIOD_SECONDS = 30;
const DIGITS = 6;
const ISSUER = 'AlphaX AI Security Control';

function encryptionKey(): Buffer {
  let raw = getSetting('auth.totp_encryption_key');
  if (!raw) {
    raw = randomBytes(32).toString('base64url');
    setSetting('auth.totp_encryption_key', raw);
  }
  return createHash('sha256').update(raw).digest();
}

function encodeBase32(input: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function decodeBase32(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of input.replace(/=+$/g, '').toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error('invalid TOTP secret');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function encryptSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}

function decryptSecret(payload: string): string {
  const [ivRaw, tagRaw, ciphertextRaw] = payload.split('.');
  if (!ivRaw || !tagRaw || !ciphertextRaw) throw new Error('invalid encrypted TOTP secret');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextRaw, 'base64url')), decipher.final()]).toString('utf8');
}

export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(20));
}

export function buildOtpAuthUri(username: string, secret: string): string {
  return `otpauth://totp/${encodeURIComponent(ISSUER)}:${encodeURIComponent(username)}?secret=${secret}&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=${DIGITS}&period=${PERIOD_SECONDS}`;
}

function codeFor(secret: string, counter: number): string {
  const key = decodeBase32(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', key).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
  return String(value % 10 ** DIGITS).padStart(DIGITS, '0');
}

export function verifyTotp(secret: string, suppliedCode: string, nowMs = Date.now()): boolean {
  if (!/^\d{6}$/.test(suppliedCode)) return false;
  const counter = Math.floor(nowMs / 1000 / PERIOD_SECONDS);
  const supplied = Buffer.from(suppliedCode);
  for (const offset of [-1, 0, 1]) {
    const expected = Buffer.from(codeFor(secret, counter + offset));
    if (expected.length === supplied.length && timingSafeEqual(expected, supplied)) return true;
  }
  return false;
}

export function protectTotpSecret(secret: string): string {
  return encryptSecret(secret);
}

export function revealTotpSecret(payload: string): string {
  return decryptSecret(payload);
}
