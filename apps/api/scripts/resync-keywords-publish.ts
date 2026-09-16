import { config } from 'dotenv';
import { resolve } from 'path';
import { NestFactory } from '@nestjs/core';
import {
  expandThinPublishKeywords,
  normalizeCampaignDraft,
  sanitizeNegativesAgainstPositives,
} from '@context-buyer/agents';
import { AppModule } from '../src/app.module';
import { CampaignsService } from '../src/campaigns/campaigns.service';
import { PrismaService } from '../src/prisma/prisma.service';

config({ path: resolve(__dirname, '../../../.env') });

const projectId = process.argv[2] ?? '9258fd08-c24b-4c15-8ef4-b54cfc55d539';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const prisma = app.get(PrismaService);
    const campaigns = app.get(CampaignsService);
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { organizationId: true, name: true },
    });
    if (!project) throw new Error('project not found');

    const draft = await prisma.campaignDraft.findFirst({
      where: { projectId },
      orderBy: { updatedAt: 'desc' },
    });
    if (!draft) throw new Error('draft not found');

    const structure = normalizeCampaignDraft(draft.structureJson);
    for (const unit of structure.campaigns) {
      for (const group of unit.ad_groups) {
        group.keywords = expandThinPublishKeywords(group.keywords, 5);
        group.negative_keywords = sanitizeNegativesAgainstPositives(
          group.negative_keywords,
          group.keywords,
        );
      }
      structure.global_negatives = sanitizeNegativesAgainstPositives(
        structure.global_negatives,
        unit.ad_groups.flatMap((g) => g.keywords),
      );
      if (unit.publish?.adGroups) {
        for (const g of unit.publish.adGroups) {
          g.keywordsAdded = false;
          g.negativesAdded = false;
        }
        unit.publish.step = 'addKeywords';
        unit.publish.error = undefined;
      }
    }

    await prisma.campaignDraft.update({
      where: { id: draft.id },
      data: {
        structureJson: structure as object,
        status: 'pending_approval',
      },
    });

    const user = await prisma.user.findFirst({
      where: { organizationId: project.organizationId },
      select: { id: true },
    });
    if (!user) throw new Error('no user for org');

    console.log(
      JSON.stringify(
        {
          project: project.name,
          beforePublish: structure.campaigns.map((u) => ({
            name: u.campaign.name,
            groups: u.ad_groups.map((g) => ({
              name: g.name,
              kw: g.keywords.length,
              neg: g.negative_keywords.length,
            })),
          })),
        },
        null,
        2,
      ),
    );

    const result = await campaigns.publish(
      project.organizationId,
      projectId,
      user.id,
    );
    console.log(
      JSON.stringify(
        {
          published: true,
          draftStatus: result.draft?.status,
          campaigns: result.campaigns?.length,
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
