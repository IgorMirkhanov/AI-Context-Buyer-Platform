import { fetchLandingText } from "./fetch-landing";
import type { AnalysisBriefInput, AnalysisResult, AnalysisWriter } from "./types";
import type { LlmUsage } from "../semantic/types";

export type AnalysisPipelineDeps = {
  writer: AnalysisWriter;
  fetchLanding?: (url: string) => Promise<string>;
  onLlmCall?: (usage: LlmUsage) => Promise<void> | void;
};

export async function runAnalysisPipeline(
  brief: AnalysisBriefInput,
  deps: AnalysisPipelineDeps,
): Promise<AnalysisResult> {
  const fetchLanding = deps.fetchLanding ?? fetchLandingText;
  let landingText = "";
  try {
    landingText = await fetchLanding(brief.website_url);
  } catch {
    landingText = "";
  }
  const { explanation, usage } = await deps.writer.explain(brief, landingText);
  await deps.onLlmCall?.(usage);
  return {
    explanation,
    landingText,
    websiteUrl: brief.website_url,
  };
}

export function parseCustomSeeds(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((item) => item.trim().toLowerCase().replace(/\s+/g, " "))
    .filter((item) => item.length >= 2)
    .slice(0, 50);
}

export function mergeSeedMasks(masks: string[], extraSeeds: string[]): string[] {
  const normalized = extraSeeds
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length >= 2);
  return Array.from(new Set([...masks, ...normalized])).slice(0, 30);
}
