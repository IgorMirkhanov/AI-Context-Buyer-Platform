import { round2 } from "../reporting/metrics";
import {
  CampaignPerfInput,
  OPTIMIZATION_THRESHOLDS as T,
  OptimizationRecommendation,
  OptimizationInput,
  SearchTermInput,
} from "./types";

export function proposeRecommendations(
  input: OptimizationInput,
): Array<Omit<OptimizationRecommendation, "rationale"> & { fact: string }> {
  const out: Array<
    Omit<OptimizationRecommendation, "rationale"> & { fact: string }
  > = [];
  for (const campaign of input.campaigns) {
    const pause = shouldPause(campaign);
    if (pause) {
      out.push(pauseRec(campaign, input.targetCpl));
    } else if (shouldCutBudget(campaign, input.targetCpl)) {
      out.push(cutBudgetRec(campaign, input.targetCpl));
    }
    const terms = input.searchTerms.filter(
      (row) =>
        row.campaignId === campaign.campaignId ||
        row.campaignId === campaign.externalCampaignId,
    );
    for (const term of terms) {
      if (isWastedTerm(term)) {
        out.push(negativeRec(campaign, input.targetCpl, term));
      }
    }
  }
  return out;
}

export function shouldPause(campaign: CampaignPerfInput): boolean {
  return (
    campaign.metrics.conversions === 0 &&
    campaign.metrics.spend >= T.pauseMinSpend &&
    campaign.metrics.clicks >= T.pauseMinClicks
  );
}

export function shouldCutBudget(
  campaign: CampaignPerfInput,
  targetCpl: number,
): boolean {
  if (targetCpl <= 0) return false;
  const cpl = campaign.metrics.cpl;
  return cpl != null && cpl > round2(targetCpl * T.cplOverTarget);
}

export function isWastedTerm(term: SearchTermInput): boolean {
  return (
    term.conversions === 0 &&
    term.clicks >= T.wastedMinClicks &&
    term.spend > 0 &&
    term.phrase.trim().length > 0
  );
}

function evidenceOf(
  campaign: CampaignPerfInput,
  targetCpl: number,
  extra: Partial<OptimizationRecommendation["evidence"]> = {},
) {
  return {
    impressions: campaign.metrics.impressions,
    clicks: campaign.metrics.clicks,
    spend: campaign.metrics.spend,
    conversions: campaign.metrics.conversions,
    ctr: campaign.metrics.ctr,
    cpc: campaign.metrics.cpc,
    cpl: campaign.metrics.cpl,
    target_cpl: targetCpl,
    ...extra,
  };
}

function pauseRec(campaign: CampaignPerfInput, targetCpl: number) {
  const evidence = evidenceOf(campaign, targetCpl);
  return {
    type: "pause_campaign" as const,
    campaign_id: campaign.campaignId,
    campaign_external_id: campaign.externalCampaignId,
    evidence,
    action: { pause: true },
    fact: `Клики ${evidence.clicks}, расход ${evidence.spend}, конверсий ${evidence.conversions} (CTR ${evidence.ctr}%) → рекомендую отключить кампанию.`,
  };
}

function cutBudgetRec(campaign: CampaignPerfInput, targetCpl: number) {
  const current = campaign.budgetDaily;
  const next = round2(current * T.budgetCutRatio);
  const evidence = evidenceOf(campaign, targetCpl, {
    current_budget: current,
    new_budget: next,
  });
  return {
    type: "reduce_budget" as const,
    campaign_id: campaign.campaignId,
    campaign_external_id: campaign.externalCampaignId,
    evidence,
    action: { budget_daily: next },
    fact: `CPL факт ${evidence.cpl} при цели ${evidence.target_cpl}, расход ${evidence.spend} → рекомендую снизить дневной бюджет с ${current} до ${next}.`,
  };
}

function negativeRec(
  campaign: CampaignPerfInput,
  targetCpl: number,
  term: SearchTermInput,
) {
  const phrase = term.phrase.trim();
  const evidence = evidenceOf(campaign, targetCpl, {
    phrase,
    wasted_clicks: term.clicks,
    wasted_spend: term.spend,
  });
  return {
    type: "add_negative" as const,
    campaign_id: campaign.campaignId,
    campaign_external_id: campaign.externalCampaignId,
    evidence,
    action: { negative_phrases: [phrase] },
    fact: `Запрос «${phrase}»: клики ${term.clicks}, расход ${term.spend}, конверсий ${term.conversions} → рекомендую добавить минус-слово.`,
  };
}
