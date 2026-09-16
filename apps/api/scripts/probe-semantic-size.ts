import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';

config({ path: resolve(__dirname, '../../../.env') });

const projectId = process.argv[2] ?? 'd32c36bd-5fce-40a6-8a4a-cac783607548';

async function main() {
  const p = new PrismaClient();
  try {
    const clusters = await p.semanticCluster.findMany({
      where: { projectId },
      include: {
        keywords: {
          where: { isNegative: false },
          orderBy: { frequency: 'desc' },
          take: 5,
        },
        _count: { select: { keywords: true } },
      },
    });
    const bySource = await p.semanticKeyword.groupBy({
      by: ['source', 'isNegative'],
      where: { projectId },
      _count: true,
    });
    const scored = clusters
      .map((c) => ({
        id: c.id,
        name: c.name,
        kw: c._count.keywords,
        freq: c.keywords.reduce((s, k) => s + k.frequency, 0),
        sample: c.keywords.map((k) => k.phrase),
      }))
      .sort((a, b) => b.freq - a.freq || b.kw - a.kw);
    console.log(
      JSON.stringify(
        {
          clusters: clusters.length,
          positives: scored.reduce((s, c) => s + c.kw, 0),
          bySource,
          tiny: scored.filter((x) => x.kw <= 2).length,
          top20: scored.slice(0, 20),
        },
        null,
        2,
      ),
    );
  } finally {
    await p.$disconnect();
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
