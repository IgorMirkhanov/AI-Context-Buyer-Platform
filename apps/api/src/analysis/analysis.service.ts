import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AgentTaskStatus, AgentType } from '@prisma/client';
import {
  AnalysisBriefInput,
  parseCustomSeeds,
  resolveAnalysisLlm,
  resolveLlmCostUsd,
  runAnalysisPipeline,
} from '@context-buyer/agents';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectBriefPayload } from '../briefs/brief.schema';
import { AiProviderService } from '../ai-provider/ai-provider.service';

@Injectable()
export class AnalysisService {
  private readonly log = new Logger(AnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiProviderService,
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

    const task = await this.prisma.agentTask.create({
      data: {
        projectId,
        agentType: AgentType.analysis,
        status: AgentTaskStatus.running,
        startedAt: new Date(),
        inputRef: briefRow.id,
      },
    });

    try {
      const brief = this.toBriefInput(
        briefRow.payloadJson as ProjectBriefPayload,
      );
      const { writer, mode } = resolveAnalysisLlm({
        apiKey: credentials?.apiKey ?? null,
        provider: credentials?.provider ?? null,
        onFallback: (message) => this.log.warn(message),
      });
      const existing = await this.prisma.projectAnalysis.findUnique({
        where: { projectId },
      });
      const result = await runAnalysisPipeline(brief, {
        writer,
        onLlmCall: async (usage) => {
          await this.prisma.llmCallLog.create({
            data: {
              projectId,
              agentType: AgentType.analysis,
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

      await this.prisma.projectAnalysis.upsert({
        where: { projectId },
        create: {
          projectId,
          briefId: briefRow.id,
          websiteUrl: result.websiteUrl,
          landingText: result.landingText,
          explanation: result.explanation,
          customSeeds: existing?.customSeeds ?? [],
          llmMode: mode,
        },
        update: {
          briefId: briefRow.id,
          websiteUrl: result.websiteUrl,
          landingText: result.landingText,
          explanation: result.explanation,
          llmMode: mode,
        },
      });

      await this.prisma.agentTask.update({
        where: { id: task.id },
        data: {
          status: AgentTaskStatus.done,
          finishedAt: new Date(),
          outputRef: 'project_analysis',
        },
      });

      return this.getResult(organizationId, projectId, mode);
    } catch (err) {
      const details = err instanceof Error ? err.message : 'Unknown analysis error';
      await this.prisma.agentTask.update({
        where: { id: task.id },
        data: {
          status: AgentTaskStatus.failed,
          finishedAt: new Date(),
          error: details,
        },
      });
      throw new BadRequestException({
        message: 'Analysis failed',
        details,
      });
    }
  }

  async updateSeeds(
    organizationId: string,
    projectId: string,
    customSeedsText: string,
  ) {
    await this.requireProject(organizationId, projectId);
    const analysis = await this.prisma.projectAnalysis.findUnique({
      where: { projectId },
    });
    if (!analysis) {
      throw new BadRequestException('Run analysis before adding custom seeds');
    }
    const customSeeds = parseCustomSeeds(customSeedsText);
    await this.prisma.projectAnalysis.update({
      where: { projectId },
      data: { customSeeds },
    });
    return { customSeeds };
  }

  async getResult(
    organizationId: string,
    projectId: string,
    llmMode?: string,
  ) {
    await this.requireProject(organizationId, projectId);
    const analysis = await this.prisma.projectAnalysis.findUnique({
      where: { projectId },
    });
    const lastTask = await this.prisma.agentTask.findFirst({
      where: { projectId, agentType: AgentType.analysis },
      orderBy: { startedAt: 'desc' },
    });
    if (!analysis) {
      return {
        task: lastTask,
        ready: false,
        explanation: null,
        landingText: null,
        websiteUrl: null,
        customSeeds: [] as string[],
        llmMode: null,
      };
    }
    return {
      task: lastTask,
      ready: true,
      explanation: analysis.explanation,
      landingText: analysis.landingText,
      websiteUrl: analysis.websiteUrl,
      customSeeds: analysis.customSeeds,
      llmMode: llmMode ?? analysis.llmMode,
    };
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

  private toBriefInput(payload: ProjectBriefPayload): AnalysisBriefInput {
    return {
      website_url: payload.project.website_url,
      geo: payload.project.geo,
      usp: payload.marketing.usp,
      target_audience: payload.marketing.target_audience,
      global_negative_keywords: payload.exclusions.global_negative_keywords,
      product_description: payload.marketing.product_description,
      price_segment: payload.marketing.price_segment,
    };
  }
}
