import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AgentTaskStatus,
  AgentType,
  LiveCampaignStatus,
} from '@prisma/client';
import {
  AnalyticsAdGroupSlice,
  AnalyticsCampaignSlice,
  buildAnalyticsView,
  buildPerformanceReport,
  ChartPoint,
  defaultReportPeriod,
  HeuristicReportingLlm,
  normalizeCampaignDraft,
  PacingForecast,
  PerformanceReport,
  resolveLlmCostUsd,
  Spend7dSummary,
  sumCampaignSpend,
  summarizeLlmUsage,
} from '@context-buyer/agents';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectorRouter } from '../connectors/connector-router';
import { PipelineQueue } from '../pipeline/pipeline.queue';
import { ProjectBriefPayload } from '../briefs/brief.schema';
import {
  decryptSecret,
  parseTokenEncryptionKey,
} from '../security/token-encryption';

@Injectable()
export class ReportsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly connectors: ConnectorRouter,
    private readonly queue: PipelineQueue,
  ) {}

  async onModuleInit() {
    this.queue.register('performance_collect', async () => {
      await this.collectAll();
    });
    const ms = Number(this.config.get('PERFORMANCE_POLL_MS') ?? 60 * 60 * 1000);
    await this.queue.schedule('performance_collect', ms);
  }

  async collectAll() {
    const campaigns = await this.prisma.campaign.findMany({
      where: { status: { not: LiveCampaignStatus.archived } },
    });
    const byProject = new Map<string, typeof campaigns>();
    for (const campaign of campaigns) {
      const list = byProject.get(campaign.projectId) ?? [];
      list.push(campaign);
      byProject.set(campaign.projectId, list);
    }
    let saved = 0;
    for (const [projectId, list] of byProject) {
      saved += await this.collectProject(projectId, list);
    }
    return { projects: byProject.size, snapshots: saved };
  }

  async collectForOrganization(organizationId: string, projectId: string) {
    await this.requireProject(organizationId, projectId);
    const campaigns = await this.prisma.campaign.findMany({
      where: {
        projectId,
        status: { not: LiveCampaignStatus.archived },
      },
    });
    if (campaigns.length === 0) {
      throw new BadRequestException(
        'Сначала опубликуйте кампанию на вкладке «Кампания»',
      );
    }
    const snapshots = await this.collectProject(projectId, campaigns);
    const result = await this.getReport(organizationId, projectId);
    await this.prisma.agentTask.create({
      data: {
        projectId,
        agentType: AgentType.reporting,
        status: AgentTaskStatus.done,
        startedAt: new Date(),
        finishedAt: new Date(),
        outputRef: `snapshots:${snapshots}`,
      },
    });
    await this.prisma.llmCallLog.create({
      data: {
        projectId,
        agentType: AgentType.reporting,
        step: 'wrap_insights',
        model: 'heuristic',
        prompt: JSON.stringify(result.report.metrics),
        response: result.report.insights.join('\n'),
        inputTokens: 0,
        outputTokens: 0,
        costUsd: resolveLlmCostUsd({
          model: 'heuristic',
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
        }),
        latencyMs: 0,
      },
    });
    return result;
  }

  async getReport(
    organizationId: string,
    projectId: string,
    from?: string,
    to?: string,
  ): Promise<{
    report: PerformanceReport;
    series: ChartPoint[];
    campaigns: AnalyticsCampaignSlice[];
    adGroups: AnalyticsAdGroupSlice[];
    pacing: PacingForecast;
    spend7d: Spend7dSummary;
    llmUsage: ReturnType<typeof summarizeLlmUsage>;
  }> {
    await this.requireProject(organizationId, projectId);
    const period = parsePeriod(from, to);
    const period7d = defaultReportPeriod(7);
    const snapshotFrom =
      period.from < period7d.from ? period.from : period7d.from;
    const snapshotTo = period.to > period7d.to ? period.to : period7d.to;
    const [rows, liveCampaigns, brief] = await Promise.all([
      this.prisma.performanceSnapshot.findMany({
        where: {
          projectId,
          date: {
            gte: new Date(`${snapshotFrom}T00:00:00.000Z`),
            lte: new Date(`${snapshotTo}T00:00:00.000Z`),
          },
        },
        orderBy: { date: 'asc' },
      }),
      this.prisma.campaign.findMany({
        where: {
          projectId,
          status: { not: LiveCampaignStatus.archived },
        },
        include: { draft: true },
      }),
      this.prisma.projectBrief.findFirst({
        where: { projectId },
        orderBy: { version: 'desc' },
      }),
    ]);
    const payload = (brief?.payloadJson as ProjectBriefPayload | null) ?? null;
    const targetCpl = payload?.project.target_cpl ?? 0;
    const dailyBudget = payload?.project.budget?.daily ?? null;
    const currency = payload?.project.budget?.currency ?? '';
    const campaignMeta = liveCampaigns.map((campaign) => {
      const targeting = (campaign.targetingJson ?? {}) as {
        campaignName?: string;
        draftUnitIndex?: number;
      };
      return {
        id: campaign.id,
        name:
          targeting.campaignName ??
          nameFromDraft(
            campaign.draft?.structureJson,
            targeting.draftUnitIndex ?? 0,
          ) ??
          `Кампания ${campaign.externalCampaignId}`,
        externalCampaignId: campaign.externalCampaignId,
        status: campaign.status,
      };
    });
    const analytics = buildAnalyticsView({
      snapshots: rows.map((row) => ({
        date: row.date.toISOString().slice(0, 10),
        campaignId: row.campaignId,
        adGroupExternalId: row.adGroupExternalId,
        adGroupName: row.adGroupName ?? undefined,
        impressions: row.impressions,
        clicks: row.clicks,
        spend: Number(row.spend),
        conversions: row.conversions,
      })),
      campaigns: campaignMeta,
      period,
      dailyBudget: dailyBudget != null && dailyBudget > 0 ? dailyBudget : null,
      currency,
    });
    const analytics7d = buildAnalyticsView({
      snapshots: rows.map((row) => ({
        date: row.date.toISOString().slice(0, 10),
        campaignId: row.campaignId,
        adGroupExternalId: row.adGroupExternalId,
        adGroupName: row.adGroupName ?? undefined,
        impressions: row.impressions,
        clicks: row.clicks,
        spend: Number(row.spend),
        conversions: row.conversions,
      })),
      campaigns: campaignMeta,
      period: period7d,
      dailyBudget: null,
      currency,
    });
    const spend7d: Spend7dSummary = {
      amount: sumCampaignSpend(analytics7d.campaigns),
      currency,
      period: period7d,
    };
    const report = buildPerformanceReport(
      analytics.series,
      targetCpl,
      period,
      new HeuristicReportingLlm(),
    );
    const llmRows = await this.prisma.llmCallLog.findMany({
      where: { projectId },
      select: {
        agentType: true,
        inputTokens: true,
        outputTokens: true,
        costUsd: true,
      },
    });
    const llmUsage = summarizeLlmUsage(
      llmRows.map((row) => ({
        agentType: row.agentType,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        costUsd: Number(row.costUsd),
      })),
    );
    return {
      report,
      series: analytics.series,
      campaigns: analytics.campaigns,
      adGroups: analytics.adGroups,
      pacing: analytics.pacing,
      spend7d,
      llmUsage,
    };
  }

  private async collectProject(
    projectId: string,
    campaigns: Array<{ id: string; externalCampaignId: string }>,
  ): Promise<number> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId },
    });
    if (!project) return 0;
    const cred = await this.prisma.adPlatformCredential.findFirst({
      where: { projectId, platform: project.primaryPlatform },
    });
    if (!cred) return 0;
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
    const period = parsePeriod(undefined, undefined, COLLECT_LOOKBACK_DAYS);
    const rows = await connector.getPerformance(
      projectId,
      {
        from: period.from,
        to: period.to,
        campaignIds: campaigns.map((item) => item.externalCampaignId),
      },
      auth,
    );
    const byExternal = new Map(
      campaigns.map((item) => [item.externalCampaignId, item.id]),
    );
    await this.prisma.performanceSnapshot.deleteMany({
      where: {
        campaignId: { in: campaigns.map((item) => item.id) },
        date: {
          gte: new Date(`${period.from}T00:00:00.000Z`),
          lte: new Date(`${period.to}T00:00:00.000Z`),
        },
      },
    });
    let saved = 0;
    for (const row of rows) {
      const campaignId = byExternal.get(row.externalCampaignId);
      if (!campaignId || !row.date) continue;
      const adGroupExternalId = row.adGroupExternalId ?? '';
      await this.prisma.performanceSnapshot.upsert({
        where: {
          campaignId_adGroupExternalId_date: {
            campaignId,
            adGroupExternalId,
            date: new Date(`${row.date}T00:00:00.000Z`),
          },
        },
        create: {
          projectId,
          campaignId,
          adGroupExternalId,
          adGroupName: row.adGroupName ?? null,
          date: new Date(`${row.date}T00:00:00.000Z`),
          impressions: row.impressions,
          clicks: row.clicks,
          ctr: row.ctr,
          cpc: row.cpc,
          conversions: row.conversions,
          cpl: row.cpl,
          spend: row.spend,
        },
        update: {
          adGroupName: row.adGroupName ?? null,
          impressions: row.impressions,
          clicks: row.clicks,
          ctr: row.ctr,
          cpc: row.cpc,
          conversions: row.conversions,
          cpl: row.cpl,
          spend: row.spend,
        },
      });
      saved += 1;
    }
    return saved;
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

const COLLECT_LOOKBACK_DAYS = 90;

function parsePeriod(
  from?: string,
  to?: string,
  days = 7,
): { from: string; to: string } {
  if (from && to) return { from, to };
  return defaultReportPeriod(days);
}

function nameFromDraft(structureJson: unknown, unitIndex = 0): string | null {
  try {
    const structure = normalizeCampaignDraft(structureJson);
    const unit = structure.campaigns[unitIndex] ?? structure.campaigns[0];
    return unit?.campaign?.name?.trim() || null;
  } catch {
    return null;
  }
}
