import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AgentTaskStatus } from '@prisma/client';
import {
  AnthropicOptimizationLlm,
  HeuristicOptimizationLlm,
  buildOptimizationPlan,
  OPTIMIZATION_HEURISTIC_FALLBACK_MESSAGE,
} from '@context-buyer/agents';
import { OptimizationService } from './optimization.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { ConnectorRouter } from '../connectors/connector-router';
import { AlertsService } from '../alerts/alerts.service';
import { AuditService } from '../audit/audit.service';
import { PipelineQueue } from '../pipeline/pipeline.queue';
import { AiProviderService } from '../ai-provider/ai-provider.service';

jest.mock('@context-buyer/agents', () => {
  const actual = jest.requireActual('@context-buyer/agents');
  return {
    ...actual,
    buildOptimizationPlan: jest.fn(),
  };
});

describe('OptimizationService LLM wiring', () => {
  const buildOptimizationPlanMock = buildOptimizationPlan as jest.MockedFunction<
    typeof buildOptimizationPlan
  >;

  const prisma = {
    project: { findFirst: jest.fn(), findFirstOrThrow: jest.fn() },
    campaign: { findMany: jest.fn() },
    performanceSnapshot: { findMany: jest.fn() },
    projectBrief: { findFirst: jest.fn() },
    agentTask: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
    },
    optimizationRecommendation: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
    },
    adPlatformCredential: { findFirst: jest.fn().mockResolvedValue(null) },
    llmCallLog: { create: jest.fn() },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<void>) =>
      fn({
        optimizationRecommendation: {
          deleteMany: jest.fn(),
          createMany: jest.fn(),
        },
      }),
    ),
  };

  const ai = { tryResolveOptional: jest.fn() };
  const config = { get: jest.fn() };
  const connectors = { forPlatform: jest.fn() };
  const alerts = {};
  const audit = {};
  const queue = { register: jest.fn(), schedule: jest.fn() };

  let service: OptimizationService;
  let warnSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    prisma.project.findFirst.mockResolvedValue({
      id: 'proj-1',
      organizationId: 'org-1',
      primaryPlatform: 'yandex_direct',
      autopilotEnabled: false,
      autopilotEnabledAt: null,
    });
    prisma.campaign.findMany.mockResolvedValue([
      {
        id: 'camp-1',
        externalCampaignId: '555',
        budget: 5000,
      },
    ]);
    prisma.performanceSnapshot.findMany.mockResolvedValue([
      {
        campaignId: 'camp-1',
        date: new Date('2026-08-20T00:00:00.000Z'),
        impressions: 800,
        clicks: 40,
        spend: 800,
        conversions: 0,
      },
    ]);
    prisma.projectBrief.findFirst.mockResolvedValue({
      payloadJson: { project: { target_cpl: 300 } },
    });
    prisma.agentTask.create.mockResolvedValue({ id: 'task-1' });
    prisma.agentTask.update.mockResolvedValue({});
    prisma.agentTask.findFirst.mockResolvedValue({
      outputRef: 'recommendations:1:anthropic',
    });
    prisma.optimizationRecommendation.findMany.mockResolvedValue([]);
    connectors.forPlatform.mockReturnValue({
      getSearchTerms: jest.fn().mockResolvedValue([]),
    });
    buildOptimizationPlanMock.mockResolvedValue({
      period: { from: '2026-08-20', to: '2026-08-26' },
      recommendations: [
        {
          type: 'pause_campaign',
          campaign_id: 'camp-1',
          campaign_external_id: '555',
          evidence: {
            impressions: 800,
            clicks: 40,
            spend: 800,
            conversions: 0,
            ctr: 5,
            cpc: 20,
            cpl: null,
            target_cpl: 300,
          },
          action: { pause: true },
          rationale: 'Клики 40, расход 800, конверсий 0',
        },
      ],
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        OptimizationService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: ConnectorRouter, useValue: connectors },
        { provide: AlertsService, useValue: alerts },
        { provide: AuditService, useValue: audit },
        { provide: PipelineQueue, useValue: queue },
        { provide: AiProviderService, useValue: ai },
      ],
    }).compile();
    service = moduleRef.get(OptimizationService);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('passes AnthropicOptimizationLlm when api key is resolved', async () => {
    ai.tryResolveOptional.mockResolvedValue({
      provider: 'anthropic',
      apiKey: 'sk-ant-test',
      source: 'database',
    });

    const result = await service.run('org-1', 'proj-1');

    expect(buildOptimizationPlanMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(AnthropicOptimizationLlm),
    );
    expect(result.llmMode).toBe('anthropic');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('falls back to heuristic with warning when api key is missing', async () => {
    ai.tryResolveOptional.mockResolvedValue(null);
    prisma.agentTask.findFirst.mockResolvedValue({
      outputRef: 'recommendations:1:heuristic',
    });

    const result = await service.run('org-1', 'proj-1');

    expect(buildOptimizationPlanMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(HeuristicOptimizationLlm),
    );
    expect(result.llmMode).toBe('heuristic');
    expect(warnSpy).toHaveBeenCalledWith(OPTIMIZATION_HEURISTIC_FALLBACK_MESSAGE);
    expect(prisma.agentTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: AgentTaskStatus.done }),
      }),
    );
  });
});
