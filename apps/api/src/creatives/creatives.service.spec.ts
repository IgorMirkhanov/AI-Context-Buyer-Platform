import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AgentTaskStatus } from '@prisma/client';
import {
  AnthropicCopywriter,
  HeuristicCopywriter,
  runCopyAndValidate,
  COPYWRITING_HEURISTIC_FALLBACK_MESSAGE,
} from '@context-buyer/agents';
import { CreativesService } from './creatives.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiProviderService } from '../ai-provider/ai-provider.service';

jest.mock('@context-buyer/agents', () => {
  const actual = jest.requireActual('@context-buyer/agents');
  return {
    ...actual,
    runCopyAndValidate: jest.fn(),
  };
});

describe('CreativesService LLM wiring', () => {
  const runCopyAndValidateMock = runCopyAndValidate as jest.MockedFunction<
    typeof runCopyAndValidate
  >;

  const prisma = {
    project: { findFirst: jest.fn() },
    projectBrief: { findFirst: jest.fn() },
    projectCampaignPlan: { findUnique: jest.fn() },
    semanticCluster: { findMany: jest.fn() },
    platformLimit: { findMany: jest.fn() },
    agentTask: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
    },
    adCreative: { findMany: jest.fn() },
    validationIssue: { findMany: jest.fn() },
    llmCallLog: { create: jest.fn() },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<void>) =>
      fn({
        validationIssue: {
          deleteMany: jest.fn(),
          create: jest.fn(),
          createMany: jest.fn(),
        },
        adCreative: {
          deleteMany: jest.fn(),
          create: jest.fn().mockResolvedValue({ id: 'cr-1' }),
          createMany: jest.fn(),
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'cr-1',
              clusterId: 'cl-1',
              type: 'headline1',
              abGroup: 'A',
            },
          ]),
        },
      }),
    ),
  };

  const ai = {
    tryResolveOptional: jest.fn(),
  };

  let service: CreativesService;
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
    });
    prisma.projectBrief.findFirst.mockResolvedValue({
      payloadJson: {
        project: { geo: ['RU-MOW'] },
        marketing: {
          usp: ['test usp'],
          target_audience: [{ segment: 'all' }],
          forbidden_phrases: [],
        },
      },
    });
    prisma.projectCampaignPlan.findUnique.mockResolvedValue({
      approved: true,
    });
    prisma.semanticCluster.findMany.mockResolvedValue([
      {
        id: 'cl-1',
        name: 'test cluster',
        category: 'generic',
        keywords: [
          {
            phrase: 'купить test',
            intent: 'hot',
            frequency: 10,
            isNegative: false,
          },
        ],
      },
    ]);
    prisma.platformLimit.findMany.mockResolvedValue([
      { elementType: 'headline1', maxLength: 56, maxCount: 1 },
      { elementType: 'headline2', maxLength: 30, maxCount: 1 },
      { elementType: 'description', maxLength: 81, maxCount: 1 },
      { elementType: 'sitelink', maxLength: 30, maxCount: 4 },
      { elementType: 'callout', maxLength: 25, maxCount: 8 },
    ]);
    prisma.agentTask.create.mockResolvedValue({ id: 'task-1' });
    prisma.agentTask.update.mockResolvedValue({});
    prisma.agentTask.findFirst.mockResolvedValue({
      outputRef: 'ad_creatives:anthropic',
    });
    prisma.adCreative.findMany.mockResolvedValue([]);
    prisma.validationIssue.findMany.mockResolvedValue([]);
    runCopyAndValidateMock.mockResolvedValue({
      creatives: [
        {
          cluster_name: 'test cluster',
          ab_variants: 2,
          ads: [
            {
              ab_group: 'A',
              headline1: 'test',
              headline2: 'test usp',
              description: 'test usp desc',
              sitelinks: ['test usp'],
              callouts: ['test usp'],
            },
          ],
        },
      ],
      issues: [],
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        CreativesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiProviderService, useValue: ai },
      ],
    }).compile();
    service = moduleRef.get(CreativesService);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('passes AnthropicCopywriter when api key is resolved', async () => {
    ai.tryResolveOptional.mockResolvedValue({
      provider: 'anthropic',
      apiKey: 'sk-ant-test',
      source: 'database',
    });

    const result = await service.run('org-1', 'proj-1');

    expect(runCopyAndValidateMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.any(Array),
      expect.any(AnthropicCopywriter),
    );
    expect(result.llmMode).toBe('anthropic');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('falls back to heuristic with warning when api key is missing', async () => {
    ai.tryResolveOptional.mockResolvedValue(null);
    prisma.agentTask.findFirst.mockResolvedValue({
      outputRef: 'ad_creatives:heuristic',
    });

    const result = await service.run('org-1', 'proj-1');

    expect(runCopyAndValidateMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.any(Array),
      expect.any(HeuristicCopywriter),
    );
    expect(result.llmMode).toBe('heuristic');
    expect(warnSpy).toHaveBeenCalledWith(COPYWRITING_HEURISTIC_FALLBACK_MESSAGE);
    expect(prisma.agentTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: AgentTaskStatus.done }),
      }),
    );
  });
});
