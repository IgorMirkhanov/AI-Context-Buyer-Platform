/**
 * Clean junk semantic keywords for a project, then rebuild plan + draft.
 * Usage: npx ts-node --transpile-only -r tsconfig-paths/register scripts/cleanup-semantic-quality.ts <projectId>
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { NestFactory } from '@nestjs/core';
import {
  isPublishWorthyKeyword,
  isSensibleSearchKeyword,
} from '@context-buyer/agents';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CampaignPlanService } from '../src/campaign-plan/campaign-plan.service';
import { CampaignsService } from '../src/campaigns/campaigns.service';

config({ path: resolve(__dirname, '../../../.env') });

const projectId = process.argv[2];
if (!projectId) {
  console.error('Usage: cleanup-semantic-quality.ts <projectId>');
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

    const keywords = await prisma.semanticKeyword.findMany({
      where: { projectId, isNegative: false },
      select: {
        id: true,
        phrase: true,
        frequency: true,
        source: true,
        intent: true,
        clusterId: true,
      },
    });

    const dropIds: string[] = [];
    for (const row of keywords) {
      const keep = isPublishWorthyKeyword(row.phrase, {
        frequency: row.frequency,
        source: row.source,
        intent: row.intent as 'hot' | 'warm' | 'navigational',
      });
      if (!keep && !isSensibleSearchKeyword(row.phrase)) {
        dropIds.push(row.id);
        continue;
      }
      if (!keep) {
        // Drop synthetic / low-value even if barely sensible
        const synthetic =
          row.source === 'seed_expand_templates' ||
          row.source.startsWith('llm_') ||
          row.frequency <= 1;
        if (synthetic) dropIds.push(row.id);
      }
    }

    const allDrop = [...new Set(dropIds)];
    for (let i = 0; i < allDrop.length; i += 500) {
      await prisma.semanticKeyword.deleteMany({
        where: { id: { in: allDrop.slice(i, i + 500) } },
      });
    }

    // Aggressive pass: drop all synthetic templates and low-volume LLM rows.
    const more = await prisma.semanticKeyword.findMany({
      where: {
        projectId,
        isNegative: false,
        OR: [
          { source: 'seed_expand_templates' },
          { source: { startsWith: 'llm_' } },
          { frequency: { lte: 1 }, source: { not: 'google_keyword_planner' } },
        ],
      },
      select: { id: true },
    });
    const moreIds = more.map((r) => r.id);
    for (let i = 0; i < moreIds.length; i += 500) {
      await prisma.semanticKeyword.deleteMany({
        where: { id: { in: moreIds.slice(i, i + 500) } },
      });
    }

    // Off-niche salon/hair noise for marketing agencies
    const salon = await prisma.semanticKeyword.findMany({
      where: {
        projectId,
        isNegative: false,
        OR: [
          { phrase: { contains: 'парикмахер', mode: 'insensitive' } },
          { phrase: { contains: 'салон красоты', mode: 'insensitive' } },
          { phrase: { contains: 'креатив салон', mode: 'insensitive' } },
          { phrase: { contains: 'салон креатив', mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    });
    if (salon.length > 0) {
      await prisma.semanticKeyword.deleteMany({
        where: { id: { in: salon.map((r) => r.id) } },
      });
    }

    const droppedTotal = allDrop.length + moreIds.length + salon.length;

    // Remove empty clusters (and their creatives cascade if configured)
    const clusters = await prisma.semanticCluster.findMany({
      where: { projectId },
      include: { _count: { select: { keywords: true } } },
    });
    const emptyIds = clusters
      .filter((c) => c._count.keywords === 0)
      .map((c) => c.id);
    if (emptyIds.length > 0) {
      await prisma.adCreative.deleteMany({
        where: { projectId, clusterId: { in: emptyIds } },
      });
      await prisma.semanticCluster.deleteMany({
        where: { id: { in: emptyIds } },
      });
    }

    const leftKeywords = await prisma.semanticKeyword.count({
      where: { projectId, isNegative: false },
    });
    const leftClusters = await prisma.semanticCluster.count({
      where: { projectId },
    });

    const plan = app.get(CampaignPlanService);
    await plan.run(project.organizationId, project.id);
    await plan.approve(project.organizationId, project.id);

    // Reuse existing creatives — full copywriting on 100+ clusters times out.
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
    const agCount = units.reduce(
      (sum, u) => sum + (u.ad_groups?.length ?? 0),
      0,
    );
    const kwCount = units.reduce(
      (sum, u) =>
        sum +
        (u.ad_groups ?? []).reduce(
          (s, g) => s + (g.keywords?.length ?? 0),
          0,
        ),
      0,
    );

    console.log(
      JSON.stringify(
        {
          project: project.name,
          droppedKeywords: droppedTotal,
          emptyClustersRemoved: emptyIds.length,
          leftKeywords,
          leftClusters,
          draftCampaigns: units.length,
          draftAdGroups: agCount,
          draftKeywords: kwCount,
          sampleGroups: units.flatMap((u) =>
            (u.ad_groups ?? []).slice(0, 4).map((g) => ({
              campaign: u.campaign?.name,
              group: g.name,
              kwCount: g.keywords?.length ?? 0,
              keywords: (g.keywords ?? []).slice(0, 8),
            })),
          ),
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
