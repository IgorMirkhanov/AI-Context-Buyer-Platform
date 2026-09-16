/**
 * Keep only the top N semantic clusters by volume; delete the rest.
 * Then rebuild plan + draft.
 *
 * Usage:
 *   npx ts-node --transpile-only -r tsconfig-paths/register scripts/prune-semantic-clusters.ts <projectId> [keep=15]
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CampaignPlanService } from '../src/campaign-plan/campaign-plan.service';
import { CampaignsService } from '../src/campaigns/campaigns.service';

config({ path: resolve(__dirname, '../../../.env') });

const projectId = process.argv[2];
const keep = Math.max(5, Number(process.argv[3] ?? 15));
if (!projectId) {
  console.error(
    'Usage: prune-semantic-clusters.ts <projectId> [keep=15]',
  );
  process.exit(1);
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const prisma = app.get(PrismaService);
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, organizationId: true, name: true },
    });
    if (!project) throw new Error(`Project not found: ${projectId}`);

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

    const ranked = [...clusters].sort((a, b) => {
      const score = (c: (typeof clusters)[number]) =>
        c.keywords.reduce((s, k) => s + k.frequency, 0);
      return score(b) - score(a) || b._count.keywords - a._count.keywords;
    });
    const keepIds = new Set(ranked.slice(0, keep).map((c) => c.id));
    const dropIds = ranked.filter((c) => !keepIds.has(c.id)).map((c) => c.id);

    if (dropIds.length > 0) {
      await prisma.adCreative.deleteMany({
        where: { projectId, clusterId: { in: dropIds } },
      });
      await prisma.semanticKeyword.deleteMany({
        where: { projectId, clusterId: { in: dropIds } },
      });
      await prisma.semanticCluster.deleteMany({
        where: { id: { in: dropIds } },
      });
    }

    // Cap cross-minus noise on remaining clusters.
    const crossMinus = await prisma.semanticKeyword.findMany({
      where: {
        projectId,
        isNegative: true,
        source: 'cross_minus',
      },
      select: { id: true, clusterId: true, frequency: true },
      orderBy: { frequency: 'desc' },
    });
    const perCluster = new Map<string, string[]>();
    for (const row of crossMinus) {
      if (!row.clusterId) continue;
      const list = perCluster.get(row.clusterId) ?? [];
      list.push(row.id);
      perCluster.set(row.clusterId, list);
    }
    const crossDrop: string[] = [];
    for (const ids of perCluster.values()) {
      if (ids.length > 12) crossDrop.push(...ids.slice(12));
    }
    if (crossDrop.length > 0) {
      for (let i = 0; i < crossDrop.length; i += 500) {
        await prisma.semanticKeyword.deleteMany({
          where: { id: { in: crossDrop.slice(i, i + 500) } },
        });
      }
    }

    // Cap positives per kept cluster at 12 (keep highest frequency).
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
    const posDrop: string[] = [];
    for (const cluster of kept) {
      if (cluster.keywords.length > 12) {
        posDrop.push(...cluster.keywords.slice(12).map((k) => k.id));
      }
    }
    if (posDrop.length > 0) {
      await prisma.semanticKeyword.deleteMany({
        where: { id: { in: posDrop } },
      });
    }

    const leftClusters = await prisma.semanticCluster.count({
      where: { projectId },
    });
    const leftPos = await prisma.semanticKeyword.count({
      where: { projectId, isNegative: false },
    });
    const leftNeg = await prisma.semanticKeyword.count({
      where: { projectId, isNegative: true },
    });

    const plan = app.get(CampaignPlanService);
    await plan.run(project.organizationId, project.id);
    await plan.approve(project.organizationId, project.id);
    const campaigns = app.get(CampaignsService);
    await campaigns.build(project.organizationId, project.id);

    const draft = await prisma.campaignDraft.findFirst({
      where: { projectId },
      orderBy: { updatedAt: 'desc' },
    });
    const structure = draft?.structureJson as {
      campaigns?: Array<{
        campaign?: { name?: string };
        ad_groups?: Array<{ name?: string; keywords?: string[] }>;
      }>;
    } | null;
    const units = structure?.campaigns ?? [];

    console.log(
      JSON.stringify(
        {
          project: project.name,
          droppedClusters: dropIds.length,
          droppedCrossMinus: crossDrop.length,
          droppedExtraPositives: posDrop.length,
          leftClusters,
          leftPositives: leftPos,
          leftNegatives: leftNeg,
          draftCampaigns: units.length,
          draftAdGroups: units.reduce(
            (s, u) => s + (u.ad_groups?.length ?? 0),
            0,
          ),
          draftKeywords: units.reduce(
            (s, u) =>
              s +
              (u.ad_groups ?? []).reduce(
                (g, ag) => g + (ag.keywords?.length ?? 0),
                0,
              ),
            0,
          ),
          keptNames: ranked.slice(0, keep).map((c) => c.name),
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
