import { estimateLlmCostUsd } from "../llm/cost";
import type { LlmUsage } from "../semantic/types";
import type { AnalysisBriefInput, AnalysisWriter } from "./types";

function usage(step: string, prompt: string, response: string): LlmUsage {
  const inputTokens = Math.ceil(prompt.length / 4);
  const outputTokens = Math.ceil(response.length / 4);
  return {
    model: "heuristic",
    prompt,
    response,
    inputTokens,
    outputTokens,
    costUsd: estimateLlmCostUsd("heuristic", inputTokens, outputTokens),
    latencyMs: 0,
    step,
  };
}

export class HeuristicAnalysisWriter implements AnalysisWriter {
  async explain(
    brief: AnalysisBriefInput,
    landingText: string,
  ): Promise<{ explanation: string; usage: LlmUsage }> {
    const audience = brief.target_audience
      .map((item) => item.segment)
      .join(", ");
    const landingSnippet = landingText
      .split(/\s+/)
      .slice(0, 40)
      .join(" ");
    const lines = [
      "Основа для семантики (без LLM — краткая сводка по брифу и сайту):",
      "",
      `1. Сайт: ${brief.website_url}. ${
        landingSnippet
          ? `С главной возьму формулировки: «${landingSnippet}…»`
          : "Текст страницы недоступен — опираюсь на бриф."
      }`,
      `2. УТП из брифа: ${brief.usp.join("; ")}.`,
      `3. Аудитория: ${audience}.`,
      `4. Гео: ${brief.geo.join(", ")}.`,
      `5. Глобальные минус-слова: ${brief.global_negative_keywords.join(", ") || "не заданы"}.`,
      "6. Маски для Wordstat соберу из УТП, аудитории и ключевых фраз с лендинга.",
    ];
    const explanation = lines.join("\n");
    return {
      explanation,
      usage: usage("explain", JSON.stringify(brief), explanation),
    };
  }
}
