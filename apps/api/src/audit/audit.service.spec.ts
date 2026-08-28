import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AdPlatform,
  AdWriteAction,
  AdWriteActor,
  AdWriteStatus,
} from '@prisma/client';
import { AuditService, sanitizeAuditJson } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';

describe('sanitizeAuditJson', () => {
  it('drops token-like keys and keeps cabinet ids', () => {
    const out = sanitizeAuditJson({
      accessToken: 'plain-access',
      refreshToken: 'plain-refresh',
      authorization: 'Bearer abc',
      externalCampaignId: '1001',
      nested: { clientSecret: 'shh', name: 'Asus' },
    }) as Record<string, unknown>;
    expect(out.accessToken).toBeUndefined();
    expect(out.refreshToken).toBeUndefined();
    expect(out.authorization).toBeUndefined();
    expect(out.externalCampaignId).toBe('1001');
    expect((out.nested as Record<string, unknown>).clientSecret).toBeUndefined();
    expect((out.nested as Record<string, unknown>).name).toBe('Asus');
  });
});

describe('AuditService', () => {
  const prisma = {
    project: { findFirst: jest.fn() },
    adWriteAudit: { findMany: jest.fn(), create: jest.fn() },
  };
  let service: AuditService;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.project.findFirst.mockResolvedValue({
      id: 'p1',
      organizationId: 'org-a',
    });
    prisma.adWriteAudit.create.mockResolvedValue({});
    prisma.adWriteAudit.findMany.mockResolvedValue([]);
    const module = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(AuditService);
  });

  it('does not list or write a sibling organization project', async () => {
    prisma.project.findFirst.mockResolvedValue(null);
    await expect(service.list('org-b', 'p1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.wrapWrite(
        {
          organizationId: 'org-b',
          projectId: 'p1',
          actor: AdWriteActor.user,
          action: AdWriteAction.pause_campaign,
          platform: AdPlatform.yandex_direct,
        },
        async () => 'should-not-run',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.adWriteAudit.create).not.toHaveBeenCalled();
  });

  it('records a successful write for the requested project only', async () => {
    const result = await service.wrapWrite(
      {
        organizationId: 'org-a',
        projectId: 'p1',
        userId: 'user-1',
        actor: AdWriteActor.user,
        action: AdWriteAction.create_campaign,
        platform: AdPlatform.yandex_direct,
        summary: {
          name: 'Asus',
          accessToken: 'must-not-store',
        },
      },
      async () => '9001',
    );
    expect(result).toBe('9001');
    expect(prisma.project.findFirst).toHaveBeenCalledWith({
      where: { id: 'p1', organizationId: 'org-a' },
    });
    const data = prisma.adWriteAudit.create.mock.calls[0][0].data;
    expect(data.projectId).toBe('p1');
    expect(data.userId).toBe('user-1');
    expect(data.status).toBe(AdWriteStatus.success);
    expect(data.summaryJson.accessToken).toBeUndefined();
    expect(data.summaryJson.name).toBe('Asus');
    expect(data.summaryJson.externalId).toBe('9001');
    expect(JSON.stringify(data)).not.toContain('must-not-store');
  });

  it('records a failed write and rethrows', async () => {
    await expect(
      service.wrapWrite(
        {
          organizationId: 'org-a',
          projectId: 'p1',
          actor: AdWriteActor.autopilot,
          action: AdWriteAction.set_budget,
          platform: AdPlatform.google_ads,
          summary: { budget_daily: 1000 },
        },
        async () => {
          throw new Error('Direct 429');
        },
      ),
    ).rejects.toThrow(/429/);
    const data = prisma.adWriteAudit.create.mock.calls[0][0].data;
    expect(data.projectId).toBe('p1');
    expect(data.status).toBe(AdWriteStatus.failed);
    expect(data.error).toBe('Direct 429');
    expect(data.actor).toBe(AdWriteActor.autopilot);
  });
});
