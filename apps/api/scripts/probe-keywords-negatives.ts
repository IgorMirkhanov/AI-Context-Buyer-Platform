import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';

config({ path: resolve(__dirname, '../../../.env') });

const projectId = '9258fd08-c24b-4c15-8ef4-b54cfc55d539';

async function main() {
  const prisma = new PrismaClient();
  try {
    const clusters = await prisma.semanticCluster.findMany({
      where: { projectId },
      include: {
        keywords: {
          select: {
            phrase: true,
            isNegative: true,
            frequency: true,
            source: true,
          },
        },
      },
    });
    const draft = await prisma.campaignDraft.findFirst({
      where: { projectId },
      orderBy: { updatedAt: 'desc' },
    });
    const structure = (draft?.structureJson ?? {}) as {
      global_negatives?: string[];
      campaigns?: Array<{
        campaign?: { name?: string };
        ad_groups?: Array<{
          name?: string;
          keywords?: string[];
          negative_keywords?: string[];
        }>;
      }>;
    };

    const clusterSummary = clusters.map((c) => {
      const pos = c.keywords.filter((k) => !k.isNegative);
      const neg = c.keywords.filter((k) => k.isNegative);
      const bySource: Record<string, number> = {};
      for (const k of pos) {
        const s = (k.source ?? 'unknown').toLowerCase();
        bySource[s] = (bySource[s] ?? 0) + 1;
      }
      return {
        name: c.name,
        positives: pos.length,
        negatives: neg.length,
        bySource,
        samplePos: pos.slice(0, 5).map((k) => ({
          phrase: k.phrase,
          freq: k.frequency,
          source: k.source,
        })),
        sampleNeg: neg.slice(0, 8).map((k) => k.phrase),
      };
    });

    const draftSummary = (structure.campaigns ?? []).map((u) => ({
      name: u.campaign?.name,
      groups: (u.ad_groups ?? []).map((g) => ({
        name: g.name,
        kwCount: g.keywords?.length ?? 0,
        kws: g.keywords,
        negCount: g.negative_keywords?.length ?? 0,
        negs: g.negative_keywords,
      })),
    }));

    const audits = await prisma.adWriteAudit.findMany({
      where: {
        projectId,
        action: { in: ['add_keywords', 'add_negative_keywords'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        action: true,
        status: true,
        error: true,
        summaryJson: true,
        createdAt: true,
      },
    });

    console.log(
      JSON.stringify(
        {
          clusterSummary,
          global_negatives: structure.global_negatives,
          draftSummary,
          audits,
        },
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
