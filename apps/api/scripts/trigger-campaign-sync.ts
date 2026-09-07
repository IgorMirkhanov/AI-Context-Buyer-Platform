/**
 * One-off: run campaign_sync for a project via Nest application context.
 * Usage: npx ts-node --transpile-only -r tsconfig-paths/register scripts/trigger-campaign-sync.ts <projectId>
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { CampaignSyncService } from '../src/campaigns/campaign-sync.service';
import { PrismaService } from '../src/prisma/prisma.service';

const projectId = process.argv[2];
if (!projectId) {
  console.error('Usage: trigger-campaign-sync.ts <projectId>');
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
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }
    const sync = app.get(CampaignSyncService);
    const result = await sync.syncProject(project.organizationId, project.id);
    const campaigns = await prisma.campaign.count({
      where: { projectId: project.id },
    });
    console.log(
      JSON.stringify(
        {
          project: project.name,
          projectId: project.id,
          sync: result,
          campaignCount: campaigns,
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
