import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AgentTaskStatus } from '@prisma/client';
import {
  AnthropicSemanticLlm,
  HeuristicSemanticLlm,
  runSemanticPipeline,
  SEMANTIC_HEURISTIC_FALLBACK_MESSAGE,
} from '@context-buyer/agents';
import { SemanticService } from './semantic.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectorRouter } from '../connectors/connector-router';
import { AiProviderService } from '../ai-provider/ai-provider.service';

jest.mock('@context-buyer/agents', () => {
  const actual = jest.requireActual('@context-buyer/agents');
  return {
    ...actual,
    runSemanticPipeline: jest.fn(),
  };
});

describe('SemanticService LLM wiring', () => {
  const runSemanticPipelineMock = runSemanticPipeline as jest.MockedFunction<
    typeof runSemanticPipeline
  >;

  const prisma = {
    project: { findFirst: jest.fn() },
    projectBrief: { findFirst: jest.fn() },
    briefs: undefined as unknown,
    projectAnalysis: { findUnique: jest.fn() },
    agentTask: {
      create: jest.fn(),
      update: jest.fn(),
    },
    llmCallLog: { create: jest.fn() },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<void>) =>
      fn({
        validationIssue: { deleteMany: jest.fn() },
        adCreative: { deleteMany: jest.fn() },
        semanticKeyword: { deleteMany: jest.fn(), createMany: jest.fn() },
        semanticCluster: {
          deleteMany: jest.fn(),
          create: jest.fn().mockResolvedValue({ id: 'cluster-1' }),
        },
        keywordEmbedding: { deleteMany: jest.fn() },
        semanticNegativeSuggestion: {
          deleteMany: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]),
          upsert: jest.fn(),
        },
        projectBrief: { create: jest.fn() },
      }),
    ),
    semanticNegativeSuggestion: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  const connectors = {
    forPlatform: jest.fn().mockReturnValue({
      getKeywordIdeas: jest.fn(),
    }),
  };

  const ai = {
    tryResolveOptional: jest.fn(),
  };

  let service: SemanticService;
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
      briefs: [
        {
          id: 'brief-1',
          payloadJson: {
            project: { website_url: 'https://x.example', geo: ['RU-MOW'] },
            marketing: {
              usp: ['test usp'],
              target_audience: [{ segment: 'all' }],
              forbidden_phrases: [],
            },
            exclusions: { global_negative_keywords: [] },
          },
        },
      ],
    });
    prisma.projectAnalysis.findUnique.mockResolvedValue({
      landingText: 'landing page text',
      customSeeds: ['custom seed'],
    });
    prisma.agentTask.create.mockResolvedValue({ id: 'task-1' });
    prisma.agentTask.update.mockResolvedValue({});
    runSemanticPipelineMock.mockResolvedValue({
      core: {
        clusters: [
          {
            cluster_name: 'test',
            category: 'generic',
            keywords: [{ phrase: 'купить test', intent: 'hot', frequency: 10 }],
            negative_keywords: [],
          },
        ],
        global_negatives: [],
      },
      suggested_negative_words: [],
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        SemanticService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConnectorRouter, useValue: connectors },
        { provide: AiProviderService, useValue: ai },
      ],
    }).compile();
    service = moduleRef.get(SemanticService);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('passes AnthropicSemanticLlm when api key is resolved', async () => {
    ai.tryResolveOptional.mockResolvedValue({
      provider: 'anthropic',
      apiKey: 'sk-ant-test',
      source: 'database',
    });

    const result = await service.run('org-1', 'proj-1');

    expect(runSemanticPipelineMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        llm: expect.any(AnthropicSemanticLlm),
        landingText: 'landing page text',
        extraSeeds: ['custom seed'],
      }),
    );
    expect(result.llmMode).toBe('anthropic');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('falls back to heuristic with warning when api key is missing', async () => {
    ai.tryResolveOptional.mockResolvedValue(null);

    const result = await service.run('org-1', 'proj-1');

    expect(runSemanticPipelineMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        llm: expect.any(HeuristicSemanticLlm),
      }),
    );
    expect(result.llmMode).toBe('heuristic');
    expect(warnSpy).toHaveBeenCalledWith(SEMANTIC_HEURISTIC_FALLBACK_MESSAGE);
    expect(prisma.agentTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: AgentTaskStatus.done }),
      }),
    );
  });
});
