import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import {
  AgentTaskStatus,
  AgentType,
  AttributionProvider,
  ConversionEventType,
} from '@prisma/client';
import {
  HeuristicReportingLlm,
  wrapAttributionSummary,
} from '@context-buyer/agents';
import { PrismaService } from '../prisma/prisma.service';
import { AttributionRouter } from '../connectors/attribution-router';
import { ProjectBriefPayload } from '../briefs/brief.schema';
import {
  decryptSecret,
  encryptSecret,
  parseTokenEncryptionKey,
} from '../security/token-encryption';
import { ConnectAttributionDto } from './dto/connect-attribution.dto';

@Injectable()
export class AttributionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly router: AttributionRouter,
  ) {}

  async get(organizationId: string, projectId: string, from?: string, to?: string) {
    const project = await this.requireProject(organizationId, projectId);
    const period = parsePeriod(from, to);
    const credentials = await this.prisma.attributionCredential.findMany({
      where: { projectId: project.id },
    });
    const events = await this.prisma.conversionEvent.findMany({
      where: {
        projectId,
        occurredAt: {
          gte: new Date(`${period.from}T00:00:00.000Z`),
          lte: new Date(`${period.to}T23:59:59.000Z`),
        },
      },
      orderBy: { occurredAt: 'desc' },
      take: 100,
    });
    const snapshots = await this.prisma.performanceSnapshot.findMany({
      where: {
        projectId,
        date: {
          gte: new Date(`${period.from}T00:00:00.000Z`),
          lte: new Date(`${period.to}T00:00:00.000Z`),
        },
      },
    });
    const spend = snapshots.reduce((sum, row) => sum + Number(row.spend), 0);
    const adsConversions = snapshots.reduce(
      (sum, row) => sum + row.conversions,
      0,
    );
    const brief = await this.prisma.projectBrief.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
    });
    const targetCpl =
      (brief?.payloadJson as ProjectBriefPayload | null)?.project.target_cpl ??
      0;
    const summary = wrapAttributionSummary(
      spend,
      adsConversions,
      events.length,
      targetCpl,
      new HeuristicReportingLlm(),
    );
    const origin =
      this.config.get<string>('API_PUBLIC_URL') ??
      `http://localhost:${this.config.get('API_PORT') ?? 3001}`;
    return {
      period,
      connections: credentials.map((row) => ({
        provider: row.provider,
        inboundUrl: `${origin}/attribution/inbound/${project.id}?provider=${row.provider}`,
      })),
      events: events.map((row) => ({
        id: row.id,
        provider: row.provider,
        type: row.type,
        title: row.title,
        occurredAt: row.occurredAt,
        utmCampaign: row.utmCampaign,
        amount: row.amount == null ? null : Number(row.amount),
        phoneHash: row.phoneHash,
      })),
      summary,
    };
  }

  async connect(
    organizationId: string,
    projectId: string,
    dto: ConnectAttributionDto,
  ) {
    const project = await this.requireProject(organizationId, projectId);
    const key = this.encryptionKey();
    const inboundSecret = randomBytes(24).toString('base64url');
    await this.prisma.attributionCredential.upsert({
      where: {
        projectId_provider: {
          projectId: project.id,
          provider: dto.provider,
        },
      },
      update: {
        tokenEncrypted: encryptSecret(dto.token, key),
        extraEncrypted: dto.extra ? encryptSecret(dto.extra, key) : null,
        inboundSecretEncrypted: encryptSecret(inboundSecret, key),
      },
      create: {
        projectId: project.id,
        provider: dto.provider,
        tokenEncrypted: encryptSecret(dto.token, key),
        extraEncrypted: dto.extra ? encryptSecret(dto.extra, key) : null,
        inboundSecretEncrypted: encryptSecret(inboundSecret, key),
      },
    });
    const origin =
      this.config.get<string>('API_PUBLIC_URL') ??
      `http://localhost:${this.config.get('API_PORT') ?? 3001}`;
    return {
      provider: dto.provider,
      inboundUrl: `${origin}/attribution/inbound/${project.id}?provider=${dto.provider}`,
      inboundSecret,
    };
  }

  async disconnect(
    organizationId: string,
    projectId: string,
    provider: AttributionProvider,
  ) {
    const project = await this.requireProject(organizationId, projectId);
    await this.prisma.attributionCredential.deleteMany({
      where: { projectId: project.id, provider },
    });
    return { ok: true };
  }

  async collect(
    organizationId: string,
    projectId: string,
    provider: AttributionProvider,
  ) {
    const project = await this.requireProject(organizationId, projectId);
    const cred = await this.prisma.attributionCredential.findFirst({
      where: { projectId: project.id, provider },
    });
    if (!cred) {
      throw new BadRequestException('Connect the attribution source first');
    }
    const key = this.encryptionKey();
    const period = parsePeriod();
    const connector = this.router.forProvider(provider);
    const records = await connector.listConversions(
      project.id,
      period,
      {
        accessToken: decryptSecret(cred.tokenEncrypted, key),
        extra: cred.extraEncrypted
          ? decryptSecret(cred.extraEncrypted, key)
          : undefined,
      },
    );
    const saved = await this.persistRecords(project.id, provider, records);
    await this.prisma.agentTask.create({
      data: {
        projectId: project.id,
        agentType: AgentType.reporting,
        status: AgentTaskStatus.done,
        startedAt: new Date(),
        finishedAt: new Date(),
        inputRef: `attribution:${provider}`,
        outputRef: `events:${saved}`,
      },
    });
    return this.get(organizationId, projectId, period.from, period.to);
  }

  async ingestInbound(
    projectId: string,
    providerRaw: string,
    secret: string | undefined,
    payload: unknown,
  ) {
    if (!isProvider(providerRaw)) {
      throw new BadRequestException('Unknown attribution provider');
    }
    const cred = await this.prisma.attributionCredential.findFirst({
      where: { projectId, provider: providerRaw },
    });
    if (!cred || !secret) {
      throw new UnauthorizedException('Invalid attribution webhook');
    }
    const expected = decryptSecret(cred.inboundSecretEncrypted, this.encryptionKey());
    if (!safeEqual(secret, expected)) {
      throw new UnauthorizedException('Invalid attribution webhook');
    }
    const records = this.router
      .forProvider(providerRaw)
      .parseInbound(projectId, payload);
    const saved = await this.persistRecords(projectId, providerRaw, records);
    return { ok: true, saved };
  }

  private async persistRecords(
    projectId: string,
    provider: AttributionProvider,
    records: Array<{
      externalId: string;
      type: 'lead' | 'deal' | 'call';
      occurredAt: string;
      amount: number | null;
      utmCampaign: string | null;
      phoneHash: string | null;
      title: string;
    }>,
  ) {
    const campaigns = await this.prisma.campaign.findMany({
      where: { projectId },
      select: { id: true, externalCampaignId: true },
    });
    const byExternal = new Map(
      campaigns.map((item) => [item.externalCampaignId, item.id]),
    );
    let saved = 0;
    for (const row of records) {
      if (!row.externalId) continue;
      const campaignId = row.utmCampaign
        ? (byExternal.get(row.utmCampaign) ?? null)
        : null;
      await this.prisma.conversionEvent.upsert({
        where: {
          projectId_provider_externalId: {
            projectId,
            provider,
            externalId: row.externalId,
          },
        },
        create: {
          projectId,
          campaignId,
          provider,
          externalId: row.externalId,
          type: row.type as ConversionEventType,
          occurredAt: new Date(row.occurredAt),
          amount: row.amount,
          utmCampaign: row.utmCampaign,
          phoneHash: row.phoneHash,
          title: row.title.slice(0, 200),
        },
        update: {
          campaignId,
          type: row.type as ConversionEventType,
          occurredAt: new Date(row.occurredAt),
          amount: row.amount,
          utmCampaign: row.utmCampaign,
          phoneHash: row.phoneHash,
          title: row.title.slice(0, 200),
        },
      });
      saved += 1;
    }
    return saved;
  }

  private encryptionKey(): Buffer {
    return parseTokenEncryptionKey(
      this.config.get<string>('TOKEN_ENCRYPTION_KEY'),
    );
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

function parsePeriod(from?: string, to?: string): { from: string; to: string } {
  if (from && to) return { from, to };
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

function isProvider(value: string): value is AttributionProvider {
  return (
    value === 'bitrix24' ||
    value === 'amocrm' ||
    value === 'calltouch' ||
    value === 'roistat'
  );
}

function safeEqual(left: string, right: string): boolean {
  const a = createHash('sha256').update(left).digest();
  const b = createHash('sha256').update(right).digest();
  return timingSafeEqual(a, b);
}
