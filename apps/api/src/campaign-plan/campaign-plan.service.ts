import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AgentTaskStatus, AgentType } from '@prisma/client';
import {
  CampaignPlan,
  CampaignPlanValidationError,
  resolveCampaignPlanLlm,
  resolveLlmCostUsd,
  runCampaignPlanPipeline,
} from '@context-buyer/agents';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectBriefPayload } from '../briefs/brief.schema';
import { AiProviderService } from '../ai-provider/ai-provider.service';
import {
  LLM_SPEND_CAP_REACHED,
  LlmSpendCapReachedError,
} from '../ai-provider/llm-spend-cap';
import { SemanticService } from '../semantic/semantic.service';

@Injectable()
export class CampaignPlanService {
  private readonly log = new Logger(CampaignPlanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiProviderService,
    private readonly semantic: SemanticService,
  ) {}

  async run(organizationId: string, projectId: string) {
    const credentials = await this.ai.tryResolveOptional(organizationId);
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
      include: {
        briefs: { orderBy: { version: 'desc' }, take: 1 },
        semanticClusters: {
          include: {
            keywords: {
              where: { isNegative: false },
              orderBy: { frequency: 'desc' },
              take: 5,
            },
          },
        },
      },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    if (project.semanticClusters.length === 0) {
      throw new BadRequestException('Run Semantic Agent first');
    }
    const briefRow = project.briefs[0];
    if (!briefRow) {
      throw new BadRequestException('Project brief is missing');
    }

    const task = await this.prisma.agentTask.create({
      data: {
        projectId,
        agentType: AgentType.campaign_plan,
        status: AgentTaskStatus.running,
        startedAt: new Date(),
      },
    });

    try {
      const payload = briefRow.payloadJson as ProjectBriefPayload;
      const clusters = project.semanticClusters.map((cluster) => ({
        name: cluster.name,
        category: cluster.category,
        keyword_count: cluster.keywords.length,
        sample_keywords: cluster.keywords.map((item) => item.phrase),
      }));
      const brief = {
        project_name: project.name,
        geo: payload.project.geo,
        usp: payload.marketing.usp,
        target_audience: payload.marketing.target_audience.map(
          (item) => item.segment,
        ),
      };
      const { writer, mode } = resolveCampaignPlanLlm({
        apiKey: credentials?.apiKey ?? null,
        provider: credentials?.provider ?? null,
        onFallback: (message) => this.log.warn(message),
      });
      if (mode !== 'heuristic') {
        await this.ai.assertWithinMonthlyCap(organizationId);
      }
      const plan = await runCampaignPlanPipeline(brief, clusters, {
        writer,
        onLlmCall: async (usage) => {
          await this.prisma.llmCallLog.create({
            data: {
              projectId,
              agentType: AgentType.campaign_plan,
              step: usage.step,
              model: usage.model,
              prompt: usage.prompt,
              response: usage.response,
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              costUsd: resolveLlmCostUsd(usage),
              latencyMs: usage.latencyMs,
            },
          });
        },
      });

      await this.prisma.projectCampaignPlan.upsert({
        where: { projectId },
        create: {
          projectId,
          planJson: plan as object,
          approved: false,
          llmMode: mode,
        },
        update: {
          planJson: plan as object,
          approved: false,
          llmMode: mode,
        },
      });
      await this.prisma.agentTask.update({
        where: { id: task.id },
        data: {
          status: AgentTaskStatus.done,
          finishedAt: new Date(),
          outputRef: 'campaign_plan',
        },
      });
      return this.getResult(organizationId, projectId);
    } catch (err) {
      const details =
        err instanceof LlmSpendCapReachedError
          ? LLM_SPEND_CAP_REACHED
          : err instanceof CampaignPlanValidationError
            ? err.details.join('; ')
            : err instanceof Error
              ? err.message
              : 'Campaign plan failed';
      await this.prisma.agentTask.update({
        where: { id: task.id },
        data: {
          status: AgentTaskStatus.failed,
          finishedAt: new Date(),
          error: details,
        },
      });
      if (err instanceof LlmSpendCapReachedError) {
        throw new BadRequestException({
          message: err.uiMessage,
          details: LLM_SPEND_CAP_REACHED,
        });
      }
      throw new BadRequestException({
        message: 'Campaign plan failed',
        details,
      });
    }
  }

  async approve(organizationId: string, projectId: string) {
    await this.requireProject(organizationId, projectId);
    const row = await this.prisma.projectCampaignPlan.findUnique({
      where: { projectId },
    });
    if (!row) {
      throw new BadRequestException('Сначала сформируйте план кампаний');
    }
    await this.semantic.acceptAllPendingNegativeSuggestions(
      organizationId,
      projectId,
    );
    await this.prisma.projectCampaignPlan.update({
      where: { projectId },
      data: { approved: true },
    });
    return this.getResult(organizationId, projectId);
  }

  async getResult(organizationId: string, projectId: string) {
    await this.requireProject(organizationId, projectId);
    const [row, lastTask] = await Promise.all([
      this.prisma.projectCampaignPlan.findUnique({ where: { projectId } }),
      this.prisma.agentTask.findFirst({
        where: { projectId, agentType: AgentType.campaign_plan },
        orderBy: { startedAt: 'desc' },
      }),
    ]);
    const plan = row?.planJson as CampaignPlan | undefined;
    return {
      task: lastTask,
      ready: Boolean(row),
      approved: row?.approved ?? false,
      plan: plan ?? null,
      llmMode: row?.llmMode ?? null,
      campaignCount: plan?.campaigns?.length ?? 0,
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
