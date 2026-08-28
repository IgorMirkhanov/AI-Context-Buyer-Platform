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

const TEST_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('ProjectsService', () => {
  const prisma = {
    project: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    projectBrief: { create: jest.fn() },
    adPlatformCredential: { upsert: jest.fn(), deleteMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const yandex = {
    buildAuthorizeUrl: jest.fn(),
    handleOAuthCallback: jest.fn(),
  };
  const google = {
    buildAuthorizeUrl: jest.fn(),
    handleOAuthCallback: jest.fn(),
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
              if (key === 'JWT_SECRET') return 'jwt-test';
              if (key === 'YANDEX_CLIENT_ID') return 'yandex-client';
              if (key === 'GOOGLE_ADS_CLIENT_ID') return 'google-client';
              return undefined;
            },
          },
        },
        { provide: ConnectorRouter, useValue: connectors },
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
    prisma.adPlatformCredential.upsert.mockResolvedValue({});
    prisma.project.update.mockResolvedValue({});

    const state = signOAuthState(
      { projectId: 'p1', organizationId: 'org-a' },
      'jwt-test',
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
    expect(upsert.create.platform).toBe(AdPlatform.yandex_direct);
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
    prisma.adPlatformCredential.upsert.mockResolvedValue({});
    prisma.project.update.mockResolvedValue({});

    const state = signOAuthState(
      { projectId: 'p1', organizationId: 'org-a' },
      'jwt-test',
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
});
