import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';

config({ path: resolve(__dirname, '../../../.env') });

const projectId = '9258fd08-c24b-4c15-8ef4-b54cfc55d539';

async function main() {
  const prisma = new PrismaClient();
  try {
    const brief = await prisma.projectBrief.findFirst({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
    const payload = brief?.payloadJson as {
      exclusions?: { global_negative_keywords?: string[] };
    } | null;
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
    const clusters = await prisma.semanticCluster.findMany({
      where: { projectId },
      include: {
        keywords: {
          select: { phrase: true, isNegative: true, source: true },
        },
      },
    });

    const lookFor = [
      'вет аптека',
      'ветаптека',
      'ветеринарные',
      'ветеринарный',
      'влажный',
      'грызунов',
    ];

    const briefNeg = payload?.exclusions?.global_negative_keywords ?? [];
    const draftGlobal = structure.global_negatives ?? [];

    const hits = lookFor.map((term) => {
      const key = term.toLowerCase();
      return {
        term,
        inBrief: briefNeg.some((n) => n.toLowerCase().includes(key)),
        inDraftGlobal: draftGlobal.some((n) => n.toLowerCase().includes(key)),
        inClusterNeg: clusters.flatMap((c) =>
          c.keywords
            .filter((k) => k.isNegative && k.phrase.toLowerCase().includes(key))
            .map((k) => ({
              cluster: c.name,
              phrase: k.phrase,
              source: k.source,
            })),
        ),
        inAdGroupNeg: (structure.campaigns ?? []).flatMap((u) =>
          (u.ad_groups ?? []).flatMap((g) =>
            (g.negative_keywords ?? [])
              .filter((n) => n.toLowerCase().includes(key))
              .map((n) => ({ campaign: u.campaign?.name, group: g.name, phrase: n })),
          ),
        ),
      };
    });

    // Also show: positives that also appear as negatives (cross-minus problem)
    const allPos = new Set(
      clusters.flatMap((c) =>
        c.keywords.filter((k) => !k.isNegative).map((k) => k.phrase.toLowerCase()),
      ),
    );
    const crossAsNeg = (structure.campaigns ?? []).flatMap((u) =>
      (u.ad_groups ?? []).flatMap((g) =>
        (g.negative_keywords ?? [])
          .filter((n) => allPos.has(n.toLowerCase()))
          .map((n) => ({ group: g.name, phrase: n })),
      ),
    );

    console.log(
      JSON.stringify(
        {
          briefNegSample: briefNeg.slice(0, 20),
          briefNegCount: briefNeg.length,
          draftGlobalCount: draftGlobal.length,
          hits,
          positivesUsedAsAdGroupNegatives: crossAsNeg.slice(0, 30),
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
