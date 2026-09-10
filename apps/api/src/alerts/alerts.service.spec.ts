import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AgentTaskStatus, AgentType, OpsAlertKind } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { AlertsService } from './alerts.service';
import { PrismaService } from '../prisma/prisma.service';
import { PipelineQueue } from '../pipeline/pipeline.queue';
import * as alertWebhook from './alert-webhook';

describe('AlertsService', () => {
  const db = {
    project: { findFirst: jest.fn() },
    adPlatformCredential: { findFirst: jest.fn() },
    agentTask: { findFirst: jest.fn() },
    opsAlert: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  let service: AlertsService;
  let configGet: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    configGet = jest.fn((key: string) =>
      key === 'ALERT_WEBHOOK_URL' ? 'https://hooks.example/a' : 0,
    );
    db.project.findFirst.mockResolvedValue({
      id: 'p1',
      organizationId: 'org-a',
    });
    db.adPlatformCredential.findFirst.mockResolvedValue({
      expiresAt: new Date('2027-01-01T00:00:00.000Z'),
    });
    db.agentTask.findFirst.mockResolvedValue({
      agentType: AgentType.semantic,
      error: 'Wordstat timeout',
      status: AgentTaskStatus.failed,
    });
    db.opsAlert.findFirst.mockResolvedValue(null);
    db.opsAlert.findMany.mockResolvedValue([]);
    db.opsAlert.create.mockImplementation(async ({ data }: { data: object }) => ({
      id: 'a1',
      ...data,
    }));
    const module = await Test.createTestingModule({
      providers: [
        AlertsService,
        { provide: PrismaService, useValue: db },
        { provide: ConfigService, useValue: { get: configGet } },
        {
          provide: PipelineQueue,
          useValue: { register: jest.fn(), schedule: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(AlertsService);
  });

  it('does not scan a sibling organization project', async () => {
    db.project.findFirst.mockResolvedValue(null);
    await expect(service.list('org-b', 'p1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(db.opsAlert.create).not.toHaveBeenCalled();
  });

  it('opens a pipeline failure alert for the requested project only', async () => {
    await service.list('org-a', 'p1');
    expect(db.project.findFirst).toHaveBeenCalledWith({
      where: { id: 'p1', organizationId: 'org-a' },
    });
    expect(db.opsAlert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: 'p1',
        kind: OpsAlertKind.pipeline_failed,
      }),
    });
  });

  it('notifies ALERT_WEBHOOK_URL once when a critical alert is created', async () => {
    const notify = jest
      .spyOn(alertWebhook, 'notifyAlertWebhook')
      .mockResolvedValue(true);
    await service.recordPipelineFailure('org-a', 'p1', new Error('boom'));
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      'https://hooks.example/a',
      expect.objectContaining({
        projectId: 'p1',
        kind: OpsAlertKind.pipeline_failed,
      }),
    );
  });

  it('acknowledges OAuth alerts only for the requested project', async () => {
    db.opsAlert.updateMany.mockResolvedValue({ count: 1 });
    await service.acknowledgeOauthAlerts('org-a', 'p1');
    expect(db.opsAlert.updateMany).toHaveBeenCalledWith({
      where: {
        projectId: 'p1',
        kind: {
          in: [OpsAlertKind.oauth_expiring, OpsAlertKind.oauth_expired],
        },
        acknowledgedAt: null,
      },
      data: { acknowledgedAt: expect.any(Date) },
    });
  });
});
