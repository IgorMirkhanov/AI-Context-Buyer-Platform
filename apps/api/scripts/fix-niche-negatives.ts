import { config } from 'dotenv';
import { resolve } from 'path';
import { NestFactory } from '@nestjs/core';
import {
  expandThinPublishKeywords,
  sanitizeBriefNegatives,
} from '@context-buyer/agents';
import { AppModule } from '../src/app.module';
import { CampaignsService } from '../src/campaigns/campaigns.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProjectBriefPayload } from '../src/briefs/brief.schema';

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
    });
    if (!project) throw new Error('project not found');

    const briefRow = await prisma.projectBrief.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
    });
    if (!briefRow) throw new Error('brief not found');

    const payload = briefRow.payloadJson as ProjectBriefPayload;
    const before = [...payload.exclusions.global_negative_keywords];
    const cleaned = sanitizeBriefNegatives(before, {
      usp: [...payload.marketing.usp, project.name],
      product_description:
        payload.marketing.product_description ||
        'зоомагазин корм товары для животных',
      forbidden_phrases: payload.marketing.forbidden_phrases,
    });
    const removed = before.filter(
      (item) =>
        !cleaned.some((c) => c.toLowerCase() === item.toLowerCase()),
    );

    // Move removed niche terms into semantic keywords (first cluster / new).
    const clusters = await prisma.semanticCluster.findMany({
      where: { projectId },
      include: { keywords: { where: { isNegative: false } } },
      orderBy: { name: 'asc' },
    });
    const target = clusters[0];
    if (target && removed.length > 0) {
      const existing = new Set(
        clusters.flatMap((c) =>
          c.keywords.map((k) => k.phrase.trim().toLowerCase()),
        ),
      );
      const toKeywords = expandThinPublishKeywords(
        removed.filter((r) => r.trim().split(/\s+/).length >= 1),
        Math.min(3, removed.length),
        40,
      ).filter((phrase) => {
        const key = phrase.toLowerCase();
        // Prefer multi-word commercial phrases as keywords; skip pure junk brands
        if (/^(xiaomi|gourmet|zooland|zoomarket)$/i.test(key)) return false;
        return !existing.has(key);
      });
      // Also add removed single niche tokens as short seeds where sensible
      const nicheSeeds = removed
        .map((r) => r.trim().toLowerCase())
        .filter(
          (r) =>
            /корм|кошк|собак|зоо|животн|вет|грызун|влажн|товар|магазин|доставк/i.test(
              r,
            ) && !existing.has(r),
        );
      const add = [...new Set([...toKeywords, ...nicheSeeds])].filter(
        (phrase) => phrase.length >= 3,
      );
      if (add.length > 0) {
        await prisma.semanticKeyword.createMany({
          data: add.map((phrase) => ({
            projectId,
            clusterId: target.id,
            phrase,
            isNegative: false,
            frequency: 1,
            source: 'manual_edit',
            intent: 'hot',
          })),
          skipDuplicates: true,
        });
      }
    }

    const nextPayload: ProjectBriefPayload = {
      ...payload,
      marketing: {
        ...payload.marketing,
        product_description:
          payload.marketing.product_description?.trim() ||
          'Зоомагазин: корм и товары для животных, доставка',
        usp:
          payload.marketing.usp.length > 0
            ? payload.marketing.usp
            : ['Зоомагазин', 'Корм и зоотовары', 'Доставка'],
      },
      exclusions: {
        ...payload.exclusions,
        global_negative_keywords: cleaned,
      },
    };

    await prisma.projectBrief.update({
      where: { id: briefRow.id },
      data: { payloadJson: nextPayload as object },
    });

    await campaigns.build(project.organizationId, projectId);

    console.log(
      JSON.stringify(
        {
          project: project.name,
          beforeCount: before.length,
          afterCount: cleaned.length,
          removed,
          kept: cleaned,
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
