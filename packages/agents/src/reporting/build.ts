import {
  aggregateMetrics,
  assertInsightsKeepFigures,
  compareToTarget,
  insightFacts,
} from "./metrics";
import { HeuristicReportingLlm } from "./llm";
import {
  DailyMetrics,
  InsightWriter,
  PerformanceReport,
} from "./types";
import { validatePerformanceReport } from "./validate";

export function buildPerformanceReport(
  rows: DailyMetrics[],
  targetCpl: number,
  period: { from: string; to: string },
  writer: InsightWriter = new HeuristicReportingLlm(),
): PerformanceReport {
  const metrics = aggregateMetrics(rows);
  const vsGoal = compareToTarget(metrics.cpl, targetCpl);
  const facts = insightFacts(metrics, vsGoal);
  const wrapped = writer.wrap(facts);
  assertInsightsKeepFigures(facts, wrapped.insights);
  const report: PerformanceReport = {
    period,
    metrics,
    vs_goal: vsGoal,
    insights: wrapped.insights.slice(0, 3),
  };
  validatePerformanceReport(report);
  return report;
}
