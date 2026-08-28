import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  LiveCampaignStatus,
  OptimizationRecStatus,
  OptimizationRecType,
} from '@prisma/client';
import { OptimizationService } from './optimization.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectorRouter } from '../connectors/connector-router';
import { AlertsService } from '../alerts/alerts.service';
import { AuditService } from '../audit/audit.service';
import { PipelineQueue } from '../pipeline/pipeline.queue';
import { AiProviderService } from '../ai-provider/ai-provider.service';
import {
  encryptSecret,
  parseTokenEncryptionKey,
} from '../security/token-encryption';

const TEST_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('OptimizationService autopilot toggle', () => {
  const prisma = {
    project: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    agentTask: { findFirst: jest.fn(), create: jest.fn() },
    optimizationRecommendation: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    adPlatformCredential: { findFirst: jest.fn() },
    campaign: { update: jest.fn() },
  };
  const connectors = { forPlatform: jest.fn() };
  let service: OptimizationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.project.findFirst.mockResolvedValue({
      id: 'p1',
      organizationId: 'org-a',
      primaryPlatform: 'yandex_direct',
      autopilotEnabled: false,
      autopilotEnabledAt: null,
    });
    prisma.agentTask.findFirst.mockResolvedValue(null);
    prisma.agentTask.create.mockResolvedValue({});
    prisma.project.update.mockResolvedValue({});
    prisma.optimizationRecommendation.update.mockResolvedValue({});
    prisma.campaign.update.mockResolvedValue({});
    const module = await Test.createTestingModule({
      providers: [
        OptimizationService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'TOKEN_ENCRYPTION_KEY' ? TEST_KEY : undefined,
          },
        },
        { provide: ConnectorRouter, useValue: connectors },
        { provide: AlertsService, useValue: { recordIfRateLimited: jest.fn() } },
        {
          provide: PipelineQueue,
          useValue: { register: jest.fn(), schedule: jest.fn() },
        },
        {
          provide: AuditService,
          useValue: {
            wrapWrite: async (
              _ctx: unknown,
              fn: () => Promise<unknown>,
            ) => fn(),
          },
        },
        {
          provide: AiProviderService,
          useValue: {
            requireReady: jest.fn().mockResolvedValue({
              apiKey: 'sk-test',
              provider: 'openai',
              source: 'env',
            }),
            resolveApiKey: jest.fn().mockResolvedValue('sk-test'),
          },
        },
      ],
    }).compile();
    service = module.get(OptimizationService);
  });

  it('refuses to enable without an explicit confirm flag', async () => {
    await expect(
      service.setAutopilot('org-a', 'p1', true, false),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.project.update).not.toHaveBeenCalled();
  });

  it('refuses to enable before recommendation quality is proven', async () => {
    prisma.optimizationRecommendation.findMany.mockResolvedValue([
      { status: OptimizationRecStatus.proposed },
    ]);
    await expect(
      service.setAutopilot('org-a', 'p1', true, true),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.project.update).not.toHaveBeenCalled();
  });

  it('enables autopilot only for the requested project after the gate', async () => {
    prisma.optimizationRecommendation.findMany
      .mockResolvedValueOnce([
        { status: OptimizationRecStatus.applied },
        { status: OptimizationRecStatus.applied },
        { status: OptimizationRecStatus.rejected },
      ])
      .mockResolvedValueOnce([]);
    prisma.project.findFirst
      .mockResolvedValueOnce({
        id: 'p1',
        organizationId: 'org-a',
        autopilotEnabled: false,
        autopilotEnabledAt: null,
      })
      .mockResolvedValueOnce({
        id: 'p1',
        organizationId: 'org-a',
        autopilotEnabled: true,
        autopilotEnabledAt: new Date(),
      });
    const result = await service.setAutopilot('org-a', 'p1', true, true);
    expect(prisma.project.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: expect.objectContaining({ autopilotEnabled: true }),
    });
    expect(result.autopilot).toBe(true);
    expect(connectors.forPlatform).not.toHaveBeenCalled();
  });

  it('turns autopilot off without touching the ads connector', async () => {
    prisma.optimizationRecommendation.findMany.mockResolvedValue([]);
    prisma.project.findFirst
      .mockResolvedValueOnce({
        id: 'p1',
        organizationId: 'org-a',
        autopilotEnabled: true,
        autopilotEnabledAt: new Date(),
      })
      .mockResolvedValueOnce({
        id: 'p1',
        organizationId: 'org-a',
        autopilotEnabled: false,
        autopilotEnabledAt: new Date(),
      });
    await service.setAutopilot('org-a', 'p1', false);
    expect(prisma.project.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { autopilotEnabled: false },
    });
    expect(connectors.forPlatform).not.toHaveBeenCalled();
  });

  it('still requires approve before a manual apply', async () => {
    prisma.optimizationRecommendation.findFirst.mockResolvedValue({
      id: 'r1',
      projectId: 'p1',
      campaignId: 'c1',
      type: OptimizationRecType.pause_campaign,
      status: OptimizationRecStatus.proposed,
      actionJson: {},
      campaign: { externalCampaignId: '555' },
    });
    await expect(service.apply('org-a', 'p1', 'r1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(connectors.forPlatform).not.toHaveBeenCalled();
  });

  it('auto-applies a proposed pause through the connector and never creates a campaign', async () => {
    const pauseCampaign = jest.fn().mockResolvedValue(undefined);
    const createCampaign = jest.fn();
    connectors.forPlatform.mockReturnValue({
      pauseCampaign,
      createCampaign,
      setBudget: jest.fn(),
      addNegativeKeywords: jest.fn(),
    });
    prisma.optimizationRecommendation.findFirst.mockResolvedValue({
      id: 'r1',
      projectId: 'p1',
      campaignId: 'c1',
      type: OptimizationRecType.pause_campaign,
      status: OptimizationRecStatus.proposed,
      actionJson: {},
      campaign: { externalCampaignId: '555' },
    });
    prisma.adPlatformCredential.findFirst.mockResolvedValue({
      accessTokenEncrypted: encryptSecret(
        'tok',
        parseTokenEncryptionKey(TEST_KEY),
      ),
      externalAccountId: 'login',
    });
    prisma.optimizationRecommendation.findMany.mockResolvedValue([]);
    await service.apply('org-a', 'p1', 'r1', 'autopilot');
    expect(pauseCampaign).toHaveBeenCalledWith(
      'p1',
      '555',
      expect.objectContaining({ accessToken: 'tok' }),
    );
    expect(prisma.campaign.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: LiveCampaignStatus.paused },
    });
    expect(createCampaign).not.toHaveBeenCalled();
  });
});
