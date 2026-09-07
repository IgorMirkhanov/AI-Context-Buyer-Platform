/** Read-only: preview decrypted access_token shape for one project. */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { createDecipheriv, scryptSync } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');
const PROJECT_ID = process.argv[2] ?? '98abacc8-8c51-4881-aa24-5c6b66907847';

function loadEnv() {
  for (const line of readFileSync(resolve(root, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m || process.env[m[1].trim()]) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[m[1].trim()] = val;
  }
}

function parseTokenEncryptionKey(raw) {
  const value = raw?.trim() ?? '';
  if (/^[0-9a-fA-F]{64}$/.test(value)) return Buffer.from(value, 'hex');
  const fromBase64 = Buffer.from(value, 'base64');
  if (fromBase64.length === 32) return fromBase64;
  if (value.length >= 32) return scryptSync(value, 'context-buyer-token-key', 32);
  throw new Error('TOKEN_ENCRYPTION_KEY invalid');
}

function decryptSecret(payload, key) {
  const [ivPart, tagPart, dataPart] = payload.split('.');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function looksLikeYandexToken(s) {
  return /^[\x20-\x7E]+$/.test(s) && !/\s/.test(s) && s.length >= 20;
}

loadEnv();
const prisma = new PrismaClient();
try {
  const cred = await prisma.adPlatformCredential.findFirst({
    where: { projectId: PROJECT_ID, platform: 'yandex_direct' },
    select: {
      externalAccountId: true,
      accessTokenEncrypted: true,
      expiresAt: true,
    },
  });
  if (!cred?.accessTokenEncrypted) {
    console.log(JSON.stringify({ error: 'no credential' }));
    process.exit(1);
  }
  const key = parseTokenEncryptionKey(process.env.TOKEN_ENCRYPTION_KEY);
  let plaintext;
  let decryptError = null;
  try {
    plaintext = decryptSecret(cred.accessTokenEncrypted, key);
  } catch (e) {
    decryptError = e instanceof Error ? e.message : String(e);
  }
  const preview = plaintext ? plaintext.slice(0, 12) : null;
  const nonPrintable = plaintext
    ? [...plaintext].filter((ch) => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) > 0x7e).length
    : null;
  console.log(
    JSON.stringify(
      {
        projectId: PROJECT_ID,
        externalAccountId: cred.externalAccountId,
        expiresAt: cred.expiresAt,
        ciphertextParts: cred.accessTokenEncrypted.split('.').length,
        decryptError,
        plaintextLength: plaintext?.length ?? null,
        preview,
        endsWithEllipsis: plaintext && plaintext.length > 12,
        nonPrintableCharCount: nonPrintable,
        looksLikeYandexToken: plaintext ? looksLikeYandexToken(plaintext) : false,
        hypothesis:
          decryptError
            ? 'decrypt_failed_key_or_corrupt_ciphertext'
            : plaintext && looksLikeYandexToken(plaintext)
              ? 'decrypt_ok_format_plausible_stale_access_token'
              : 'decrypt_ok_but_garbage_wrong_key_or_corrupt_plaintext',
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
