import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';

config({ path: resolve(__dirname, '../../../.env') });

async function main() {
  const prisma = new PrismaClient();
  try {
    const projects = await prisma.project.findMany({
      where: {
        OR: [
          { name: { contains: 'Final', mode: 'insensitive' } },
          { name: { contains: 'final', mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, status: true, updatedAt: true },
    });
    console.log(JSON.stringify({ projects }, null, 2));
    for (const p of projects) {
      const id = p.id;
      const brief = await prisma.projectBrief.count({ where: { projectId: id } });
      const analysis = Boolean(
        await prisma.projectAnalysis.findUnique({
          where: { projectId: id },
          select: { projectId: true },
        }),
      );
      const clusters = await prisma.semanticCluster.count({
        where: { projectId: id },
      });
      const plan = await prisma.projectCampaignPlan.findUnique({
        where: { projectId: id },
        select: { approved: true },
      });
      const creatives = await prisma.adCreative.count({ where: { projectId: id } });
      const draft = await prisma.campaignDraft.findFirst({
        where: { projectId: id },
        orderBy: { createdAt: 'desc' },
        select: { status: true, createdAt: true },
      });
      const campaigns = await prisma.campaign.count({ where: { projectId: id } });
      const tasks = await prisma.agentTask.findMany({
        where: { projectId: id },
        orderBy: { startedAt: 'desc' },
        take: 6,
        select: {
          agentType: true,
          status: true,
          error: true,
          startedAt: true,
          outputRef: true,
        },
      });
      console.log(
        JSON.stringify(
          { id, brief, analysis, clusters, plan, creatives, draft, campaigns, tasks },
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
