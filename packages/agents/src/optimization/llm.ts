import { OptimizationWriter, OptimizationWrapResult } from "./types";

/** Мок LLM: только оборачивает уже посчитанные факты, не считает метрики. */
export class HeuristicOptimizationLlm implements OptimizationWriter {
  wrap(facts: string[]): OptimizationWrapResult {
    const insights = facts.map((fact) => `Рекомендация: ${fact}`);
    const prompt = facts.join("\n");
    return {
      insights,
      prompt,
      response: insights.join("\n"),
      model: "heuristic",
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs: 0,
    };
  }
}
