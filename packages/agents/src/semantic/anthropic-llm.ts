import { anthropicMessages, AnthropicClientOptions } from "../llm/anthropic-client";
import { RemoteSemanticLlm } from "./remote-semantic-llm";
import { SemanticLlm } from "./llm";
import { SEMANTIC_SYSTEM } from "./prompts";

export class AnthropicSemanticLlm implements SemanticLlm {
  private readonly delegate: RemoteSemanticLlm;

  constructor(options: AnthropicClientOptions) {
    this.delegate = new RemoteSemanticLlm(async ({ system, user, maxTokens }) =>
      anthropicMessages({
        ...options,
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

// Re-export for tests that assert prompt wiring
export { SEMANTIC_SYSTEM };
