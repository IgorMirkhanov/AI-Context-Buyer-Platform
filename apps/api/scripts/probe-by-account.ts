import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';

config({ path: resolve(__dirname, '../../../.env') });

async function main() {
  const prisma = new PrismaClient();
  try {
    const creds = await prisma.adPlatformCredential.findMany({
      where: { externalAccountId: '7082558607' },
      select: { projectId: true, platform: true, externalAccountId: true },
    });
    const recent = await prisma.project.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: { id: true, name: true, status: true, updatedAt: true },
    });
    console.log(JSON.stringify({ creds, recent }, null, 2));
    for (const c of creds) {
      const id = c.projectId;
      const brief = await prisma.projectBrief.count({ where: { projectId: id } });
      const analysis = await prisma.projectAnalysis.findUnique({
        where: { projectId: id },
        select: { projectId: true },
      });
      const clusters = await prisma.semanticCluster.count({
        where: { projectId: id },
      });
      const plan = await prisma.projectCampaignPlan.findUnique({
        where: { projectId: id },
        select: { approved: true },
      });
      const creatives = await prisma.adCreative.count({
        where: { projectId: id },
      });
      const draft = await prisma.campaignDraft.findFirst({
        where: { projectId: id },
        orderBy: { createdAt: 'desc' },
        select: { status: true, createdAt: true },
      });
      const campaigns = await prisma.campaign.count({ where: { projectId: id } });
      const tasks = await prisma.agentTask.findMany({
        where: { projectId: id },
        orderBy: { startedAt: 'desc' },
        take: 8,
        select: {
          agentType: true,
          status: true,
          error: true,
          startedAt: true,
          outputRef: true,
        },
      });
      const project = recent.find((p) => p.id === id) ??
        (await prisma.project.findUnique({
          where: { id },
          select: { id: true, name: true, status: true, updatedAt: true },
        }));
      console.log(
        JSON.stringify(
          {
            project,
            brief,
            hasAnalysis: Boolean(analysis),
            clusters,
            plan,
            creatives,
            draft,
            campaigns,
            tasks,
          },
          null,
          2,
        ),
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
