import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';
import { planPipeline } from '@context-buyer/agents';

config({ path: resolve(__dirname, '../../../.env') });

const id = '39d9f0c9-ec16-478c-b1b9-e544d539651b';

async function main() {
  const prisma = new PrismaClient();
  try {
    const draft = await prisma.campaignDraft.findFirst({
      where: { projectId: id },
      orderBy: { createdAt: 'desc' },
    });
    const campaigns = await prisma.campaign.count({ where: { projectId: id } });
    const structure = draft?.structureJson as any;
    const publish = structure?.campaigns?.[0]?.publish;
    console.log(
      JSON.stringify(
        {
          draftStatus: draft?.status,
          draftId: draft?.id,
          campaigns,
          publishStep: publish?.step,
          publishError: publish?.error ?? null,
          externalCampaignId: publish?.externalCampaignId,
          adGroupCount: publish?.adGroups?.length,
          campaignName: structure?.campaigns?.[0]?.campaign?.name,
          budget: structure?.campaigns?.[0]?.campaign?.budget_daily,
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
