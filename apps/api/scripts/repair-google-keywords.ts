import { config } from 'dotenv';
import { resolve } from 'path';
import { NestFactory } from '@nestjs/core';
import {
  expandThinPublishKeywords,
  isSensibleSearchKeyword,
  normalizeCampaignDraft,
  sanitizeNegativesAgainstPositives,
} from '@context-buyer/agents';
import { LiveGoogleAdsApi } from '@context-buyer/connectors';
import { AdPlatform } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  decryptSecret,
  parseTokenEncryptionKey,
} from '../src/security/token-encryption';

config({ path: resolve(__dirname, '../../../.env') });

const projectId = process.argv[2] ?? '9258fd08-c24b-4c15-8ef4-b54cfc55d539';

function pickSeed(keywords: string[]): string | null {
  const sensible = keywords
    .map((k) => k.trim().toLowerCase().replace(/\s+/g, ' '))
    .filter(isSensibleSearchKeyword);
  if (sensible.length === 0) return null;
  // Prefer complete geo phrases over stripped cores.
  return [...sensible].sort((a, b) => {
    const geoA = /алматы|almaty/u.test(a) ? 1 : 0;
    const geoB = /алматы|almaty/u.test(b) ? 1 : 0;
    if (geoA !== geoB) return geoB - geoA;
    return b.split(' ').length - a.split(' ').length;
  })[0];
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const prisma = app.get(PrismaService);
    const configSvc = app.get(ConfigService);
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new Error('project not found');
    const cred = await prisma.adPlatformCredential.findFirst({
      where: { projectId, platform: AdPlatform.google_ads },
    });
    if (!cred?.externalAccountId) throw new Error('google cred missing');

    const auth = {
      accessToken: decryptSecret(
        cred.accessTokenEncrypted,
        parseTokenEncryptionKey(
          configSvc.get<string>('TOKEN_ENCRYPTION_KEY'),
        ),
      ),
      customerId: String(cred.externalAccountId).replace(/-/g, ''),
      projectId,
    };
    const api = new LiveGoogleAdsApi(
      configSvc.get<string>('GOOGLE_ADS_DEVELOPER_TOKEN') ?? '',
      configSvc.get<string>('GOOGLE_ADS_LOGIN_CUSTOMER_ID'),
    );

    const draft = await prisma.campaignDraft.findFirst({
      where: { projectId },
      orderBy: { updatedAt: 'desc' },
    });
    if (!draft) throw new Error('draft not found');
    const structure = normalizeCampaignDraft(draft.structureJson);
    const report: unknown[] = [];

    for (const unit of structure.campaigns) {
      const campaignId = unit.publish?.externalCampaignId;
      if (!campaignId) continue;

      for (const group of unit.ad_groups) {
        const seed = pickSeed(group.keywords);
        group.keywords = expandThinPublishKeywords(seed ? [seed] : [], 3);
        group.negative_keywords = sanitizeNegativesAgainstPositives(
          group.negative_keywords,
          group.keywords,
        );
      }
      const allPositives = unit.ad_groups.flatMap((g) => g.keywords);
      structure.global_negatives = sanitizeNegativesAgainstPositives(
        structure.global_negatives,
        allPositives,
      );

      const live = await api.listAdGroupKeywords(auth, campaignId);
      const desiredByGroup = new Map<string, Set<string>>();
      const safeNegByGroup = new Map<string, Set<string>>();
      for (const [index, group] of unit.ad_groups.entries()) {
        const adGroupId = unit.publish?.adGroups?.[index]?.externalId;
        if (!adGroupId) continue;
        desiredByGroup.set(
          adGroupId,
          new Set(group.keywords.map((k) => k.toLowerCase())),
        );
        safeNegByGroup.set(
          adGroupId,
          new Set(group.negative_keywords.map((k) => k.toLowerCase())),
        );
      }
      const safeCampaignNeg = new Set(
        structure.global_negatives.map((k) => k.toLowerCase()),
      );

      const toRemovePositives = live.filter((row) => {
        if (row.negative) return false;
        const desired = desiredByGroup.get(row.adGroupId);
        if (!desired) return !isSensibleSearchKeyword(row.text);
        return !desired.has(row.text) || !isSensibleSearchKeyword(row.text);
      });
      // Drop ad-group negatives that are no longer in the sanitized draft set.
      const toRemoveAgNeg = live.filter((row) => {
        if (!row.negative) return false;
        const safe = safeNegByGroup.get(row.adGroupId);
        if (!safe) return true;
        return !safe.has(row.text);
      });
      await api.removeAdGroupCriteria(auth, [
        ...toRemovePositives.map((r) => r.criterionResourceName),
        ...toRemoveAgNeg.map((r) => r.criterionResourceName),
      ]);

      const campNeg = await api.listCampaignNegativeKeywords(auth, campaignId);
      const badCampNeg = campNeg.filter((row) => !safeCampaignNeg.has(row.text));
      await api.removeCampaignCriteria(
        auth,
        badCampNeg.map((r) => r.criterionResourceName),
      );

      for (const [index, group] of unit.ad_groups.entries()) {
        const adGroupId = unit.publish?.adGroups?.[index]?.externalId;
        if (!adGroupId) continue;
        await api.addKeywords(auth, adGroupId, group.keywords);
        await api.addNegativeKeywords(
          auth,
          { type: 'ad_group', id: adGroupId },
          group.negative_keywords,
          group.keywords,
        );
      }
      await api.addNegativeKeywords(
        auth,
        { type: 'campaign', id: campaignId },
        structure.global_negatives,
        allPositives,
      );

      const after = await api.listAdGroupKeywords(auth, campaignId);
      const afterCampNeg = await api.listCampaignNegativeKeywords(
        auth,
        campaignId,
      );
      report.push({
        campaign: unit.campaign.name,
        campaignId,
        removedPositives: toRemovePositives.map((r) => r.text),
        removedConflictingNegatives: [
          ...toRemoveAgNeg.map((r) => r.text),
          ...badCampNeg.map((r) => r.text),
        ],
        positivesAfter: after.filter((r) => !r.negative).map((r) => r.text),
        campaignNegativesCount: afterCampNeg.length,
        adGroupNegativesCount: after.filter((r) => r.negative).length,
        sampleCampaignNegatives: afterCampNeg.slice(0, 12).map((n) => n.text),
        draftKeywords: unit.ad_groups.map((g) => ({
          name: g.name,
          keywords: g.keywords,
        })),
      });
    }

    await prisma.campaignDraft.update({
      where: { id: draft.id },
      data: { structureJson: structure as object, status: 'published' },
    });

    console.log(JSON.stringify({ ok: true, report }, null, 2));
  } finally {
    await app.close();
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
