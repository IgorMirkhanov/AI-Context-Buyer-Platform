import { parseJsonFromLlm } from "../llm/anthropic-client";
import { OpenAICompatibleMessageResult } from "../llm/openai-compatible-client";
import { intentFromHeuristics } from "./heuristics";
import { HeuristicSemanticLlm, SemanticLlm } from "./llm";
import {
  classifyIntentsUser,
  extractMasksUser,
  nameClusterUser,
  SEMANTIC_SYSTEM,
  suggestNearIntentUser,
  suggestFromSeedWordsUser,
  suggestNegativeWordsUser,
} from "./prompts";
import {
  ClusterCategory,
  KeywordIntent,
  LlmUsage,
  SemanticBriefInput,
} from "./types";

export type SemanticChatFn = (options: {
  system: string;
  user: string;
  maxTokens?: number;
}) => Promise<OpenAICompatibleMessageResult>;

function toUsage(
  step: string,
  prompt: string,
  result: OpenAICompatibleMessageResult,
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

/** Shared SemanticLlm logic for any chat backend (Anthropic, Groq, Gemini, OpenAI). */
export class RemoteSemanticLlm implements SemanticLlm {
  private readonly heuristic = new HeuristicSemanticLlm();

  constructor(
    private readonly chat: SemanticChatFn,
    private readonly parseJson: <T>(text: string) => T | null = parseJsonFromLlm,
  ) {}

  async extractMasks(
    brief: SemanticBriefInput,
    landingText: string,
  ): Promise<{ masks: string[]; usage: LlmUsage }> {
    const prompt = JSON.stringify({ brief, landingText });
    try {
      const result = await this.chat({
        system: SEMANTIC_SYSTEM,
        user: extractMasksUser(prompt),
      });
      const parsed = this.parseJson<{ masks?: string[] }>(result.text);
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
      const result = await this.chat({
        system: SEMANTIC_SYSTEM,
        user: classifyIntentsUser(prompt),
      });
      const parsed = this.parseJson<{ intents?: string[] }>(result.text);
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
      const result = await this.chat({
        system: SEMANTIC_SYSTEM,
        user: nameClusterUser(prompt),
      });
      const parsed = this.parseJson<{
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
      const result = await this.chat({
        system: SEMANTIC_SYSTEM,
        user: suggestNearIntentUser(prompt),
        maxTokens: 1024,
      });
      const parsed = this.parseJson<{ phrases?: string[] }>(result.text);
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

  async suggestFromSeedWords(
    brief: SemanticBriefInput,
    seedWords: string[],
    existingPhrases: string[],
  ): Promise<{ phrases: string[]; usage: LlmUsage }> {
    if (seedWords.length === 0) {
      return this.heuristic.suggestFromSeedWords(
        brief,
        seedWords,
        existingPhrases,
      );
    }
    const prompt = JSON.stringify({
      brief,
      seedWords: seedWords.slice(0, 30),
      existingPhrases: existingPhrases.slice(0, 80),
    });
    try {
      const result = await this.chat({
        system: SEMANTIC_SYSTEM,
        user: suggestFromSeedWordsUser(prompt),
        maxTokens: 1024,
      });
      const parsed = this.parseJson<{ phrases?: string[] }>(result.text);
      const phrases = (parsed?.phrases ?? [])
        .map((item) => item.trim().toLowerCase().replace(/\s+/g, " "))
        .filter((item) => item.length >= 3);
      return {
        phrases: Array.from(new Set(phrases)).slice(0, 15),
        usage: toUsage("suggest_from_seed_words", prompt, result),
      };
    } catch {
      return this.heuristic.suggestFromSeedWords(
        brief,
        seedWords,
        existingPhrases,
      );
    }
  }

  async suggestNegativeWords(
    brief: SemanticBriefInput,
    collectedKeywords: string[],
  ): Promise<{
    negatives: Array<{ phrase: string; reason: string }>;
    usage: LlmUsage;
  }> {
    if (collectedKeywords.length === 0) {
      return this.heuristic.suggestNegativeWords(brief, collectedKeywords);
    }
    const prompt = JSON.stringify({
      brief,
      collectedKeywords: collectedKeywords.slice(0, 120),
      global_negative_keywords: brief.global_negative_keywords,
    });
    try {
      const result = await this.chat({
        system: SEMANTIC_SYSTEM,
        user: suggestNegativeWordsUser(prompt),
        maxTokens: 1024,
      });
      const parsed = this.parseJson<{
        negatives?: Array<{ phrase?: string; reason?: string }>;
      }>(result.text);
      const negatives = (parsed?.negatives ?? [])
        .map((item) => ({
          phrase: (item.phrase ?? "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, " "),
          reason: (item.reason ?? "").trim(),
        }))
        .filter((item) => item.phrase.length >= 2);
      const unique = new Map<string, { phrase: string; reason: string }>();
      for (const item of negatives) {
        if (!unique.has(item.phrase)) {
          unique.set(item.phrase, {
            phrase: item.phrase,
            reason: item.reason || "нецелевой интент в собранной семантике",
          });
        }
      }
      return {
        negatives: [...unique.values()].slice(0, 15),
        usage: toUsage("suggest_negative_words", prompt, result),
      };
    } catch {
      return this.heuristic.suggestNegativeWords(brief, collectedKeywords);
    }
  }
}
