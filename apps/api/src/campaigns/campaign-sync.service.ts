import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccountCampaignStatus,
} from '@context-buyer/connectors';
import {
  CampaignSource,
  LiveCampaignStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectorRouter } from '../connectors/connector-router';
import {
  PlatformConnectionService,
  verificationCheckFields,
} from '../connectors/platform-connection.service';
import { PipelineQueue } from '../pipeline/pipeline.queue';
import { ReportsService } from '../reports/reports.service';

@Injectable()
export class CampaignSyncService implements OnModuleInit {
  private readonly log = new Logger(CampaignSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly connectors: ConnectorRouter,
    private readonly platformConnection: PlatformConnectionService,
    private readonly queue: PipelineQueue,
    private readonly reports: ReportsService,
  ) {}

  async onModuleInit() {
    this.queue.register('campaign_sync_scan', async () => {
      await this.scanConnectedProjects();
    });
    this.queue.register('campaign_sync_run', async (job) => {
      if (!job.organizationId || !job.projectId) {
        throw new Error('campaign_sync_run job is missing organizationId/projectId');
      }
      await this.syncProject(job.organizationId, job.projectId);
    });
    const ms = Number(
      this.config.get('CAMPAIGN_SYNC_MS') ?? 6 * 60 * 60 * 1000,
    );
    await this.queue.schedule('campaign_sync_scan', ms);
  }

  async scanConnectedProjects() {
    const credentials = await this.prisma.adPlatformCredential.findMany({
      select: {
        projectId: true,
        project: { select: { organizationId: true } },
      },
    });
    for (const cred of credentials) {
      try {
        await this.queue.enqueueBackground({
          kind: 'campaign_sync_run',
          organizationId: cred.project.organizationId,
          projectId: cred.projectId,
        });
      } catch (err) {
        this.log.warn(
          err instanceof Error ? err.message : 'campaign_sync enqueue failed',
        );
      }
    }
    return { projects: credentials.length };
  }

  async syncProject(organizationId: string, projectId: string) {
    const project = await this.requireProject(organizationId, projectId);
    const cred = await this.prisma.adPlatformCredential.findFirst({
      where: { projectId, platform: project.primaryPlatform },
    });
    if (!cred) {
      return { synced: 0, performanceSnapshots: 0 };
    }
    const verification = await this.platformConnection.verifyProjectConnection(
      projectId,
      project.primaryPlatform,
      cred,
    );
    const checkedAt = new Date();
    const verificationFields = verificationCheckFields(verification, checkedAt);
    if (!verification.ok) {
      await this.prisma.adPlatformCredential.update({
        where: {
          projectId_platform: {
            projectId,
            platform: project.primaryPlatform,
          },
        },
        data: verificationFields,
      });
      this.log.warn(
        `campaign_sync skipped for ${projectId}: ${verification.reason}`,
      );
      return { synced: 0, performanceSnapshots: 0, verificationFailed: true };
    }
    await this.prisma.adPlatformCredential.update({
      where: {
        projectId_platform: {
          projectId,
          platform: project.primaryPlatform,
        },
      },
      data: verificationFields,
    });
    const connector = this.connectors.forPlatform(project.primaryPlatform);
    const auth = this.platformConnection.buildAuth(cred, projectId);
    const remote = await connector.fetchAllAccountCampaigns(projectId, auth);
    const remoteIds = new Set(remote.map((item) => item.externalCampaignId));
    let synced = 0;

    for (const row of remote) {
      if (!row.externalCampaignId) continue;
      const existing = await this.prisma.campaign.findUnique({
        where: {
          projectId_externalCampaignId: {
            projectId,
            externalCampaignId: row.externalCampaignId,
          },
        },
      });
      if (existing?.source === CampaignSource.platform) {
        continue;
      }
      const status = mapAccountStatus(row.status);
      const data = {
        platform: project.primaryPlatform,
        source: CampaignSource.external,
        status,
        budget: row.dailyBudget ?? null,
        targetingJson: { campaignName: row.name },
        syncedAt: new Date(),
      };
      if (existing) {
        await this.prisma.campaign.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await this.prisma.campaign.create({
          data: {
            projectId,
            externalCampaignId: row.externalCampaignId,
            ...data,
          },
        });
      }
      synced += 1;
    }

    await this.prisma.campaign.updateMany({
      where: {
        projectId,
        source: CampaignSource.external,
        externalCampaignId: { notIn: [...remoteIds] },
        status: { not: LiveCampaignStatus.archived },
      },
      data: { status: LiveCampaignStatus.archived, syncedAt: new Date() },
    });

    const externalCampaigns = await this.prisma.campaign.findMany({
      where: {
        projectId,
        source: CampaignSource.external,
      },
      select: { id: true, externalCampaignId: true },
    });
    const performanceSnapshots = await this.reports.collectCampaignSnapshots(
      projectId,
      externalCampaigns,
    );
    return { synced, performanceSnapshots };
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

function mapAccountStatus(
  status: AccountCampaignStatus,
): LiveCampaignStatus {
  if (status === 'archived') return LiveCampaignStatus.archived;
  if (status === 'active') return LiveCampaignStatus.active;
  return LiveCampaignStatus.paused;
}
