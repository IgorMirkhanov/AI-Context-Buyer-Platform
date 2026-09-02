import { openaiCompatibleChat } from "../llm/openai-compatible-client";
import {
  GROQ_DEFAULT_MODEL,
  GROQ_OPENAI_BASE_URL,
} from "../llm/groq-defaults";
import { parseJsonFromLlm } from "../llm/anthropic-client";
import { HeuristicOptimizationLlm } from "./llm";
import { OptimizationWriter, OptimizationWrapResult } from "./types";

const SYSTEM =
  "Ты узкий агент оптимизации рекламных кампаний. Отвечай только валидным JSON без пояснений.";

export type GroqOptimizationLlmOptions = {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export class GroqOptimizationLlm implements OptimizationWriter {
  private readonly heuristic = new HeuristicOptimizationLlm();
  private readonly options: GroqOptimizationLlmOptions;

  constructor(options: GroqOptimizationLlmOptions) {
    this.options = options;
  }

  async wrap(facts: string[]): Promise<OptimizationWrapResult> {
    if (facts.length === 0) {
      return this.heuristic.wrap(facts);
    }
    const prompt = facts.join("\n");
    try {
      const result = await openaiCompatibleChat({
        apiKey: this.options.apiKey,
        baseUrl: GROQ_OPENAI_BASE_URL,
        model: this.options.model ?? GROQ_DEFAULT_MODEL,
        fetchImpl: this.options.fetchImpl,
        timeoutMs: this.options.timeoutMs,
        system: SYSTEM,
        user: `Переформулируй каждый факт в короткую рекомендацию для контекстолога на русском. Сохрани все числа из исходных фактов без изменений. JSON: {"insights":["..."]} — массив той же длины, что входные строки.\n${prompt}`,
        maxTokens: 1024,
      });
      const parsed = parseJsonFromLlm<{ insights?: string[] }>(result.text);
      const insights =
        parsed?.insights?.length === facts.length
          ? parsed.insights
          : facts.map(
              (fact, index) =>
                parsed?.insights?.[index] ?? `Рекомендация: ${fact}`,
            );
      return {
        insights,
        prompt,
        response: result.text,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: result.costUsd,
        latencyMs: result.latencyMs,
      };
    } catch {
      return this.heuristic.wrap(facts);
    }
  }
}
