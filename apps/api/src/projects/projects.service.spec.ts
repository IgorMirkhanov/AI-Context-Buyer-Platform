import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AdPlatform } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { ProjectsService } from './projects.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectorRouter } from '../connectors/connector-router';
import { AccessService } from '../tenancy/access.service';
import { JwtPayload } from '../auth/jwt-payload';
import {
  decryptSecret,
  parseTokenEncryptionKey,
} from '../security/token-encryption';
import { signOAuthState } from '../security/oauth-state';
import { ConnectionVerificationFailedError } from './connection-verification.error';
import { PlatformConnectionService } from '../connectors/platform-connection.service';
import { DEFAULT_CONNECTION_VERIFY_THROTTLE_MS } from '../connectors/platform-connection.service';
import { TokenRefreshService } from '../oauth/token-refresh.service';
import { AlertsService } from '../alerts/alerts.service';

const TEST_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const TEST_JWT = 'test-jwt-secret-at-least-32-characters-long';

describe('ProjectsService', () => {
  const prisma = {
    project: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    adPlatformCredential: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
    },
    projectBrief: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const platformConnection = {
    verifyProjectConnection: jest.fn(),
    throttleMs: jest.fn(() => DEFAULT_CONNECTION_VERIFY_THROTTLE_MS),
  };
  const tokens = {
    refreshProject: jest.fn().mockResolvedValue({ refreshed: false }),
  };
  const alerts = {
    acknowledgeOauthAlerts: jest.fn().mockResolvedValue(undefined),
  };
  const yandex = {
    buildAuthorizeUrl: jest.fn(),
    handleOAuthCallback: jest.fn(),
    verifyConnection: jest.fn(),
  };
  const google = {
    buildAuthorizeUrl: jest.fn(),
    handleOAuthCallback: jest.fn(),
    verifyConnection: jest.fn(),
  };
  const connectors = {
    forPlatform: jest.fn((platform: AdPlatform) =>
      platform === AdPlatform.google_ads ? google : yandex,
    ),
  };
  let service: ProjectsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    connectors.forPlatform.mockImplementation((platform: AdPlatform) =>
      platform === AdPlatform.google_ads ? google : yandex,
    );
    prisma.$transaction.mockImplementation(
      async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
    );
    const module = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'TOKEN_ENCRYPTION_KEY') return TEST_KEY;
              if (key === 'JWT_SECRET') return TEST_JWT;
              if (key === 'YANDEX_CLIENT_ID') return 'yandex-client';
              if (key === 'GOOGLE_ADS_CLIENT_ID') return 'google-client';
              return undefined;
            },
          },
        },
        { provide: ConnectorRouter, useValue: connectors },
        { provide: PlatformConnectionService, useValue: platformConnection },
        { provide: TokenRefreshService, useValue: tokens },
        { provide: AlertsService, useValue: alerts },
        {
          provide: AccessService,
          useFactory: () => new AccessService(prisma as unknown as PrismaService),
        },
      ],
    }).compile();
    service = module.get(ProjectsService);
  });

  it('lists only projects of the given organization', async () => {
    prisma.project.findMany.mockResolvedValue([]);
    await service.listForOrganization('org-a');
    expect(prisma.project.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-a' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('lists only granted projects for a client user', async () => {
    prisma.project.findMany.mockResolvedValue([]);
    const client: JwtPayload = {
      sub: 'user-client',
      organizationId: 'org-a',
      email: 'c@x.test',
      role: 'client',
    };
    await service.listForUser(client);
    expect(prisma.project.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-a',
        clientAccess: { some: { userId: 'user-client' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('does not return a project from another organization', async () => {
    prisma.project.findFirst.mockResolvedValue(null);
    await expect(
      service.getForOrganization('org-a', 'project-other'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates a project and brief bound to the caller organization', async () => {
    prisma.project.create.mockResolvedValue({ id: 'p1' });
    prisma.projectBrief.create.mockResolvedValue({ id: 'b1' });
    await service.createForOrganization(
      {
        sub: 'user-owner',
        organizationId: 'org-a',
        email: 'owner@agency.test',
        role: 'owner',
      },
      {
      name: 'Client A',
      primaryPlatform: AdPlatform.yandex_direct,
      websiteUrl: 'https://example.com',
      geo: ['RU-MOW'],
      budgetDaily: 5000,
      usp: ['Гарантия 3 года'],
      targetAudience: [{ segment: 'Геймеры 18-30' }],
      globalNegativeKeywords: ['бесплатно'],
      },
    );
    expect(prisma.project.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-a',
        name: 'Client A',
        primaryPlatform: AdPlatform.yandex_direct,
        websiteUrl: 'https://example.com',
      },
    });
    expect(prisma.projectBrief.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: 'p1',
        version: 1,
      }),
    });
  });

  it('rejects a brief that fails the JSON schema', async () => {
    await expect(
      service.createForOrganization(
        {
          sub: 'user-owner',
          organizationId: 'org-a',
          email: 'owner@agency.test',
          role: 'owner',
        },
        {
          name: 'Bad',
          primaryPlatform: AdPlatform.yandex_direct,
          websiteUrl: 'https://example.com',
          geo: [],
          budgetDaily: 5000,
          usp: ['USP'],
          targetAudience: [{ segment: 'Seg' }],
          globalNegativeKeywords: [],
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.project.create).not.toHaveBeenCalled();
  });

  it('does not let a client create a project', async () => {
    await expect(
      service.createForOrganization(
        {
          sub: 'user-client',
          organizationId: 'org-a',
          email: 'c@x.test',
          role: 'client',
        },
        {
          name: 'Nope',
          primaryPlatform: AdPlatform.yandex_direct,
          websiteUrl: 'https://example.com',
          geo: ['RU-MOW'],
          budgetDaily: 5000,
          usp: ['USP'],
          targetAudience: [{ segment: 'Seg' }],
          globalNegativeKeywords: [],
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.project.create).not.toHaveBeenCalled();
  });

  it('creates a new brief version for an existing project', async () => {
    prisma.project.findFirst.mockResolvedValue({
      id: 'p1',
      organizationId: 'org-a',
      primaryPlatform: AdPlatform.yandex_direct,
    });
    prisma.projectBrief.findFirst.mockResolvedValue({ version: 2 });
    prisma.projectBrief.create.mockResolvedValue({ id: 'b3' });
    prisma.project.update.mockResolvedValue({});

    const result = await service.upsertBrief('org-a', 'p1', {
      websiteUrl: 'https://shop.test',
      geo: ['RU-MOW'],
      budgetDaily: 4000,
      usp: ['Доставка за день'],
      targetAudience: [{ segment: 'Офисы' }],
      globalNegativeKeywords: ['бесплатно'],
    });

    expect(prisma.projectBrief.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: 'p1',
        version: 3,
      }),
    });
    expect(prisma.project.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { websiteUrl: 'https://shop.test' },
    });
    expect(result.version).toBe(3);
    expect(result.brief.project.website_url).toBe('https://shop.test');
  });

  it('encrypts provider tokens before upserting credentials', async () => {
    prisma.project.findFirst.mockResolvedValue({
      id: 'p1',
      organizationId: 'org-a',
      primaryPlatform: AdPlatform.yandex_direct,
    });
    yandex.handleOAuthCallback.mockResolvedValue({
      accessToken: 'plain-access',
      refreshToken: 'plain-refresh',
      expiresAt: new Date('2026-09-01T00:00:00.000Z'),
      scopes: 'direct:api',
      externalAccountId: 'client-login',
    });
    yandex.verifyConnection.mockResolvedValue({ ok: true });
    prisma.adPlatformCredential.upsert.mockResolvedValue({});
    prisma.project.update.mockResolvedValue({});

    const state = signOAuthState(
      { projectId: 'p1', organizationId: 'org-a' },
      TEST_JWT,
    );
    await service.completeOAuth(state, 'code-from-yandex');

    const upsert = prisma.adPlatformCredential.upsert.mock.calls[0][0];
    const stored = upsert.update.accessTokenEncrypted as string;
    expect(stored).not.toBe('plain-access');
    const key = parseTokenEncryptionKey(TEST_KEY);
    expect(stored.split('.')).toHaveLength(3);
    expect(decryptSecret(stored, key)).toBe('plain-access');
    expect(yandex.handleOAuthCallback).toHaveBeenCalledWith(
      'p1',
      'code-from-yandex',
    );
    expect(yandex.verifyConnection).toHaveBeenCalledWith('p1', {
      accessToken: 'plain-access',
      clientLogin: 'client-login',
      projectId: 'p1',
    });
    expect(upsert.create.platform).toBe(AdPlatform.yandex_direct);
    expect(upsert.create.apiVerificationError).toBeNull();
    expect(upsert.create.apiVerifiedAt).toBeInstanceOf(Date);
  });

  it('does not mark project active when API verification fails after OAuth', async () => {
    prisma.project.findFirst.mockResolvedValue({
      id: 'p1',
      organizationId: 'org-a',
      primaryPlatform: AdPlatform.yandex_direct,
    });
    yandex.handleOAuthCallback.mockResolvedValue({
      accessToken: 'plain-access',
      refreshToken: 'plain-refresh',
      expiresAt: new Date('2026-09-01T00:00:00.000Z'),
      scopes: 'login:info',
      externalAccountId: 'client-login',
    });
    yandex.verifyConnection.mockResolvedValue({
      ok: false,
      reason: 'Invalid OAuth token',
    });
    prisma.adPlatformCredential.upsert.mockResolvedValue({});

    const state = signOAuthState(
      { projectId: 'p1', organizationId: 'org-a' },
      TEST_JWT,
    );
    await expect(
      service.completeOAuth(state, 'code-from-yandex'),
    ).rejects.toBeInstanceOf(ConnectionVerificationFailedError);

    const upsert = prisma.adPlatformCredential.upsert.mock.calls[0][0];
    expect(upsert.create.apiVerificationError).toBe('Invalid OAuth token');
    expect(upsert.create.apiVerifiedAt).toBeInstanceOf(Date);
    expect(prisma.project.update).not.toHaveBeenCalled();
  });

  it('encrypts Google Ads tokens against the google_ads credential slot', async () => {
    prisma.project.findFirst.mockResolvedValue({
      id: 'p1',
      organizationId: 'org-a',
      primaryPlatform: AdPlatform.google_ads,
    });
    google.handleOAuthCallback.mockResolvedValue({
      accessToken: 'google-access',
      refreshToken: 'google-refresh',
      expiresAt: new Date('2026-09-01T00:00:00.000Z'),
      scopes: 'https://www.googleapis.com/auth/adwords',
      externalAccountId: '1234567890',
    });
    google.verifyConnection.mockResolvedValue({ ok: true });
    prisma.adPlatformCredential.upsert.mockResolvedValue({});
    prisma.project.update.mockResolvedValue({});

    const state = signOAuthState(
      { projectId: 'p1', organizationId: 'org-a' },
      TEST_JWT,
    );
    await service.completeOAuth(state, 'code-from-google');

    const upsert = prisma.adPlatformCredential.upsert.mock.calls[0][0];
    expect(upsert.create.platform).toBe(AdPlatform.google_ads);
    expect(google.handleOAuthCallback).toHaveBeenCalledWith(
      'p1',
      'code-from-google',
    );
    expect(yandex.handleOAuthCallback).not.toHaveBeenCalled();
    const key = parseTokenEncryptionKey(TEST_KEY);
    expect(decryptSecret(upsert.update.accessTokenEncrypted, key)).toBe(
      'google-access',
    );
  });

  it('starts Yandex OAuth in mock mode without client id env', async () => {
    const module = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'JWT_SECRET') return TEST_JWT;
              if (key === 'YANDEX_DIRECT_MOCK') return '1';
              return undefined;
            },
          },
        },
        { provide: ConnectorRouter, useValue: connectors },
        { provide: PlatformConnectionService, useValue: platformConnection },
        { provide: TokenRefreshService, useValue: tokens },
        { provide: AlertsService, useValue: alerts },
        {
          provide: AccessService,
          useFactory: () => new AccessService(prisma as unknown as PrismaService),
        },
      ],
    }).compile();
    const mockService = module.get(ProjectsService);
    prisma.project.findFirst.mockResolvedValue({
      id: 'p1',
      organizationId: 'org-a',
      primaryPlatform: AdPlatform.yandex_direct,
    });
    yandex.buildAuthorizeUrl.mockReturnValue({ url: 'http://mock/oauth' });

    await mockService.startYandexOAuth('org-a', 'p1');

    expect(yandex.buildAuthorizeUrl).toHaveBeenCalled();
  });

  describe('setPrimaryPlatform', () => {
    const projectId = 'p1';
    const organizationId = 'org-a';
    const now = new Date('2026-09-04T12:00:00.000Z');

    function mockGetAfterSwitch(platform: AdPlatform) {
      prisma.project.findFirst.mockResolvedValue({
        id: projectId,
        organizationId,
        name: 'Test',
        status: 'active',
        primaryPlatform: platform,
        websiteUrl: null,
        createdAt: now,
        updatedAt: now,
        briefs: [],
        credentials: [],
      });
    }

    it('switches yandex_direct → google_ads when no credential', async () => {
      prisma.project.findFirst
        .mockResolvedValueOnce({
          id: projectId,
          organizationId,
          primaryPlatform: AdPlatform.yandex_direct,
        })
        .mockResolvedValueOnce({
          id: projectId,
          organizationId,
          name: 'Test',
          status: 'active',
          primaryPlatform: AdPlatform.google_ads,
          websiteUrl: null,
          createdAt: now,
          updatedAt: now,
          briefs: [],
          credentials: [],
        });
      prisma.adPlatformCredential.findFirst.mockResolvedValue(null);
      prisma.projectBrief.findMany.mockResolvedValue([
        {
          id: 'brief-1',
          payloadJson: {
            project: { platforms: [AdPlatform.yandex_direct] },
          },
        },
      ]);

      const result = await service.setPrimaryPlatform(
        organizationId,
        projectId,
        AdPlatform.google_ads,
      );

      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: projectId },
        data: { primaryPlatform: AdPlatform.google_ads },
      });
      expect(prisma.projectBrief.update).toHaveBeenCalledWith({
        where: { id: 'brief-1' },
        data: {
          payloadJson: expect.objectContaining({
            project: expect.objectContaining({
              platforms: [AdPlatform.google_ads],
            }),
          }),
        },
      });
      expect(result.primaryPlatform).toBe(AdPlatform.google_ads);
    });

    it('rejects switch while current platform credential exists', async () => {
      prisma.project.findFirst.mockResolvedValue({
        id: projectId,
        organizationId,
        primaryPlatform: AdPlatform.yandex_direct,
      });
      prisma.adPlatformCredential.findFirst.mockResolvedValue({ id: 'cred-1' });

      await expect(
        service.setPrimaryPlatform(
          organizationId,
          projectId,
          AdPlatform.google_ads,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.project.update).not.toHaveBeenCalled();
    });

    it('is a no-op when platform is already selected', async () => {
      mockGetAfterSwitch(AdPlatform.google_ads);
      prisma.project.findFirst.mockResolvedValue({
        id: projectId,
        organizationId,
        name: 'Test',
        status: 'active',
        primaryPlatform: AdPlatform.google_ads,
        websiteUrl: null,
        createdAt: now,
        updatedAt: now,
        briefs: [],
        credentials: [],
      });

      const result = await service.setPrimaryPlatform(
        organizationId,
        projectId,
        AdPlatform.google_ads,
      );

      expect(prisma.adPlatformCredential.findFirst).not.toHaveBeenCalled();
      expect(prisma.project.update).not.toHaveBeenCalled();
      expect(result.primaryPlatform).toBe(AdPlatform.google_ads);
    });
  });

  describe('getForOrganization connection verify throttle', () => {
    const projectId = 'p1';
    const organizationId = 'org-a';
    const checkedAt = new Date('2026-09-02T12:00:00.000Z');
    const credential = {
      platform: AdPlatform.yandex_direct,
      accessTokenEncrypted: 'enc',
      externalAccountId: 'mediapeace',
      apiVerifiedAt: null as Date | null,
      apiVerificationError: null as string | null,
      expiresAt: new Date('2027-09-02T00:00:00.000Z'),
    };

    function mockProject(cred = credential) {
      prisma.project.findFirst.mockResolvedValue({
        id: projectId,
        organizationId,
        name: 'Test',
        status: 'active',
        primaryPlatform: AdPlatform.yandex_direct,
        websiteUrl: null,
        createdAt: checkedAt,
        updatedAt: checkedAt,
        briefs: [],
        credentials: [cred],
      });
    }

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(checkedAt);
      platformConnection.verifyProjectConnection.mockResolvedValue({
        ok: false,
        reason: 'Invalid OAuth token',
      });
      prisma.adPlatformCredential.findFirst.mockResolvedValue(null);
      prisma.adPlatformCredential.update.mockImplementation(async ({ data }) => ({
        ...credential,
        ...data,
      }));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('verifies on first GET /projects/:id when throttle expired', async () => {
      mockProject({
        ...credential,
        apiVerifiedAt: new Date('2026-09-02T11:00:00.000Z'),
      });
      const result = await service.getForOrganization(organizationId, projectId);
      expect(platformConnection.verifyProjectConnection).toHaveBeenCalledTimes(1);
      expect(prisma.adPlatformCredential.update).toHaveBeenCalledTimes(1);
      expect(result.connection.status).toBe('needs_reconnect');
    });

    it('does not verify again inside throttle window', async () => {
      mockProject({
        ...credential,
        apiVerifiedAt: new Date('2026-09-02T11:50:00.000Z'),
        apiVerificationError: 'Invalid OAuth token',
      });
      jest.setSystemTime(new Date('2026-09-02T12:00:00.000Z'));
      await service.getForOrganization(organizationId, projectId);
      await service.getForOrganization(organizationId, projectId);
      expect(platformConnection.verifyProjectConnection).not.toHaveBeenCalled();
      expect(prisma.adPlatformCredential.update).not.toHaveBeenCalled();
    });

    it('verifies again after throttle window passes', async () => {
      mockProject({
        ...credential,
        apiVerifiedAt: new Date('2026-09-02T11:00:00.000Z'),
        apiVerificationError: 'Invalid OAuth token',
      });
      jest.setSystemTime(new Date('2026-09-02T12:16:00.000Z'));
      await service.getForOrganization(organizationId, projectId);
      expect(platformConnection.verifyProjectConnection).toHaveBeenCalledTimes(1);
      expect(prisma.adPlatformCredential.update).toHaveBeenCalledTimes(1);
    });
  });
});
