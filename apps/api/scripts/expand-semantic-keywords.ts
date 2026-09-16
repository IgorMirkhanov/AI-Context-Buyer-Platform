import { config } from 'dotenv';
import { resolve } from 'path';
import { NestFactory } from '@nestjs/core';
import { expandThinPublishKeywords } from '@context-buyer/agents';
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

    const clusters = await prisma.semanticCluster.findMany({
      where: { projectId },
      include: {
        keywords: { where: { isNegative: false } },
      },
    });

    const summary: Array<{ name: string; before: number; after: number }> = [];
    for (const cluster of clusters) {
      const before = cluster.keywords.length;
      const seeds = cluster.keywords.map((k) => k.phrase);
      const expanded = expandThinPublishKeywords(seeds, 5, 40);
      const existing = new Set(
        cluster.keywords.map((k) => k.phrase.trim().toLowerCase()),
      );
      const toAdd = expanded.filter(
        (phrase) => !existing.has(phrase.trim().toLowerCase()),
      );
      if (toAdd.length > 0) {
        await prisma.semanticKeyword.createMany({
          data: toAdd.map((phrase) => ({
            projectId,
            clusterId: cluster.id,
            phrase,
            isNegative: false,
            frequency: 1,
            source: 'seed_expand_templates',
            intent: 'hot',
          })),
          skipDuplicates: true,
        });
      }
      summary.push({
        name: cluster.name,
        before,
        after: before + toAdd.length,
      });
    }

    // Rebuild campaign draft so Campaign tab shows full keyword lists.
    await campaigns.build(project.organizationId, projectId);

    console.log(
      JSON.stringify({ project: project.name, clusters: summary }, null, 2),
    );
  } finally {
    await app.close();
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
