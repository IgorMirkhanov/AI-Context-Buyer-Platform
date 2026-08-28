import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { join } from 'path';
import {
  AgentTaskStatus,
  AgentType,
  MediaAssetStatus,
  MediaKind,
} from '@prisma/client';
import {
  buildMediaPlan,
  HeuristicMediaPromptWriter,
  MediaKind as PlanKind,
  MediaPlanValidationError,
  resolveLlmCostUsd,
} from '@context-buyer/agents';
import {
  createMediaGenerationApi,
  MediaGenerationConnector,
} from '@context-buyer/connectors';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectBriefPayload } from '../briefs/brief.schema';
import { LocalObjectStore, ObjectStore } from './object-store';
import { AiProviderService } from '../ai-provider/ai-provider.service';

/** Visual creatives: generate via MediaGenerationConnector, never push to ads. */

@Injectable()
export class MediaService {
  private readonly store: ObjectStore;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly ai: AiProviderService,
  ) {
    this.store = new LocalObjectStore(
      this.config.get<string>('MEDIA_STORE_DIR') ||
        join(process.cwd(), '.media-store'),
    );
  }

  async generate(
    organizationId: string,
    projectId: string,
    kinds: PlanKind[] = ['image'],
  ) {
    await this.ai.requireReady(organizationId);
    await this.requireProject(organizationId, projectId);
    const uniqueKinds = [...new Set(kinds)];
    if (uniqueKinds.length === 0) {
      throw new BadRequestException('kinds must include image or video');
    }

    const [briefRow, clusters] = await Promise.all([
      this.prisma.projectBrief.findFirst({
        where: { projectId },
        orderBy: { version: 'desc' },
      }),
      this.prisma.semanticCluster.findMany({
        where: { projectId },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    if (!briefRow) {
      throw new BadRequestException('Project brief is missing');
    }
    if (clusters.length === 0) {
      throw new BadRequestException('Run Semantic Agent first');
    }

    const payload = briefRow.payloadJson as ProjectBriefPayload;
    const task = await this.prisma.agentTask.create({
      data: {
        projectId,
        agentType: AgentType.media,
        status: AgentTaskStatus.running,
        startedAt: new Date(),
        inputRef: uniqueKinds.join(','),
      },
    });

    try {
      const plan = buildMediaPlan(
        {
          clusters: clusters.slice(0, 20).map((cluster) => ({
            id: cluster.id,
            name: cluster.name,
          })),
          marketing: {
            usp: payload.marketing.usp,
            target_audience: payload.marketing.target_audience,
            forbidden_phrases: payload.marketing.forbidden_phrases ?? [],
            geo: payload.project.geo,
            product_description: payload.marketing.product_description,
          },
          kinds: uniqueKinds,
        },
        new HeuristicMediaPromptWriter(),
      );

      await this.removeGenerated(
        projectId,
        uniqueKinds.map((kind) =>
          kind === 'video' ? MediaKind.video : MediaKind.image,
        ),
      );

      const openaiKey = await this.ai.resolveApiKey(organizationId, 'openai');
      const mock =
        this.config.get<string>('MEDIA_MOCK') === '1' ||
        this.config.get<string>('MEDIA_MOCK') === 'true' ||
        !openaiKey;
      const media = new MediaGenerationConnector(
        createMediaGenerationApi({
          mock,
          apiKey: openaiKey ?? undefined,
          model: this.config.get<string>('MEDIA_IMAGE_MODEL') || 'dall-e-3',
        }),
      );

      for (const item of plan.items) {
        const generated =
          item.kind === 'video'
            ? await media.generateVideo(projectId, {
                prompt: item.prompt,
                width: item.width,
                height: item.height,
                durationMs: item.duration_ms ?? 5000,
              })
            : await media.generateImage(projectId, {
                prompt: item.prompt,
                width: item.width,
                height: item.height,
              });

        const id = randomUUID();
        const ext = extensionFor(generated.mimeType);
        const { key } = await this.store.put(
          projectId,
          `${id}.${ext}`,
          generated.bytes,
          generated.mimeType,
        );
        await this.prisma.mediaAsset.create({
          data: {
            id,
            projectId,
            clusterId: item.cluster_id,
            kind:
              item.kind === 'video' ? MediaKind.video : MediaKind.image,
            provider: generated.provider,
            prompt: item.prompt,
            storageKey: key,
            mimeType: generated.mimeType,
            width: generated.width,
            height: generated.height,
            durationMs: generated.durationMs ?? item.duration_ms,
            status: MediaAssetStatus.generated,
          },
        });
        await this.prisma.llmCallLog.create({
          data: {
            projectId,
            agentType: AgentType.media,
            step: item.kind === 'video' ? 'video_prompt' : 'image_prompt',
            model: generated.provider,
            prompt: item.prompt,
            response: key,
            inputTokens: 0,
            outputTokens: 0,
            costUsd: resolveLlmCostUsd({
              model: generated.provider,
              inputTokens: 0,
              outputTokens: 0,
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
          outputRef: `media_assets:${plan.items.length}`,
        },
      });
      return this.list(organizationId, projectId);
    } catch (err) {
      const details =
        err instanceof MediaPlanValidationError
          ? err.details.join('; ')
          : err instanceof Error
            ? err.message
            : 'media generation failed';
      await this.prisma.agentTask.update({
        where: { id: task.id },
        data: {
          status: AgentTaskStatus.failed,
          finishedAt: new Date(),
          error: details,
        },
      });
      throw new BadRequestException({
        message: 'Media generation failed',
        details,
      });
    }
  }

  async list(organizationId: string, projectId: string) {
    await this.requireProject(organizationId, projectId);
    const [task, assets, clusters] = await Promise.all([
      this.prisma.agentTask.findFirst({
        where: { projectId, agentType: AgentType.media },
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.mediaAsset.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.semanticCluster.findMany({ where: { projectId } }),
    ]);
    const clusterName = new Map(clusters.map((item) => [item.id, item.name]));
    return {
      task,
      publishedToAds: false,
      assets: assets.map((item) => ({
        id: item.id,
        kind: item.kind,
        status: item.status,
        provider: item.provider,
        prompt: item.prompt,
        mimeType: item.mimeType,
        width: item.width,
        height: item.height,
        durationMs: item.durationMs,
        clusterId: item.clusterId,
        clusterName: item.clusterId
          ? (clusterName.get(item.clusterId) ?? null)
          : null,
        createdAt: item.createdAt,
      })),
    };
  }

  async approve(organizationId: string, projectId: string, assetId: string) {
    const asset = await this.requireAsset(organizationId, projectId, assetId);
    if (asset.status === MediaAssetStatus.rejected) {
      throw new BadRequestException('Rejected asset cannot be approved');
    }
    await this.prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { status: MediaAssetStatus.approved },
    });
    return this.list(organizationId, projectId);
  }

  async reject(organizationId: string, projectId: string, assetId: string) {
    const asset = await this.requireAsset(organizationId, projectId, assetId);
    await this.prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { status: MediaAssetStatus.rejected },
    });
    return this.list(organizationId, projectId);
  }

  async getFile(organizationId: string, projectId: string, assetId: string) {
    const asset = await this.requireAsset(organizationId, projectId, assetId);
    const stored = await this.store.get(projectId, asset.storageKey);
    if (!stored) {
      throw new NotFoundException('Media file not found');
    }
    return {
      body: stored.body,
      mimeType: asset.mimeType,
      filename: asset.storageKey.split('/').pop() ?? `${asset.id}`,
    };
  }

  private async removeGenerated(projectId: string, kinds: MediaKind[]) {
    const previous = await this.prisma.mediaAsset.findMany({
      where: {
        projectId,
        kind: { in: kinds },
        status: MediaAssetStatus.generated,
      },
    });
    for (const item of previous) {
      await this.store.delete(projectId, item.storageKey);
    }
    await this.prisma.mediaAsset.deleteMany({
      where: {
        projectId,
        kind: { in: kinds },
        status: MediaAssetStatus.generated,
      },
    });
  }

  private async requireAsset(
    organizationId: string,
    projectId: string,
    assetId: string,
  ) {
    await this.requireProject(organizationId, projectId);
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id: assetId, projectId },
    });
    if (!asset) {
      throw new NotFoundException('Media asset not found');
    }
    return asset;
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

function extensionFor(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'video/mp4') return 'mp4';
  if (mimeType === 'video/webm') return 'webm';
  return 'png';
}
