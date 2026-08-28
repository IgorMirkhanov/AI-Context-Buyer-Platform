import { InsightWriter } from "./types";

/** Мок LLM: только оборачивает уже посчитанные факты, не считает метрики. */
export class HeuristicReportingLlm implements InsightWriter {
  wrap(facts: string[]): {
    insights: string[];
    prompt: string;
    response: string;
  } {
    const insights = facts.slice(0, 3).map((fact) => `Вывод: ${fact}`);
    const prompt = facts.join("\n");
    return { insights, prompt, response: insights.join("\n") };
  }
}
