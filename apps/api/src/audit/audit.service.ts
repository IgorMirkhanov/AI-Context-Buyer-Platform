import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AdPlatform,
  AdWriteAction,
  AdWriteActor,
  AdWriteStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const SENSITIVE_KEY =
  /token|secret|authorization|password|apikey|access_token|refresh_token/i;

export type AdWriteContext = {
  organizationId: string;
  projectId: string;
  userId?: string | null;
  actor: AdWriteActor;
  action: AdWriteAction;
  platform: AdPlatform;
  summary?: unknown;
};

export function sanitizeAuditJson(value: unknown, depth = 0): Prisma.InputJsonValue {
  if (depth > 6 || value === undefined || value === null) {
    return {};
  }
  if (typeof value === 'string') return value.slice(0, 500);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value
      .slice(0, 40)
      .map((item) => sanitizeAuditJson(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, Prisma.InputJsonValue> = {};
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (SENSITIVE_KEY.test(key) || nested === undefined || nested === null) {
        continue;
      }
      out[key] = sanitizeAuditJson(nested, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, 200);
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, projectId: string) {
    await this.requireProject(organizationId, projectId);
    const items = await this.prisma.adWriteAudit.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        actor: true,
        action: true,
        platform: true,
        status: true,
        summaryJson: true,
        error: true,
        createdAt: true,
        user: { select: { email: true } },
      },
    });
    return {
      items: items.map((row) => ({
        id: row.id,
        actor: row.actor,
        action: row.action,
        platform: row.platform,
        status: row.status,
        summary: row.summaryJson,
        error: row.error,
        createdAt: row.createdAt,
        actorEmail: row.user?.email ?? null,
      })),
    };
  }

  async wrapWrite<T>(ctx: AdWriteContext, fn: () => Promise<T>): Promise<T> {
    await this.requireProject(ctx.organizationId, ctx.projectId);
    try {
      const result = await fn();
      await this.insert(ctx, AdWriteStatus.success, result);
      return result;
    } catch (err) {
      await this.insert(
        ctx,
        AdWriteStatus.failed,
        undefined,
        err instanceof Error ? err.message : 'write failed',
      );
      throw err;
    }
  }

  private async insert(
    ctx: AdWriteContext,
    status: AdWriteStatus,
    result?: unknown,
    error?: string,
  ) {
    const summary = sanitizeAuditJson({
      ...(asObject(ctx.summary) ?? {}),
      ...(resultAsSummary(result) ?? {}),
    });
    await this.prisma.adWriteAudit.create({
      data: {
        projectId: ctx.projectId,
        userId: ctx.userId || null,
        actor: ctx.actor,
        action: ctx.action,
        platform: ctx.platform,
        status,
        summaryJson: summary,
        error: error ? error.slice(0, 500) : null,
      },
    });
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

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function resultAsSummary(result: unknown): Record<string, unknown> | null {
  if (typeof result === 'string') return { externalId: result };
  if (Array.isArray(result) && result.every((item) => typeof item === 'string')) {
    return { externalIds: result.slice(0, 40) };
  }
  return null;
}
