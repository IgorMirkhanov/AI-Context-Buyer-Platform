import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AgentTaskStatus,
  AgentType,
  CreativeStatus,
  CreativeType,
  IssueLevel,
} from '@prisma/client';
import {
  ClusterCreatives,
  CopyMarketing,
  CopywritingLlmMode,
  PlatformLimit,
  agentAcceptance,
  clusterEditAcceptance,
  resolveCopywritingLlm,
  resolveLlmCostUsd,
  runCopyAndValidate,
  SemanticCore,
  ValidationIssueDraft,
} from '@context-buyer/agents';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectBriefPayload } from '../briefs/brief.schema';
import { AiProviderService } from '../ai-provider/ai-provider.service';

@Injectable()
export class CreativesService {
  private readonly log = new Logger(CreativesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiProviderService,
  ) {}

  async run(organizationId: string, projectId: string) {
    const credentials = await this.ai.tryResolveOptional(organizationId);
    const project = await this.requireProject(organizationId, projectId);
    const [briefRow, clusters, dbLimits] = await Promise.all([
      this.prisma.projectBrief.findFirst({
        where: { projectId },
        orderBy: { version: 'desc' },
      }),
      this.prisma.semanticCluster.findMany({
        where: { projectId },
        include: { keywords: true },
      }),
      this.prisma.platformLimit.findMany({
        where: { platform: project.primaryPlatform },
      }),
    ]);
    if (!briefRow) {
      throw new BadRequestException('Project brief is missing');
    }
    if (clusters.length === 0) {
      throw new BadRequestException('Run Semantic Agent first');
    }
    if (dbLimits.length === 0) {
      throw new BadRequestException('Platform limits are not configured');
    }

    const task = await this.prisma.agentTask.create({
      data: {
        projectId,
        agentType: AgentType.copywriting,
        status: AgentTaskStatus.running,
        startedAt: new Date(),
      },
    });

    try {
      const payload = briefRow.payloadJson as ProjectBriefPayload;
      const marketing = this.toMarketing(payload);
      const limits = this.toLimits(dbLimits);
      const core = this.toCore(clusters);
      const { writer, mode } = resolveCopywritingLlm({
        apiKey: credentials?.apiKey ?? null,
        onFallback: (message) => this.log.warn(message),
        onLlmCall: async (usage) => {
          await this.prisma.llmCallLog.create({
            data: {
              projectId,
              agentType: AgentType.copywriting,
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
      const result = await runCopyAndValidate(core, marketing, limits, writer);

      await this.persist(projectId, clusters, result.creatives, result.issues);
      if (mode === 'heuristic') {
        const copyPrompt = JSON.stringify({
          clusters: result.creatives.length,
        });
        const copyResponse = JSON.stringify({
          issues: result.issues.length,
        });
        await this.prisma.llmCallLog.create({
          data: {
            projectId,
            agentType: AgentType.copywriting,
            step: 'copy_and_validate',
            model: 'heuristic',
            prompt: copyPrompt,
            response: copyResponse,
            inputTokens: Math.ceil(copyPrompt.length / 4),
            outputTokens: Math.ceil(copyResponse.length / 4),
            costUsd: resolveLlmCostUsd({
              model: 'heuristic',
              inputTokens: Math.ceil(copyPrompt.length / 4),
              outputTokens: Math.ceil(copyResponse.length / 4),
            }),
            latencyMs: 0,
          },
        });
      }
      await this.prisma.agentTask.update({
        where: { id: task.id },
        data: {
          status: AgentTaskStatus.done,
          finishedAt: new Date(),
          outputRef: `ad_creatives:${mode}`,
        },
      });
      await this.prisma.agentTask.create({
        data: {
          projectId,
          agentType: AgentType.validation,
          status: AgentTaskStatus.done,
          startedAt: new Date(),
          finishedAt: new Date(),
          outputRef: `issues:${result.issues.length}`,
        },
      });
      return { ...(await this.getResult(organizationId, projectId)), llmMode: mode };
    } catch (err) {
      const details = err instanceof Error ? err.message : 'copywriting failed';
      await this.prisma.agentTask.update({
        where: { id: task.id },
        data: {
          status: AgentTaskStatus.failed,
          finishedAt: new Date(),
          error: details,
        },
      });
      throw new BadRequestException({
        message: 'Copywriting pipeline failed',
        details,
      });
    }
  }

  async getResult(organizationId: string, projectId: string) {
    await this.requireProject(organizationId, projectId);
    const [creatives, issues, clusters, copyTask, validationTask] =
      await Promise.all([
        this.prisma.adCreative.findMany({
          where: { projectId },
          orderBy: [{ clusterId: 'asc' }, { abGroup: 'asc' }, { type: 'asc' }],
        }),
        this.prisma.validationIssue.findMany({
          where: { projectId },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.semanticCluster.findMany({ where: { projectId } }),
        this.prisma.agentTask.findFirst({
          where: { projectId, agentType: AgentType.copywriting },
          orderBy: { startedAt: 'desc' },
        }),
        this.prisma.agentTask.findFirst({
          where: { projectId, agentType: AgentType.validation },
          orderBy: { startedAt: 'desc' },
        }),
      ]);
    const clusterName = new Map(clusters.map((item) => [item.id, item.name]));
    return {
      task: copyTask,
      validationTask,
      llmMode: parseCopywritingLlmMode(copyTask?.outputRef),
      quality: {
        creatives: agentAcceptance({
          total: creatives.length,
          edited: creatives.filter(
            (item) => item.status === CreativeStatus.edited,
          ).length,
        }),
        clusters: clusterEditAcceptance(
          creatives.map((item) => ({
            clusterId: item.clusterId,
            edited: item.status === CreativeStatus.edited,
          })),
        ),
      },
      creatives: creatives.map((item) => ({
        ...item,
        clusterName: clusterName.get(item.clusterId) ?? '',
        issues: issues.filter((issue) => issue.creativeId === item.id),
      })),
      issues,
    };
  }

  async updateText(
    organizationId: string,
    projectId: string,
    creativeId: string,
    text: string,
  ) {
    await this.requireProject(organizationId, projectId);
    const creative = await this.prisma.adCreative.findFirst({
      where: { id: creativeId, projectId },
    });
    if (!creative) {
      throw new NotFoundException('Creative not found');
    }
    const project = await this.prisma.project.findFirstOrThrow({
      where: { id: projectId },
    });
    const limits = await this.prisma.platformLimit.findMany({
      where: { platform: project.primaryPlatform },
    });
    const limit = limits.find((item) => item.elementType === creative.type);
    const nextText =
      limit && text.length > limit.maxLength
        ? text.slice(0, limit.maxLength)
        : text;

    await this.prisma.$transaction(async (tx) => {
      await tx.adCreative.update({
        where: { id: creativeId },
        data: { text: nextText, status: CreativeStatus.edited },
      });
      await tx.validationIssue.deleteMany({ where: { creativeId } });
      if (limit && text.length > limit.maxLength) {
        await tx.validationIssue.create({
          data: {
            projectId,
            creativeId,
            level: IssueLevel.warning,
            code: 'length_limit',
            message: `${creative.type} clipped to ${limit.maxLength} chars`,
            autoFixed: true,
          },
        });
      }
    });
    return this.getResult(organizationId, projectId);
  }

  private async persist(
    projectId: string,
    clusters: Array<{ id: string; name: string }>,
    creatives: ClusterCreatives[],
    issues: ValidationIssueDraft[],
  ) {
    const byName = new Map(clusters.map((item) => [item.name, item.id]));
    await this.prisma.$transaction(async (tx) => {
      await tx.validationIssue.deleteMany({ where: { projectId } });
      await tx.adCreative.deleteMany({ where: { projectId } });

      const createdIds: Array<{
        clusterName: string;
        abGroup: string;
        type: CreativeType;
        id: string;
      }> = [];

      for (const cluster of creatives) {
        const clusterId = byName.get(cluster.cluster_name);
        if (!clusterId) continue;
        for (const ad of cluster.ads) {
          const rows: Array<{ type: CreativeType; text: string }> = [
            { type: CreativeType.headline1, text: ad.headline1 },
            { type: CreativeType.headline2, text: ad.headline2 },
            { type: CreativeType.description, text: ad.description },
            ...ad.sitelinks.map((text) => ({
              type: CreativeType.sitelink,
              text,
            })),
            ...ad.callouts.map((text) => ({
              type: CreativeType.callout,
              text,
            })),
          ];
          for (const row of rows) {
            const saved = await tx.adCreative.create({
              data: {
                projectId,
                clusterId,
                type: row.type,
                text: row.text,
                abGroup: ad.ab_group,
              },
            });
            createdIds.push({
              clusterName: cluster.cluster_name,
              abGroup: ad.ab_group,
              type: row.type,
              id: saved.id,
            });
          }
        }
      }

      for (const issue of issues) {
        await tx.validationIssue.create({
          data: {
            projectId,
            creativeId: matchCreativeId(createdIds, issue),
            level:
              issue.level === 'critical'
                ? IssueLevel.critical
                : IssueLevel.warning,
            code: issue.code,
            message: issue.message,
            autoFixed: issue.autoFixed,
          },
        });
      }
    });
  }

  private toCore(
    clusters: Array<{
      name: string;
      category: SemanticCore['clusters'][number]['category'];
      keywords: Array<{
        phrase: string;
        intent: SemanticCore['clusters'][number]['keywords'][number]['intent'];
        frequency: number;
        isNegative: boolean;
      }>;
    }>,
  ): SemanticCore {
    return {
      clusters: clusters.map((cluster) => ({
        cluster_name: cluster.name,
        category: cluster.category,
        keywords: cluster.keywords
          .filter((item) => !item.isNegative)
          .map((item) => ({
            phrase: item.phrase,
            intent: item.intent,
            frequency: item.frequency,
          })),
        negative_keywords: cluster.keywords
          .filter((item) => item.isNegative)
          .map((item) => item.phrase),
      })),
      global_negatives: [],
    };
  }

  private toMarketing(payload: ProjectBriefPayload): CopyMarketing {
    return {
      usp: payload.marketing.usp,
      target_audience: payload.marketing.target_audience,
      forbidden_phrases: payload.marketing.forbidden_phrases ?? [],
      geo: payload.project.geo,
    };
  }

  private toLimits(
    rows: Array<{
      elementType: string;
      maxLength: number;
      maxCount: number;
    }>,
  ): PlatformLimit[] {
    return rows.map((row) => ({
      elementType: row.elementType as PlatformLimit['elementType'],
      maxLength: row.maxLength,
      maxCount: row.maxCount,
    }));
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

function parseCopywritingLlmMode(
  outputRef: string | null | undefined,
): CopywritingLlmMode | null {
  if (!outputRef) return null;
  if (outputRef.endsWith(':anthropic')) return 'anthropic';
  if (outputRef.endsWith(':heuristic') || outputRef === 'ad_creatives') {
    return 'heuristic';
  }
  return null;
}

function matchCreativeId(
  created: Array<{
    clusterName: string;
    abGroup: string;
    type: CreativeType;
    id: string;
  }>,
  issue: ValidationIssueDraft,
): string | undefined {
  const typePart = issue.elementType?.split(':')[0] as CreativeType | undefined;
  const indexPart = issue.elementType?.includes(':')
    ? Number(issue.elementType.split(':')[1])
    : undefined;
  const pool = created.filter(
    (item) =>
      item.clusterName === issue.clusterName &&
      (issue.abGroup == null || item.abGroup === issue.abGroup) &&
      (typePart == null || item.type === typePart),
  );
  if (indexPart != null && !Number.isNaN(indexPart)) {
    return pool[indexPart]?.id;
  }
  return pool[0]?.id;
}
