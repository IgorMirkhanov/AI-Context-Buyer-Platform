import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const MEDIAPEACE = '98abacc8-8c51-4881-aa24-5c6b66907847';

try {
  const creds = await prisma.$queryRaw`
    SELECT project_id, external_account_id
    FROM ad_platform_credentials
    WHERE project_id = ${MEDIAPEACE}::uuid
  `;
  console.log('credential', creds);

  const campaigns = await prisma.$queryRaw`
    SELECT id, external_campaign_id, status, targeting_json
    FROM campaigns
    WHERE project_id = ${MEDIAPEACE}::uuid
    ORDER BY created_at DESC
    LIMIT 30
  `;
  console.log('campaigns', campaigns);

  const daily = await prisma.$queryRaw`
    SELECT ps.date::text AS date,
           SUM(ps.impressions)::int AS impressions,
           SUM(ps.clicks)::int AS clicks,
           SUM(ps.spend)::float AS spend
    FROM performance_snapshots ps
    JOIN campaigns c ON c.id = ps.campaign_id
    WHERE c.project_id = ${MEDIAPEACE}::uuid
      AND ps.date >= CURRENT_DATE - 7
    GROUP BY ps.date
    ORDER BY ps.date
  `;
  console.log('daily7d', daily);

  const total = await prisma.$queryRaw`
    SELECT SUM(ps.impressions)::int AS impressions,
           SUM(ps.clicks)::int AS clicks,
           ROUND(SUM(ps.spend)::numeric, 2) AS spend
    FROM performance_snapshots ps
    JOIN campaigns c ON c.id = ps.campaign_id
    WHERE c.project_id = ${MEDIAPEACE}::uuid
      AND ps.date >= CURRENT_DATE - 7
  `;
  console.log('total7d', total);

  const jobs = await prisma.$queryRaw`
    SELECT type, status, created_at, finished_at, error
    FROM background_jobs
    WHERE payload::text LIKE ${'%' + MEDIAPEACE + '%'}
    ORDER BY created_at DESC
    LIMIT 10
  `.catch(() => null);
  if (jobs) console.log('recentJobs', jobs);
} finally {
  await prisma.$disconnect();
}
