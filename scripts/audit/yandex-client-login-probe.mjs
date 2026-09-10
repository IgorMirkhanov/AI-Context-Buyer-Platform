/**
 * Live probe: per-project Client-Login → Yandex Campaigns.get (read-only).
 * Usage: node scripts/audit/yandex-client-login-probe.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { createDecipheriv, scryptSync } from 'crypto';
import { assertAuditScriptsAllowed } from './assert-local-only.mjs';

assertAuditScriptsAllowed();

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

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

async function fetchCampaigns(accessToken, clientLogin) {
  const res = await fetch('https://api.direct.yandex.com/json/v5/campaigns', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=utf-8',
      Accept: 'application/json',
      ...(clientLogin ? { 'Client-Login': clientLogin } : {}),
    },
    body: JSON.stringify({
      method: 'get',
      params: {
        SelectionCriteria: {},
        FieldNames: ['Id', 'Name', 'State', 'Status'],
      },
    }),
  });
  const body = await res.json();
  return { status: res.status, clientLogin: clientLogin ?? null, body };
}

loadEnv();
const prisma = new PrismaClient();
const key = parseTokenEncryptionKey(process.env.TOKEN_ENCRYPTION_KEY);

const targets = [
  { id: '98abacc8-8c51-4881-aa24-5c6b66907847', label: 'mediapeace' },
  { id: '4ff9d160-419e-45c3-a9ea-c464e524acd4', label: 'Saask97-demo' },
];

try {
  for (const target of targets) {
    const cred = await prisma.adPlatformCredential.findFirst({
      where: { projectId: target.id, platform: 'yandex_direct' },
    });
    if (!cred) {
      console.log(JSON.stringify({ label: target.label, error: 'no credential' }));
      continue;
    }
    const accessToken = decryptSecret(cred.accessTokenEncrypted, key);
    const expectedLogin = cred.externalAccountId;
    const result = await fetchCampaigns(accessToken, expectedLogin ?? undefined);
    const campaigns = result.body?.result?.Campaigns ?? [];
    const error = result.body?.error;
    console.log(
      JSON.stringify({
        label: target.label,
        projectId: target.id,
        externalAccountId: expectedLogin,
        clientLoginSent: expectedLogin,
        httpStatus: result.status,
        campaignCount: campaigns.length,
        sampleNames: campaigns.slice(0, 3).map((c) => c.Name),
        error: error
          ? {
              code: error.error_code,
              string: error.error_string,
              detail: error.error_detail,
            }
          : null,
      }),
    );

    // Cross-check: wrong login should differ or error
    if (expectedLogin === 'mediapeace') {
      const wrong = await fetchCampaigns(accessToken, 'Saask97');
      const wrongCount = wrong.body?.result?.Campaigns?.length ?? 0;
      const wrongErr = wrong.body?.error?.error_string ?? null;
      console.log(
        JSON.stringify({
          label: `${target.label}-crosscheck-wrong-login`,
          clientLoginSent: 'Saask97',
          campaignCount: wrongCount,
          error: wrongErr,
        }),
      );
    }
  }
} finally {
  await prisma.$disconnect();
}
