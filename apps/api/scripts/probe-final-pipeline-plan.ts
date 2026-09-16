import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient, AgentTaskStatus, AgentType, CampaignDraftStatus, IssueLevel } from '@prisma/client';
import { planPipeline, planFullRunToDraft } from '@context-buyer/agents';

config({ path: resolve(__dirname, '../../../.env') });

const PROJECT_ID = '0f3c656c-c790-47b9-83ad-209c22d30ec2';

async function main() {
  const prisma = new PrismaClient();
  try {
    const [
      briefCount,
      analysis,
      clusterCount,
      plan,
      creativeCount,
      criticalIssues,
      latestDraft,
      campaignCount,
      snapshotCount,
      runningTask,
      latestTask,
    ] = await Promise.all([
      prisma.projectBrief.count({ where: { projectId: PROJECT_ID } }),
      prisma.projectAnalysis.findUnique({ where: { projectId: PROJECT_ID } }),
      prisma.semanticCluster.count({ where: { projectId: PROJECT_ID } }),
      prisma.projectCampaignPlan.findUnique({ where: { projectId: PROJECT_ID } }),
      prisma.adCreative.count({ where: { projectId: PROJECT_ID } }),
      prisma.validationIssue.count({
        where: { projectId: PROJECT_ID, level: IssueLevel.critical },
      }),
      prisma.campaignDraft.findFirst({
        where: { projectId: PROJECT_ID },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.campaign.count({ where: { projectId: PROJECT_ID } }),
      prisma.performanceSnapshot.count({ where: { projectId: PROJECT_ID } }),
      prisma.agentTask.findFirst({
        where: {
          projectId: PROJECT_ID,
          status: AgentTaskStatus.running,
          agentType: {
            in: [
              AgentType.analysis,
              AgentType.semantic,
              AgentType.campaign_plan,
              AgentType.copywriting,
              AgentType.validation,
              AgentType.campaign_builder,
            ],
          },
        },
        orderBy: { startedAt: 'desc' },
      }),
      prisma.agentTask.findFirst({
        where: {
          projectId: PROJECT_ID,
          agentType: {
            in: [
              AgentType.analysis,
              AgentType.semantic,
              AgentType.campaign_plan,
              AgentType.copywriting,
              AgentType.validation,
              AgentType.campaign_builder,
            ],
          },
        },
        orderBy: { startedAt: 'desc' },
      }),
    ]);

    const draftFailed = latestDraft?.status === CampaignDraftStatus.failed;
    const facts = {
      hasBrief: briefCount > 0,
      hasAnalysis: Boolean(analysis),
      hasSemantic: clusterCount > 0,
      hasPlan: Boolean(plan),
      planApproved: plan?.approved ?? false,
      hasCreatives: creativeCount > 0,
      criticalIssues,
      hasDraft: Boolean(latestDraft),
      draftPendingApproval:
        latestDraft?.status === CampaignDraftStatus.pending_approval,
      draftPublishFailed: draftFailed,
      hasLiveCampaign: campaignCount > 0,
      hasSnapshots: snapshotCount > 0,
      runningAgent: null,
      lastFailedAgent: draftFailed
        ? ('campaign_builder' as const)
        : latestTask?.status === AgentTaskStatus.failed
          ? (latestTask.agentType as any)
          : null,
      lastError: draftFailed
        ? JSON.stringify(latestDraft?.structureJson)?.slice(0, 500)
        : latestTask?.error ?? null,
    };

    const plan1 = planPipeline(facts as any);
    const full = planFullRunToDraft(facts as any);
    const publishErr =
      latestDraft && typeof latestDraft.structureJson === 'object'
        ? (latestDraft.structureJson as any)?.lastPublishError ??
          (latestDraft.structureJson as any)?.publishError ??
          (latestDraft.structureJson as any)?.error
        : null;

    console.log(
      JSON.stringify(
        {
          facts: {
            ...facts,
            lastError: facts.lastError?.slice?.(0, 200) ?? facts.lastError,
          },
          plan: plan1,
          fullRun: full,
          draftStatus: latestDraft?.status,
          publishErr,
          credential: await prisma.adPlatformCredential.findFirst({
            where: { projectId: PROJECT_ID },
            select: {
              platform: true,
              externalAccountId: true,
              expiresAt: true,
            },
          }),
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
