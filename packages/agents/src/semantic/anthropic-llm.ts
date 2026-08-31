import {
  anthropicMessages,
  AnthropicClientOptions,
  parseJsonFromLlm,
} from "../llm/anthropic-client";
import { masksFromBrief, intentFromHeuristics } from "./heuristics";
import { HeuristicSemanticLlm, SemanticLlm } from "./llm";
import {
  ClusterCategory,
  KeywordIntent,
  LlmUsage,
  SemanticBriefInput,
} from "./types";

const SYSTEM =
  "Ты узкий агент семантики для контекстной рекламы. Отвечай только валидным JSON без пояснений.";

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

export class AnthropicSemanticLlm implements SemanticLlm {
  private readonly heuristic = new HeuristicSemanticLlm();
  private readonly options: AnthropicClientOptions;

  constructor(options: AnthropicClientOptions) {
    this.options = options;
  }

  async extractMasks(
    brief: SemanticBriefInput,
    landingText: string,
  ): Promise<{ masks: string[]; usage: LlmUsage }> {
    const prompt = JSON.stringify({ brief, landingText });
    try {
      const result = await anthropicMessages({
        ...this.options,
        system: SYSTEM,
        user: `Извлеки до 20 поисковых масок (seed) для Wordstat по брифу. Верни JSON: {"masks":["..."]}. Бриф:\n${prompt}`,
      });
      const parsed = parseJsonFromLlm<{ masks?: string[] }>(result.text);
      const fromLlm = (parsed?.masks ?? [])
        .map((mask) => mask.trim().toLowerCase())
        .filter((mask) => mask.length >= 3);
      const baseline = await this.heuristic.extractMasks(brief, landingText);
      const masks = Array.from(new Set([...fromLlm, ...baseline.masks])).slice(
        0,
        30,
      );
      return {
        masks,
        usage: toUsage("extract_masks", prompt, result),
      };
    } catch {
      return this.heuristic.extractMasks(brief, landingText);
    }
  }

  async classifyIntents(
    phrases: string[],
  ): Promise<{ intents: KeywordIntent[]; usage: LlmUsage }> {
    if (phrases.length === 0) {
      return this.heuristic.classifyIntents(phrases);
    }
    const prompt = phrases.join("\n");
    try {
      const result = await anthropicMessages({
        ...this.options,
        system: SYSTEM,
        user: `Классифицируй intent каждой фразы: hot | warm | navigational. Верни JSON {"intents":["hot",...]} в том же порядке.\n${prompt}`,
      });
      const parsed = parseJsonFromLlm<{ intents?: string[] }>(result.text);
      const intents = phrases.map((phrase, index) => {
        const raw = parsed?.intents?.[index]?.toLowerCase();
        if (raw === "hot" || raw === "warm" || raw === "navigational") {
          return raw;
        }
        return intentFromHeuristics(phrase) ?? "warm";
      });
      return {
        intents,
        usage: toUsage("classify_intent", prompt, result),
      };
    } catch {
      return this.heuristic.classifyIntents(phrases);
    }
  }

  async nameCluster(
    phrases: string[],
  ): Promise<{ name: string; category: ClusterCategory; usage: LlmUsage }> {
    const prompt = phrases.join("\n");
    try {
      const result = await anthropicMessages({
        ...this.options,
        system: SYSTEM,
        user: `Дай короткое имя кластера и category (brand|feature|geo|generic) для ключей. JSON: {"name":"...","category":"generic"}.\n${prompt}`,
      });
      const parsed = parseJsonFromLlm<{
        name?: string;
        category?: ClusterCategory;
      }>(result.text);
      const name = parsed?.name?.trim() || phrases[0] || "Кластер";
      const category = parsed?.category ?? "generic";
      return {
        name,
        category,
        usage: toUsage("name_cluster", prompt, result),
      };
    } catch {
      return this.heuristic.nameCluster(phrases);
    }
  }

  async suggestNearIntentPhrases(
    brief: SemanticBriefInput,
    wordstatPhrases: string[],
  ): Promise<{ phrases: string[]; usage: LlmUsage }> {
    const prompt = JSON.stringify({
      brief,
      wordstatPhrases: wordstatPhrases.slice(0, 80),
    });
    try {
      const result = await anthropicMessages({
        ...this.options,
        system: SYSTEM,
        user: `По брифу и уже найденным ключам Wordstat предложи до 12 дополнительных коммерческих поисковых фраз на русском (разговорные формулировки, синонимы «цена/стоимость», глагольные CTA вроде «записаться»). Не дублируй wordstatPhrases. JSON: {"phrases":["..."]}.\n${prompt}`,
        maxTokens: 1024,
      });
      const parsed = parseJsonFromLlm<{ phrases?: string[] }>(result.text);
      const phrases = (parsed?.phrases ?? [])
        .map((item) => item.trim().toLowerCase().replace(/\s+/g, " "))
        .filter((item) => item.length >= 3);
      return {
        phrases: Array.from(new Set(phrases)).slice(0, 12),
        usage: toUsage("suggest_near_intent", prompt, result),
      };
    } catch {
      return this.heuristic.suggestNearIntentPhrases(brief, wordstatPhrases);
    }
  }
}
