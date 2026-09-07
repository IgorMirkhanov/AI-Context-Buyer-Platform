/**
 * Read-only: what scopes does Yandex actually grant this token?
 * Compares login.yandex.ru/info + Campaigns.get with OAuth vs Bearer.
 */
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

async function yandexLoginInfo(accessToken) {
  const res = await fetch('https://login.yandex.ru/info?format=json', {
    headers: { Authorization: `OAuth ${accessToken}` },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { rawText: text };
  }
  return { httpStatus: res.status, body: json };
}

async function campaignsGet(accessToken, clientLogin, authScheme) {
  const res = await fetch('https://api.direct.yandex.com/json/v5/campaigns', {
    method: 'POST',
    headers: {
      Authorization: `${authScheme} ${accessToken}`,
      'Content-Type': 'application/json; charset=utf-8',
      Accept: 'application/json',
      ...(clientLogin ? { 'Client-Login': clientLogin } : {}),
    },
    body: JSON.stringify({
      method: 'get',
      params: {
        SelectionCriteria: {},
        FieldNames: ['Id', 'Name'],
      },
    }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { rawText: text };
  }
  return { httpStatus: res.status, authScheme, body: json };
}

loadEnv();
const prisma = new PrismaClient();
const key = parseTokenEncryptionKey(process.env.TOKEN_ENCRYPTION_KEY);

try {
  const cred = await prisma.adPlatformCredential.findFirst({
    where: { projectId: PROJECT_ID, platform: 'yandex_direct' },
    include: { project: { select: { name: true } } },
  });
  if (!cred?.accessTokenEncrypted) {
    console.log(JSON.stringify({ error: 'no credential' }));
    process.exit(1);
  }

  const accessToken = decryptSecret(cred.accessTokenEncrypted, key);
  const clientId = process.env.YANDEX_CLIENT_ID?.trim();

  const loginInfo = await yandexLoginInfo(accessToken);
  const directOAuth = await campaignsGet(accessToken, cred.externalAccountId ?? undefined, 'OAuth');
  const directBearer = await campaignsGet(accessToken, cred.externalAccountId ?? undefined, 'Bearer');

  console.log(
    JSON.stringify(
      {
        projectId: PROJECT_ID,
        projectName: cred.project.name,
        externalAccountId: cred.externalAccountId,
        dbScopes: cred.scopes,
        credentialCreatedAt: cred.createdAt,
        clientId,
        appInfoUrl: clientId ? `https://oauth.yandex.com/client/${clientId}/info` : null,
        accessTokenPreview: `${accessToken.slice(0, 8)}…(len=${accessToken.length})`,
        loginYandexRuInfo: loginInfo,
        campaignsGetOAuth: directOAuth,
        campaignsGetBearer: directBearer,
        interpretation: {
          dbScopesIsBackfillOnly:
            'scopes in DB may have been set by backfill script, not by Yandex token response',
          directApiWorksWithOAuth: !directOAuth.body?.error,
          directApiWorksWithBearer: !directBearer.body?.error,
          hasDirectApiInLoginInfoScope:
            typeof loginInfo.body?.scope === 'string' &&
            loginInfo.body.scope.includes('direct'),
        },
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
