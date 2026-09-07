/**
 * Read-only: full Yandex OAuth refresh response for diagnosis.
 * Does NOT update DB. Prints HTTP status + raw JSON body.
 *
 * Usage:
 *   node scripts/audit/yandex-refresh-diagnostic.mjs [projectId]
 * Default project: mediapeace (98abacc8-...)
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { createDecipheriv, scryptSync } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');
const DEFAULT_PROJECT = '98abacc8-8c51-4881-aa24-5c6b66907847';

function loadEnv() {
  const path = resolve(root, '.env');
  const text = readFileSync(path, 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
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
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivPart, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

loadEnv();
const projectId = process.argv[2] ?? DEFAULT_PROJECT;
const prisma = new PrismaClient();
const key = parseTokenEncryptionKey(process.env.TOKEN_ENCRYPTION_KEY);

try {
  const cred = await prisma.adPlatformCredential.findFirst({
    where: { projectId, platform: 'yandex_direct' },
    include: { project: { select: { name: true } } },
  });
  if (!cred) {
    console.error(JSON.stringify({ error: 'no yandex_direct credential' }));
    process.exit(1);
  }
  if (!cred.refreshTokenEncrypted) {
    console.error(JSON.stringify({ error: 'refresh_token missing in DB' }));
    process.exit(1);
  }

  const refreshToken = decryptSecret(cred.refreshTokenEncrypted, key);
  const clientId = process.env.YANDEX_CLIENT_ID?.trim();
  const clientSecret = process.env.YANDEX_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    console.error(JSON.stringify({ error: 'YANDEX_CLIENT_ID/SECRET not set in .env' }));
    process.exit(1);
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch('https://oauth.yandex.ru/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const rawText = await res.text();
  let json;
  try {
    json = JSON.parse(rawText);
  } catch {
    json = { _parseError: true, rawText };
  }

  const redact = process.argv.includes('--redact') || !process.argv.includes('--show-tokens');
  if (redact && json && typeof json === 'object' && !json._parseError) {
    if (json.access_token) json.access_token = `[redacted, len=${String(json.access_token).length}]`;
    if (json.refresh_token) json.refresh_token = `[redacted, len=${String(json.refresh_token).length}]`;
  }

  console.log(
    JSON.stringify(
      {
        projectId,
        projectName: cred.project.name,
        externalAccountId: cred.externalAccountId,
        expiresAt: cred.expiresAt?.toISOString?.() ?? cred.expiresAt,
        scopes: cred.scopes,
        httpStatus: res.status,
        httpStatusText: res.statusText,
        yandexResponse: json,
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
