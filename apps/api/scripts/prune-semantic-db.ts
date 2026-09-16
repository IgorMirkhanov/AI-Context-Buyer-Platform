/**
 * Prisma-only: keep top N clusters, trim keywords. No Nest / no LLM.
 * Usage: npx ts-node --transpile-only scripts/prune-semantic-db.ts <projectId> [keep=15]
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';

config({ path: resolve(__dirname, '../../../.env') });

const projectId = process.argv[2];
const keep = Math.max(5, Number(process.argv[3] ?? 15));
if (!projectId) {
  console.error('Usage: prune-semantic-db.ts <projectId> [keep=15]');
  process.exit(1);
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const clusters = await prisma.semanticCluster.findMany({
      where: { projectId },
      include: {
        keywords: {
          where: { isNegative: false },
          select: { frequency: true },
        },
        _count: { select: { keywords: true } },
      },
    });
    console.log(`before: clusters=${clusters.length}`);

    const ranked = [...clusters].sort((a, b) => {
      const score = (c: (typeof clusters)[number]) =>
        c.keywords.reduce((s, k) => s + k.frequency, 0);
      return score(b) - score(a) || b._count.keywords - a._count.keywords;
    });
    const keepIds = ranked.slice(0, keep).map((c) => c.id);
    const dropIds = ranked.slice(keep).map((c) => c.id);
    console.log(`keep=${keepIds.length} drop=${dropIds.length}`);

    for (let i = 0; i < dropIds.length; i += 50) {
      const chunk = dropIds.slice(i, i + 50);
      await prisma.adCreative.deleteMany({
        where: { projectId, clusterId: { in: chunk } },
      });
      await prisma.semanticKeyword.deleteMany({
        where: { projectId, clusterId: { in: chunk } },
      });
      await prisma.semanticCluster.deleteMany({
        where: { id: { in: chunk } },
      });
      console.log(`dropped chunk ${i}-${i + chunk.length}`);
    }

    // Drop ALL cross_minus — they made the semantic unreadable (10k+ rows).
    const cross = await prisma.semanticKeyword.deleteMany({
      where: { projectId, isNegative: true, source: 'cross_minus' },
    });
    console.log(`deleted cross_minus=${cross.count}`);

    // Cap positives per cluster at 12.
    const kept = await prisma.semanticCluster.findMany({
      where: { projectId },
      include: {
        keywords: {
          where: { isNegative: false },
          orderBy: { frequency: 'desc' },
          select: { id: true },
        },
      },
    });
    let posDrop = 0;
    for (const cluster of kept) {
      const extra = cluster.keywords.slice(12).map((k) => k.id);
      if (extra.length === 0) continue;
      await prisma.semanticKeyword.deleteMany({ where: { id: { in: extra } } });
      posDrop += extra.length;
    }
    console.log(`trimmed positives=${posDrop}`);

    const leftClusters = await prisma.semanticCluster.count({
      where: { projectId },
    });
    const leftPos = await prisma.semanticKeyword.count({
      where: { projectId, isNegative: false },
    });
    const leftNeg = await prisma.semanticKeyword.count({
      where: { projectId, isNegative: true },
    });
    const names = await prisma.semanticCluster.findMany({
      where: { projectId },
      select: { name: true },
      orderBy: { name: 'asc' },
    });
    console.log(
      JSON.stringify(
        {
          leftClusters,
          leftPositives: leftPos,
          leftNegatives: leftNeg,
          names: names.map((n) => n.name),
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
