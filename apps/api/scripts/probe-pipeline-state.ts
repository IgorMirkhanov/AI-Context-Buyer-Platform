import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';

config({ path: resolve(__dirname, '../../../.env') });

const id = process.argv[2] ?? '39d9f0c9-ec16-478c-b1b9-e544d539851b';

async function main() {
  const prisma = new PrismaClient();
  try {
    const project = await prisma.project.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        status: true,
        websiteUrl: true,
        primaryPlatform: true,
      },
    });
    const brief = await prisma.projectBrief.count({ where: { projectId: id } });
    const analysis = await prisma.projectAnalysis.findUnique({
      where: { projectId: id },
    });
    const clusters = await prisma.semanticCluster.count({
      where: { projectId: id },
    });
    const keywords = await prisma.semanticKeyword.count({
      where: { projectId: id, isNegative: false },
    });
    const plan = await prisma.projectCampaignPlan.findUnique({
      where: { projectId: id },
    });
    const creatives = await prisma.adCreative.count({ where: { projectId: id } });
    const draft = await prisma.campaignDraft.findFirst({
      where: { projectId: id },
      orderBy: { createdAt: 'desc' },
    });
    const campaigns = await prisma.campaign.count({ where: { projectId: id } });
    const tasks = await prisma.agentTask.findMany({
      where: { projectId: id },
      orderBy: { startedAt: 'desc' },
      take: 10,
      select: {
        agentType: true,
        status: true,
        error: true,
        startedAt: true,
        finishedAt: true,
        outputRef: true,
      },
    });
    const alerts = await prisma.opsAlert.findMany({
      where: { projectId: id, acknowledgedAt: null },
      take: 5,
      select: { title: true, detail: true, kind: true, createdAt: true },
    });
    console.log(
      JSON.stringify(
        {
          project,
          brief,
          hasAnalysis: Boolean(analysis),
          analysisUrl: analysis?.websiteUrl ?? null,
          clusters,
          keywords,
          plan: plan
            ? { approved: plan.approved, updatedAt: plan.updatedAt }
            : null,
          creatives,
          draft: draft
            ? { status: draft.status, id: draft.id, createdAt: draft.createdAt }
            : null,
          campaigns,
          tasks,
          alerts,
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
