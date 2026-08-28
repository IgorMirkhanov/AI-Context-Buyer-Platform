import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AgentType } from '@prisma/client';
import {
  estimateLlmCostUsd,
  previewLlmText,
  resolveLlmCostUsd,
  summarizeLlmUsage,
} from '@context-buyer/agents';
import { LlmUsageService } from './llm-usage.service';
import { PrismaService } from '../prisma/prisma.service';

describe('LLM cost helpers', () => {
  it('keeps heuristic and mock models at zero', () => {
    expect(estimateLlmCostUsd('heuristic', 10_000, 2_000)).toBe(0);
    expect(estimateLlmCostUsd('mock', 10_000, 2_000)).toBe(0);
  });

  it('prices an OpenAI image call as a flat rate', () => {
    expect(estimateLlmCostUsd('openai', 0, 0)).toBe(0.04);
    expect(estimateLlmCostUsd('dall-e-3', 0, 0)).toBe(0.04);
  });

  it('uses the provider cost when it is already set', () => {
    expect(
      resolveLlmCostUsd({
        model: 'claude-sonnet',
        inputTokens: 1000,
        outputTokens: 200,
        costUsd: 0.12,
      }),
    ).toBe(0.12);
  });

  it('estimates Claude tokens when cost is missing', () => {
    const cost = estimateLlmCostUsd('claude-3-5-sonnet', 1_000_000, 1_000_000);
    expect(cost).toBe(18);
  });

  it('redacts secrets from the dashboard preview', () => {
    expect(previewLlmText('token sk-abc123xyz and Bearer secret-value')).toBe(
      'token [redacted] and [redacted]',
    );
  });

  it('aggregates cost per agent', () => {
    const summary = summarizeLlmUsage([
      {
        agentType: 'semantic',
        inputTokens: 100,
        outputTokens: 20,
        costUsd: 0.01,
      },
      {
        agentType: 'semantic',
        inputTokens: 50,
        outputTokens: 10,
        costUsd: 0.02,
      },
      {
        agentType: 'media',
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0.04,
      },
    ]);
    expect(summary.calls).toBe(3);
    expect(summary.costUsd).toBe(0.07);
    expect(summary.byAgent[0]).toEqual(
      expect.objectContaining({ agentType: 'media', costUsd: 0.04, calls: 1 }),
    );
    expect(summary.byAgent[1]).toEqual(
      expect.objectContaining({
        agentType: 'semantic',
        calls: 2,
        inputTokens: 150,
        costUsd: 0.03,
      }),
    );
  });
});

describe('LlmUsageService', () => {
  const prisma = {
    project: { findFirst: jest.fn() },
    llmCallLog: { findMany: jest.fn() },
  };
  let service: LlmUsageService;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.project.findFirst.mockResolvedValue({
      id: 'p1',
      organizationId: 'org-a',
    });
    prisma.llmCallLog.findMany.mockResolvedValue([
      {
        id: 'log-1',
        projectId: 'p1',
        agentType: AgentType.semantic,
        step: 'extract_masks',
        model: 'heuristic',
        prompt: 'secret Bearer abc.def and the brief',
        response: 'should not leak',
        inputTokens: 40,
        outputTokens: 10,
        costUsd: 0,
        latencyMs: 12,
        createdAt: new Date('2026-08-27T12:00:00.000Z'),
      },
    ]);
    const module = await Test.createTestingModule({
      providers: [
        LlmUsageService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(LlmUsageService);
  });

  it('does not read logs of a sibling organization project', async () => {
    prisma.project.findFirst.mockResolvedValue(null);
    await expect(service.get('org-b', 'p1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.llmCallLog.findMany).not.toHaveBeenCalled();
  });

  it('returns totals without full prompt or response text', async () => {
    const result = await service.get('org-a', 'p1');
    expect(prisma.project.findFirst).toHaveBeenCalledWith({
      where: { id: 'p1', organizationId: 'org-a' },
    });
    expect(prisma.llmCallLog.findMany).toHaveBeenCalledWith({
      where: { projectId: 'p1' },
      orderBy: { createdAt: 'desc' },
    });
    expect(result.summary.calls).toBe(1);
    expect(result.recent[0].promptPreview).toContain('[redacted]');
    expect(JSON.stringify(result)).not.toContain('should not leak');
    expect(JSON.stringify(result)).not.toContain('Bearer abc.def');
    expect(result.recent[0]).not.toHaveProperty('prompt');
    expect(result.recent[0]).not.toHaveProperty('response');
  });
});
