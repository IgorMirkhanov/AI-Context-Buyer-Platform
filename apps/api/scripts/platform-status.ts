/**
 * Platform status snapshot: projects, credentials, pipeline stages, recent errors.
 * Usage: npx ts-node --transpile-only -r tsconfig-paths/register scripts/platform-status.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient, AgentTaskStatus } from '@prisma/client';

config({ path: resolve(__dirname, '../../../.env') });

async function main() {
  const prisma = new PrismaClient();
  try {
    const [
      orgCount,
      projectCount,
      creds,
      recentProjects,
      failedTasks,
      analysisCount,
      clusterCount,
      draftCount,
      campaignCount,
    ] = await Promise.all([
      prisma.organization.count(),
      prisma.project.count(),
      prisma.adPlatformCredential.findMany({
        select: {
          platform: true,
          externalAccountId: true,
          apiVerifiedAt: true,
          apiVerificationError: true,
          expiresAt: true,
          project: { select: { id: true, name: true, primaryPlatform: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      prisma.project.findMany({
        orderBy: { createdAt: 'desc' },
        take: 12,
        select: {
          id: true,
          name: true,
          status: true,
          primaryPlatform: true,
          websiteUrl: true,
          _count: {
            select: {
              briefs: true,
              semanticClusters: true,
              semanticKeywords: true,
              adCreatives: true,
              campaignDrafts: true,
              campaigns: true,
            },
          },
          analysis: { select: { id: true } },
          campaignPlan: { select: { approved: true } },
          credentials: {
            select: {
              platform: true,
              apiVerifiedAt: true,
              apiVerificationError: true,
              expiresAt: true,
              externalAccountId: true,
            },
          },
        },
      }),
      prisma.agentTask.findMany({
        where: { status: AgentTaskStatus.failed },
        orderBy: { startedAt: 'desc' },
        take: 8,
        select: {
          agentType: true,
          error: true,
          startedAt: true,
          project: { select: { name: true } },
        },
      }),
      prisma.projectAnalysis.count(),
      prisma.semanticCluster.count(),
      prisma.campaignDraft.count(),
      prisma.campaign.count(),
    ]);
    const aiProviderCount = await prisma.aiProviderCredential.count();

    const envFlags = {
      GOOGLE_ADS_MOCK: process.env.GOOGLE_ADS_MOCK ?? null,
      hasGoogleClientId: Boolean(process.env.GOOGLE_ADS_CLIENT_ID?.trim()),
      hasGoogleClientSecret: Boolean(
        process.env.GOOGLE_ADS_CLIENT_SECRET?.trim(),
      ),
      hasGoogleDeveloperToken: Boolean(
        process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim(),
      ),
      hasOpenAiKey: Boolean(
        process.env.OPENAI_API_KEY?.trim() ||
          process.env.AI_API_KEY?.trim() ||
          process.env.LLM_API_KEY?.trim(),
      ),
      hasYandexToken: Boolean(
        process.env.YANDEX_DIRECT_TOKEN?.trim() ||
          process.env.YANDEX_OAUTH_TOKEN?.trim(),
      ),
      hasJwtSecret: Boolean(process.env.JWT_SECRET?.trim()),
      hasDatabaseUrl: Boolean(process.env.DATABASE_URL?.trim()),
      hasRedisUrl: Boolean(process.env.REDIS_URL?.trim()),
      aiProviderCredentials: aiProviderCount,
    };

    const now = Date.now();
    const connections = creds.map((c) => {
      const expired =
        c.expiresAt != null && c.expiresAt.getTime() < now;
      const verified = c.apiVerifiedAt != null && !c.apiVerificationError;
      return {
        project: c.project.name.trim(),
        projectId: c.project.id,
        platform: c.platform,
        accountId: c.externalAccountId,
        verified,
        expired,
        expiresAt: c.expiresAt?.toISOString() ?? null,
        verifyError: c.apiVerificationError,
      };
    });

    console.log(
      JSON.stringify(
        {
          totals: {
            organizations: orgCount,
            projects: projectCount,
            analyses: analysisCount,
            semanticClusters: clusterCount,
            drafts: draftCount,
            campaigns: campaignCount,
          },
          envFlags,
          connections,
          recentProjects: recentProjects.map((p) => ({
            id: p.id,
            name: p.name.trim(),
            status: p.status,
            platform: p.primaryPlatform,
            websiteUrl: p.websiteUrl,
            hasBrief: p._count.briefs > 0,
            hasAnalysis: Boolean(p.analysis),
            clusters: p._count.semanticClusters,
            keywords: p._count.semanticKeywords,
            creatives: p._count.adCreatives,
            drafts: p._count.campaignDrafts,
            campaigns: p._count.campaigns,
            planApproved: p.campaignPlan?.approved ?? null,
            connections: p.credentials.map((c) => ({
              platform: c.platform,
              accountId: c.externalAccountId,
              verified: Boolean(c.apiVerifiedAt) && !c.apiVerificationError,
              expired: c.expiresAt != null && c.expiresAt.getTime() < now,
              error: c.apiVerificationError,
            })),
          })),
          recentFailures: failedTasks.map((t) => ({
            project: t.project.name.trim(),
            agent: t.agentType,
            at: t.startedAt,
            error: (t.error ?? '').slice(0, 220),
          })),
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
