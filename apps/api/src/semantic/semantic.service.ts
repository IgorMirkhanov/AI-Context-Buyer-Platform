import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AgentTaskStatus, AgentType, KeywordIntent } from '@prisma/client';
import {
  resolveLlmCostUsd,
  runSemanticPipeline,
  SemanticBriefInput,
  SemanticCore,
  SemanticCoreValidationError,
} from '@context-buyer/agents';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectorRouter } from '../connectors/connector-router';
import { ProjectBriefPayload } from '../briefs/brief.schema';
import { AiProviderService } from '../ai-provider/ai-provider.service';

@Injectable()
export class SemanticService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connectors: ConnectorRouter,
    private readonly ai: AiProviderService,
  ) {}

  async run(organizationId: string, projectId: string) {
    const credentials = await this.ai.requireReady(organizationId);
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
      const core = await runSemanticPipeline(brief, {
        apiKey: credentials.apiKey,
        getKeywordIdeas: (seeds, geo) =>
          connector.getKeywordIdeas(seeds, geo),
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

      await this.persistCore(projectId, core);
      await this.prisma.agentTask.update({
        where: { id: task.id },
        data: {
          status: AgentTaskStatus.done,
          finishedAt: new Date(),
          outputRef: 'semantic_core',
        },
      });
      return { taskId: task.id, status: AgentTaskStatus.done, core };
    } catch (err) {
      const details =
        err instanceof SemanticCoreValidationError
          ? err.details.join('; ')
          : err instanceof Error
            ? err.message
            : 'Unknown semantic agent error';
      await this.prisma.agentTask.update({
        where: { id: task.id },
        data: {
          status: AgentTaskStatus.failed,
          finishedAt: new Date(),
          error: details,
        },
      });
      throw new BadRequestException({
        message: 'Semantic pipeline failed',
        details,
      });
    }
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
    return {
      task: lastTask,
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
          })),
        negativeKeywords: cluster.keywords
          .filter((item) => item.isNegative)
          .map((item) => item.phrase),
      })),
    };
  }

  async exportCsv(organizationId: string, projectId: string): Promise<string> {
    const result = await this.getResult(organizationId, projectId);
    const lines = [
      [
        'cluster',
        'category',
        'phrase',
        'intent',
        'frequency',
        'is_negative',
      ].join(','),
    ];
    for (const cluster of result.clusters) {
      for (const kw of cluster.keywords) {
        lines.push(
          [
            csv(cluster.name),
            csv(cluster.category),
            csv(kw.phrase),
            csv(kw.intent),
            String(kw.frequency),
            'false',
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
          ].join(','),
        );
      }
    }
    return lines.join('\n');
  }

  async exportXlsx(organizationId: string, projectId: string): Promise<Buffer> {
    const csvText = await this.exportCsv(organizationId, projectId);
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
              source: 'mock_wordstat',
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
