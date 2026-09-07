import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const PROJECTS = [
  { id: '98abacc8-8c51-4881-aa24-5c6b66907847', label: 'mediapeace' },
  { id: '4ff9d160-419e-45c3-a9ea-c464e524acd4', label: 'Saask97-demo' },
  { id: '0e501d2c-8ac3-45e2-8c4a-9b420eba9e24', label: 'Saask97-VHM' },
];

try {
  for (const p of PROJECTS) {
    const cred = await prisma.adPlatformCredential.findFirst({
      where: { projectId: p.id, platform: 'yandex_direct' },
      select: { externalAccountId: true, scopes: true },
    });
    const campaignCount = await prisma.campaign.count({
      where: { projectId: p.id },
    });
    const snapCount = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS n
      FROM performance_snapshots ps
      JOIN campaigns c ON c.id = ps.campaign_id
      WHERE c.project_id = ${p.id}::uuid
    `;
    console.log(
      JSON.stringify({
        label: p.label,
        projectId: p.id,
        externalAccountId: cred?.externalAccountId ?? null,
        scopes: cred?.scopes ?? null,
        campaignCount,
        snapshotRows: snapCount[0]?.n ?? 0,
      }),
    );
  }
} finally {
  await prisma.$disconnect();
}
