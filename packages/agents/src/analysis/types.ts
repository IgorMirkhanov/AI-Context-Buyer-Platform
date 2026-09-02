import type { LlmUsage } from "../semantic/types";

export type AnalysisBriefInput = {
  website_url: string;
  geo: string[];
  usp: string[];
  target_audience: Array<{
    segment: string;
    pains?: string[];
    objections?: string[];
  }>;
  global_negative_keywords: string[];
  product_description?: string;
  price_segment?: string;
};

export type AnalysisWriter = {
  explain(
    brief: AnalysisBriefInput,
    landingText: string,
  ): Promise<{ explanation: string; usage: LlmUsage }>;
};

export type AnalysisResult = {
  explanation: string;
  landingText: string;
  websiteUrl: string;
};
