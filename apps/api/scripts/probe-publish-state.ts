import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';

config({ path: resolve(__dirname, '../.env') });
config({ path: resolve(__dirname, '../../../.env') });

const projectId = process.argv[2] ?? '9258fd08-c24b-4c15-8ef4-b54cfc55d539';

async function main() {
  const prisma = new PrismaClient();
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true },
    });
    const draft = await prisma.campaignDraft.findFirst({
      where: { projectId },
      orderBy: { updatedAt: 'desc' },
    });
    const camps = await prisma.campaign.findMany({
      where: { projectId },
      select: {
        externalCampaignId: true,
        status: true,
        platform: true,
        source: true,
      },
    });
    const structure = (draft?.structureJson ?? {}) as {
      campaigns?: Array<{
        campaign?: { name?: string };
        publish?: Record<string, unknown> & {
          step?: string;
          error?: string;
          lastError?: string;
          externalCampaignId?: string;
          locationsSet?: boolean;
          adGroups?: Array<{
            name?: string;
            externalId?: string;
            adsCreated?: boolean;
            keywordsAdded?: boolean;
            negativesAdded?: boolean;
          }>;
        };
      }>;
    };
    const units = (structure.campaigns ?? []).map((c) => ({
      name: c.campaign?.name,
      step: c.publish?.step,
      err: c.publish?.error ?? c.publish?.lastError,
      ext: c.publish?.externalCampaignId,
      locationsSet: c.publish?.locationsSet,
      groups: (c.publish?.adGroups ?? []).map((g) => ({
        name: g.name,
        id: g.externalId,
        adsCreated: Boolean(g.adsCreated),
        keywordsAdded: Boolean(g.keywordsAdded),
        negativesAdded: Boolean(g.negativesAdded),
      })),
    }));
    console.log(
      JSON.stringify(
        {
          project,
          draftStatus: draft?.status,
          draftUpdatedAt: draft?.updatedAt,
          units,
          camps,
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
