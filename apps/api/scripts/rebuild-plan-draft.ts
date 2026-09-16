/**
 * Rebuild plan + draft after semantic cleanup (reuse existing creatives).
 * Usage: npx ts-node --transpile-only -r tsconfig-paths/register scripts/rebuild-plan-draft.ts <projectId>
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
if (!projectId) {
  console.error('Usage: rebuild-plan-draft.ts <projectId>');
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

    const leftKeywords = await prisma.semanticKeyword.count({
      where: { projectId, isNegative: false },
    });
    const leftClusters = await prisma.semanticCluster.count({
      where: { projectId },
    });
    const creatives = await prisma.adCreative.count({ where: { projectId } });

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
    const agCount = units.reduce(
      (sum, u) => sum + (u.ad_groups?.length ?? 0),
      0,
    );
    const kwCount = units.reduce(
      (sum, u) =>
        sum +
        (u.ad_groups ?? []).reduce((s, g) => s + (g.keywords?.length ?? 0), 0),
      0,
    );

    console.log(
      JSON.stringify(
        {
          project: project.name,
          leftKeywords,
          leftClusters,
          creatives,
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
