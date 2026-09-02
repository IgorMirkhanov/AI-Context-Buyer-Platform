export type KeywordIntent = "hot" | "warm" | "navigational";

export type ClusterCategory = "brand" | "feature" | "geo" | "generic";

export type SemanticKeyword = {
  phrase: string;
  intent: KeywordIntent;
  frequency: number;
  source?: string;
};

export type SemanticCluster = {
  cluster_name: string;
  category: ClusterCategory;
  keywords: SemanticKeyword[];
  negative_keywords: string[];
};

export type SemanticCore = {
  clusters: SemanticCluster[];
  global_negatives: string[];
};

export type SuggestedNegativeWord = {
  phrase: string;
  reason: string;
};

export type SemanticPipelineResult = {
  core: SemanticCore;
  suggested_negative_words: SuggestedNegativeWord[];
};

export type SemanticBriefInput = {
  website_url?: string;
  geo: string[];
  usp: string[];
  target_audience: Array<{ segment: string }>;
  global_negative_keywords: string[];
  product_description?: string;
  price_segment?: string;
  forbidden_phrases?: string[];
};

export type LlmUsage = {
  model: string;
  prompt: string;
  response: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  step: string;
};

export type KeywordIdea = {
  phrase: string;
  frequency: number;
  source: string;
};
