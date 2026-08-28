import { OptimizationWriter } from "./types";

/** Мок LLM: только оборачивает уже посчитанные факты, не считает метрики. */
export class HeuristicOptimizationLlm implements OptimizationWriter {
  wrap(facts: string[]): {
    insights: string[];
    prompt: string;
    response: string;
  } {
    const insights = facts.map((fact) => `Рекомендация: ${fact}`);
    const prompt = facts.join("\n");
    return { insights, prompt, response: insights.join("\n") };
  }
}
