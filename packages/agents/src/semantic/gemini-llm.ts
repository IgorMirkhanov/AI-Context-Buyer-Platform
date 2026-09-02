import { openaiCompatibleChat } from "../llm/openai-compatible-client";
import {
  GEMINI_DEFAULT_MODEL,
  GEMINI_OPENAI_BASE_URL,
} from "../llm/gemini-defaults";
import { parseJsonFromGeminiLlm } from "../llm/gemini-json";
import { SemanticLlm } from "./llm";
import { RemoteSemanticLlm } from "./remote-semantic-llm";

export type GeminiSemanticLlmOptions = {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export class GeminiSemanticLlm implements SemanticLlm {
  private readonly delegate: RemoteSemanticLlm;

  constructor(options: GeminiSemanticLlmOptions) {
    const model = options.model ?? GEMINI_DEFAULT_MODEL;
    this.delegate = new RemoteSemanticLlm(
      async ({ system, user, maxTokens }) =>
        openaiCompatibleChat({
          apiKey: options.apiKey,
          baseUrl: GEMINI_OPENAI_BASE_URL,
          model,
          fetchImpl: options.fetchImpl,
          timeoutMs: options.timeoutMs,
          system,
          user,
          maxTokens,
        }),
      parseJsonFromGeminiLlm,
    );
  }

  extractMasks(
    ...args: Parameters<RemoteSemanticLlm["extractMasks"]>
  ): ReturnType<RemoteSemanticLlm["extractMasks"]> {
    return this.delegate.extractMasks(...args);
  }

  classifyIntents(
    ...args: Parameters<RemoteSemanticLlm["classifyIntents"]>
  ): ReturnType<RemoteSemanticLlm["classifyIntents"]> {
    return this.delegate.classifyIntents(...args);
  }

  nameCluster(
    ...args: Parameters<RemoteSemanticLlm["nameCluster"]>
  ): ReturnType<RemoteSemanticLlm["nameCluster"]> {
    return this.delegate.nameCluster(...args);
  }

  suggestNearIntentPhrases(
    ...args: Parameters<RemoteSemanticLlm["suggestNearIntentPhrases"]>
  ): ReturnType<RemoteSemanticLlm["suggestNearIntentPhrases"]> {
    return this.delegate.suggestNearIntentPhrases(...args);
  }

  suggestFromSeedWords(
    ...args: Parameters<RemoteSemanticLlm["suggestFromSeedWords"]>
  ): ReturnType<RemoteSemanticLlm["suggestFromSeedWords"]> {
    return this.delegate.suggestFromSeedWords(...args);
  }

  suggestNegativeWords(
    ...args: Parameters<RemoteSemanticLlm["suggestNegativeWords"]>
  ): ReturnType<RemoteSemanticLlm["suggestNegativeWords"]> {
    return this.delegate.suggestNegativeWords(...args);
  }
}
