import { openaiCompatibleChat } from "../llm/openai-compatible-client";
import { anthropicMessages } from "../llm/anthropic-client";
import {
  GEMINI_DEFAULT_MODEL,
  GEMINI_OPENAI_BASE_URL,
} from "../llm/gemini-defaults";
import {
  GROQ_DEFAULT_MODEL,
  GROQ_OPENAI_BASE_URL,
} from "../llm/groq-defaults";
import type { LlmUsage } from "../semantic/types";
import { HeuristicAnalysisWriter } from "./heuristic-llm";
import { ANALYSIS_SYSTEM, analysisUserPrompt } from "./prompts";
import type { AnalysisBriefInput, AnalysisWriter } from "./types";

export type AnalysisChatFn = (options: {
  system: string;
  user: string;
  maxTokens?: number;
}) => Promise<{
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
}>;

function toUsage(
  step: string,
  prompt: string,
  result: Awaited<ReturnType<AnalysisChatFn>>,
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

export class RemoteAnalysisWriter implements AnalysisWriter {
  private readonly heuristic = new HeuristicAnalysisWriter();

  constructor(private readonly chat: AnalysisChatFn) {}

  async explain(
    brief: AnalysisBriefInput,
    landingText: string,
  ): Promise<{ explanation: string; usage: LlmUsage }> {
    const user = analysisUserPrompt(brief, landingText);
    try {
      const result = await this.chat({
        system: ANALYSIS_SYSTEM,
        user,
        maxTokens: 2048,
      });
      const explanation = result.text.trim();
      if (!explanation) {
        return this.heuristic.explain(brief, landingText);
      }
      return {
        explanation,
        usage: toUsage("explain", user, result),
      };
    } catch {
      return this.heuristic.explain(brief, landingText);
    }
  }
}

export function createGeminiAnalysisChat(options: {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): AnalysisChatFn {
  const model = options.model ?? GEMINI_DEFAULT_MODEL;
  return async ({ system, user, maxTokens }) =>
    openaiCompatibleChat({
      apiKey: options.apiKey,
      baseUrl: GEMINI_OPENAI_BASE_URL,
      model,
      fetchImpl: options.fetchImpl,
      system,
      user,
      maxTokens,
    });
}

export function createGroqAnalysisChat(options: {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): AnalysisChatFn {
  const model = options.model ?? GROQ_DEFAULT_MODEL;
  return async ({ system, user, maxTokens }) =>
    openaiCompatibleChat({
      apiKey: options.apiKey,
      baseUrl: GROQ_OPENAI_BASE_URL,
      model,
      fetchImpl: options.fetchImpl,
      system,
      user,
      maxTokens,
    });
}

export function createAnthropicAnalysisChat(options: {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): AnalysisChatFn {
  return async ({ system, user, maxTokens }) =>
    anthropicMessages({
      apiKey: options.apiKey,
      model: options.model,
      fetchImpl: options.fetchImpl,
      system,
      user,
      maxTokens,
    });
}
