/**
 * Pre-release audit helper — read-only checks (credentials, clientLogin wiring).
 * Usage: node scripts/audit/pre-release-audit.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MEDIAPEACE_PROJECT_ID = '98abacc8-8c51-4881-aa24-5c6b66907847';

try {
  const creds = await prisma.adPlatformCredential.findMany({
    select: {
      projectId: true,
      platform: true,
      externalAccountId: true,
      scopes: true,
      project: { select: { name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log('=== OAuth credentials per project ===');
  for (const row of creds) {
    console.log(
      JSON.stringify({
        projectId: row.projectId,
        projectName: row.project.name,
        platform: row.platform,
        externalAccountId: row.externalAccountId,
        scopes: row.scopes,
        clientLoginHeader: row.externalAccountId ?? '(none)',
      }),
    );
  }

  const dupes = new Map();
  for (const row of creds) {
    const key = `${row.platform}:${row.externalAccountId}`;
    const list = dupes.get(key) ?? [];
    list.push(row.projectId);
    dupes.set(key, list);
  }
  const shared = [...dupes.entries()].filter(([, ids]) => ids.length > 1);
  console.log('\n=== Same login on multiple projects (allowed if intentional) ===');
  console.log(shared.length ? JSON.stringify(shared, null, 2) : 'none');

  const mp = await prisma.project.findUnique({
    where: { id: MEDIAPEACE_PROJECT_ID },
    include: {
      credentials: true,
      campaigns: { select: { id: true, externalCampaignId: true, source: true, status: true, targetingJson: true } },
      performanceSnapshots: {
        where: { date: { gte: new Date(Date.now() - 8 * 86400000) } },
        select: { campaignId: true, date: true, impressions: true, clicks: true, spend: true },
      },
    },
  });

  if (mp) {
    console.log('\n=== mediapeace project ===');
    console.log(
      JSON.stringify({
        id: mp.id,
        name: mp.name,
        credential: mp.credentials[0]
          ? {
              externalAccountId: mp.credentials[0].externalAccountId,
              scopes: mp.credentials[0].scopes,
            }
          : null,
        campaignCount: mp.campaigns.length,
        campaigns: mp.campaigns.map((c) => ({
          externalCampaignId: c.externalCampaignId,
          source: c.source,
          status: c.status,
          name: (c.targetingJson)?.campaignName,
        })),
        snapshotRows7d: mp.performanceSnapshots.length,
        spend7d: mp.performanceSnapshots.reduce((s, r) => s + Number(r.spend), 0),
        impressions7d: mp.performanceSnapshots.reduce((s, r) => s + r.impressions, 0),
        clicks7d: mp.performanceSnapshots.reduce((s, r) => s + r.clicks, 0),
      }, null, 2),
    );
  }
} finally {
  await prisma.$disconnect();
}
