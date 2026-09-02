import { openaiCompatibleChat } from "../llm/openai-compatible-client";
import {
  GROQ_DEFAULT_MODEL,
  GROQ_OPENAI_BASE_URL,
} from "../llm/groq-defaults";
import { SemanticLlm } from "./llm";
import { RemoteSemanticLlm } from "./remote-semantic-llm";

export type GroqSemanticLlmOptions = {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export class GroqSemanticLlm implements SemanticLlm {
  private readonly delegate: RemoteSemanticLlm;

  constructor(options: GroqSemanticLlmOptions) {
    const model = options.model ?? GROQ_DEFAULT_MODEL;
    this.delegate = new RemoteSemanticLlm(async ({ system, user, maxTokens }) =>
      openaiCompatibleChat({
        apiKey: options.apiKey,
        baseUrl: GROQ_OPENAI_BASE_URL,
        model,
        fetchImpl: options.fetchImpl,
        timeoutMs: options.timeoutMs,
        system,
        user,
        maxTokens,
      }),
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
