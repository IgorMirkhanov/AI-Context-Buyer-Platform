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
  PipelineAgentStep,
  PipelineFacts,
  PipelinePlan,
  PipelineRunningAgent,
} from '@context-buyer/agents';
import { PrismaService } from '../prisma/prisma.service';
import { SemanticService } from '../semantic/semantic.service';
import { CreativesService } from '../creatives/creatives.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { PipelineQueue } from './pipeline.queue';
import { AlertsService } from '../alerts/alerts.service';
import { AiProviderService } from '../ai-provider/ai-provider.service';

const PIPELINE_AGENTS: AgentType[] = [
  AgentType.semantic,
  AgentType.copywriting,
  AgentType.validation,
  AgentType.campaign_builder,
];

const MAX_AUTO_STEPS = 4;

@Injectable()
export class PipelineService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly semantic: SemanticService,
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
    const plan = planPipeline(await this.loadFacts(projectId));
    if (!plan.autoRunnable || !plan.nextStep) {
      throw new BadRequestException(
        plan.blockedReason ?? 'Pipeline has nothing to run automatically',
      );
    }
    await this.queue.enqueue({ organizationId, projectId });
    return this.inspect(organizationId, projectId);
  }

  async processQueuedRun(organizationId: string, projectId: string) {
    try {
      const plan = planPipeline(await this.loadFacts(projectId));
      if (!plan.autoRunnable || !plan.nextStep) {
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
    let plan = planPipeline(await this.loadFacts(projectId));
    if (!plan.autoRunnable || !plan.nextStep) {
      throw new BadRequestException(
        plan.blockedReason ?? 'Pipeline has nothing to run automatically',
      );
    }
    for (let i = 0; i < MAX_AUTO_STEPS; i += 1) {
      const step = plan.nextStep;
      if (!step || !plan.autoRunnable) break;
      await this.runStep(organizationId, projectId, step);
      plan = planPipeline(await this.loadFacts(projectId));
      if (plan.stage === 'awaiting_approval' || plan.stage === 'failed') {
        break;
      }
    }
    const facts = await this.loadFacts(projectId);
    return this.toDto(projectId, facts, planPipeline(facts));
  }

  private async runStep(
    organizationId: string,
    projectId: string,
    step: PipelineAgentStep,
  ) {
    if (step === 'semantic') {
      await this.semantic.run(organizationId, projectId);
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
      clusterCount,
      creativeCount,
      criticalIssues,
      latestDraft,
      campaignCount,
      snapshotCount,
      latestTask,
    ] = await Promise.all([
      this.prisma.projectBrief.count({ where: { projectId } }),
      this.prisma.semanticCluster.count({ where: { projectId } }),
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
      hasSemantic: clusterCount > 0,
      hasCreatives: creativeCount > 0,
      criticalIssues,
      hasDraft: Boolean(latestDraft),
      draftPendingApproval: latestDraft?.status === CampaignDraftStatus.pending_approval,
      hasLiveCampaign: campaignCount > 0,
      hasSnapshots: snapshotCount > 0,
      runningAgent,
      lastFailedAgent,
      lastError: lastFailedAgent ? latestTask?.error ?? null : null,
    };
  }

  private async toDto(projectId: string, facts: PipelineFacts, plan: PipelinePlan) {
    const queue = await this.queue.getStatus(projectId);
    return {
      projectId,
      ...plan,
      queue,
      facts: {
        hasBrief: facts.hasBrief,
        hasSemantic: facts.hasSemantic,
        hasCreatives: facts.hasCreatives,
        criticalIssues: facts.criticalIssues,
        hasDraft: facts.hasDraft,
        hasLiveCampaign: facts.hasLiveCampaign,
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

function toRunningAgent(type: AgentType): PipelineRunningAgent | null {
  if (type === AgentType.semantic) return 'semantic';
  if (type === AgentType.copywriting) return 'copywriting';
  if (type === AgentType.validation) return 'validation';
  if (type === AgentType.campaign_builder) return 'campaign_builder';
  return null;
}
