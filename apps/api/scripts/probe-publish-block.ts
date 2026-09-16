import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';

config({ path: resolve(__dirname, '../../../.env') });

async function main() {
  const prisma = new PrismaClient();
  try {
    const needle = process.argv[2] ?? '39d9f0c9';
    const projects = await prisma.project.findMany({
      where: {
        OR: [
          { id: '39d9f0c9-ec16-478c-b1b9-e544d539651b' },
          { id: '39d9f0c9-ec16-478c-b1b9-e544d539851b' },
          { id: '39d9f0c9-ec1b-478c-b1b9-e544d539851b' },
          { name: { contains: 'Basic', mode: 'insensitive' } },
          { name: { contains: 'Базов', mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        name: true,
        status: true,
        primaryPlatform: true,
        websiteUrl: true,
        updatedAt: true,
      },
      take: 20,
    });
    console.log(JSON.stringify({ projects }, null, 2));

    for (const p of projects) {
      const id = p.id;
      const cred = await prisma.adPlatformCredential.findFirst({
        where: { projectId: id },
        select: {
          platform: true,
          externalAccountId: true,
          expiresAt: true,
          scopes: true,
        },
      });
      const draft = await prisma.campaignDraft.findFirst({
        where: { projectId: id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, createdAt: true, structureJson: true },
      });
      const campaigns = await prisma.campaign.findMany({
        where: { projectId: id },
        select: {
          id: true,
          status: true,
          externalCampaignId: true,
          platform: true,
          source: true,
        },
      });
      const structure = draft?.structureJson as
        | {
            campaigns?: Array<{
              publish?: { step?: string; error?: string };
              campaign?: { name?: string };
            }>;
          }
        | null;
      console.log(
        JSON.stringify(
          {
            id,
            name: p.name,
            platform: p.primaryPlatform,
            cred,
            draft: draft
              ? {
                  id: draft.id,
                  status: draft.status,
                  createdAt: draft.createdAt,
                  publishErrors: structure?.campaigns?.map((c) => ({
                    name: c.campaign?.name,
                    publish: c.publish,
                  })),
                }
              : null,
            campaigns,
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
