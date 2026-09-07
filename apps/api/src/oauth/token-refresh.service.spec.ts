import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AdPlatform } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_TOKEN_REFRESH_SKEW_MS,
  tokenNeedsRefresh,
} from '@context-buyer/connectors';
import { TokenRefreshService } from './token-refresh.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectorRouter } from '../connectors/connector-router';
import { AlertsService } from '../alerts/alerts.service';
import { PipelineQueue } from '../pipeline/pipeline.queue';
import {
  decryptSecret,
  encryptSecret,
  parseTokenEncryptionKey,
} from '../security/token-encryption';

const TEST_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('tokenNeedsRefresh', () => {
  const now = new Date('2026-08-27T12:00:00.000Z');

  it('is false when expiresAt is missing', () => {
    expect(tokenNeedsRefresh(null, now)).toBe(false);
  });

  it('is true inside the default skew window', () => {
    const expiresAt = new Date(now.getTime() + DEFAULT_TOKEN_REFRESH_SKEW_MS);
    expect(tokenNeedsRefresh(expiresAt, now)).toBe(true);
  });

  it('is false when expiry is beyond the skew', () => {
    const expiresAt = new Date(
      now.getTime() + DEFAULT_TOKEN_REFRESH_SKEW_MS + 1,
    );
    expect(tokenNeedsRefresh(expiresAt, now)).toBe(false);
  });
});

describe('TokenRefreshService', () => {
  const key = parseTokenEncryptionKey(TEST_KEY);
  const prisma = {
    project: { findFirst: jest.fn() },
    adPlatformCredential: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };
  const yandex = { refreshAccessToken: jest.fn() };
  const google = { refreshAccessToken: jest.fn() };
  const connectors = {
    forPlatform: jest.fn((platform: AdPlatform) =>
      platform === AdPlatform.google_ads ? google : yandex,
    ),
  };
  const alerts = {
    recordOauthRefreshFailure: jest.fn(),
    acknowledgeOauthAlerts: jest.fn(),
  };
  let service: TokenRefreshService;

  beforeEach(async () => {
    jest.clearAllMocks();
    connectors.forPlatform.mockImplementation((platform: AdPlatform) =>
      platform === AdPlatform.google_ads ? google : yandex,
    );
    prisma.project.findFirst.mockResolvedValue({
      id: 'p1',
      organizationId: 'org-a',
      primaryPlatform: AdPlatform.yandex_direct,
    });
    prisma.adPlatformCredential.findFirst.mockResolvedValue({
      id: 'cred-1',
      projectId: 'p1',
      platform: AdPlatform.yandex_direct,
      accessTokenEncrypted: encryptSecret('old-access', key),
      refreshTokenEncrypted: encryptSecret('old-refresh', key),
      expiresAt: new Date('2026-08-27T12:05:00.000Z'),
      scopes: 'direct:api',
      externalAccountId: 'agency-login',
    });
    prisma.adPlatformCredential.update.mockResolvedValue({});
    yandex.refreshAccessToken.mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresAt: new Date('2026-09-01T00:00:00.000Z'),
      scopes: 'direct:api',
      externalAccountId: '',
    });
    const module = await Test.createTestingModule({
      providers: [
        TokenRefreshService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: (name: string) => (name === 'TOKEN_ENCRYPTION_KEY' ? TEST_KEY : 0) },
        },
        { provide: ConnectorRouter, useValue: connectors },
        { provide: AlertsService, useValue: alerts },
        {
          provide: PipelineQueue,
          useValue: { register: jest.fn(), schedule: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(TokenRefreshService);
  });

  it('encrypts rotated Google Ads tokens', async () => {
    prisma.project.findFirst.mockResolvedValue({
      id: 'p1',
      organizationId: 'org-a',
      primaryPlatform: AdPlatform.google_ads,
    });
    prisma.adPlatformCredential.findFirst.mockResolvedValue({
      id: 'cred-g',
      projectId: 'p1',
      platform: AdPlatform.google_ads,
      accessTokenEncrypted: encryptSecret('old-g-access', key),
      refreshTokenEncrypted: encryptSecret('old-g-refresh', key),
      expiresAt: new Date('2026-08-27T12:05:00.000Z'),
      scopes: 'https://www.googleapis.com/auth/adwords',
      externalAccountId: '1112223333',
    });
    google.refreshAccessToken.mockResolvedValue({
      accessToken: 'new-g-access',
      refreshToken: 'new-g-refresh',
      expiresAt: new Date('2026-09-01T00:00:00.000Z'),
      scopes: 'https://www.googleapis.com/auth/adwords',
      externalAccountId: '',
    });
    await service.refreshProject('org-a', 'p1', { force: true });
    expect(google.refreshAccessToken).toHaveBeenCalledWith('p1', 'old-g-refresh');
    expect(yandex.refreshAccessToken).not.toHaveBeenCalled();
    const update = prisma.adPlatformCredential.update.mock.calls[0][0];
    expect(update.where).toEqual({
      projectId_platform: {
        projectId: 'p1',
        platform: AdPlatform.google_ads,
      },
    });
    expect(decryptSecret(update.data.accessTokenEncrypted, key)).toBe(
      'new-g-access',
    );
    expect(decryptSecret(update.data.refreshTokenEncrypted, key)).toBe(
      'new-g-refresh',
    );
    expect(update.data.externalAccountId).toBeUndefined();
  });

  it('does not refresh a sibling organization project', async () => {
    prisma.project.findFirst.mockResolvedValue(null);
    await expect(
      service.refreshProject('org-b', 'p1', { force: true }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(yandex.refreshAccessToken).not.toHaveBeenCalled();
    expect(prisma.adPlatformCredential.update).not.toHaveBeenCalled();
  });

  it('encrypts rotated tokens and does not overwrite the account id', async () => {
    await service.refreshProject('org-a', 'p1', { force: true });
    expect(prisma.project.findFirst).toHaveBeenCalledWith({
      where: { id: 'p1', organizationId: 'org-a' },
    });
    expect(yandex.refreshAccessToken).toHaveBeenCalledWith('p1', 'old-refresh');
    expect(google.refreshAccessToken).not.toHaveBeenCalled();
    const update = prisma.adPlatformCredential.update.mock.calls[0][0];
    expect(update.where).toEqual({
      projectId_platform: {
        projectId: 'p1',
        platform: AdPlatform.yandex_direct,
      },
    });
    expect(update.data.accessTokenEncrypted).not.toBe('new-access');
    expect(update.data.refreshTokenEncrypted).not.toBe('new-refresh');
    expect(decryptSecret(update.data.accessTokenEncrypted, key)).toBe(
      'new-access',
    );
    expect(decryptSecret(update.data.refreshTokenEncrypted, key)).toBe(
      'new-refresh',
    );
    expect(update.data.externalAccountId).toBeUndefined();
    expect(alerts.acknowledgeOauthAlerts).toHaveBeenCalledWith('org-a', 'p1');
  });

  it('keeps the previous refresh token when the provider omits a new one', async () => {
    yandex.refreshAccessToken.mockResolvedValue({
      accessToken: 'rotated-access',
      refreshToken: 'old-refresh',
      expiresAt: new Date('2026-09-01T00:00:00.000Z'),
      scopes: 'direct:api',
      externalAccountId: '',
    });
    await service.refreshProject('org-a', 'p1', { force: true });
    const update = prisma.adPlatformCredential.update.mock.calls[0][0];
    expect(decryptSecret(update.data.refreshTokenEncrypted, key)).toBe(
      'old-refresh',
    );
  });

  it('opens an oauth_expired alert and hides the provider error', async () => {
    yandex.refreshAccessToken.mockRejectedValue(new Error('invalid_grant secret-xyz'));
    await expect(
      service.refreshProject('org-a', 'p1', { force: true }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(alerts.recordOauthRefreshFailure).toHaveBeenCalledWith('org-a', 'p1');
    expect(prisma.adPlatformCredential.update).not.toHaveBeenCalled();
  });

  it('skips rotation when the token is still valid and force is off', async () => {
    prisma.adPlatformCredential.findFirst.mockResolvedValue({
      id: 'cred-1',
      projectId: 'p1',
      platform: AdPlatform.yandex_direct,
      accessTokenEncrypted: encryptSecret('old-access', key),
      refreshTokenEncrypted: encryptSecret('old-refresh', key),
      expiresAt: new Date('2027-01-01T00:00:00.000Z'),
      scopes: 'direct:api',
      externalAccountId: 'agency-login',
    });
    const result = await service.refreshProject('org-a', 'p1');
    expect(result.refreshed).toBe(false);
    expect(yandex.refreshAccessToken).not.toHaveBeenCalled();
  });

  it('rejects a project without a connected cabinet', async () => {
    prisma.adPlatformCredential.findFirst.mockResolvedValue(null);
    await expect(
      service.refreshProject('org-a', 'p1', { force: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
