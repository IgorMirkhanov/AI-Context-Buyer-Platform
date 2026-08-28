import { HeuristicReportingLlm } from "../reporting/llm";
import { assertInsightsKeepFigures } from "../reporting/metrics";
import { InsightWriter } from "../reporting/types";
import {
  AttributionSummary,
  attributionFacts,
  buildAttributionSummary,
} from "./summary";
import { validateAttributionSummary } from "./validate";

export function wrapAttributionSummary(
  spend: number,
  adsConversions: number,
  leads: number,
  targetCpl: number,
  writer: InsightWriter = new HeuristicReportingLlm(),
): AttributionSummary {
  const base = buildAttributionSummary(spend, adsConversions, leads, targetCpl);
  const facts = attributionFacts(base);
  const wrapped = writer.wrap(facts);
  assertInsightsKeepFigures(facts, wrapped.insights);
  const summary: AttributionSummary = {
    ...base,
    insights: wrapped.insights.slice(0, 3),
  };
  validateAttributionSummary(summary);
  return summary;
}
