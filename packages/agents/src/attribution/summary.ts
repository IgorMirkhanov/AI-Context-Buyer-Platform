import { GoalComparison } from "../reporting/types";
import { compareToTarget, round2 } from "../reporting/metrics";

export type AttributionSummary = {
  leads: number;
  ads_conversions: number;
  spend: number;
  attributed_cpl: number | null;
  vs_goal: GoalComparison;
  insights: string[];
};

export function attributedCpl(spend: number, leads: number): number | null {
  if (leads <= 0) return null;
  return round2(spend / leads);
}

export function attributionFacts(
  summary: Omit<AttributionSummary, "insights">,
): string[] {
  const facts = [
    `Лидов из CRM/коллтрекинга ${summary.leads}, конверсий в кабинете ${summary.ads_conversions}, расход ${summary.spend}.`,
    summary.attributed_cpl == null
      ? `Attributed CPL посчитать нельзя, цель CPL ${summary.vs_goal.target_cpl}.`
      : `Attributed CPL ${summary.attributed_cpl}, цель ${summary.vs_goal.target_cpl}, дельта ${summary.vs_goal.delta}.`,
  ];
  return facts;
}

export function buildAttributionSummary(
  spend: number,
  adsConversions: number,
  leads: number,
  targetCpl: number,
): Omit<AttributionSummary, "insights"> {
  const cpl = attributedCpl(spend, leads);
  return {
    leads,
    ads_conversions: adsConversions,
    spend: round2(spend),
    attributed_cpl: cpl,
    vs_goal: compareToTarget(cpl, targetCpl),
  };
}
