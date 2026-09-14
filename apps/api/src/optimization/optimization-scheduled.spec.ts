import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  isOptimizationDue,
  nextOptimizationAfterRun,
  optimizationComparePeriods,
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
    buildOptimizationPlan: jest.fn().mockResolvedValue({
      period: { from: '2026-08-25', to: '2026-08-31' },
      recommendations: [],
    }),
    resolveOptimizationLlm: jest.fn(() => ({
      writer: {},
      mode: 'heuristic',
    })),
  };
});

describe('OptimizationService scheduled runs', () => {
  const launchedAt = new Date('2026-09-01T10:00:00.000Z');
  const prisma = {
    project: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    campaign: { findMany: jest.fn() },
    performanceSnapshot: { findMany: jest.fn() },
    projectBrief: { findFirst: jest.fn() },
    agentTask: {
      create: jest.fn().mockResolvedValue({ id: 'task-1' }),
      update: jest.fn(),
      findFirst: jest.fn(),
    },
    optimizationRecommendation: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
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
  const queue = {
    register: jest.fn(),
    schedule: jest.fn(),
    enqueueBackground: jest.fn().mockResolvedValue({ jobId: 'opt-1', queued: true }),
  };

  let service: OptimizationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    prisma.project.findFirst.mockResolvedValue({
      id: 'proj-1',
      organizationId: 'org-1',
      primaryPlatform: 'yandex_direct',
      autopilotEnabled: false,
      autopilotEnabledAt: null,
      optimizationLaunchedAt: launchedAt,
      optimizationLastRunAt: null,
      optimizationNextRunAt: launchedAt,
    });
    prisma.campaign.findMany.mockResolvedValue([
      { id: 'camp-1', externalCampaignId: '555', budget: 5000 },
    ]);
    // Snapshots must fall inside the rolling current window from
    // optimizationComparePeriods() — a fixed historical date ages out.
    const { current } = optimizationComparePeriods();
    prisma.performanceSnapshot.findMany.mockResolvedValue([
      {
        campaignId: 'camp-1',
        adGroupExternalId: 'ag-1',
        adGroupName: 'Группа A',
        date: new Date(`${current.to}T00:00:00.000Z`),
        impressions: 1000,
        clicks: 50,
        spend: 500,
        conversions: 2,
      },
    ]);
    prisma.projectBrief.findFirst.mockResolvedValue({
      payloadJson: { project: { target_cpl: 300 } },
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        OptimizationService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        {
          provide: ConnectorRouter,
          useValue: {
            forPlatform: jest.fn().mockReturnValue({
              getSearchTerms: jest.fn().mockResolvedValue([]),
            }),
          },
        },
        { provide: AlertsService, useValue: {} },
        { provide: AuditService, useValue: {} },
        { provide: PipelineQueue, useValue: queue },
        {
          provide: AiProviderService,
          useValue: {
            tryResolveOptional: jest.fn(),
            assertWithinMonthlyCap: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();
    service = moduleRef.get(OptimizationService);
  });

  it('enqueues launch optimization after scheduleOnLaunch', async () => {
    prisma.project.findFirst.mockResolvedValueOnce({
      id: 'proj-1',
      organizationId: 'org-1',
      optimizationLaunchedAt: null,
    });
    await service.scheduleOnLaunch('org-1', 'proj-1');
    expect(queue.enqueueBackground).toHaveBeenCalledWith({
      kind: 'optimization_run',
      organizationId: 'org-1',
      projectId: 'proj-1',
    });
    expect(prisma.project.update).toHaveBeenCalled();
  });

  it('runs scheduled optimization on due date and moves next run to day 7', async () => {
    const dueAt = new Date('2026-09-01T11:00:00.000Z');
    expect(
      isOptimizationDue(launchedAt, launchedAt, dueAt),
    ).toBe(true);

    await service.runScheduled('org-1', 'proj-1', 'scheduled');

    const expectedNext = nextOptimizationAfterRun(launchedAt, null, dueAt);
    expect(prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'proj-1' },
        data: expect.objectContaining({
          optimizationLastRunAt: expect.any(Date),
          optimizationNextRunAt: expectedNext,
        }),
      }),
    );
  });

  it('skips scheduled run without current-window snapshots: bumps next only', async () => {
    prisma.performanceSnapshot.findMany.mockResolvedValue([]);

    const result = await service.runScheduled('org-1', 'proj-1', 'scheduled');
    expect(result).toBeNull();

    expect(prisma.project.update).toHaveBeenCalledTimes(1);
    const updateData = prisma.project.update.mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    expect(updateData.optimizationLastRunAt).toBeUndefined();
    // First successful schedule slot is still launched_at + 7d (previousLastRunAt null).
    expect(updateData.optimizationNextRunAt).toEqual(
      nextOptimizationAfterRun(launchedAt, null, new Date()),
    );
  });

  it('scanDueOptimizationProjects enqueues only due projects', async () => {
    const due = new Date('2026-09-08T12:00:00.000Z');
    prisma.project.findMany.mockResolvedValue([
      {
        id: 'due',
        organizationId: 'org-1',
        optimizationLaunchedAt: launchedAt,
        optimizationNextRunAt: new Date('2026-09-08T09:00:00.000Z'),
      },
      {
        id: 'later',
        organizationId: 'org-1',
        optimizationLaunchedAt: launchedAt,
        optimizationNextRunAt: new Date('2026-09-20T09:00:00.000Z'),
      },
    ]);
    jest.useFakeTimers();
    jest.setSystemTime(due);
    await service.scanDueOptimizationProjects();
    jest.useRealTimers();
    expect(queue.enqueueBackground).toHaveBeenCalledTimes(1);
    expect(queue.enqueueBackground).toHaveBeenCalledWith({
      kind: 'optimization_run',
      organizationId: 'org-1',
      projectId: 'due',
    });
  });

  it('run uses only platform campaigns', async () => {
    await service.run('org-1', 'proj-1');
    expect(prisma.campaign.findMany).toHaveBeenCalledWith({
      where: { projectId: 'proj-1', source: 'platform' },
    });
  });
});
