import { Injectable, NotFoundException } from '@nestjs/common';
import {
  previewLlmText,
  summarizeLlmUsage,
} from '@context-buyer/agents';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LlmUsageService {
  constructor(private readonly prisma: PrismaService) {}

  async get(organizationId: string, projectId: string) {
    await this.requireProject(organizationId, projectId);
    const rows = await this.prisma.llmCallLog.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
    const summary = summarizeLlmUsage(
      rows.map((row) => ({
        agentType: row.agentType,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        costUsd: Number(row.costUsd),
      })),
    );
    return {
      summary,
      recent: rows.slice(0, 30).map((row) => ({
        id: row.id,
        agentType: row.agentType,
        step: row.step,
        model: row.model,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        costUsd: Number(row.costUsd),
        latencyMs: row.latencyMs,
        createdAt: row.createdAt,
        promptPreview: previewLlmText(row.prompt),
      })),
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
}
