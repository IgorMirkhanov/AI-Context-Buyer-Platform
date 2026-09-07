/**
 * One-off backfill: set scopes = 'direct:api' for Yandex Direct credentials
 * where scopes is empty or null.
 *
 * Default mode is DRY RUN (preview only). Pass --execute to apply changes.
 *
 * Usage:
 *   node scripts/data/backfill-yandex-direct-scopes.mjs
 *   node scripts/data/backfill-yandex-direct-scopes.mjs --execute
 *
 * Requires DATABASE_URL (from repo root .env).
 */
import { PrismaClient } from '@prisma/client';

const execute = process.argv.includes('--execute');
const prisma = new PrismaClient();

try {
  const rows = await prisma.adPlatformCredential.findMany({
    where: {
      platform: 'yandex_direct',
      OR: [{ scopes: null }, { scopes: '' }],
    },
    select: {
      id: true,
      projectId: true,
      externalAccountId: true,
      scopes: true,
      createdAt: true,
    },
  });

  console.log(
    execute
      ? `Applying backfill to ${rows.length} row(s)...`
      : `DRY RUN — ${rows.length} row(s) would be updated:`,
  );
  for (const row of rows) {
    console.log(
      JSON.stringify({
        id: row.id,
        projectId: row.projectId,
        externalAccountId: row.externalAccountId,
        scopes: row.scopes,
        createdAt: row.createdAt.toISOString(),
      }),
    );
  }

  if (!execute) {
    console.log(
      '\nNo changes made. Re-run with --execute after you confirm the list.',
    );
  } else if (rows.length > 0) {
    const result = await prisma.adPlatformCredential.updateMany({
      where: {
        platform: 'yandex_direct',
        OR: [{ scopes: null }, { scopes: '' }],
      },
      data: { scopes: 'direct:api' },
    });
    console.log(`\nUpdated ${result.count} row(s).`);
  }
} finally {
  await prisma.$disconnect();
}
