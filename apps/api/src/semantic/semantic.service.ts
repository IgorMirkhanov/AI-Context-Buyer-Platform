import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AdPlatform,
  AgentTaskStatus,
  AgentType,
  KeywordIntent,
  NegativeSuggestionStatus,
} from '@prisma/client';
import {
  resolveLlmCostUsd,
  resolveSemanticLlm,
  runSemanticPipeline,
  SemanticBriefInput,
  SemanticCore,
  SemanticCoreValidationError,
  isCommercialKeyword,
  isSafeNegativePhrase,
  sanitizeBriefNegatives,
} from '@context-buyer/agents';
import { PlatformApiError } from '@context-buyer/connectors';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectorRouter } from '../connectors/connector-router';
import { PlatformConnectionService } from '../connectors/platform-connection.service';
import { ProjectBriefPayload } from '../briefs/brief.schema';
import { validateProjectBrief, BriefValidationError } from '../briefs/brief.validator';
import { AiProviderService } from '../ai-provider/ai-provider.service';
import {
  LLM_SPEND_CAP_REACHED,
  LlmSpendCapReachedError,
} from '../ai-provider/llm-spend-cap';
import { TokenRefreshService } from '../oauth/token-refresh.service';

@Injectable()
export class SemanticService {
  private readonly log = new Logger(SemanticService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly connectors: ConnectorRouter,
    private readonly platformConnection: PlatformConnectionService,
    private readonly ai: AiProviderService,
    private readonly tokens: TokenRefreshService,
  ) {}

  async run(organizationId: string, projectId: string) {
    const credentials = await this.ai.tryResolveOptional(organizationId);
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
      include: { briefs: { orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    const briefRow = project.briefs[0];
    if (!briefRow) {
      throw new BadRequestException('Project brief is missing');
    }
    const analysis = await this.prisma.projectAnalysis.findUnique({
      where: { projectId },
    });
    if (!analysis) {
      throw new BadRequestException(
        'Сначала выполните анализ на вкладке «Анализ»',
      );
    }

    const task = await this.prisma.agentTask.create({
      data: {
        projectId,
        agentType: AgentType.semantic,
        status: AgentTaskStatus.running,
        startedAt: new Date(),
        inputRef: briefRow.id,
      },
    });

    try {
      const brief = this.toBriefInput(
        briefRow.payloadJson as ProjectBriefPayload,
      );
      const connector = this.connectors.forPlatform(project.primaryPlatform);
      const platformAuth = await this.resolvePlatformAuth(
        organizationId,
        projectId,
        project.primaryPlatform,
      );
      const { llm, mode } = resolveSemanticLlm({
        apiKey: credentials?.apiKey ?? null,
        provider: credentials?.provider ?? null,
        onFallback: (message) => this.log.warn(message),
      });
      if (mode !== 'heuristic') {
        await this.ai.assertWithinMonthlyCap(organizationId);
      }
      const { core, suggested_negative_words, sanitized_global_negatives } =
        await runSemanticPipeline(brief, {
        llm,
        landingText: analysis.landingText,
        extraSeeds: analysis.customSeeds,
        getKeywordIdeas: (seeds, geo) =>
          connector.getKeywordIdeas(seeds, geo, platformAuth),
        onLlmCall: async (usage) => {
          await this.prisma.llmCallLog.create({
            data: {
              projectId,
              agentType: AgentType.semantic,
              step: usage.step,
              model: usage.model,
              prompt: usage.prompt,
              response: usage.response,
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              costUsd: resolveLlmCostUsd(usage),
              latencyMs: usage.latencyMs,
            },
          });
        },
      });

      await this.persistSanitizedBriefNegatives(
        projectId,
        briefRow,
        sanitized_global_negatives ?? brief.global_negative_keywords,
      );
      await this.persistCore(projectId, core);
      await this.persistNegativeSuggestions(projectId, suggested_negative_words);
      await this.prisma.agentTask.update({
        where: { id: task.id },
        data: {
          status: AgentTaskStatus.done,
          finishedAt: new Date(),
          outputRef: 'semantic_core',
        },
      });
      return { taskId: task.id, status: AgentTaskStatus.done, core, llmMode: mode };
    } catch (err) {
      const details = this.formatSemanticError(err);
      await this.prisma.agentTask.update({
        where: { id: task.id },
        data: {
          status: AgentTaskStatus.failed,
          finishedAt: new Date(),
          error: details,
        },
      });
      if (err instanceof LlmSpendCapReachedError) {
        throw new BadRequestException({
          message: err.uiMessage,
          details: LLM_SPEND_CAP_REACHED,
        });
      }
      throw new BadRequestException({
        message: details,
        details,
        step: err instanceof PlatformApiError ? err.step : undefined,
      });
    }
  }

  private async resolvePlatformAuth(
    organizationId: string,
    projectId: string,
    platform: AdPlatform,
  ): Promise<
    | { accessToken: string; clientLogin?: string; projectId: string }
    | undefined
  > {
    const cred = await this.prisma.adPlatformCredential.findFirst({
      where: { projectId, platform },
    });
    if (!cred) {
      return undefined;
    }
    try {
      await this.tokens.refreshProject(organizationId, projectId, {
        force: false,
      });
    } catch (err) {
      this.log.warn(
        err instanceof Error
          ? err.message
          : 'token refresh before semantic failed',
      );
    }
    const fresh =
      (await this.prisma.adPlatformCredential.findFirst({
        where: { projectId, platform },
      })) ?? cred;
    return this.platformConnection.buildAuth(fresh, projectId);
  }

  private formatSemanticError(err: unknown): string {
    if (err instanceof LlmSpendCapReachedError) {
      return LLM_SPEND_CAP_REACHED;
    }
    if (err instanceof SemanticCoreValidationError) {
      return err.details.join('; ');
    }
    if (err instanceof PlatformApiError) {
      return err.message;
    }
    if (err instanceof Error) {
      return err.message;
    }
    return 'Unknown semantic agent error';
  }

  async getResult(organizationId: string, projectId: string) {
    await this.requireProject(organizationId, projectId);
    const clusters = await this.prisma.semanticCluster.findMany({
      where: { projectId },
      include: { keywords: { orderBy: { frequency: 'desc' } } },
      orderBy: { createdAt: 'asc' },
    });
    const lastTask = await this.prisma.agentTask.findFirst({
      where: { projectId, agentType: AgentType.semantic },
      orderBy: { startedAt: 'desc' },
    });
    const negativeSuggestions = await this.prisma.semanticNegativeSuggestion.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
    return {
      task: lastTask,
      negativeSuggestions: negativeSuggestions.map((item) => ({
        id: item.id,
        phrase: item.phrase,
        reason: item.reason,
        source: item.source,
        status: item.status,
        createdAt: item.createdAt,
        resolvedAt: item.resolvedAt,
      })),
      clusters: clusters.map((cluster) => ({
        id: cluster.id,
        name: cluster.name,
        category: cluster.category,
        keywords: cluster.keywords
          .filter((item) => !item.isNegative)
          .map((item) => ({
            phrase: item.phrase,
            intent: item.intent,
            frequency: item.frequency,
            source: item.source,
            isCommercial: isCommercialKeyword(
              item.phrase,
              item.intent as 'hot' | 'warm' | 'navigational',
            ),
          })),
        negativeKeywords: cluster.keywords
          .filter((item) => item.isNegative)
          .map((item) => item.phrase),
      })),
    };
  }

  /**
   * Manual edit of cluster positives before rebuild/publish.
   * Does not re-run LLM — only DB rows. Rebuild draft after edits.
   */
  async editKeywords(
    organizationId: string,
    projectId: string,
    input: {
      clusterId: string;
      action: 'add' | 'remove';
      phrases: string[];
      intent?: 'hot' | 'warm' | 'navigational';
    },
  ) {
    await this.requireProject(organizationId, projectId);
    const cluster = await this.prisma.semanticCluster.findFirst({
      where: { id: input.clusterId, projectId },
    });
    if (!cluster) {
      throw new NotFoundException('Кластер не найден');
    }
    const phrases = [
      ...new Set(
        input.phrases
          .map((item) => item.trim().replace(/\s+/g, ' '))
          .filter((item) => item.length > 0),
      ),
    ];
    if (phrases.length === 0) {
      throw new BadRequestException('Укажите хотя бы одну фразу');
    }

    if (input.action === 'remove') {
      const keys = phrases.map((item) => item.toLowerCase());
      const rows = await this.prisma.semanticKeyword.findMany({
        where: {
          projectId,
          clusterId: input.clusterId,
          isNegative: false,
        },
      });
      const ids = rows
        .filter((row) => keys.includes(row.phrase.trim().toLowerCase()))
        .map((row) => row.id);
      if (ids.length > 0) {
        await this.prisma.semanticKeyword.deleteMany({
          where: { id: { in: ids } },
        });
      }
      return this.getResult(organizationId, projectId);
    }

    const existing = await this.prisma.semanticKeyword.findMany({
      where: {
        projectId,
        clusterId: input.clusterId,
        isNegative: false,
      },
      select: { phrase: true },
    });
    const existingKeys = new Set(
      existing.map((row) => row.phrase.trim().toLowerCase()),
    );
    const toCreate = phrases.filter(
      (phrase) => !existingKeys.has(phrase.toLowerCase()),
    );
    if (toCreate.length > 0) {
      await this.prisma.semanticKeyword.createMany({
        data: toCreate.map((phrase) => ({
          projectId,
          clusterId: input.clusterId,
          phrase,
          frequency: 1,
          intent: (input.intent as KeywordIntent | undefined) ?? KeywordIntent.warm,
          isNegative: false,
          source: 'manual_edit',
        })),
      });
    }
    return this.getResult(organizationId, projectId);
  }

  async resolveNegativeSuggestion(
    organizationId: string,
    projectId: string,
    suggestionId: string,
    action: 'accept' | 'reject',
  ) {
    await this.requireProject(organizationId, projectId);
    const suggestion = await this.prisma.semanticNegativeSuggestion.findFirst({
      where: {
        id: suggestionId,
        projectId,
        status: NegativeSuggestionStatus.pending,
      },
    });
    if (!suggestion) {
      throw new NotFoundException('Предложение не найдено или уже обработано');
    }

    if (action === 'reject') {
      await this.prisma.semanticNegativeSuggestion.update({
        where: { id: suggestionId },
        data: {
          status: NegativeSuggestionStatus.rejected,
          resolvedAt: new Date(),
        },
      });
      return { status: 'rejected', phrase: suggestion.phrase };
    }

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
      include: { briefs: { orderBy: { version: 'desc' }, take: 1 } },
    });
    const briefRow = project?.briefs[0];
    if (!briefRow) {
      throw new BadRequestException('Бриф проекта не найден');
    }

    const payload = briefRow.payloadJson as ProjectBriefPayload;
    const protectedPhrases = [
      ...payload.marketing.usp,
      payload.marketing.product_description ?? '',
    ];
    const existing = new Set(
      payload.exclusions.global_negative_keywords.map((item) =>
        item.trim().toLowerCase(),
      ),
    );
    const phrase = suggestion.phrase.trim().toLowerCase();
    if (!isSafeNegativePhrase(phrase, protectedPhrases)) {
      await this.prisma.semanticNegativeSuggestion.update({
        where: { id: suggestionId },
        data: {
          status: NegativeSuggestionStatus.rejected,
          resolvedAt: new Date(),
        },
      });
      return {
        status: 'rejected',
        phrase: suggestion.phrase,
        reason: 'intersects_commercial_core',
      };
    }

    await this.prisma.$transaction(async (tx) => {
      if (!existing.has(phrase)) {
        const nextPayload: ProjectBriefPayload = {
          ...payload,
          exclusions: {
            ...payload.exclusions,
            global_negative_keywords: [
              ...payload.exclusions.global_negative_keywords,
              suggestion.phrase.trim(),
            ],
          },
        };
        try {
          validateProjectBrief(nextPayload);
        } catch (err) {
          if (err instanceof BriefValidationError) {
            throw new BadRequestException({
              message: 'Invalid project brief',
              details: err.details,
            });
          }
          throw err;
        }
        await tx.projectBrief.create({
          data: {
            projectId,
            version: briefRow.version + 1,
            payloadJson: nextPayload,
          },
        });
      }
      await tx.semanticNegativeSuggestion.update({
        where: { id: suggestionId },
        data: {
          status: NegativeSuggestionStatus.accepted,
          resolvedAt: new Date(),
        },
      });
    });

    return { status: 'accepted', phrase: suggestion.phrase };
  }

  async acceptAllPendingNegativeSuggestions(
    organizationId: string,
    projectId: string,
  ) {
    await this.requireProject(organizationId, projectId);
    const pending = await this.prisma.semanticNegativeSuggestion.findMany({
      where: { projectId, status: NegativeSuggestionStatus.pending },
      orderBy: { createdAt: 'asc' },
    });

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
      include: { briefs: { orderBy: { version: 'desc' }, take: 1 } },
    });
    const briefRow = project?.briefs[0];
    if (!briefRow) {
      throw new BadRequestException('Бриф проекта не найден');
    }

    if (pending.length === 0) {
      const payload = briefRow.payloadJson as ProjectBriefPayload;
      const cleaned = sanitizeBriefNegatives(
        payload.exclusions.global_negative_keywords,
        {
          usp: payload.marketing.usp,
          product_description: payload.marketing.product_description,
          forbidden_phrases: payload.marketing.forbidden_phrases,
        },
      );
      await this.persistSanitizedBriefNegatives(projectId, briefRow, cleaned);
      return { accepted: [] as string[], rejected: 0 };
    }

    const payload = briefRow.payloadJson as ProjectBriefPayload;
    const protectedPhrases = [
      ...payload.marketing.usp,
      payload.marketing.product_description ?? '',
    ];
    const existing = new Set(
      payload.exclusions.global_negative_keywords.map((item) =>
        item.trim().toLowerCase(),
      ),
    );
    const toAdd: string[] = [];
    const toReject: string[] = [];
    for (const item of pending) {
      const phrase = item.phrase.trim();
      const key = phrase.toLowerCase();
      if (!key || existing.has(key)) {
        continue;
      }
      if (!isSafeNegativePhrase(key, protectedPhrases)) {
        toReject.push(item.id);
        continue;
      }
      existing.add(key);
      toAdd.push(phrase);
    }

    const cleanedExisting = sanitizeBriefNegatives(
      payload.exclusions.global_negative_keywords,
      {
        usp: payload.marketing.usp,
        product_description: payload.marketing.product_description,
        forbidden_phrases: payload.marketing.forbidden_phrases,
      },
    );
    const briefNeedsRewrite =
      cleanedExisting.length !==
        payload.exclusions.global_negative_keywords.length ||
      toAdd.length > 0;

    await this.prisma.$transaction(async (tx) => {
      if (briefNeedsRewrite) {
        const nextPayload: ProjectBriefPayload = {
          ...payload,
          exclusions: {
            ...payload.exclusions,
            global_negative_keywords: [...cleanedExisting, ...toAdd],
          },
        };
        try {
          validateProjectBrief(nextPayload);
        } catch (err) {
          if (err instanceof BriefValidationError) {
            throw new BadRequestException({
              message: 'Invalid project brief',
              details: err.details,
            });
          }
          throw err;
        }
        await tx.projectBrief.create({
          data: {
            projectId,
            version: briefRow.version + 1,
            payloadJson: nextPayload,
          },
        });
      }
      if (toReject.length > 0) {
        await tx.semanticNegativeSuggestion.updateMany({
          where: { id: { in: toReject } },
          data: {
            status: NegativeSuggestionStatus.rejected,
            resolvedAt: new Date(),
          },
        });
      }
      const acceptIds = pending
        .filter((item) => !toReject.includes(item.id))
        .map((item) => item.id);
      if (acceptIds.length > 0) {
        await tx.semanticNegativeSuggestion.updateMany({
          where: { id: { in: acceptIds } },
          data: {
            status: NegativeSuggestionStatus.accepted,
            resolvedAt: new Date(),
          },
        });
      }
    });

    return {
      accepted: toAdd,
      rejected: toReject.length,
    };
  }

  async exportCsv(
    organizationId: string,
    projectId: string,
    options?: { commercialOnly?: boolean },
  ): Promise<string> {
    const result = await this.getResult(organizationId, projectId);
    const commercialOnly = options?.commercialOnly ?? false;
    const lines = [
      [
        'cluster',
        'category',
        'phrase',
        'intent',
        'commercial',
        'frequency',
        'is_negative',
        'source',
      ].join(','),
    ];
    for (const cluster of result.clusters) {
      for (const kw of cluster.keywords) {
        if (commercialOnly && !kw.isCommercial) continue;
        lines.push(
          [
            csv(cluster.name),
            csv(cluster.category),
            csv(kw.phrase),
            csv(kw.intent),
            String(kw.isCommercial ?? false),
            String(kw.frequency),
            'false',
            csv(kw.source ?? 'mock_wordstat'),
          ].join(','),
        );
      }
      for (const phrase of cluster.negativeKeywords) {
        lines.push(
          [
            csv(cluster.name),
            csv(cluster.category),
            csv(phrase),
            '',
            '0',
            'true',
            'cross_minus',
          ].join(','),
        );
      }
    }
    return lines.join('\n');
  }

  async exportXlsx(
    organizationId: string,
    projectId: string,
    options?: { commercialOnly?: boolean },
  ): Promise<Buffer> {
    const csvText = await this.exportCsv(organizationId, projectId, options);
    const rows = csvText.split('\n').map((line) => parseCsvLine(line));
    const cells = rows
      .map(
        (row) =>
          `<Row>${row
            .map(
              (cell) =>
                `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`,
            )
            .join('')}</Row>`,
      )
      .join('');
    const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="semantic"><Table>${cells}</Table></Worksheet>
</Workbook>`;
    return Buffer.from(xml, 'utf8');
  }

  private async persistSanitizedBriefNegatives(
    projectId: string,
    briefRow: { id: string; version: number; payloadJson: unknown },
    sanitized: string[],
  ) {
    const payload = briefRow.payloadJson as ProjectBriefPayload;
    const current = payload.exclusions.global_negative_keywords.map((item) =>
      item.trim().toLowerCase(),
    );
    const next = sanitized.map((item) => item.trim().toLowerCase());
    const same =
      current.length === next.length &&
      current.every((item, index) => item === next[index]);
    if (same) {
      return;
    }
    const nextPayload: ProjectBriefPayload = {
      ...payload,
      exclusions: {
        ...payload.exclusions,
        global_negative_keywords: sanitized,
      },
    };
    try {
      validateProjectBrief(nextPayload);
    } catch (err) {
      if (err instanceof BriefValidationError) {
        this.log.warn(
          `skip brief negative sanitize: ${err.details.join('; ')}`,
        );
        return;
      }
      throw err;
    }
    await this.prisma.projectBrief.create({
      data: {
        projectId,
        version: briefRow.version + 1,
        payloadJson: nextPayload,
      },
    });
  }

  private async persistCore(projectId: string, core: SemanticCore) {
    await this.prisma.$transaction(async (tx) => {
      await tx.validationIssue.deleteMany({ where: { projectId } });
      await tx.adCreative.deleteMany({ where: { projectId } });
      await tx.semanticKeyword.deleteMany({ where: { projectId } });
      await tx.semanticCluster.deleteMany({ where: { projectId } });
      await tx.keywordEmbedding.deleteMany({ where: { projectId } });

      for (const cluster of core.clusters) {
        const created = await tx.semanticCluster.create({
          data: {
            projectId,
            name: cluster.cluster_name,
            category: cluster.category,
          },
        });
        if (cluster.keywords.length > 0) {
          await tx.semanticKeyword.createMany({
            data: cluster.keywords.map((kw) => ({
              projectId,
              clusterId: created.id,
              phrase: kw.phrase,
              frequency: Math.round(kw.frequency),
              intent: kw.intent,
              isNegative: false,
              source: kw.source ?? 'mock_wordstat',
            })),
          });
        }
        if (cluster.negative_keywords.length > 0) {
          await tx.semanticKeyword.createMany({
            data: cluster.negative_keywords.map((phrase) => ({
              projectId,
              clusterId: created.id,
              phrase,
              frequency: 0,
              intent: KeywordIntent.warm,
              isNegative: true,
              source: 'cross_minus',
            })),
          });
        }
      }
      if (core.global_negatives.length > 0) {
        await tx.semanticKeyword.createMany({
          data: core.global_negatives.map((phrase) => ({
            projectId,
            phrase,
            frequency: 0,
            intent: KeywordIntent.warm,
            isNegative: true,
            source: 'brief_global',
          })),
        });
      }
    });
  }

  private async persistNegativeSuggestions(
    projectId: string,
    suggestions: Array<{ phrase: string; reason: string; source?: string }>,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.semanticNegativeSuggestion.deleteMany({
        where: { projectId, status: NegativeSuggestionStatus.pending },
      });
      if (suggestions.length === 0) {
        return;
      }
      const resolved = await tx.semanticNegativeSuggestion.findMany({
        where: {
          projectId,
          status: {
            in: [
              NegativeSuggestionStatus.accepted,
              NegativeSuggestionStatus.rejected,
            ],
          },
        },
        select: { phrase: true },
      });
      const skip = new Set(
        resolved.map((item) => item.phrase.trim().toLowerCase()),
      );
      for (const item of suggestions) {
        const phrase = item.phrase.trim().toLowerCase();
        if (!phrase || skip.has(phrase)) {
          continue;
        }
        const source = item.source?.trim() || 'llm_negative_words';
        await tx.semanticNegativeSuggestion.upsert({
          where: {
            projectId_phrase: { projectId, phrase },
          },
          create: {
            projectId,
            phrase,
            reason: item.reason,
            source,
          },
          update: {
            reason: item.reason,
            source,
            status: NegativeSuggestionStatus.pending,
            resolvedAt: null,
          },
        });
      }
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

  private toBriefInput(payload: ProjectBriefPayload): SemanticBriefInput {
    return {
      website_url: payload.project.website_url,
      geo: payload.project.geo,
      usp: payload.marketing.usp,
      target_audience: payload.marketing.target_audience,
      global_negative_keywords: payload.exclusions.global_negative_keywords,
      product_description: payload.marketing.product_description,
      price_segment: payload.marketing.price_segment,
      forbidden_phrases: payload.marketing.forbidden_phrases,
    };
  }
}

function csv(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
