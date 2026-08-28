import {
  extraNegativesFromBrief,
  intentFromHeuristics,
  masksFromBrief,
} from "./heuristics";
import {
  ClusterCategory,
  KeywordIntent,
  LlmUsage,
  SemanticBriefInput,
} from "./types";
import { estimateLlmCostUsd } from "../llm/cost";

export interface SemanticLlm {
  extractMasks(
    brief: SemanticBriefInput,
    landingText: string,
  ): Promise<{ masks: string[]; usage: LlmUsage }>;
  classifyIntents(
    phrases: string[],
  ): Promise<{ intents: KeywordIntent[]; usage: LlmUsage }>;
  nameCluster(
    phrases: string[],
  ): Promise<{ name: string; category: ClusterCategory; usage: LlmUsage }>;
}

function usage(
  step: string,
  prompt: string,
  response: string,
  latencyMs: number,
): LlmUsage {
  const inputTokens = Math.ceil(prompt.length / 4);
  const outputTokens = Math.ceil(response.length / 4);
  return {
    model: "heuristic",
    prompt,
    response,
    inputTokens,
    outputTokens,
    costUsd: estimateLlmCostUsd("heuristic", inputTokens, outputTokens),
    latencyMs,
    step,
  };
}

/** Детерминированный LLM-слой без Anthropic — для тестов и локального запуска. */
export class HeuristicSemanticLlm implements SemanticLlm {
  async extractMasks(
    brief: SemanticBriefInput,
    landingText: string,
  ): Promise<{ masks: string[]; usage: LlmUsage }> {
    const started = Date.now();
    const masks = masksFromBrief(brief, landingText);
    const response = JSON.stringify({ masks });
    return {
      masks,
      usage: usage(
        "extract_masks",
        JSON.stringify(brief),
        response,
        Date.now() - started,
      ),
    };
  }

  async classifyIntents(
    phrases: string[],
  ): Promise<{ intents: KeywordIntent[]; usage: LlmUsage }> {
    const started = Date.now();
    const intents = phrases.map(
      (phrase) => intentFromHeuristics(phrase) ?? "warm",
    );
    return {
      intents,
      usage: usage(
        "classify_intent",
        phrases.join("\n"),
        JSON.stringify(intents),
        Date.now() - started,
      ),
    };
  }

  async nameCluster(
    phrases: string[],
  ): Promise<{ name: string; category: ClusterCategory; usage: LlmUsage }> {
    const started = Date.now();
    const name = phrases[0] ?? "Кластер";
    let category: ClusterCategory = "generic";
    const blob = phrases.join(" ");
    if (/\basus\b|\bhp\b|\bapple\b|\bsamsung\b/i.test(blob)) {
      category = "brand";
    } else if (/москв|казах|алмат|питер|гео/i.test(blob)) {
      category = "geo";
    } else if (/игр|rtx|память|экран/i.test(blob)) {
      category = "feature";
    }
    return {
      name,
      category,
      usage: usage(
        "name_cluster",
        phrases.join("\n"),
        JSON.stringify({ name, category }),
        Date.now() - started,
      ),
    };
  }
}

export { extraNegativesFromBrief };
