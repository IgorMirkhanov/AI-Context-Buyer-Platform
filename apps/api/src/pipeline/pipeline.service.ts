import {

  BadRequestException,

  Injectable,

  NotFoundException,

  OnModuleInit,

} from '@nestjs/common';

import {

  AgentTaskStatus,

  AgentType,

  CampaignDraftStatus,

  IssueLevel,

} from '@prisma/client';

import {

  planPipeline,

  planFullRunToDraft,

  fullRunToDraftAvailable,

  PipelineAgentStep,

  PipelineFacts,

  PipelinePlan,

  PipelineRunningAgent,

  normalizeCampaignDraft,

} from '@context-buyer/agents';

import { PrismaService } from '../prisma/prisma.service';

import { AnalysisService } from '../analysis/analysis.service';

import { SemanticService } from '../semantic/semantic.service';

import { CampaignPlanService } from '../campaign-plan/campaign-plan.service';

import { CreativesService } from '../creatives/creatives.service';

import { CampaignsService } from '../campaigns/campaigns.service';

import { PipelineQueue } from './pipeline.queue';

import { AlertsService } from '../alerts/alerts.service';

import { AiProviderService } from '../ai-provider/ai-provider.service';



const PIPELINE_AGENTS: AgentType[] = [

  AgentType.analysis,

  AgentType.semantic,

  AgentType.campaign_plan,

  AgentType.copywriting,

  AgentType.validation,

  AgentType.campaign_builder,

];



const MAX_FULL_RUN_STEPS = 10;



@Injectable()

export class PipelineService implements OnModuleInit {

  constructor(

    private readonly prisma: PrismaService,

    private readonly analysis: AnalysisService,

    private readonly semantic: SemanticService,

    private readonly campaignPlan: CampaignPlanService,

    private readonly creatives: CreativesService,

    private readonly campaigns: CampaignsService,

    private readonly queue: PipelineQueue,

    private readonly alerts: AlertsService,

    private readonly ai: AiProviderService,

  ) {}



  async onModuleInit() {

    this.queue.register('pipeline_run', async (job) => {

      await this.processQueuedRun(job.organizationId!, job.projectId!);

    });

  }



  async inspect(organizationId: string, projectId: string) {

    await this.requireProject(organizationId, projectId);

    const facts = await this.loadFacts(projectId);

    const plan = planPipeline(facts);

    return this.toDto(projectId, facts, plan);

  }



  async enqueueOrRun(organizationId: string, projectId: string) {

    await this.requireProject(organizationId, projectId);

    await this.ai.requireReady(organizationId);

    const facts = await this.loadFacts(projectId);

    const full = planFullRunToDraft(facts);

    if (!full.runnable) {

      throw new BadRequestException(

        full.blockedReason ?? 'Pipeline has nothing to run automatically',

      );

    }

    await this.queue.enqueue({ organizationId, projectId });

    return this.inspect(organizationId, projectId);

  }



  async cancel(organizationId: string, projectId: string) {

    await this.requireProject(organizationId, projectId);

    const facts = await this.loadFacts(projectId);

    const queue = await this.queue.getStatus(projectId);

    if (!canCancelPipeline(facts, queue.status)) {

      throw new BadRequestException(

        'Сейчас нечего отменять. После публикации в кабинет откат недоступен.',

      );

    }



    await this.queue.cancel(projectId);



    await this.prisma.agentTask.updateMany({

      where: {

        projectId,

        agentType: { in: PIPELINE_AGENTS },

        status: AgentTaskStatus.running,

      },

      data: {

        status: AgentTaskStatus.failed,

        finishedAt: new Date(),

        error: 'Отменено пользователем',

      },

    });



    const latestFailed = await this.prisma.agentTask.findFirst({

      where: {

        projectId,

        agentType: { in: PIPELINE_AGENTS },

        status: AgentTaskStatus.failed,

      },

      orderBy: { startedAt: 'desc' },

    });

    if (latestFailed) {

      await this.prisma.agentTask.update({

        where: { id: latestFailed.id },

        data: {

          status: AgentTaskStatus.done,

          error: null,

          outputRef: 'cancelled_by_user',

          finishedAt: new Date(),

        },

      });

    }



    await this.prisma.campaignDraft.deleteMany({

      where: {

        projectId,

        status: {

          in: [

            CampaignDraftStatus.pending_approval,

            CampaignDraftStatus.failed,

          ],

        },

      },

    });



    const updated = await this.loadFacts(projectId);

    return this.toDto(projectId, updated, planPipeline(updated));

  }



  async processQueuedRun(organizationId: string, projectId: string) {

    try {

      const facts = await this.loadFacts(projectId);

      if (!planFullRunToDraft(facts).runnable) {

        return this.inspect(organizationId, projectId);

      }

      return await this.run(organizationId, projectId);

    } catch (err) {

      await this.alerts.recordPipelineFailure(organizationId, projectId, err);

      throw err;

    }

  }



  async run(organizationId: string, projectId: string) {

    await this.requireProject(organizationId, projectId);

    await this.ai.requireReady(organizationId);

    const initial = planFullRunToDraft(await this.loadFacts(projectId));

    if (!initial.runnable) {

      throw new BadRequestException(

        initial.blockedReason ?? 'Pipeline has nothing to run automatically',

      );

    }

    for (let i = 0; i < MAX_FULL_RUN_STEPS; i += 1) {

      const facts = await this.loadFacts(projectId);

      const full = planFullRunToDraft(facts);

      if (!full.runnable || !full.action) break;

      if (full.action === 'approve_plan') {

        await this.campaignPlan.approve(organizationId, projectId);

        continue;

      }

      await this.runStep(organizationId, projectId, full.action);

    }

    const facts = await this.loadFacts(projectId);

    await this.alerts.clearStalePipelineFailures(projectId);

    return this.toDto(projectId, facts, planPipeline(facts));

  }



  private async runStep(

    organizationId: string,

    projectId: string,

    step: PipelineAgentStep,

  ) {

    if (step === 'analysis') {

      await this.analysis.run(organizationId, projectId);

      return;

    }

    if (step === 'semantic') {

      await this.semantic.run(organizationId, projectId);

      return;

    }

    if (step === 'plan_preview') {

      await this.campaignPlan.run(organizationId, projectId);

      return;

    }

    if (step === 'copywriting') {

      await this.creatives.run(organizationId, projectId);

      return;

    }

    await this.campaigns.build(organizationId, projectId);

  }



  private async loadFacts(projectId: string): Promise<PipelineFacts> {

    const [

      briefCount,

      analysisCount,

      clusterCount,

      campaignPlanRow,

      creativeCount,

      criticalIssues,

      latestDraft,

      campaignCount,

      snapshotCount,

      latestTask,

    ] = await Promise.all([

      this.prisma.projectBrief.count({ where: { projectId } }),

      this.prisma.projectAnalysis.count({ where: { projectId } }),

      this.prisma.semanticCluster.count({ where: { projectId } }),

      this.prisma.projectCampaignPlan.findUnique({ where: { projectId } }),

      this.prisma.adCreative.count({ where: { projectId } }),

      this.prisma.validationIssue.count({

        where: { projectId, level: IssueLevel.critical },

      }),

      this.prisma.campaignDraft.findFirst({

        where: { projectId },

        orderBy: { createdAt: 'desc' },

      }),

      this.prisma.campaign.count({ where: { projectId } }),

      this.prisma.performanceSnapshot.count({ where: { projectId } }),

      this.prisma.agentTask.findFirst({

        where: { projectId, agentType: { in: PIPELINE_AGENTS } },

        orderBy: { startedAt: 'desc' },

      }),

    ]);

    const runningAgent =

      latestTask?.status === AgentTaskStatus.running

        ? toRunningAgent(latestTask.agentType)

        : null;

    const lastFailedAgent =

      latestTask?.status === AgentTaskStatus.failed

        ? toRunningAgent(latestTask.agentType)

        : null;

    return {

      hasBrief: briefCount > 0,

      hasAnalysis: analysisCount > 0,

      hasSemantic: clusterCount > 0,

      hasPlan: Boolean(campaignPlanRow),

      planApproved: campaignPlanRow?.approved ?? false,

      hasCreatives: creativeCount > 0,

      criticalIssues,

      hasDraft: Boolean(latestDraft),

      draftPendingApproval: latestDraft?.status === CampaignDraftStatus.pending_approval,

      draftPublishFailed: latestDraft?.status === CampaignDraftStatus.failed,

      hasLiveCampaign: campaignCount > 0,

      hasSnapshots: snapshotCount > 0,

      runningAgent,

      lastFailedAgent,

      lastError: lastFailedAgent

        ? latestTask?.error ?? null

        : latestDraft?.status === CampaignDraftStatus.failed

          ? extractDraftPublishError(latestDraft.structureJson)

          : null,

    };

  }



  private async toDto(projectId: string, facts: PipelineFacts, plan: PipelinePlan) {

    const queue = await this.queue.getStatus(projectId);

    return {

      projectId,

      ...plan,

      fullRunAvailable: fullRunToDraftAvailable(facts),

      canCancel: canCancelPipeline(facts, queue.status),

      queue,

      facts: {

        hasBrief: facts.hasBrief,

        hasAnalysis: facts.hasAnalysis,

        hasSemantic: facts.hasSemantic,

        hasPlan: facts.hasPlan,

        planApproved: facts.planApproved,

        hasCreatives: facts.hasCreatives,

        criticalIssues: facts.criticalIssues,

        hasDraft: facts.hasDraft,

        draftPublishFailed: facts.draftPublishFailed,

        hasLiveCampaign: facts.hasLiveCampaign,

        lastError: facts.lastError,

      },

    };

  }



  private async requireProject(organizationId: string, projectId: string) {

    const project = await this.prisma.project.findFirst({

      where: { id: projectId, organizationId },

    });

    if (!project) {

      throw new NotFoundException('Project not found');

    }

    return project;

  }

}



function canCancelPipeline(

  facts: PipelineFacts,

  queueStatus: string,

): boolean {

  if (facts.hasLiveCampaign) return false;

  if (queueStatus === 'queued' || queueStatus === 'active') return true;

  if (facts.hasDraft && !facts.hasLiveCampaign) return true;

  if (facts.runningAgent) return true;

  if (facts.lastFailedAgent) return true;

  return false;

}



function extractDraftPublishError(structureJson: unknown): string | null {
  try {
    const structure = normalizeCampaignDraft(structureJson);
    for (const unit of structure.campaigns) {
      const error = unit.publish?.error?.trim();
      if (error) return error;
    }
  } catch {
    return null;
  }
  return null;
}

function toRunningAgent(type: AgentType): PipelineRunningAgent | null {

  if (type === AgentType.analysis) return 'analysis';

  if (type === AgentType.semantic) return 'semantic';

  if (type === AgentType.campaign_plan) return 'plan_preview';

  if (type === AgentType.copywriting) return 'copywriting';

  if (type === AgentType.validation) return 'validation';

  if (type === AgentType.campaign_builder) return 'campaign_builder';

  return null;

}


