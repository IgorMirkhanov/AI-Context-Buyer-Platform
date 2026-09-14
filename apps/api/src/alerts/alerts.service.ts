import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpsAlertKind } from '@prisma/client';
import {
  evaluateOpsAlerts,
  OpsAlertDraft,
} from '@context-buyer/agents';
import { isPlatformRateLimitError } from '@context-buyer/connectors';
import { PrismaService } from '../prisma/prisma.service';
import { PipelineQueue } from '../pipeline/pipeline.queue';
import { notifyAlertWebhook } from './alert-webhook';

/** Не поднимать снова тот же scan-алерт сразу после «Понятно». */
const SCAN_REOPEN_COOLDOWN_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AlertsService implements OnModuleInit {
  private readonly log = new Logger(AlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly queue: PipelineQueue,
  ) {}

  async onModuleInit() {
    this.queue.register('ops_alerts', async () => {
      await this.scanAll();
    });
    const ms = Number(this.config.get('ALERTS_POLL_MS') ?? 0);
    await this.queue.schedule('ops_alerts', ms);
  }

  async list(organizationId: string, projectId: string) {
    await this.requireProject(organizationId, projectId);
    await this.scan(organizationId, projectId);
    const items = await this.prisma.opsAlert.findMany({
      where: { projectId, acknowledgedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return { alerts: items };
  }

  async acknowledge(
    organizationId: string,
    projectId: string,
    alertId: string,
  ) {
    await this.requireProject(organizationId, projectId);
    const row = await this.prisma.opsAlert.findFirst({
      where: { id: alertId, projectId, acknowledgedAt: null },
    });
    if (!row) {
      throw new NotFoundException('Alert not found');
    }
    await this.prisma.opsAlert.update({
      where: { id: row.id },
      data: { acknowledgedAt: new Date() },
    });
    return this.list(organizationId, projectId);
  }

  async record(
    organizationId: string,
    projectId: string,
    draft: OpsAlertDraft,
  ) {
    await this.requireProject(organizationId, projectId);
    await this.upsertOpen(projectId, draft);
  }

  async recordIfRateLimited(
    organizationId: string,
    projectId: string,
    err: unknown,
  ) {
    if (!isPlatformRateLimitError(err)) return;
    const detail =
      err instanceof Error ? err.message : 'HTTP 429 / rate limit';
    await this.record(organizationId, projectId, {
      kind: 'platform_rate_limit',
      title: 'Платформа ограничила частоту запросов',
      detail,
    });
  }

  async recordPipelineFailure(
    organizationId: string,
    projectId: string,
    err: unknown,
  ) {
    const detail = err instanceof Error ? err.message : 'pipeline failed';
    await this.record(organizationId, projectId, {
      kind: 'pipeline_failed',
      title: 'Пайплайн остановился с ошибкой',
      detail,
    });
  }

  async recordOauthRefreshFailure(organizationId: string, projectId: string) {
    await this.record(organizationId, projectId, {
      kind: 'oauth_expired',
      title: 'Не удалось обновить OAuth-токен',
      detail: 'Подключите рекламный кабинет заново.',
    });
  }

  async acknowledgeOauthAlerts(organizationId: string, projectId: string) {
    await this.requireProject(organizationId, projectId);
    await this.prisma.opsAlert.updateMany({
      where: {
        projectId,
        kind: {
          in: [OpsAlertKind.oauth_expiring, OpsAlertKind.oauth_expired],
        },
        acknowledgedAt: null,
      },
      data: { acknowledgedAt: new Date() },
    });
  }

  async scan(organizationId: string, projectId: string) {
    await this.requireProject(organizationId, projectId);
    const [credential, openRateLimit] = await Promise.all([
      this.prisma.adPlatformCredential.findFirst({
        where: { projectId },
        select: { expiresAt: true },
      }),
      this.prisma.opsAlert.findFirst({
        where: {
          projectId,
          kind: OpsAlertKind.platform_rate_limit,
          acknowledgedAt: null,
        },
      }),
    ]);
    // pipeline_failed только через recordPipelineFailure при живом сбое.
    // Иначе каждый GET /alerts заново открывал старый failed semantic task.
    const drafts = evaluateOpsAlerts({
      now: new Date(),
      oauthExpiresAt: credential?.expiresAt ?? null,
      pipelineFailed: null,
      rateLimited: Boolean(openRateLimit),
      rateLimitDetail: openRateLimit?.detail ?? null,
    });
    // Ложные «скоро истечёт» по access-токену Google (~1ч) — закрываем.
    if (!drafts.some((draft) => draft.kind === 'oauth_expiring')) {
      await this.prisma.opsAlert.updateMany({
        where: {
          projectId,
          kind: OpsAlertKind.oauth_expiring,
          acknowledgedAt: null,
        },
        data: { acknowledgedAt: new Date() },
      });
    }
    for (const draft of drafts) {
      if (draft.kind === 'platform_rate_limit') continue;
      await this.upsertOpenFromScan(projectId, draft);
    }
  }

  async scanAll() {
    const projects = await this.prisma.project.findMany({
      select: { id: true, organizationId: true },
    });
    for (const project of projects) {
      try {
        await this.scan(project.organizationId, project.id);
      } catch (err) {
        this.log.warn(
          err instanceof Error ? err.message : 'alerts scan failed',
        );
      }
    }
  }

  private async upsertOpenFromScan(projectId: string, draft: OpsAlertDraft) {
    const recentAck = await this.prisma.opsAlert.findFirst({
      where: {
        projectId,
        kind: draft.kind as OpsAlertKind,
        acknowledgedAt: { not: null },
      },
      orderBy: { acknowledgedAt: 'desc' },
    });
    if (
      recentAck?.acknowledgedAt &&
      Date.now() - recentAck.acknowledgedAt.getTime() < SCAN_REOPEN_COOLDOWN_MS
    ) {
      return recentAck;
    }
    return this.upsertOpen(projectId, draft);
  }

  private async upsertOpen(projectId: string, draft: OpsAlertDraft) {
    const existing = await this.prisma.opsAlert.findFirst({
      where: {
        projectId,
        kind: draft.kind as OpsAlertKind,
        acknowledgedAt: null,
      },
    });
    if (existing) return existing;
    const created = await this.prisma.opsAlert.create({
      data: {
        projectId,
        kind: draft.kind as OpsAlertKind,
        title: draft.title,
        detail: draft.detail,
      },
    });
    // Optional Slack/Telegram; missing ALERT_WEBHOOK_URL is a silent no-op.
    void notifyAlertWebhook(this.config.get<string>('ALERT_WEBHOOK_URL'), {
      projectId,
      kind: created.kind,
      title: created.title,
      detail: created.detail,
    });
    return created;
  }

  private async requireProject(organizationId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }
}
