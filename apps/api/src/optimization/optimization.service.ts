import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AdWriteAction,
  AdWriteActor,
  AgentTaskStatus,
  AgentType,
  LiveCampaignStatus,
  OptimizationRecStatus,
  OptimizationRecType,
} from '@prisma/client';
import {
  aggregateMetrics,
  buildOptimizationPlan,
  evaluateAutopilotEligibility,
  OptimizationAction,
  OptimizationPlanValidationError,
  OptimizationLlmMode,
  resolveLlmCostUsd,
  resolveOptimizationLlm,
} from '@context-buyer/agents';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectorRouter } from '../connectors/connector-router';
import { AlertsService } from '../alerts/alerts.service';
import { AuditService } from '../audit/audit.service';
import { PipelineQueue } from '../pipeline/pipeline.queue';
import { ProjectBriefPayload } from '../briefs/brief.schema';
import { AiProviderService } from '../ai-provider/ai-provider.service';
import {
  decryptSecret,
  parseTokenEncryptionKey,
} from '../security/token-encryption';

/** Optimization Agent: propose; apply after UI approve, or via per-project autopilot. */

@Injectable()
export class OptimizationService implements OnModuleInit {
  private readonly log = new Logger(OptimizationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly connectors: ConnectorRouter,
    private readonly alerts: AlertsService,
    private readonly audit: AuditService,
    private readonly queue: PipelineQueue,
    private readonly ai: AiProviderService,
  ) {}

  async onModuleInit() {
    this.queue.register('autopilot', async () => {
      await this.runAutopilotProjects();
    });
    const ms = Number(this.config.get('AUTOPILOT_POLL_MS') ?? 0);
    await this.queue.schedule('autopilot', ms);
  }

  async run(organizationId: string, projectId: string) {
    const credentials = await this.ai.tryResolveOptional(organizationId);
    const project = await this.requireProject(organizationId, projectId);
    const campaigns = await this.prisma.campaign.findMany({
      where: { projectId },
    });
    if (campaigns.length === 0) {
      throw new BadRequestException('Publish a campaign first');
    }
    const period = parsePeriod();
    const snapshots = await this.prisma.performanceSnapshot.findMany({
      where: {
        projectId,
        date: {
          gte: new Date(`${period.from}T00:00:00.000Z`),
          lte: new Date(`${period.to}T00:00:00.000Z`),
        },
      },
    });
    if (snapshots.length === 0) {
      throw new BadRequestException('Collect performance snapshots first');
    }

    const brief = await this.prisma.projectBrief.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
    });
    const targetCpl =
      (brief?.payloadJson as ProjectBriefPayload | null)?.project.target_cpl ??
      0;

    const campaignInputs = campaigns.map((campaign) => {
      const rows = snapshots
        .filter((row) => row.campaignId === campaign.id)
        .map((row) => ({
          date: row.date.toISOString().slice(0, 10),
          impressions: row.impressions,
          clicks: row.clicks,
          spend: Number(row.spend),
          conversions: row.conversions,
        }));
      return {
        campaignId: campaign.id,
        externalCampaignId: campaign.externalCampaignId,
        budgetDaily: Number(campaign.budget ?? 0),
        metrics: aggregateMetrics(rows),
      };
    });

    const searchTerms = await this.loadSearchTerms(
      projectId,
      project.primaryPlatform,
      period,
      campaigns.map((item) => item.externalCampaignId),
    );

    const task = await this.prisma.agentTask.create({
      data: {
        projectId,
        agentType: AgentType.optimization,
        status: AgentTaskStatus.running,
        startedAt: new Date(),
        inputRef: `${period.from}:${period.to}`,
      },
    });

    try {
      const { writer, mode } = resolveOptimizationLlm({
        apiKey: credentials?.apiKey ?? null,
        onFallback: (message) => this.log.warn(message),
      });
      const plan = await buildOptimizationPlan(
        {
          period,
          targetCpl,
          campaigns: campaignInputs,
          searchTerms,
        },
        writer,
      );
      const wrapSample = plan.recommendations[0]?.rationale ?? '';
      await this.prisma.llmCallLog.create({
        data: {
          projectId,
          agentType: AgentType.optimization,
          step: 'wrap_rationale',
          model: mode === 'anthropic' ? 'anthropic' : 'heuristic',
          prompt: JSON.stringify(plan.recommendations.map((item) => item.evidence)),
          response: plan.recommendations.map((item) => item.rationale).join('\n'),
          inputTokens: Math.ceil(wrapSample.length / 4),
          outputTokens: Math.ceil(wrapSample.length / 4),
          costUsd: resolveLlmCostUsd({
            model: mode === 'anthropic' ? 'anthropic' : 'heuristic',
            inputTokens: Math.ceil(wrapSample.length / 4),
            outputTokens: Math.ceil(wrapSample.length / 4),
          }),
          latencyMs: 0,
        },
      });

      await this.prisma.$transaction(async (tx) => {
        await tx.optimizationRecommendation.deleteMany({
          where: { projectId, status: OptimizationRecStatus.proposed },
        });
        if (plan.recommendations.length > 0) {
          await tx.optimizationRecommendation.createMany({
            data: plan.recommendations.map((item) => ({
              projectId,
              campaignId: item.campaign_id,
              type: item.type as OptimizationRecType,
              status: OptimizationRecStatus.proposed,
              evidenceJson: item.evidence,
              actionJson: item.action,
              rationale: item.rationale,
            })),
          });
        }
      });

      await this.prisma.agentTask.update({
        where: { id: task.id },
        data: {
          status: AgentTaskStatus.done,
          finishedAt: new Date(),
          outputRef: `recommendations:${plan.recommendations.length}:${mode}`,
        },
      });
      if (project.autopilotEnabled) {
        await this.applyProposed(organizationId, projectId);
      }
      return { ...(await this.list(organizationId, projectId)), llmMode: mode };
    } catch (err) {
      const details =
        err instanceof OptimizationPlanValidationError
          ? err.details.join('; ')
          : err instanceof Error
            ? err.message
            : 'optimization failed';
      await this.prisma.agentTask.update({
        where: { id: task.id },
        data: {
          status: AgentTaskStatus.failed,
          finishedAt: new Date(),
          error: details,
        },
      });
      throw new BadRequestException({
        message: 'Optimization pipeline failed',
        details,
      });
    }
  }

  async list(organizationId: string, projectId: string) {
    const project = await this.requireProject(organizationId, projectId);
    const lastTask = await this.prisma.agentTask.findFirst({
      where: { projectId, agentType: AgentType.optimization },
      orderBy: { startedAt: 'desc' },
    });
    const recommendations = await this.prisma.optimizationRecommendation.findMany({
      where: { projectId },
      include: { campaign: { select: { externalCampaignId: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const eligibility = evaluateAutopilotEligibility(countRecs(recommendations));
    return {
      task: lastTask,
      llmMode: parseOptimizationLlmMode(lastTask?.outputRef),
      autopilot: project.autopilotEnabled,
      autopilotEnabledAt: project.autopilotEnabledAt,
      eligibility,
      recommendations: recommendations.map((row) => ({
        id: row.id,
        type: row.type,
        status: row.status,
        rationale: row.rationale,
        evidence: row.evidenceJson,
        action: row.actionJson,
        error: row.error,
        appliedBy: row.appliedBy,
        campaignExternalId: row.campaign.externalCampaignId,
        createdAt: row.createdAt,
        decidedAt: row.decidedAt,
        appliedAt: row.appliedAt,
      })),
    };
  }

  async setAutopilot(
    organizationId: string,
    projectId: string,
    enabled: boolean,
    confirm?: boolean,
  ) {
    const project = await this.requireProject(organizationId, projectId);
    if (!enabled) {
      await this.prisma.project.update({
        where: { id: projectId },
        data: { autopilotEnabled: false },
      });
      await this.prisma.agentTask.create({
        data: {
          projectId,
          agentType: AgentType.optimization,
          status: AgentTaskStatus.done,
          startedAt: new Date(),
          finishedAt: new Date(),
          inputRef: 'autopilot:off',
          outputRef: 'autopilot:off',
        },
      });
      return this.list(organizationId, projectId);
    }
    if (confirm !== true) {
      throw new BadRequestException(
        'Confirm autopilot explicitly: it will apply pause/budget/negatives without another click',
      );
    }
    const recs = await this.prisma.optimizationRecommendation.findMany({
      where: { projectId },
    });
    const eligibility = evaluateAutopilotEligibility(countRecs(recs));
    if (!eligibility.eligible) {
      throw new BadRequestException({
        message: 'Autopilot is not eligible yet',
        details: eligibility.reasons,
      });
    }
    await this.prisma.project.update({
      where: { id: project.id },
      data: { autopilotEnabled: true, autopilotEnabledAt: new Date() },
    });
    await this.prisma.agentTask.create({
      data: {
        projectId,
        agentType: AgentType.optimization,
        status: AgentTaskStatus.done,
        startedAt: new Date(),
        finishedAt: new Date(),
        inputRef: 'autopilot:on',
        outputRef: 'autopilot:on',
      },
    });
    return this.list(organizationId, projectId);
  }

  async approve(organizationId: string, projectId: string, recId: string) {
    const rec = await this.requireRec(organizationId, projectId, recId);
    if (rec.status !== OptimizationRecStatus.proposed) {
      throw new BadRequestException('Only proposed recommendations can be approved');
    }
    await this.prisma.optimizationRecommendation.update({
      where: { id: rec.id },
      data: {
        status: OptimizationRecStatus.approved,
        decidedAt: new Date(),
      },
    });
    return this.list(organizationId, projectId);
  }

  async reject(organizationId: string, projectId: string, recId: string) {
    const rec = await this.requireRec(organizationId, projectId, recId);
    if (
      rec.status !== OptimizationRecStatus.proposed &&
      rec.status !== OptimizationRecStatus.approved
    ) {
      throw new BadRequestException('This recommendation cannot be rejected');
    }
    await this.prisma.optimizationRecommendation.update({
      where: { id: rec.id },
      data: {
        status: OptimizationRecStatus.rejected,
        decidedAt: new Date(),
      },
    });
    return this.list(organizationId, projectId);
  }

  async apply(
    organizationId: string,
    projectId: string,
    recId: string,
    source: 'user' | 'autopilot' = 'user',
    userId?: string | null,
  ) {
    const rec = await this.requireRec(organizationId, projectId, recId);
    if (source === 'autopilot') {
      if (
        rec.status !== OptimizationRecStatus.proposed &&
        rec.status !== OptimizationRecStatus.approved &&
        rec.status !== OptimizationRecStatus.failed
      ) {
        throw new BadRequestException('This recommendation cannot be auto-applied');
      }
    } else if (
      rec.status !== OptimizationRecStatus.approved &&
      rec.status !== OptimizationRecStatus.failed
    ) {
      throw new BadRequestException(
        'Approve the recommendation before applying it to the cabinet',
      );
    }
    await this.applyOne(organizationId, projectId, rec, source, userId);
    return this.list(organizationId, projectId);
  }

  private async applyProposed(organizationId: string, projectId: string) {
    const recs = await this.prisma.optimizationRecommendation.findMany({
      where: { projectId, status: OptimizationRecStatus.proposed },
      include: { campaign: true },
    });
    for (const rec of recs) {
      try {
        await this.applyOne(organizationId, projectId, rec, 'autopilot');
      } catch (err) {
        this.log.warn(
          err instanceof Error ? err.message : 'autopilot apply failed',
        );
      }
    }
  }

  async runAutopilotProjects() {
    const projects = await this.prisma.project.findMany({
      where: { autopilotEnabled: true },
      select: { id: true, organizationId: true },
    });
    for (const project of projects) {
      try {
        await this.run(project.organizationId, project.id);
      } catch (err) {
        this.log.warn(
          err instanceof Error ? err.message : 'autopilot run failed',
        );
      }
    }
  }

  private async applyOne(
    organizationId: string,
    projectId: string,
    rec: {
      id: string;
      campaignId: string;
      type: OptimizationRecType;
      actionJson: unknown;
      campaign: { externalCampaignId: string };
    },
    source: 'user' | 'autopilot',
    userId?: string | null,
  ) {
    const project = await this.requireProject(organizationId, projectId);
    const cred = await this.prisma.adPlatformCredential.findFirst({
      where: { projectId, platform: project.primaryPlatform },
    });
    if (!cred) {
      throw new BadRequestException('Connect the ad account first');
    }
    const connector = this.connectors.forPlatform(project.primaryPlatform);
    const auth = {
      accessToken: decryptSecret(
        cred.accessTokenEncrypted,
        parseTokenEncryptionKey(
          this.config.get<string>('TOKEN_ENCRYPTION_KEY'),
        ),
      ),
      clientLogin: cred.externalAccountId ?? undefined,
      projectId,
    };
    const action = rec.actionJson as OptimizationAction;
    const actor =
      source === 'autopilot' ? AdWriteActor.autopilot : AdWriteActor.user;
    const write = <T>(
      writeAction: AdWriteAction,
      summary: unknown,
      fn: () => Promise<T>,
    ) =>
      this.audit.wrapWrite(
        {
          organizationId,
          projectId,
          userId: actor === AdWriteActor.user ? userId ?? null : null,
          actor,
          action: writeAction,
          platform: project.primaryPlatform,
          summary,
        },
        fn,
      );
    try {
      if (rec.type === OptimizationRecType.pause_campaign) {
        await write(
          AdWriteAction.pause_campaign,
          { externalCampaignId: rec.campaign.externalCampaignId },
          () =>
            connector.pauseCampaign(
              projectId,
              rec.campaign.externalCampaignId,
              auth,
            ),
        );
        await this.prisma.campaign.update({
          where: { id: rec.campaignId },
          data: { status: LiveCampaignStatus.paused },
        });
      } else if (rec.type === OptimizationRecType.reduce_budget) {
        if (!action.budget_daily) {
          throw new Error('budget_daily is missing');
        }
        await write(
          AdWriteAction.set_budget,
          {
            externalCampaignId: rec.campaign.externalCampaignId,
            budget_daily: action.budget_daily,
          },
          () =>
            connector.setBudget(
              projectId,
              rec.campaign.externalCampaignId,
              action.budget_daily,
              auth,
            ),
        );
        await this.prisma.campaign.update({
          where: { id: rec.campaignId },
          data: { budget: action.budget_daily },
        });
      } else if (rec.type === OptimizationRecType.add_negative) {
        const phrases = action.negative_phrases ?? [];
        await write(
          AdWriteAction.add_negative_keywords,
          {
            scope: 'campaign',
            externalCampaignId: rec.campaign.externalCampaignId,
            count: phrases.length,
          },
          () =>
            connector.addNegativeKeywords(
              projectId,
              { type: 'campaign', id: rec.campaign.externalCampaignId },
              phrases,
              auth,
            ),
        );
      }
      await this.prisma.optimizationRecommendation.update({
        where: { id: rec.id },
        data: {
          status: OptimizationRecStatus.applied,
          appliedAt: new Date(),
          decidedAt: new Date(),
          appliedBy: source,
          error: null,
        },
      });
    } catch (err) {
      await this.alerts.recordIfRateLimited(organizationId, projectId, err);
      const details = err instanceof Error ? err.message : 'apply failed';
      await this.prisma.optimizationRecommendation.update({
        where: { id: rec.id },
        data: { status: OptimizationRecStatus.failed, error: details },
      });
      throw new BadRequestException({
        message: details,
        details,
      });
    }
  }

  private async loadSearchTerms(
    projectId: string,
    platform: Parameters<ConnectorRouter['forPlatform']>[0],
    period: { from: string; to: string },
    campaignIds: string[],
  ) {
    const cred = await this.prisma.adPlatformCredential.findFirst({
      where: { projectId, platform },
    });
    if (!cred) return [];
    const connector = this.connectors.forPlatform(platform);
    try {
      return await connector.getSearchTerms(
        projectId,
        { ...period, campaignIds },
        {
          accessToken: decryptSecret(
            cred.accessTokenEncrypted,
            parseTokenEncryptionKey(
              this.config.get<string>('TOKEN_ENCRYPTION_KEY'),
            ),
          ),
          clientLogin: cred.externalAccountId ?? undefined,
          projectId,
        },
      );
    } catch {
      return [];
    }
  }

  private async requireRec(
    organizationId: string,
    projectId: string,
    recId: string,
  ) {
    await this.requireProject(organizationId, projectId);
    const rec = await this.prisma.optimizationRecommendation.findFirst({
      where: { id: recId, projectId },
      include: { campaign: true },
    });
    if (!rec) {
      throw new NotFoundException('Recommendation not found');
    }
    return rec;
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

function parsePeriod(): { from: string; to: string } {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

function parseOptimizationLlmMode(
  outputRef: string | null | undefined,
): OptimizationLlmMode | null {
  if (!outputRef) return null;
  if (outputRef.endsWith(':anthropic')) return 'anthropic';
  if (outputRef.endsWith(':heuristic')) return 'heuristic';
  if (outputRef.startsWith('recommendations:')) return 'heuristic';
  return null;
}

function countRecs(
  rows: Array<{ status: OptimizationRecStatus }>,
): {
  applied: number;
  rejected: number;
  failed: number;
  proposed: number;
  approved: number;
} {
  const stats = {
    applied: 0,
    rejected: 0,
    failed: 0,
    proposed: 0,
    approved: 0,
  };
  for (const row of rows) {
    if (row.status === OptimizationRecStatus.applied) stats.applied += 1;
    else if (row.status === OptimizationRecStatus.rejected) stats.rejected += 1;
    else if (row.status === OptimizationRecStatus.failed) stats.failed += 1;
    else if (row.status === OptimizationRecStatus.proposed) stats.proposed += 1;
    else if (row.status === OptimizationRecStatus.approved) stats.approved += 1;
  }
  return stats;
}
