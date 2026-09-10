import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdPlatform, ProjectStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectorRouter } from '../connectors/connector-router';
import {
  PlatformConnectionService,
  resolveConnectionStatus,
  shouldVerifyConnection,
  verificationCheckFields,
} from '../connectors/platform-connection.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpsertBriefDto } from './dto/upsert-brief.dto';
import { ProjectBriefPayload } from '../briefs/brief.schema';
import { AccessService } from '../tenancy/access.service';
import { JwtPayload } from '../auth/jwt-payload';
import {
  BriefValidationError,
  validateProjectBrief,
} from '../briefs/brief.validator';
import {
  encryptSecret,
  parseTokenEncryptionKey,
} from '../security/token-encryption';
import { signOAuthState, verifyOAuthState } from '../security/oauth-state';
import { requireJwtSecret } from '../security/startup-secrets';
import { ConnectionVerificationFailedError } from './connection-verification.error';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly connectors: ConnectorRouter,
    private readonly access: AccessService,
    private readonly platformConnection: PlatformConnectionService,
  ) {}

  listForUser(user: JwtPayload) {
    return this.prisma.project.findMany({
      where: this.access.listWhere(user),
      orderBy: { createdAt: 'desc' },
    });
  }

  listForOrganization(organizationId: string) {
    return this.prisma.project.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getForOrganization(organizationId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, organizationId },
      include: {
        briefs: { orderBy: { version: 'desc' }, take: 1 },
        credentials: true,
      },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    const [brief] = project.briefs;
    let credential = project.credentials.find(
      (row) => row.platform === project.primaryPlatform,
    );
    if (credential) {
      credential = await this.refreshConnectionVerificationIfDue(
        project.id,
        project.primaryPlatform,
        credential,
      );
    }
    const connectionStatus = resolveConnectionStatus(credential ?? null);
    return {
      id: project.id,
      organizationId: project.organizationId,
      name: project.name,
      status: project.status,
      primaryPlatform: project.primaryPlatform,
      websiteUrl: project.websiteUrl,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      brief: (brief?.payloadJson as ProjectBriefPayload | null) ?? null,
      connection: credential
        ? {
            status: connectionStatus,
            platform: credential.platform,
            externalAccountId: credential.externalAccountId,
            expiresAt: credential.expiresAt,
            verificationError: credential.apiVerificationError,
          }
        : {
            status: 'not_connected' as const,
            platform: project.primaryPlatform,
            externalAccountId: null,
            expiresAt: null,
            verificationError: null,
          },
    };
  }

  async createForOrganization(user: JwtPayload, dto: CreateProjectDto) {
    this.access.assertOrgWide(user);
    const organizationId = user.organizationId;
    const payload = this.buildBriefPayload(dto, dto.primaryPlatform);
    try {
      validateProjectBrief(payload);
    } catch (err) {
      if (err instanceof BriefValidationError) {
        throw new BadRequestException({
          message: 'Invalid project brief',
          details: err.details,
        });
      }
      throw err;
    }

    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          organizationId,
          name: dto.name,
          primaryPlatform: dto.primaryPlatform,
          websiteUrl: dto.websiteUrl,
        },
      });
      await tx.projectBrief.create({
        data: {
          projectId: project.id,
          version: 1,
          payloadJson: payload,
        },
      });
      return project;
    });
  }

  async upsertBrief(
    organizationId: string,
    projectId: string,
    dto: UpsertBriefDto,
  ) {
    const project = await this.requireProject(organizationId, projectId);
    const payload = this.buildBriefPayload(dto, project.primaryPlatform);
    try {
      validateProjectBrief(payload);
    } catch (err) {
      if (err instanceof BriefValidationError) {
        throw new BadRequestException({
          message: 'Invalid project brief',
          details: err.details,
        });
      }
      throw err;
    }

    const latest = await this.prisma.projectBrief.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
    });
    const version = (latest?.version ?? 0) + 1;

    await this.prisma.$transaction(async (tx) => {
      await tx.projectBrief.create({
        data: {
          projectId,
          version,
          payloadJson: payload,
        },
      });
      await tx.project.update({
        where: { id: projectId },
        data: { websiteUrl: dto.websiteUrl },
      });
    });

    return { brief: payload, version };
  }

  async startYandexOAuth(organizationId: string, projectId: string) {
    const project = await this.requireProject(organizationId, projectId);
    if (project.primaryPlatform !== AdPlatform.yandex_direct) {
      throw new BadRequestException('This project uses Google Ads');
    }
    return this.startOAuth(
      project,
      'YANDEX_CLIENT_ID',
      'YANDEX_DIRECT_MOCK',
      'Yandex Direct OAuth is not configured',
    );
  }

  async startGoogleOAuth(organizationId: string, projectId: string) {
    const project = await this.requireProject(organizationId, projectId);
    if (project.primaryPlatform !== AdPlatform.google_ads) {
      throw new BadRequestException('This project uses Yandex Direct');
    }
    const mock =
      this.config.get<string>('GOOGLE_ADS_MOCK') === '1' ||
      this.config.get<string>('GOOGLE_ADS_MOCK') === 'true';
    if (!mock) {
      const clientId = this.config.get<string>('GOOGLE_ADS_CLIENT_ID')?.trim();
      const clientSecret = this.config
        .get<string>('GOOGLE_ADS_CLIENT_SECRET')
        ?.trim();
      const developerToken = this.config
        .get<string>('GOOGLE_ADS_DEVELOPER_TOKEN')
        ?.trim();
      if (!clientId || !clientSecret || !developerToken) {
        throw new ServiceUnavailableException(
          'Google Ads OAuth is not configured (need GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_DEVELOPER_TOKEN)',
        );
      }
    }
    return this.startOAuth(
      project,
      'GOOGLE_ADS_CLIENT_ID',
      'GOOGLE_ADS_MOCK',
      'Google Ads OAuth is not configured',
    );
  }

  async completeOAuth(state: string, code: string) {
    const payload = verifyOAuthState(state, this.stateSecret());
    const project = await this.requireProject(
      payload.organizationId,
      payload.projectId,
    );
    const connector = this.connectors.forPlatform(project.primaryPlatform);
    const credentials = await connector.handleOAuthCallback(project.id, code);
    const key = parseTokenEncryptionKey(
      this.config.get<string>('TOKEN_ENCRYPTION_KEY'),
    );
    const accessTokenEncrypted = encryptSecret(credentials.accessToken, key);
    const refreshTokenEncrypted = credentials.refreshToken
      ? encryptSecret(credentials.refreshToken, key)
      : null;
    const verification = await connector.verifyConnection(project.id, {
      accessToken: credentials.accessToken,
      clientLogin: credentials.externalAccountId,
      projectId: project.id,
    });
    const checkedAt = new Date();
    const verificationFields = verificationCheckFields(verification, checkedAt);

    await this.prisma.$transaction(async (tx) => {
      await tx.adPlatformCredential.upsert({
        where: {
          projectId_platform: {
            projectId: project.id,
            platform: project.primaryPlatform,
          },
        },
        update: {
          accessTokenEncrypted,
          refreshTokenEncrypted,
          expiresAt: credentials.expiresAt,
          scopes: credentials.scopes,
          externalAccountId: credentials.externalAccountId,
          ...verificationFields,
        },
        create: {
          projectId: project.id,
          platform: project.primaryPlatform,
          accessTokenEncrypted,
          refreshTokenEncrypted,
          expiresAt: credentials.expiresAt,
          scopes: credentials.scopes,
          externalAccountId: credentials.externalAccountId,
          ...verificationFields,
        },
      });
      if (verification.ok) {
        await tx.project.update({
          where: { id: project.id },
          data: { status: ProjectStatus.active },
        });
      }
    });

    if (!verification.ok) {
      throw new ConnectionVerificationFailedError(
        project.id,
        verification.reason,
      );
    }

    return { projectId: project.id };
  }

  async disconnect(organizationId: string, projectId: string) {
    const project = await this.requireProject(organizationId, projectId);
    await this.prisma.$transaction(async (tx) => {
      await tx.adPlatformCredential.deleteMany({
        where: { projectId: project.id, platform: project.primaryPlatform },
      });
      await tx.project.update({
        where: { id: project.id },
        data: { status: ProjectStatus.disconnected },
      });
    });
    return { ok: true };
  }

  /**
   * Switch Yandex Direct ↔ Google Ads before OAuth.
   * Blocked while a credential for the current primary platform exists —
   * disconnect first.
   */
  async setPrimaryPlatform(
    organizationId: string,
    projectId: string,
    primaryPlatform: AdPlatform,
  ) {
    const project = await this.requireProject(organizationId, projectId);
    if (project.primaryPlatform === primaryPlatform) {
      return this.getForOrganization(organizationId, projectId);
    }
    const existing = await this.prisma.adPlatformCredential.findFirst({
      where: { projectId: project.id, platform: project.primaryPlatform },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(
        'Сначала отключите текущий кабинет, затем смените платформу',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: project.id },
        data: { primaryPlatform },
      });
      const [brief] = await tx.projectBrief.findMany({
        where: { projectId: project.id },
        orderBy: { version: 'desc' },
        take: 1,
      });
      if (brief) {
        const payload = brief.payloadJson as ProjectBriefPayload;
        const next: ProjectBriefPayload = {
          ...payload,
          project: {
            ...payload.project,
            platforms: [primaryPlatform],
          },
        };
        await tx.projectBrief.update({
          where: { id: brief.id },
          data: { payloadJson: next },
        });
      }
    });

    return this.getForOrganization(organizationId, projectId);
  }

  private startOAuth(
    project: { id: string; organizationId: string; primaryPlatform: AdPlatform },
    clientIdKey: string,
    mockEnvKey: string,
    missingMessage: string,
  ) {
    const mock =
      this.config.get<string>(mockEnvKey) === '1' ||
      this.config.get<string>(mockEnvKey) === 'true';
    const clientId = this.config.get<string>(clientIdKey)?.trim();
    if (!mock && !clientId) {
      throw new ServiceUnavailableException(missingMessage);
    }
    const state = signOAuthState(
      { projectId: project.id, organizationId: project.organizationId },
      this.stateSecret(),
    );
    return this.connectors
      .forPlatform(project.primaryPlatform)
      .buildAuthorizeUrl(state);
  }

  private async refreshConnectionVerificationIfDue<
    T extends {
      accessTokenEncrypted: string;
      externalAccountId: string | null;
      apiVerifiedAt: Date | null;
      apiVerificationError: string | null;
    },
  >(projectId: string, platform: AdPlatform, credential: T, now = new Date()) {
    if (
      !shouldVerifyConnection(
        credential.apiVerifiedAt,
        now,
        this.platformConnection.throttleMs(),
      )
    ) {
      return credential;
    }
    const verification =
      await this.platformConnection.verifyProjectConnection(
        projectId,
        platform,
        credential,
      );
    const fields = verificationCheckFields(verification, now);
    return this.prisma.adPlatformCredential.update({
      where: {
        projectId_platform: { projectId, platform },
      },
      data: fields,
    });
  }

  private async requireProject(organizationId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, organizationId },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }

  private stateSecret(): string {
    return requireJwtSecret((key) => this.config.get<string>(key));
  }

  private buildBriefPayload(
    dto: {
      websiteUrl: string;
      geo: string[];
      budgetDaily: number;
      budgetCurrency?: string;
      targetCpl?: number;
      usp: string[];
      targetAudience: Array<{
        segment: string;
        pains?: string[];
        objections?: string[];
      }>;
      globalNegativeKeywords: string[];
    },
    primaryPlatform: AdPlatform,
  ): ProjectBriefPayload {
    return {
      project: {
        website_url: dto.websiteUrl,
        geo: dto.geo.map((item) => item.trim()).filter(Boolean),
        budget: {
          daily: dto.budgetDaily,
          currency: dto.budgetCurrency ?? 'RUB',
        },
        ...(dto.targetCpl != null && dto.targetCpl > 0
          ? { target_cpl: dto.targetCpl }
          : {}),
        platforms: [primaryPlatform],
      },
      marketing: {
        usp: dto.usp.map((item) => item.trim()).filter(Boolean),
        target_audience: dto.targetAudience,
      },
      exclusions: {
        global_negative_keywords: dto.globalNegativeKeywords
          .map((item) => item.trim())
          .filter(Boolean),
      },
    };
  }
}
