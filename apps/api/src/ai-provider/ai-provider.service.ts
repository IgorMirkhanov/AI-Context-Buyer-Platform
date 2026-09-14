import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiProvider,
  AiProviderCredentialStatus,
  Prisma,
} from '@prisma/client';
import {
  AI_PROVIDER_REQUIRED_MESSAGE,
  AiProviderName,
  maskApiKey,
  readEnvAiKey,
  redactAiSecret,
  resolveAiApiKey,
  ResolvedAiKey,
} from '@context-buyer/agents';
import { PrismaService } from '../prisma/prisma.service';
import {
  decryptSecret,
  encryptSecret,
  parseTokenEncryptionKey,
} from '../security/token-encryption';
import {
  LlmSpendCapReachedError,
  utcMonthRange,
} from './llm-spend-cap';

export type AiProviderPublicStatus = {
  provider: AiProviderName;
  configured: boolean;
  status: 'missing' | 'unverified' | 'valid' | 'invalid';
  source: 'database' | 'env' | null;
  keyHint: string | null;
  lastVerifiedAt: string | null;
};

export type LlmSpendStatus = {
  /** Null when the org has not enabled a monthly ceiling. */
  llmMonthlyCapUsd: number | null;
  /** Sum of llm_call_logs.cost_usd for all org projects in the current UTC month. */
  spentUsdThisMonth: number;
  month: string;
};

const PROVIDERS: AiProviderName[] = ['anthropic', 'groq', 'gemini', 'openai'];

@Injectable()
export class AiProviderService {
  private readonly log = new Logger(AiProviderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async requireReady(organizationId: string): Promise<ResolvedAiKey> {
    const resolved = await this.resolveAny(organizationId);
    if (!resolved) {
      throw new BadRequestException(AI_PROVIDER_REQUIRED_MESSAGE);
    }
    await this.assertWithinMonthlyCap(organizationId);
    return resolved;
  }

  /** Без исключения — для агентов с heuristic fallback (Semantic). */
  async tryResolveOptional(
    organizationId: string,
  ): Promise<ResolvedAiKey | null> {
    return this.resolveAny(organizationId);
  }

  /**
   * Call before a paid LLM provider run (mode !== heuristic).
   * No-op when llm_monthly_cap_usd is null.
   */
  async assertWithinMonthlyCap(organizationId: string): Promise<void> {
    const spend = await this.getLlmSpendStatus(organizationId);
    if (spend.llmMonthlyCapUsd == null) {
      return;
    }
    if (spend.spentUsdThisMonth >= spend.llmMonthlyCapUsd) {
      throw new LlmSpendCapReachedError(
        spend.spentUsdThisMonth,
        spend.llmMonthlyCapUsd,
      );
    }
  }

  async getLlmSpendStatus(organizationId: string): Promise<LlmSpendStatus> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { llmMonthlyCapUsd: true },
    });
    const { from, toExclusive } = utcMonthRange();
    const agg = await this.prisma.llmCallLog.aggregate({
      where: {
        createdAt: { gte: from, lt: toExclusive },
        project: { organizationId },
      },
      _sum: { costUsd: true },
    });
    const spent = Number(agg._sum.costUsd ?? 0);
    const cap =
      org?.llmMonthlyCapUsd == null ? null : Number(org.llmMonthlyCapUsd);
    return {
      llmMonthlyCapUsd: cap,
      spentUsdThisMonth: Number.isFinite(spent) ? spent : 0,
      month: from.toISOString().slice(0, 7),
    };
  }

  async updateLlmMonthlyCap(
    organizationId: string,
    llmMonthlyCapUsd: number | null,
  ): Promise<{
    ready: boolean;
    providers: AiProviderPublicStatus[];
    spend: LlmSpendStatus;
  }> {
    if (llmMonthlyCapUsd != null) {
      if (!Number.isFinite(llmMonthlyCapUsd) || llmMonthlyCapUsd < 0) {
        throw new BadRequestException(
          'llmMonthlyCapUsd must be a non-negative number or null',
        );
      }
    }
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        llmMonthlyCapUsd:
          llmMonthlyCapUsd == null
            ? null
            : new Prisma.Decimal(llmMonthlyCapUsd.toFixed(2)),
      },
    });
    return this.getStatus(organizationId);
  }

  async resolveApiKey(
    organizationId: string,
    provider: AiProviderName,
  ): Promise<string | null> {
    const resolved = await this.resolveProvider(organizationId, provider);
    return resolved?.apiKey ?? null;
  }

  async getStatus(organizationId: string): Promise<{
    ready: boolean;
    providers: AiProviderPublicStatus[];
    spend: LlmSpendStatus;
  }> {
    const [providers, spend] = await Promise.all([
      Promise.all(
        PROVIDERS.map((provider) => this.publicStatus(organizationId, provider)),
      ),
      this.getLlmSpendStatus(organizationId),
    ]);
    return {
      ready: providers.some(
        (item) => item.configured && item.status !== 'invalid',
      ),
      providers,
      spend,
    };
  }

  async upsert(
    organizationId: string,
    provider: AiProviderName,
    apiKey: string,
  ): Promise<{
    ready: boolean;
    providers: AiProviderPublicStatus[];
    spend: LlmSpendStatus;
  }> {
    const key = this.encryptionKey();
    const apiKeyEncrypted = encryptSecret(apiKey.trim(), key);
    await this.prisma.aiProviderCredential.upsert({
      where: {
        organizationId_provider: {
          organizationId,
          provider: provider as AiProvider,
        },
      },
      create: {
        organizationId,
        provider: provider as AiProvider,
        apiKeyEncrypted,
        status: AiProviderCredentialStatus.unverified,
        lastVerifiedAt: null,
      },
      update: {
        apiKeyEncrypted,
        status: AiProviderCredentialStatus.unverified,
        lastVerifiedAt: null,
      },
    });
    return this.getStatus(organizationId);
  }

  async verify(
    organizationId: string,
    provider: AiProviderName,
    apiKeyFromForm?: string,
  ): Promise<{
    ready: boolean;
    ok: boolean;
    providers: AiProviderPublicStatus[];
    spend: LlmSpendStatus;
  }> {
    let secret = apiKeyFromForm?.trim() ?? '';
    if (secret) {
      await this.upsert(organizationId, provider, secret);
    } else {
      const resolved = await this.resolveProvider(organizationId, provider);
      secret = resolved?.apiKey ?? '';
    }
    if (!secret) {
      throw new BadRequestException(AI_PROVIDER_REQUIRED_MESSAGE);
    }

    const ok = await this.pingProvider(provider, secret);
    const row = await this.prisma.aiProviderCredential.findUnique({
      where: {
        organizationId_provider: {
          organizationId,
          provider: provider as AiProvider,
        },
      },
    });
    if (row) {
      await this.prisma.aiProviderCredential.update({
        where: { id: row.id },
        data: {
          status: ok
            ? AiProviderCredentialStatus.valid
            : AiProviderCredentialStatus.invalid,
          lastVerifiedAt: new Date(),
        },
      });
    }
    const status = await this.getStatus(organizationId);
    return { ...status, ok };
  }

  private async resolveAny(
    organizationId: string,
  ): Promise<ResolvedAiKey | null> {
    for (const provider of PROVIDERS) {
      const resolved = await this.resolveProvider(organizationId, provider);
      if (resolved) return resolved;
    }
    return null;
  }

  private async resolveProvider(
    organizationId: string,
    provider: AiProviderName,
  ): Promise<ResolvedAiKey | null> {
    const row = await this.prisma.aiProviderCredential.findUnique({
      where: {
        organizationId_provider: {
          organizationId,
          provider: provider as AiProvider,
        },
      },
    });
    let databaseKey: string | null = null;
    if (row) {
      try {
        databaseKey = decryptSecret(row.apiKeyEncrypted, this.encryptionKey());
      } catch (err) {
        this.log.warn(
          `Failed to decrypt ${provider} key for organization: ${
            err instanceof Error ? err.message : 'decrypt error'
          }`,
        );
      }
    }
    const resolved = resolveAiApiKey({
      databaseKey,
      databaseStatus: row?.status ?? null,
      envKey: readEnvAiKey(provider, {
        ANTHROPIC_API_KEY: this.config.get<string>('ANTHROPIC_API_KEY'),
        OPENAI_API_KEY: this.config.get<string>('OPENAI_API_KEY'),
        GROQ_API_KEY: this.config.get<string>('GROQ_API_KEY'),
        GEMINI_API_KEY: this.config.get<string>('GEMINI_API_KEY'),
      }),
    });
    if (!resolved) return null;
    return { provider, apiKey: resolved.apiKey, source: resolved.source };
  }

  private async publicStatus(
    organizationId: string,
    provider: AiProviderName,
  ): Promise<AiProviderPublicStatus> {
    const resolved = await this.resolveProvider(organizationId, provider);
    const row = await this.prisma.aiProviderCredential.findUnique({
      where: {
        organizationId_provider: {
          organizationId,
          provider: provider as AiProvider,
        },
      },
    });
    if (!resolved) {
      return {
        provider,
        configured: false,
        status: 'missing',
        source: null,
        keyHint: null,
        lastVerifiedAt: row?.lastVerifiedAt?.toISOString() ?? null,
      };
    }
    const status: AiProviderPublicStatus['status'] =
      resolved.source === 'env'
        ? 'valid'
        : row?.status === AiProviderCredentialStatus.valid
          ? 'valid'
          : row?.status === AiProviderCredentialStatus.invalid
            ? 'invalid'
            : 'unverified';
    return {
      provider,
      configured: true,
      status,
      source: resolved.source,
      keyHint: maskApiKey(resolved.apiKey),
      lastVerifiedAt: row?.lastVerifiedAt?.toISOString() ?? null,
    };
  }

  private async pingProvider(
    provider: AiProviderName,
    apiKey: string,
  ): Promise<boolean> {
    try {
      const res =
        provider === 'openai'
          ? await fetch('https://api.openai.com/v1/models', {
              method: 'GET',
              headers: { Authorization: `Bearer ${apiKey}` },
              signal: AbortSignal.timeout(8000),
            })
          : provider === 'groq'
            ? await fetch('https://api.groq.com/openai/v1/models', {
                method: 'GET',
                headers: { Authorization: `Bearer ${apiKey}` },
                signal: AbortSignal.timeout(8000),
              })
            : provider === 'gemini'
              ? await fetch(
                  'https://generativelanguage.googleapis.com/v1beta/openai/models',
                  {
                    method: 'GET',
                    headers: { Authorization: `Bearer ${apiKey}` },
                    signal: AbortSignal.timeout(8000),
                  },
                )
              : await fetch('https://api.anthropic.com/v1/models', {
                  method: 'GET',
                  headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                  },
                  signal: AbortSignal.timeout(8000),
                });
      if (res.ok) return true;
      const body = redactAiSecret(await res.text().catch(() => ''));
      this.log.warn(
        `${provider} verify HTTP ${res.status}: ${body.slice(0, 180)}`,
      );
      return false;
    } catch (err) {
      this.log.warn(
        `${provider} verify failed: ${
          err instanceof Error ? redactAiSecret(err.message) : 'network error'
        }`,
      );
      return false;
    }
  }

  private encryptionKey(): Buffer {
    return parseTokenEncryptionKey(
      this.config.get<string>('TOKEN_ENCRYPTION_KEY'),
    );
  }
}
