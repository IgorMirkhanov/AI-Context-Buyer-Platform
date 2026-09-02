import { parseJsonFromLlm } from "../llm/anthropic-client";
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
import { parseJsonFromGeminiLlm } from "../llm/gemini-json";
import type { LlmUsage } from "../semantic/types";
import { HeuristicCampaignPlanWriter } from "./heuristic-llm";
import { CAMPAIGN_PLAN_SYSTEM, campaignPlanUser } from "./prompts";
import type {
  CampaignPlan,
  CampaignPlanBriefInput,
  CampaignPlanClusterInput,
  CampaignPlanWriter,
} from "./types";
import { validateCampaignPlan } from "./validate";

export type CampaignPlanChatFn = (options: {
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
  result: Awaited<ReturnType<CampaignPlanChatFn>>,
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

export class RemoteCampaignPlanWriter implements CampaignPlanWriter {
  private readonly heuristic = new HeuristicCampaignPlanWriter();

  constructor(
    private readonly chat: CampaignPlanChatFn,
    private readonly parseJson: <T>(text: string) => T | null = parseJsonFromLlm,
  ) {}

  async plan(
    brief: CampaignPlanBriefInput,
    clusters: CampaignPlanClusterInput[],
  ): Promise<{ plan: CampaignPlan; usage: LlmUsage }> {
    const prompt = JSON.stringify({ brief, clusters });
    try {
      const result = await this.chat({
        system: CAMPAIGN_PLAN_SYSTEM,
        user: campaignPlanUser(prompt),
        maxTokens: 2048,
      });
      const parsed = this.parseJson<{ campaigns?: CampaignPlan["campaigns"] }>(
        result.text,
      );
      const plan: CampaignPlan = { campaigns: parsed?.campaigns ?? [] };
      validateCampaignPlan(plan, clusters);
      return {
        plan,
        usage: toUsage("plan_campaigns", prompt, result),
      };
    } catch {
      return this.heuristic.plan(brief, clusters);
    }
  }
}

export function createGeminiCampaignPlanChat(options: {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): CampaignPlanChatFn {
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

export function createGroqCampaignPlanChat(options: {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): CampaignPlanChatFn {
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

export function createAnthropicCampaignPlanChat(options: {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): CampaignPlanChatFn {
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

export function createGeminiCampaignPlanWriter(options: {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): RemoteCampaignPlanWriter {
  return new RemoteCampaignPlanWriter(
    createGeminiCampaignPlanChat(options),
    parseJsonFromGeminiLlm,
  );
}
