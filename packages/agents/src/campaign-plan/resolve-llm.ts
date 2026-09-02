import type { AiProviderName } from "../llm/credentials";
import {
  AgentLlmMode,
  pickAgentLlmProvider,
} from "../llm/resolve-agent-llm";
import { HeuristicCampaignPlanWriter } from "./heuristic-llm";
import {
  createAnthropicCampaignPlanChat,
  createGeminiCampaignPlanWriter,
  createGroqCampaignPlanChat,
  RemoteCampaignPlanWriter,
} from "./remote-llm";
import type { CampaignPlanWriter } from "./types";

export type CampaignPlanLlmMode = AgentLlmMode;

export const CAMPAIGN_PLAN_HEURISTIC_FALLBACK_MESSAGE =
  "Campaign Plan: ИИ-провайдер не настроен — используется эвристический план по категориям кластеров.";

export const CAMPAIGN_PLAN_UNSUPPORTED_PROVIDER_MESSAGE = (provider: string) =>
  `Campaign Plan: провайдер «${provider}» не поддерживается — heuristic fallback.`;

export type ResolveCampaignPlanLlmOptions = {
  apiKey?: string | null;
  provider?: AiProviderName | null;
  model?: string;
  fetchImpl?: typeof fetch;
  onFallback?: (message: string) => void;
};

export type ResolveCampaignPlanLlmResult = {
  writer: CampaignPlanWriter;
  mode: CampaignPlanLlmMode;
};

export function resolveCampaignPlanLlm(
  options: ResolveCampaignPlanLlmOptions,
): ResolveCampaignPlanLlmResult {
  const picked = pickAgentLlmProvider({
    apiKey: options.apiKey,
    provider: options.provider,
    onFallback: options.onFallback,
    unsupportedProviderMessage: CAMPAIGN_PLAN_UNSUPPORTED_PROVIDER_MESSAGE,
  });
  if (picked?.provider === "gemini") {
    return {
      writer: createGeminiCampaignPlanWriter({
        apiKey: picked.apiKey,
        model: options.model,
        fetchImpl: options.fetchImpl,
      }),
      mode: "gemini",
    };
  }
  if (picked?.provider === "groq") {
    return {
      writer: new RemoteCampaignPlanWriter(
        createGroqCampaignPlanChat({
          apiKey: picked.apiKey,
          model: options.model,
          fetchImpl: options.fetchImpl,
        }),
      ),
      mode: "groq",
    };
  }
  if (picked?.provider === "anthropic") {
    return {
      writer: new RemoteCampaignPlanWriter(
        createAnthropicCampaignPlanChat({
          apiKey: picked.apiKey,
          model: options.model,
          fetchImpl: options.fetchImpl,
        }),
      ),
      mode: "anthropic",
    };
  }
  options.onFallback?.(CAMPAIGN_PLAN_HEURISTIC_FALLBACK_MESSAGE);
  return {
    writer: new HeuristicCampaignPlanWriter(),
    mode: "heuristic",
  };
}
