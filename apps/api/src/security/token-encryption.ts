import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;

export function parseTokenEncryptionKey(raw: string | undefined): Buffer {
  const value = raw?.trim() ?? '';
  if (!value) {
    throw new Error('TOKEN_ENCRYPTION_KEY is not set');
  }
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return Buffer.from(value, 'hex');
  }
  const fromBase64 = Buffer.from(value, 'base64');
  if (fromBase64.length === 32) {
    return fromBase64;
  }
  if (value.length >= 32) {
    return scryptSync(value, 'context-buyer-token-key', 32);
  }
  throw new Error(
    'TOKEN_ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64)',
  );
}

export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decryptSecret(payload: string, key: Buffer): string {
  const [ivPart, tagPart, dataPart] = payload.split('.');
  if (!ivPart || !tagPart || !dataPart) {
    throw new Error('Invalid encrypted payload');
  }
  const decipher = createDecipheriv(
    ALGO,
    key,
    Buffer.from(ivPart, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64url')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
