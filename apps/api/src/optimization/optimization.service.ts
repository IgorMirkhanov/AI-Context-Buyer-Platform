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
  CampaignSource,
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
  optimizationComparePeriods,
  nextOptimizationAfterRun,
  initialOptimizationNextRun,
  isOptimizationDue,
  type AdGroupPerfInput,
} from '@context-buyer/agents';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectorRouter } from '../connectors/connector-router';
import { AlertsService } from '../alerts/alerts.service';
import { AuditService } from '../audit/audit.service';
import { PipelineQueue } from '../pipeline/pipeline.queue';
import { ProjectBriefPayload } from '../briefs/brief.schema';
import { AiProviderService } from '../ai-provider/ai-provider.service';
import {
  LLM_SPEND_CAP_REACHED,
  LlmSpendCapReachedError,
} from '../ai-provider/llm-spend-cap';
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
    this.queue.register('optimization_scan', async () => {
      await this.scanDueOptimizationProjects();
    });
    this.queue.register('optimization_run', async (job) => {
      if (!job.organizationId || !job.projectId) {
        throw new Error('optimization_run job is missing organizationId/projectId');
      }
      await this.runScheduled(job.organizationId, job.projectId, 'scheduled');
    });
    const autopilotMs = Number(this.config.get('AUTOPILOT_POLL_MS') ?? 0);
    await this.queue.schedule('autopilot', autopilotMs);
    const scanMs = Number(
      this.config.get('OPTIMIZATION_SCAN_MS') ?? 6 * 60 * 60 * 1000,
    );
    await this.queue.schedule('optimization_scan', scanMs);
  }

  async scheduleOnLaunch(organizationId: string, projectId: string) {
    const project = await this.requireProject(organizationId, projectId);
    const now = new Date();
    const launchedAt = project.optimizationLaunchedAt ?? now;
    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        optimizationLaunchedAt: launchedAt,
        optimizationNextRunAt: initialOptimizationNextRun(launchedAt),
      },
    });
    await this.queue.enqueueBackground({
      kind: 'optimization_run',
      organizationId,
      projectId,
    });
  }

  async scanDueOptimizationProjects() {
    const now = new Date();
    const projects = await this.prisma.project.findMany({
      where: {
        optimizationLaunchedAt: { not: null },
        campaigns: { some: { source: CampaignSource.platform } },
      },
      select: {
        id: true,
        organizationId: true,
        optimizationLaunchedAt: true,
        optimizationNextRunAt: true,
      },
    });
    for (const project of projects) {
      if (
        !isOptimizationDue(
          project.optimizationLaunchedAt,
          project.optimizationNextRunAt,
          now,
        )
      ) {
        continue;
      }
      try {
        await this.queue.enqueueBackground({
          kind: 'optimization_run',
          organizationId: project.organizationId,
          projectId: project.id,
        });
      } catch (err) {
        this.log.warn(
          err instanceof Error
            ? err.message
            : 'optimization_scan enqueue failed',
        );
      }
    }
  }

  async runScheduled(
    organizationId: string,
    projectId: string,
    trigger: 'launch' | 'scheduled',
  ) {
    const project = await this.requireProject(organizationId, projectId);
    const previousLastRunAt = project.optimizationLastRunAt;
    const launchedAt = project.optimizationLaunchedAt;
    if (!launchedAt) {
      return null;
    }
    try {
      const result = await this.runCore(organizationId, projectId, trigger);
      await this.prisma.project.update({
        where: { id: projectId },
        data: {
          optimizationLastRunAt: new Date(),
          optimizationNextRunAt: nextOptimizationAfterRun(
            launchedAt,
            previousLastRunAt,
            new Date(),
          ),
        },
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'optimization failed';
      if (/snapshots first|Collect performance/i.test(message)) {
        await this.prisma.project.update({
          where: { id: projectId },
          data: {
            optimizationNextRunAt: nextOptimizationAfterRun(
              launchedAt,
              previousLastRunAt,
              new Date(),
            ),
          },
        });
        this.log.warn(
          `optimization skipped for ${projectId} (no snapshots yet): ${message}`,
        );
        return null;
      }
      throw err;
    }
  }

  async run(organizationId: string, projectId: string) {
    return this.runCore(organizationId, projectId, 'manual');
  }

  private async runCore(
    organizationId: string,
    projectId: string,
    trigger: 'manual' | 'launch' | 'scheduled',
  ) {
    const credentials = await this.ai.tryResolveOptional(organizationId);
    const project = await this.requireProject(organizationId, projectId);
    const campaigns = await this.prisma.campaign.findMany({
      where: { projectId, source: CampaignSource.platform },
    });
    if (campaigns.length === 0) {
      throw new BadRequestException(
        'Сначала опубликуйте кампанию на вкладке «Кампания»',
      );
    }
    const periods = optimizationComparePeriods();
    const snapshots = await this.prisma.performanceSnapshot.findMany({
      where: {
        projectId,
        date: {
          gte: new Date(`${periods.prior.from}T00:00:00.000Z`),
          lte: new Date(`${periods.current.to}T00:00:00.000Z`),
        },
      },
    });
    const currentSnapshots = snapshots.filter(
      (row) =>
        row.date.toISOString().slice(0, 10) >= periods.current.from &&
        row.date.toISOString().slice(0, 10) <= periods.current.to,
    );
    if (currentSnapshots.length === 0) {
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
      const rows = currentSnapshots
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

    const adGroups = buildAdGroupInputs(
      campaigns,
      snapshots,
      periods.current,
      periods.prior,
    );

    const searchTerms = await this.loadSearchTerms(
      projectId,
      project.primaryPlatform,
      periods.current,
      campaigns.map((item) => item.externalCampaignId),
    );

    const task = await this.prisma.agentTask.create({
      data: {
        projectId,
        agentType: AgentType.optimization,
        status: AgentTaskStatus.running,
        startedAt: new Date(),
        inputRef: `${trigger}:${periods.current.from}:${periods.current.to}`,
      },
    });

    try {
      const { writer, mode } = resolveOptimizationLlm({
        apiKey: credentials?.apiKey ?? null,
        provider: credentials?.provider ?? null,
        onFallback: (message) => this.log.warn(message),
      });
      if (mode !== 'heuristic') {
        await this.ai.assertWithinMonthlyCap(organizationId);
      }
      const plan = await buildOptimizationPlan(
        {
          period: periods.current,
          priorPeriod: periods.prior,
          targetCpl,
          campaigns: campaignInputs,
          searchTerms,
          adGroups,
        },
        writer,
      );
      const wrapSample = plan.recommendations[0]?.rationale ?? '';
      await this.prisma.llmCallLog.create({
        data: {
          projectId,
          agentType: AgentType.optimization,
          step: 'wrap_rationale',
          model: mode === 'heuristic' ? 'heuristic' : mode,
          prompt: JSON.stringify(plan.recommendations.map((item) => item.evidence)),
          response: plan.recommendations.map((item) => item.rationale).join('\n'),
          inputTokens: Math.ceil(wrapSample.length / 4),
          outputTokens: Math.ceil(wrapSample.length / 4),
          costUsd: resolveLlmCostUsd({
            model: mode === 'heuristic' ? 'heuristic' : mode,
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
        err instanceof LlmSpendCapReachedError
          ? LLM_SPEND_CAP_REACHED
          : err instanceof OptimizationPlanValidationError
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
      if (err instanceof LlmSpendCapReachedError) {
        throw new BadRequestException({
          message: err.uiMessage,
          details: LLM_SPEND_CAP_REACHED,
        });
      }
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
      optimizationLaunchedAt: project.optimizationLaunchedAt,
      optimizationLastRunAt: project.optimizationLastRunAt,
      optimizationNextRunAt: project.optimizationNextRunAt,
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

function buildAdGroupInputs(
  campaigns: Array<{ id: string; externalCampaignId: string }>,
  snapshots: Array<{
    campaignId: string;
    adGroupExternalId: string;
    adGroupName: string | null;
    date: Date;
    impressions: number;
    clicks: number;
    spend: unknown;
    conversions: number;
  }>,
  current: { from: string; to: string },
  prior: { from: string; to: string },
): AdGroupPerfInput[] {
  const externalByCampaignId = new Map(
    campaigns.map((item) => [item.id, item.externalCampaignId]),
  );
  const groups = new Map<
    string,
    {
      campaignId: string;
      externalCampaignId: string;
      adGroupExternalId: string;
      adGroupName: string;
      currentRows: Parameters<typeof aggregateMetrics>[0];
      priorRows: Parameters<typeof aggregateMetrics>[0];
    }
  >();

  for (const row of snapshots) {
    if (!externalByCampaignId.has(row.campaignId)) continue;
    if (!row.adGroupExternalId) continue;
    const key = `${row.campaignId}:${row.adGroupExternalId}`;
    const date = row.date.toISOString().slice(0, 10);
    let bucket = groups.get(key);
    if (!bucket) {
      bucket = {
        campaignId: row.campaignId,
        externalCampaignId: externalByCampaignId.get(row.campaignId)!,
        adGroupExternalId: row.adGroupExternalId,
        adGroupName: row.adGroupName ?? row.adGroupExternalId,
        currentRows: [],
        priorRows: [],
      };
      groups.set(key, bucket);
    }
    const daily = {
      date,
      impressions: row.impressions,
      clicks: row.clicks,
      spend: Number(row.spend),
      conversions: row.conversions,
    };
    if (date >= current.from && date <= current.to) {
      bucket.currentRows.push(daily);
    } else if (date >= prior.from && date <= prior.to) {
      bucket.priorRows.push(daily);
    }
  }

  return [...groups.values()].map((group) => ({
    campaignId: group.campaignId,
    externalCampaignId: group.externalCampaignId,
    adGroupExternalId: group.adGroupExternalId,
    adGroupName: group.adGroupName,
    current: aggregateMetrics(group.currentRows),
    prior: aggregateMetrics(group.priorRows),
  }));
}

function parseOptimizationLlmMode(
  outputRef: string | null | undefined,
): OptimizationLlmMode | null {
  if (!outputRef) return null;
  if (outputRef.endsWith(':anthropic')) return 'anthropic';
  if (outputRef.endsWith(':groq')) return 'groq';
  if (outputRef.endsWith(':gemini')) return 'gemini';
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
