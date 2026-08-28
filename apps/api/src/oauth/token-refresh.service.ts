import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { tokenNeedsRefresh } from '@context-buyer/connectors';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectorRouter } from '../connectors/connector-router';
import { AlertsService } from '../alerts/alerts.service';
import { PipelineQueue } from '../pipeline/pipeline.queue';
import {
  decryptSecret,
  encryptSecret,
  parseTokenEncryptionKey,
} from '../security/token-encryption';

@Injectable()
export class TokenRefreshService implements OnModuleInit {
  private readonly log = new Logger(TokenRefreshService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly connectors: ConnectorRouter,
    private readonly alerts: AlertsService,
    private readonly queue: PipelineQueue,
  ) {}

  async onModuleInit() {
    this.queue.register('token_refresh', async () => {
      await this.refreshDue();
    });
    const ms = Number(this.config.get('TOKEN_REFRESH_POLL_MS') ?? 0);
    await this.queue.schedule('token_refresh', ms);
  }

  async refreshProject(
    organizationId: string,
    projectId: string,
    options: { force?: boolean } = {},
  ) {
    const project = await this.requireProject(organizationId, projectId);
    const credential = await this.prisma.adPlatformCredential.findFirst({
      where: { projectId: project.id, platform: project.primaryPlatform },
    });
    if (!credential) {
      throw new BadRequestException('Ad account is not connected');
    }
    if (!credential.refreshTokenEncrypted) {
      throw new BadRequestException(
        'Refresh token is missing; reconnect the ad account',
      );
    }
    if (
      !options.force &&
      !tokenNeedsRefresh(credential.expiresAt, new Date())
    ) {
      return { refreshed: false, expiresAt: credential.expiresAt };
    }

    const key = parseTokenEncryptionKey(
      this.config.get<string>('TOKEN_ENCRYPTION_KEY'),
    );
    const refreshToken = decryptSecret(credential.refreshTokenEncrypted, key);
    const connector = this.connectors.forPlatform(project.primaryPlatform);

    try {
      const next = await connector.refreshAccessToken(project.id, refreshToken);
      const accessTokenEncrypted = encryptSecret(next.accessToken, key);
      const refreshTokenEncrypted = encryptSecret(
        next.refreshToken ?? refreshToken,
        key,
      );
      await this.prisma.adPlatformCredential.update({
        where: {
          projectId_platform: {
            projectId: project.id,
            platform: project.primaryPlatform,
          },
        },
        data: {
          accessTokenEncrypted,
          refreshTokenEncrypted,
          expiresAt: next.expiresAt,
          scopes: next.scopes || credential.scopes,
          ...(next.externalAccountId
            ? { externalAccountId: next.externalAccountId }
            : {}),
        },
      });
      await this.alerts.acknowledgeOauthAlerts(organizationId, project.id);
      return { refreshed: true, expiresAt: next.expiresAt };
    } catch (err) {
      this.log.warn(`OAuth refresh failed for project ${project.id}`);
      await this.alerts.recordOauthRefreshFailure(organizationId, project.id);
      if (
        err instanceof BadRequestException ||
        err instanceof NotFoundException
      ) {
        throw err;
      }
      throw new ServiceUnavailableException(
        'Could not refresh OAuth token; reconnect the ad account',
      );
    }
  }

  async refreshDue() {
    const rows = await this.prisma.adPlatformCredential.findMany({
      where: { refreshTokenEncrypted: { not: null } },
      include: {
        project: { select: { id: true, organizationId: true } },
      },
    });
    const now = new Date();
    for (const row of rows) {
      if (!tokenNeedsRefresh(row.expiresAt, now)) continue;
      try {
        await this.refreshProject(row.project.organizationId, row.project.id, {
          force: true,
        });
      } catch (err) {
        this.log.warn(
          err instanceof Error
            ? err.message
            : `token refresh failed for project ${row.projectId}`,
        );
      }
    }
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
