import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AdPlatform,
  AdWriteAction,
  AdWriteActor,
  AgentTaskStatus,
  AgentType,
  CampaignDraftStatus,
  IssueLevel,
  LiveCampaignStatus,
} from '@prisma/client';
import {
  buildCampaignDraft,
  CampaignDraftStructure,
  CampaignDraftUnit,
  CampaignDraftValidationError,
  normalizeCampaignDraft,
  PublishCheckpoint,
  validateCampaignDraft,
} from '@context-buyer/agents';
import { CampaignPlan } from '@context-buyer/agents';
import { PlatformApiError } from '@context-buyer/connectors';
import { ConnectorRouter } from '../connectors/connector-router';
import { PrismaService } from '../prisma/prisma.service';
import { AlertsService } from '../alerts/alerts.service';
import { AuditService } from '../audit/audit.service';
import { ProjectBriefPayload } from '../briefs/brief.schema';
import {
  decryptSecret,
  parseTokenEncryptionKey,
} from '../security/token-encryption';
import { OptimizationService } from '../optimization/optimization.service';

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly connectors: ConnectorRouter,
    private readonly alerts: AlertsService,
    private readonly audit: AuditService,
    private readonly optimization: OptimizationService,
  ) {}

  async build(organizationId: string, projectId: string) {
    const project = await this.requireProject(organizationId, projectId);
    const [briefRow, clusters, creatives, criticalCount, planRow] =
      await Promise.all([
      this.prisma.projectBrief.findFirst({
        where: { projectId },
        orderBy: { version: 'desc' },
      }),
      this.prisma.semanticCluster.findMany({
        where: { projectId },
        include: { keywords: true },
      }),
      this.prisma.adCreative.findMany({ where: { projectId } }),
      this.prisma.validationIssue.count({
        where: { projectId, level: IssueLevel.critical },
      }),
      this.prisma.projectCampaignPlan.findUnique({ where: { projectId } }),
    ]);
    if (!briefRow) {
      throw new BadRequestException('Project brief is missing');
    }
    if (clusters.length === 0) {
      throw new BadRequestException('Run Semantic Agent first');
    }
    if (creatives.length === 0) {
      throw new BadRequestException('Run Copywriting Agent first');
    }
    if (criticalCount > 0) {
      throw new BadRequestException(
        'Fix critical validation issues before building a campaign draft',
      );
    }
    if (!planRow?.approved) {
      throw new BadRequestException(
        'Сначала утвердите план кампаний на вкладке «План»',
      );
    }

    const task = await this.prisma.agentTask.create({
      data: {
        projectId,
        agentType: AgentType.campaign_builder,
        status: AgentTaskStatus.running,
        startedAt: new Date(),
      },
    });

    try {
      const payload = briefRow.payloadJson as ProjectBriefPayload;
      const structure = buildCampaignDraft(
        {
          projectName: project.name,
          websiteUrl: payload.project.website_url || project.websiteUrl || '',
          geo: payload.project.geo,
          budgetDaily: payload.project.budget.daily,
          currency: payload.project.budget.currency,
          global_negatives: payload.exclusions.global_negative_keywords,
          clusters: this.toClusters(clusters, creatives),
        },
        planRow.planJson as CampaignPlan,
      );
      const draft = await this.prisma.campaignDraft.create({
        data: {
          projectId,
          structureJson: structure as object,
          status: CampaignDraftStatus.pending_approval,
        },
      });
      await this.prisma.agentTask.update({
        where: { id: task.id },
        data: {
          status: AgentTaskStatus.done,
          finishedAt: new Date(),
          outputRef: draft.id,
        },
      });
      return this.getResult(organizationId, projectId);
    } catch (err) {
      const details =
        err instanceof CampaignDraftValidationError
          ? err.details.join('; ')
          : err instanceof Error
            ? err.message
            : 'campaign builder failed';
      await this.prisma.agentTask.update({
        where: { id: task.id },
        data: {
          status: AgentTaskStatus.failed,
          finishedAt: new Date(),
          error: details,
        },
      });
      throw new BadRequestException({
        message: 'Campaign builder failed',
        details,
      });
    }
  }

  async getResult(organizationId: string, projectId: string) {
    await this.requireProject(organizationId, projectId);
    const [draft, campaigns, task] = await Promise.all([
      this.prisma.campaignDraft.findFirst({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.campaign.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.agentTask.findFirst({
        where: { projectId, agentType: AgentType.campaign_builder },
        orderBy: { startedAt: 'desc' },
      }),
    ]);
    return { task, draft, campaigns };
  }

  async updateDraft(
    organizationId: string,
    projectId: string,
    structure: unknown,
  ) {
    await this.requireProject(organizationId, projectId);
    const draft = await this.prisma.campaignDraft.findFirst({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
    if (!draft) {
      throw new NotFoundException('Campaign draft not found');
    }
    if (draft.status === CampaignDraftStatus.publishing) {
      throw new BadRequestException('Draft is publishing');
    }
    try {
      const normalized = normalizeCampaignDraft(structure);
      validateCampaignDraft(normalized);
      await this.prisma.campaignDraft.update({
        where: { id: draft.id },
        data: {
          structureJson: normalized as object,
          status: CampaignDraftStatus.pending_approval,
        },
      });
      return this.getResult(organizationId, projectId);
    } catch (err) {
      const details =
        err instanceof CampaignDraftValidationError
          ? err.details.join('; ')
          : 'invalid campaign_draft';
      throw new BadRequestException({ message: 'Invalid draft', details });
    }
  }

  /**
   * Реальная запись в кабинет. Вызывать только из явного UI-действия.
   * Частичный сбой: кампания остаётся на паузе, checkpoint сохраняется,
   * повторный publish продолжает с последнего успешного шага.
   */
  async publish(organizationId: string, projectId: string, userId: string) {
    const project = await this.requireProject(organizationId, projectId);
    const draft = await this.prisma.campaignDraft.findFirst({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
    if (!draft) {
      throw new NotFoundException('Campaign draft not found');
    }
    const structure = normalizeCampaignDraft(draft.structureJson);
    try {
      validateCampaignDraft(structure);
    } catch {
      throw new BadRequestException('Campaign draft is invalid');
    }

    const critical = await this.prisma.validationIssue.count({
      where: { projectId, level: IssueLevel.critical },
    });
    if (critical > 0) {
      throw new BadRequestException(
        'Fix critical validation issues before publishing',
      );
    }

    const cred = await this.prisma.adPlatformCredential.findFirst({
      where: { projectId, platform: project.primaryPlatform },
    });
    if (!cred) {
      throw new BadRequestException(
        project.primaryPlatform === AdPlatform.google_ads
          ? 'Connect Google Ads first'
          : 'Connect Yandex Direct first',
      );
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

    await this.prisma.campaignDraft.update({
      where: { id: draft.id },
      data: { status: CampaignDraftStatus.publishing },
    });

    const write = <T>(
      action: AdWriteAction,
      summary: unknown,
      fn: () => Promise<T>,
      actor: AdWriteActor = AdWriteActor.user,
    ) =>
      this.audit.wrapWrite(
        {
          organizationId,
          projectId,
          userId: actor === AdWriteActor.user ? userId : null,
          actor,
          action,
          platform: project.primaryPlatform,
          summary,
        },
        fn,
      );

    try {
      for (let unitIndex = 0; unitIndex < structure.campaigns.length; unitIndex++) {
        const unit = structure.campaigns[unitIndex];
        if (unit.publish?.step === 'done' && unit.publish.externalCampaignId) {
          const existing = await this.prisma.campaign.findFirst({
            where: {
              projectId,
              draftId: draft.id,
              externalCampaignId: unit.publish.externalCampaignId,
            },
          });
          if (existing) continue;
        }
        const externalCampaignId = await this.publishUnit(
          draft.id,
          structure,
          unitIndex,
          unit,
          connector,
          auth,
          write,
          organizationId,
          projectId,
          project.primaryPlatform,
        );
        await this.prisma.campaign.create({
          data: {
            projectId,
            draftId: draft.id,
            externalCampaignId,
            platform: project.primaryPlatform,
            status: LiveCampaignStatus.paused,
            budget: unit.campaign.budget_daily,
            targetingJson: {
              geo: unit.campaign.geo,
              initial_status: 'paused',
              campaignName: unit.campaign.name,
              draftUnitIndex: unitIndex,
            },
          },
        });
      }
      await this.prisma.campaignDraft.update({
        where: { id: draft.id },
        data: { status: CampaignDraftStatus.published },
      });
      await this.optimization.scheduleOnLaunch(organizationId, projectId);
      return this.getResult(organizationId, projectId);
    } catch (err) {
      await this.alerts.recordIfRateLimited(organizationId, projectId, err);
      const details =
        err instanceof PlatformApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'publish failed';
      const step = err instanceof PlatformApiError ? err.step : undefined;
      throw new BadRequestException({
        message: details,
        step,
        details: err instanceof PlatformApiError ? err.details : details,
        compensation:
          'Кампания (если успела создаться) оставлена на паузе. Повтор «Запустить» продолжит с последнего успешного шага, без дубля кампании.',
      });
    }
  }

  private async publishUnit(
    draftId: string,
    structure: CampaignDraftStructure,
    unitIndex: number,
    unit: CampaignDraftUnit,
    connector: ReturnType<ConnectorRouter['forPlatform']>,
    auth: { accessToken: string; clientLogin?: string; projectId: string },
    write: <T>(
      action: AdWriteAction,
      summary: unknown,
      fn: () => Promise<T>,
      actor?: AdWriteActor,
    ) => Promise<T>,
    organizationId: string,
    projectId: string,
    platform: AdPlatform,
  ): Promise<string> {
    const connectorDraft = {
      campaign: unit.campaign,
      ad_groups: unit.ad_groups,
      global_negatives: structure.global_negatives,
      publish: unit.publish,
    };
    const checkpoint: PublishCheckpoint =
      connectorDraft.publish ?? { step: 'idle' };
    try {
      if (!checkpoint.externalCampaignId) {
        checkpoint.step = 'createCampaign';
        checkpoint.externalCampaignId = await write(
          AdWriteAction.create_campaign,
          { name: connectorDraft.campaign.name },
          () => connector.createCampaign(projectId, connectorDraft, auth),
        );
        await this.saveCheckpoint(draftId, structure, checkpoint, unitIndex);
      }

      checkpoint.step = 'setBudget';
      await write(
        AdWriteAction.set_budget,
        {
          externalCampaignId: checkpoint.externalCampaignId,
          budget_daily: connectorDraft.campaign.budget_daily,
        },
        () =>
          connector.setBudget(
            projectId,
            checkpoint.externalCampaignId as string,
            connectorDraft.campaign.budget_daily,
            auth,
          ),
      );
      await this.saveCheckpoint(draftId, structure, checkpoint, unitIndex);

      if (!checkpoint.adGroups) {
        checkpoint.adGroups = connectorDraft.ad_groups.map((group) => ({
          name: group.name,
        }));
      }
      const missing = checkpoint.adGroups.filter((item) => !item.externalId);
      if (missing.length > 0) {
        checkpoint.step = 'createAdGroups';
        const ids = await write(
          AdWriteAction.create_ad_groups,
          {
            externalCampaignId: checkpoint.externalCampaignId,
            names: missing.map((item) => item.name),
          },
          () =>
            connector.createAdGroups(
              projectId,
              checkpoint.externalCampaignId as string,
              missing.map((item) => ({
                name: item.name,
                geo: connectorDraft.campaign.geo,
              })),
              auth,
            ),
        );
        missing.forEach((item, index) => {
          item.externalId = ids[index];
        });
        await this.saveCheckpoint(draftId, structure, checkpoint, unitIndex);
      }

      for (const [index, group] of connectorDraft.ad_groups.entries()) {
        const state = checkpoint.adGroups[index];
        if (!state?.externalId) {
          throw new Error(`Ad group "${group.name}" was not created`);
        }
        if (!state.adsCreated) {
          checkpoint.step = 'createAds';
          await write(
            AdWriteAction.create_ads,
            { adGroupId: state.externalId, count: group.ads.length },
            () =>
              connector.createAds(
                projectId,
                state.externalId as string,
                group.ads,
                auth,
              ),
          );
          state.adsCreated = true;
          await this.saveCheckpoint(draftId, structure, checkpoint, unitIndex);
        }
        if (!state.keywordsAdded) {
          checkpoint.step = 'addKeywords';
          await write(
            AdWriteAction.add_keywords,
            { adGroupId: state.externalId, count: group.keywords.length },
            () =>
              connector.addKeywords(
                projectId,
                state.externalId as string,
                group.keywords,
                auth,
              ),
          );
          state.keywordsAdded = true;
          await this.saveCheckpoint(draftId, structure, checkpoint, unitIndex);
        }
        if (!state.negativesAdded) {
          checkpoint.step = 'addNegativeKeywords';
          await write(
            AdWriteAction.add_negative_keywords,
            {
              scope: 'ad_group',
              adGroupId: state.externalId,
              count: group.negative_keywords.length,
            },
            () =>
              connector.addNegativeKeywords(
                projectId,
                { type: 'ad_group', id: state.externalId },
                group.negative_keywords,
                auth,
              ),
          );
          state.negativesAdded = true;
          await this.saveCheckpoint(draftId, structure, checkpoint, unitIndex);
        }
      }

      checkpoint.step = 'addNegativeKeywords';
      await write(
        AdWriteAction.add_negative_keywords,
        {
          scope: 'campaign',
          externalCampaignId: checkpoint.externalCampaignId,
          count: structure.global_negatives.length,
        },
        () =>
          connector.addNegativeKeywords(
            projectId,
            { type: 'campaign', id: checkpoint.externalCampaignId },
            structure.global_negatives,
            auth,
          ),
      );

      checkpoint.step = 'done';
      checkpoint.error = undefined;
      await this.saveCheckpoint(draftId, structure, checkpoint, unitIndex);
      const externalCampaignId = checkpoint.externalCampaignId;
      if (!externalCampaignId) {
        throw new Error('Campaign was not created');
      }
      return externalCampaignId;
    } catch (err) {
      await this.alerts.recordIfRateLimited(organizationId, projectId, err);
      const details =
        err instanceof PlatformApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'publish failed';
      checkpoint.error = details;
      structure.campaigns[unitIndex].publish = checkpoint;
      if (checkpoint.externalCampaignId) {
        await write(
          AdWriteAction.pause_campaign,
          {
            reason: 'compensation',
            externalCampaignId: checkpoint.externalCampaignId,
          },
          () =>
            connector.ensurePaused(
              projectId,
              checkpoint.externalCampaignId as string,
              auth,
            ),
          AdWriteActor.system,
        ).catch(() => undefined);
      }
      await this.prisma.campaignDraft.update({
        where: { id: draftId },
        data: {
          status: CampaignDraftStatus.failed,
          structureJson: structure as object,
        },
      });
      throw err;
    }
  }

  private async saveCheckpoint(
    draftId: string,
    structure: CampaignDraftStructure,
    checkpoint: PublishCheckpoint,
    campaignIndex = 0,
  ) {
    if (!structure.campaigns[campaignIndex]) {
      throw new Error(`Campaign unit ${campaignIndex} is missing in draft`);
    }
    structure.campaigns[campaignIndex].publish = checkpoint;
    await this.prisma.campaignDraft.update({
      where: { id: draftId },
      data: { structureJson: structure as object },
    });
  }

  private toClusters(
    clusters: Array<{
      id: string;
      name: string;
      keywords: Array<{ phrase: string; isNegative: boolean }>;
    }>,
    creatives: Array<{
      id: string;
      clusterId: string;
      type: string;
      text: string;
      abGroup: string;
    }>,
  ) {
    return clusters.map((cluster) => {
      const rows = creatives.filter((item) => item.clusterId === cluster.id);
      const groups = new Map<string, typeof rows>();
      for (const row of rows) {
        const list = groups.get(row.abGroup) ?? [];
        list.push(row);
        groups.set(row.abGroup, list);
      }
      const ads = [...groups.entries()].map(([abGroup, items]) => ({
        ab_group: abGroup,
        creative_ids: items.map((item) => item.id),
        headline1: textOf(items, 'headline1'),
        headline2: textOf(items, 'headline2'),
        description: textOf(items, 'description'),
        sitelinks: items
          .filter((item) => item.type === 'sitelink')
          .map((item) => item.text),
        callouts: items
          .filter((item) => item.type === 'callout')
          .map((item) => item.text),
      }));
      return {
        name: cluster.name,
        keywords: cluster.keywords
          .filter((item) => !item.isNegative)
          .map((item) => item.phrase),
        negative_keywords: cluster.keywords
          .filter((item) => item.isNegative)
          .map((item) => item.phrase),
        ads,
      };
    });
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

function textOf(
  items: Array<{ type: string; text: string }>,
  type: string,
): string {
  return items.find((item) => item.type === type)?.text ?? '';
}
