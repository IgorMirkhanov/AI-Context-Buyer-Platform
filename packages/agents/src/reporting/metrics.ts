import { DailyMetrics, GoalComparison, MetricsSummary } from "./types";

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function aggregateMetrics(rows: DailyMetrics[]): MetricsSummary {
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
  const spend = rows.reduce((sum, row) => sum + row.spend, 0);
  const conversions = rows.reduce((sum, row) => sum + row.conversions, 0);
  return {
    impressions,
    clicks,
    spend: round2(spend),
    conversions,
    ctr: impressions > 0 ? round2((clicks / impressions) * 100) : 0,
    cpc: clicks > 0 ? round2(spend / clicks) : 0,
    cpl: conversions > 0 ? round2(spend / conversions) : null,
  };
}

export function compareToTarget(
  actualCpl: number | null,
  targetCpl: number,
): GoalComparison {
  if (actualCpl == null) {
    return {
      target_cpl: targetCpl,
      actual_cpl: null,
      delta: null,
      status: "no_conversions",
    };
  }
  const delta = round2(actualCpl - targetCpl);
  let status: GoalComparison["status"] = "on_target";
  if (delta < 0) status = "better";
  if (delta > 0) status = "worse";
  return {
    target_cpl: targetCpl,
    actual_cpl: actualCpl,
    delta,
    status,
  };
}

export function insightFacts(
  metrics: MetricsSummary,
  vsGoal: GoalComparison,
): string[] {
  const facts = [
    `Показы ${metrics.impressions}, клики ${metrics.clicks}, CTR ${metrics.ctr}%, расход ${metrics.spend}.`,
    metrics.cpl == null
      ? `Конверсий 0, CPL посчитать нельзя, цель CPL ${vsGoal.target_cpl}.`
      : `CPL факт ${metrics.cpl}, цель ${vsGoal.target_cpl}, дельта ${vsGoal.delta}.`,
  ];
  if (vsGoal.status === "better") {
    facts.push(
      `Факт CPL ${metrics.cpl} лучше цели ${vsGoal.target_cpl} на ${Math.abs(vsGoal.delta ?? 0)}.`,
    );
  } else if (vsGoal.status === "worse") {
    facts.push(
      `Факт CPL ${metrics.cpl} хуже цели ${vsGoal.target_cpl} на ${vsGoal.delta}.`,
    );
  } else if (vsGoal.status === "on_target") {
    facts.push(`CPL ${metrics.cpl} совпадает с целью ${vsGoal.target_cpl}.`);
  } else {
    facts.push(`Нужны конверсии, чтобы сравнить CPL с целью ${vsGoal.target_cpl}.`);
  }
  return facts.slice(0, 3);
}

export function assertInsightsKeepFigures(
  facts: string[],
  insights: string[],
): void {
  const blob = insights.join(" ");
  for (const fact of facts) {
    const nums = fact.match(/\d+(?:[.,]\d+)?/g) ?? [];
    for (const num of nums) {
      if (!blob.includes(num)) {
        throw new Error(`Reporting LLM dropped computed figure ${num}`);
      }
    }
  }
}
