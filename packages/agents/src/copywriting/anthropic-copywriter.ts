import {
  anthropicMessages,
  AnthropicClientOptions,
  parseJsonFromLlm,
} from "../llm/anthropic-client";
import { LlmUsage } from "../semantic/types";
import { SemanticCluster } from "../semantic/types";
import {
  Copywriter,
  HeuristicCopywriter,
  sanitizeClusterCreatives,
} from "./generate";
import {
  ClusterCreatives,
  CopyMarketing,
  limitOf,
  PlatformLimit,
} from "./limits";

const SYSTEM =
  "Ты узкий агент копирайтинга для контекстной рекламы. Отвечай только валидным JSON без пояснений.";

export type AnthropicCopywriterOptions = AnthropicClientOptions & {
  onLlmCall?: (usage: LlmUsage) => void | Promise<void>;
};

function toUsage(
  step: string,
  prompt: string,
  result: Awaited<ReturnType<typeof anthropicMessages>>,
): LlmUsage {
  return {
    step,
    model: result.model,
    prompt,
    response: result.text,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
    latencyMs: result.latencyMs,
  };
}

export class AnthropicCopywriter implements Copywriter {
  private readonly heuristic = new HeuristicCopywriter();
  private readonly options: AnthropicCopywriterOptions;

  constructor(options: AnthropicCopywriterOptions) {
    this.options = options;
  }

  async writeCluster(
    cluster: SemanticCluster,
    marketing: CopyMarketing,
    limits: PlatformLimit[],
  ): Promise<ClusterCreatives> {
    const prompt = JSON.stringify({
      cluster_name: cluster.cluster_name,
      keywords: cluster.keywords.slice(0, 12).map((item) => item.phrase),
      marketing: {
        usp: marketing.usp,
        target_audience: marketing.target_audience,
        forbidden_phrases: marketing.forbidden_phrases,
        geo: marketing.geo,
      },
      limits: {
        headline1: limitOf(limits, "headline1").maxLength,
        headline2: limitOf(limits, "headline2").maxLength,
        description: limitOf(limits, "description").maxLength,
        sitelink: {
          maxLength: limitOf(limits, "sitelink").maxLength,
          maxCount: limitOf(limits, "sitelink").maxCount,
        },
        callout: {
          maxLength: limitOf(limits, "callout").maxLength,
          maxCount: limitOf(limits, "callout").maxCount,
        },
      },
    });
    try {
      const result = await anthropicMessages({
        apiKey: this.options.apiKey,
        model: this.options.model,
        fetchImpl: this.options.fetchImpl,
        system: SYSTEM,
        user: `Напиши 2 A/B-варианта объявления (ab_group A и B) для кластера ключей. JSON: {"cluster_name":"...","ab_variants":2,"ads":[{"ab_group":"A","headline1":"","headline2":"","description":"","sitelinks":[],"callouts":[]}]}. Соблюдай maxLength из limits. Хотя бы одно УТП из marketing.usp обязательно в каждом объявлении. Не используй forbidden_phrases.\n${prompt}`,
        maxTokens: 2048,
      });
      await this.options.onLlmCall?.(
        toUsage("write_cluster", prompt, result),
      );
      const parsed = parseJsonFromLlm<ClusterCreatives>(result.text);
      if (!parsed?.ads?.length) {
        return this.heuristic.writeCluster(cluster, marketing, limits);
      }
      return sanitizeClusterCreatives(
        {
          cluster_name: cluster.cluster_name,
          ab_variants: parsed.ab_variants ?? parsed.ads.length,
          ads: parsed.ads,
        },
        marketing,
        limits,
      );
    } catch {
      return this.heuristic.writeCluster(cluster, marketing, limits);
    }
  }
}
