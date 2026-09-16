import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';

config({ path: resolve(__dirname, '../../../.env') });

async function main() {
  const prisma = new PrismaClient();
  try {
    const model = (prisma as { adWriteAudit?: { findMany: Function } })
      .adWriteAudit;
    if (!model) {
      const keys = Object.keys(prisma).filter((k) => !k.startsWith('_') && !k.startsWith('$'));
      console.log(JSON.stringify({ models: keys }, null, 2));
      return;
    }
    const rows = await model.findMany({
      where: { projectId: '9258fd08-c24b-4c15-8ef4-b54cfc55d539' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    console.log(
      JSON.stringify(
        rows.map((r: Record<string, unknown>) => ({
          action: r.action,
          createdAt: r.createdAt,
          summary: r.summary,
          success: r.success,
          error: r.error,
          status: r.status,
        })),
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
