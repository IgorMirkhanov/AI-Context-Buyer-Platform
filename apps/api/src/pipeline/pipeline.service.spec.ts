import { BadRequestException, NotFoundException } from '@nestjs/common';

import { Test } from '@nestjs/testing';

import {

  AgentTaskStatus,

  AgentType,

  CampaignDraftStatus,

  IssueLevel,

} from '@prisma/client';

import { AnalysisService } from '../analysis/analysis.service';

import { CampaignPlanService } from '../campaign-plan/campaign-plan.service';

import { PipelineService } from './pipeline.service';

import { PrismaService } from '../prisma/prisma.service';

import { SemanticService } from '../semantic/semantic.service';

import { CreativesService } from '../creatives/creatives.service';

import { CampaignsService } from '../campaigns/campaigns.service';

import { PipelineQueue } from './pipeline.queue';

import { AlertsService } from '../alerts/alerts.service';

import { AiProviderService } from '../ai-provider/ai-provider.service';

import { AI_PROVIDER_REQUIRED_MESSAGE } from '@context-buyer/agents';



describe('PipelineService', () => {

  const db = {

    briefs: 1,

    analysis: 0,

    clusters: 0,

    plan: null as { approved: boolean } | null,

    creatives: 0,

    critical: 0,

    draft: null as {
      status: CampaignDraftStatus;
      structureJson?: unknown;
    } | null,

    campaigns: 0,

    snapshots: 0,

    latestTask: null as {

      agentType: AgentType;

      status: AgentTaskStatus;

      error: string | null;

    } | null,

  };



  const prisma = {

    project: { findFirst: jest.fn() },

    projectBrief: { count: jest.fn() },

    projectAnalysis: { count: jest.fn() },

    semanticCluster: { count: jest.fn() },

    projectCampaignPlan: { findUnique: jest.fn() },

    adCreative: { count: jest.fn() },

    validationIssue: { count: jest.fn() },

    campaignDraft: { findFirst: jest.fn(), deleteMany: jest.fn() },

    campaign: { count: jest.fn() },

    performanceSnapshot: { count: jest.fn() },

    agentTask: { findFirst: jest.fn(), updateMany: jest.fn(), update: jest.fn() },

  };

  const analysis = { run: jest.fn() };

  const semantic = { run: jest.fn() };

  const campaignPlan = { run: jest.fn(), approve: jest.fn() };

  const creatives = { run: jest.fn() };

  const campaigns = { build: jest.fn(), publish: jest.fn() };

  const queue = {

    start: jest.fn(),

    register: jest.fn(),

    enqueue: jest.fn(),

    getStatus: jest.fn(),

    cancel: jest.fn(),

  };

  const alerts = { recordPipelineFailure: jest.fn() };

  const ai = {

    requireReady: jest.fn().mockResolvedValue({

      apiKey: 'sk-test',

      provider: 'openai',

      source: 'env',

    }),

  };

  let service: PipelineService;



  beforeEach(async () => {

    jest.clearAllMocks();

    ai.requireReady.mockResolvedValue({

      apiKey: 'sk-test',

      provider: 'openai',

      source: 'env',

    });

    db.briefs = 1;

    db.analysis = 0;

    db.clusters = 0;

    db.plan = null;

    db.creatives = 0;

    db.critical = 0;

    db.draft = null;

    db.campaigns = 0;

    db.snapshots = 0;

    db.latestTask = null;

    prisma.project.findFirst.mockResolvedValue({

      id: 'p1',

      organizationId: 'org-a',

    });

    prisma.projectBrief.count.mockImplementation(async () => db.briefs);

    prisma.projectAnalysis.count.mockImplementation(async () => db.analysis);

    prisma.semanticCluster.count.mockImplementation(async () => db.clusters);

    prisma.projectCampaignPlan.findUnique.mockImplementation(async () => db.plan);

    prisma.adCreative.count.mockImplementation(async () => db.creatives);

    prisma.validationIssue.count.mockImplementation(async (args: { where: { level: IssueLevel } }) =>

      args.where.level === IssueLevel.critical ? db.critical : 0,

    );

    prisma.campaignDraft.findFirst.mockImplementation(async () => db.draft);

    prisma.campaign.count.mockImplementation(async () => db.campaigns);

    prisma.performanceSnapshot.count.mockImplementation(async () => db.snapshots);

    prisma.agentTask.findFirst.mockImplementation(async () => db.latestTask);

    analysis.run.mockImplementation(async () => {

      db.analysis = 1;

    });

    semantic.run.mockImplementation(async () => {

      db.clusters = 2;

    });

    campaignPlan.run.mockImplementation(async () => {

      db.plan = { approved: false };

    });

    campaignPlan.approve.mockImplementation(async () => {

      if (db.plan) db.plan.approved = true;

    });

    creatives.run.mockImplementation(async () => {

      db.creatives = 4;

    });

    campaigns.build.mockImplementation(async () => {

      db.draft = { status: CampaignDraftStatus.pending_approval };

    });

    queue.getStatus.mockResolvedValue({

      mode: 'inline',

      jobId: 'pipeline:p1',

      status: 'idle',

      failedReason: null,

    });

    queue.enqueue.mockResolvedValue({ jobId: 'pipeline:p1', queued: true });

    const module = await Test.createTestingModule({

      providers: [

        PipelineService,

        { provide: PrismaService, useValue: prisma },

        { provide: AnalysisService, useValue: analysis },

        { provide: SemanticService, useValue: semantic },

        { provide: CampaignPlanService, useValue: campaignPlan },

        { provide: CreativesService, useValue: creatives },

        { provide: CampaignsService, useValue: campaigns },

        { provide: PipelineQueue, useValue: queue },

        { provide: AlertsService, useValue: alerts },

        {

          provide: AiProviderService,

          useValue: ai,

        },

      ],

    }).compile();

    service = module.get(PipelineService);

  });



  it('does not run a sibling organization project', async () => {

    prisma.project.findFirst.mockResolvedValue(null);

    await expect(service.run('org-b', 'p1')).rejects.toBeInstanceOf(

      NotFoundException,

    );

    expect(semantic.run).not.toHaveBeenCalled();

  });



  it('runs full pipeline from brief to awaiting_approval', async () => {

    const result = await service.run('org-a', 'p1');

    expect(analysis.run).toHaveBeenCalledWith('org-a', 'p1');

    expect(semantic.run).toHaveBeenCalledWith('org-a', 'p1');

    expect(campaignPlan.run).toHaveBeenCalledWith('org-a', 'p1');

    expect(campaignPlan.approve).toHaveBeenCalledWith('org-a', 'p1');

    expect(creatives.run).toHaveBeenCalledWith('org-a', 'p1');

    expect(campaigns.build).toHaveBeenCalledWith('org-a', 'p1');

    expect(result.stage).toBe('awaiting_approval');

    expect(result.fullRunAvailable).toBe(false);

  });



  it('continues full run from semantic_ready to draft', async () => {

    db.analysis = 1;

    db.clusters = 2;

    const result = await service.run('org-a', 'p1');

    expect(campaignPlan.run).toHaveBeenCalledWith('org-a', 'p1');

    expect(campaignPlan.approve).toHaveBeenCalledWith('org-a', 'p1');

    expect(creatives.run).toHaveBeenCalledWith('org-a', 'p1');

    expect(campaigns.build).toHaveBeenCalledWith('org-a', 'p1');

    expect(result.stage).toBe('awaiting_approval');

  });



  it('runs copy → draft when plan is approved and never publishes', async () => {

    db.analysis = 1;

    db.clusters = 2;

    db.plan = { approved: true };

    const result = await service.run('org-a', 'p1');

    expect(campaignPlan.run).not.toHaveBeenCalled();

    expect(creatives.run).toHaveBeenCalledWith('org-a', 'p1');

    expect(campaigns.build).toHaveBeenCalledWith('org-a', 'p1');

    expect(campaigns.publish).not.toHaveBeenCalled();

    expect(result.stage).toBe('awaiting_approval');

    expect(result.nextStep).toBeNull();

    expect(result.autoRunnable).toBe(false);

  });



  it('refuses to auto-publish when the draft is waiting for confirmation', async () => {

    db.analysis = 1;

    db.clusters = 2;

    db.plan = { approved: true };

    db.creatives = 4;

    db.draft = { status: CampaignDraftStatus.pending_approval };

    await expect(service.run('org-a', 'p1')).rejects.toBeInstanceOf(

      BadRequestException,

    );

    expect(campaigns.build).not.toHaveBeenCalled();

    expect(campaigns.publish).not.toHaveBeenCalled();

  });



  it('enqueues a job for the requested project only and never publishes', async () => {

    const result = await service.enqueueOrRun('org-a', 'p1');

    expect(queue.enqueue).toHaveBeenCalledWith({

      organizationId: 'org-a',

      projectId: 'p1',

    });

    expect(campaigns.publish).not.toHaveBeenCalled();

    expect(result.queue.jobId).toBe('pipeline:p1');

  });



  it('does not enqueue a sibling organization project', async () => {

    prisma.project.findFirst.mockResolvedValue(null);

    await expect(service.enqueueOrRun('org-b', 'p1')).rejects.toBeInstanceOf(

      NotFoundException,

    );

    expect(queue.enqueue).not.toHaveBeenCalled();

  });



  it('does not enqueue publish when the draft waits for confirmation', async () => {

    db.analysis = 1;

    db.clusters = 2;

    db.plan = { approved: true };

    db.creatives = 4;

    db.draft = { status: CampaignDraftStatus.pending_approval };

    await expect(service.enqueueOrRun('org-a', 'p1')).rejects.toBeInstanceOf(

      BadRequestException,

    );

    expect(queue.enqueue).not.toHaveBeenCalled();

    expect(campaigns.publish).not.toHaveBeenCalled();

  });



  it('queued processor stops at approval without publishing', async () => {

    db.analysis = 1;

    db.clusters = 2;

    db.plan = { approved: true };

    db.creatives = 4;

    db.draft = { status: CampaignDraftStatus.pending_approval };

    const result = await service.processQueuedRun('org-a', 'p1');

    expect(result.stage).toBe('awaiting_approval');

    expect(campaigns.build).not.toHaveBeenCalled();

    expect(campaigns.publish).not.toHaveBeenCalled();

  });



  it('does not start agents when the AI provider key is missing', async () => {

    ai.requireReady.mockRejectedValue(

      new BadRequestException(AI_PROVIDER_REQUIRED_MESSAGE),

    );

    await expect(service.run('org-a', 'p1')).rejects.toBeInstanceOf(

      BadRequestException,

    );

    expect(semantic.run).not.toHaveBeenCalled();

    expect(creatives.run).not.toHaveBeenCalled();

  });



  it('cancels awaiting draft and allows rework', async () => {

    db.analysis = 1;

    db.clusters = 2;

    db.plan = { approved: true };

    db.creatives = 4;

    db.draft = { status: CampaignDraftStatus.pending_approval };

    queue.getStatus.mockResolvedValue({

      mode: 'inline',

      jobId: 'pipeline:p1',

      status: 'idle',

      failedReason: null,

    });

    queue.cancel.mockResolvedValue(false);

    prisma.campaignDraft.deleteMany.mockImplementation(async () => {

      db.draft = null;

      return { count: 1 };

    });

    const result = await service.cancel('org-a', 'p1');

    expect(prisma.campaignDraft.deleteMany).toHaveBeenCalled();

    expect(result.canCancel).toBe(false);

    expect(result.stage).not.toBe('awaiting_approval');

  });



  it('inspect surfaces failed draft publish error instead of awaiting_approval', async () => {

    db.briefs = 1;

    db.analysis = 1;

    db.clusters = 1;

    db.plan = { approved: true };

    db.creatives = 2;

    db.draft = {

      status: CampaignDraftStatus.failed,

      structureJson: {

        campaigns: [

          {

            campaign: {

              name: 'C1',

              type: 'search',

              budget_daily: 1000,

              currency: 'RUB',

              bidding_strategy: 'manual_cpc',

              geo: ['RU'],

              schedule: { days: ['mon'], hours: '9-18' },

              href: 'https://example.com',

              initial_status: 'paused',

            },

            ad_groups: [],

            publish: {

              step: 'createCampaign',

              error: 'Collect performance snapshots first',

            },

          },

        ],

        global_negatives: [],

      },

    };

    const result = await service.inspect('org-a', 'p1');

    expect(result.stage).toBe('failed');

    expect(result.facts.draftPublishFailed).toBe(true);

    expect(result.facts.hasLiveCampaign).toBe(false);

    expect(result.facts.lastError).toBe('Collect performance snapshots first');

    expect(result.blockedReason).toBe('Collect performance snapshots first');

  });



  it('rejects cancel after campaign is live', async () => {

    db.campaigns = 1;

    db.draft = { status: CampaignDraftStatus.pending_approval };

    queue.getStatus.mockResolvedValue({

      mode: 'inline',

      jobId: 'pipeline:p1',

      status: 'idle',

      failedReason: null,

    });

    await expect(service.cancel('org-a', 'p1')).rejects.toBeInstanceOf(

      BadRequestException,

    );

  });

});

