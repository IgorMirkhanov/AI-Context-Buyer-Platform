import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  CampaignSource,
  LiveCampaignStatus,
} from '@prisma/client';
import { CampaignSyncService } from './campaign-sync.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { ConnectorRouter } from '../connectors/connector-router';
import { PlatformConnectionService } from '../connectors/platform-connection.service';
import { PipelineQueue } from '../pipeline/pipeline.queue';
import { ReportsService } from '../reports/reports.service';

jest.mock('../security/token-encryption', () => ({
  decryptSecret: jest.fn(() => 'access-token'),
  parseTokenEncryptionKey: jest.fn(() => Buffer.alloc(32)),
}));

describe('CampaignSyncService', () => {
  const remoteCampaigns = [
    {
      externalCampaignId: '555',
      name: 'Платформенная',
      status: 'paused' as const,
      dailyBudget: 5000,
    },
    {
      externalCampaignId: '9001',
      name: 'Старая архивная',
      status: 'archived' as const,
      dailyBudget: null,
    },
  ];

  const prisma = {
    project: { findFirst: jest.fn() },
    adPlatformCredential: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    campaign: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const connector = {
    fetchAllAccountCampaigns: jest.fn().mockResolvedValue(remoteCampaigns),
  };
  const reports = {
    collectCampaignSnapshots: jest.fn().mockResolvedValue(12),
  };
  const platformConnection = {
    verifyProjectConnection: jest.fn().mockResolvedValue({ ok: true }),
    buildAuth: jest.fn(() => ({
      accessToken: 'access-token',
      clientLogin: 'login',
      projectId: 'proj-1',
    })),
  };
  const queue = {
    register: jest.fn(),
    schedule: jest.fn(),
    enqueueBackground: jest.fn().mockResolvedValue({ jobId: 'sync-1', queued: true }),
  };

  let service: CampaignSyncService;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    prisma.project.findFirst.mockResolvedValue({
      id: 'proj-1',
      organizationId: 'org-1',
      primaryPlatform: 'yandex_direct',
    });
    prisma.adPlatformCredential.findFirst.mockResolvedValue({
      accessTokenEncrypted: 'enc',
      externalAccountId: 'login',
    });
    prisma.campaign.findUnique.mockImplementation(async ({ where }: {
      where: { projectId_externalCampaignId: { externalCampaignId: string } };
    }) => {
      if (where.projectId_externalCampaignId.externalCampaignId === '555') {
        return {
          id: 'camp-platform',
          source: CampaignSource.platform,
        };
      }
      return null;
    });
    prisma.campaign.findMany.mockResolvedValue([
      { id: 'camp-archived', externalCampaignId: '9001' },
    ]);
    prisma.campaign.create.mockResolvedValue({ id: 'camp-archived' });

    const moduleRef = await Test.createTestingModule({
      providers: [
        CampaignSyncService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        {
          provide: ConnectorRouter,
          useValue: { forPlatform: jest.fn(() => connector) },
        },
        {
          provide: PlatformConnectionService,
          useValue: platformConnection,
        },
        { provide: PipelineQueue, useValue: queue },
        { provide: ReportsService, useValue: reports },
      ],
    }).compile();

    service = moduleRef.get(CampaignSyncService);
  });

  it('imports archived external campaign via fetchAllAccountCampaigns', async () => {
    const result = await service.syncProject('org-1', 'proj-1');

    expect(connector.fetchAllAccountCampaigns).toHaveBeenCalledWith(
      'proj-1',
      expect.objectContaining({ accessToken: 'access-token' }),
    );
    expect(prisma.campaign.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: 'proj-1',
        externalCampaignId: '9001',
        source: CampaignSource.external,
        status: LiveCampaignStatus.archived,
        targetingJson: { campaignName: 'Старая архивная' },
      }),
    });
    expect(prisma.campaign.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'camp-platform' },
      }),
    );
    expect(reports.collectCampaignSnapshots).toHaveBeenCalledWith('proj-1', [
      { id: 'camp-archived', externalCampaignId: '9001' },
    ]);
    expect(result.synced).toBe(1);
  });

  it('marks credential as needs reconnect when API verification fails', async () => {
    platformConnection.verifyProjectConnection.mockResolvedValue({
      ok: false,
      reason: 'Invalid OAuth token',
    });
    prisma.adPlatformCredential.update.mockResolvedValue({});

    const result = await service.syncProject('org-1', 'proj-1');

    expect(prisma.adPlatformCredential.update).toHaveBeenCalledWith({
      where: {
        projectId_platform: {
          projectId: 'proj-1',
          platform: 'yandex_direct',
        },
      },
      data: {
        apiVerifiedAt: expect.any(Date),
        apiVerificationError: 'Invalid OAuth token',
      },
    });
    expect(connector.fetchAllAccountCampaigns).not.toHaveBeenCalled();
    expect(result).toEqual({
      synced: 0,
      performanceSnapshots: 0,
      verificationFailed: true,
    });
  });
});
