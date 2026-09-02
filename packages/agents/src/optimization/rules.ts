import { round2 } from "../reporting/metrics";
import {
  AdGroupPerfInput,
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
  const campaignById = new Map(
    input.campaigns.map((campaign) => [campaign.campaignId, campaign]),
  );
  for (const campaign of input.campaigns) {
    const pause = shouldPause(campaign);
    if (pause) {
      out.push(pauseRec(campaign, input.targetCpl, input));
    } else if (shouldCutBudget(campaign, input.targetCpl)) {
      out.push(cutBudgetRec(campaign, input.targetCpl, input));
    }
    const terms = input.searchTerms.filter(
      (row) =>
        row.campaignId === campaign.campaignId ||
        row.campaignId === campaign.externalCampaignId,
    );
    for (const term of terms) {
      if (isWastedTerm(term)) {
        out.push(negativeRec(campaign, input.targetCpl, term, input));
      }
    }
  }
  for (const group of input.adGroups ?? []) {
    const drop = ctrDropRec(group, input);
    if (!drop) continue;
    const campaign = campaignById.get(group.campaignId);
    if (!campaign) continue;
    if (
      out.some(
        (item) =>
          item.campaign_id === campaign.campaignId &&
          item.type === "reduce_budget",
      )
    ) {
      continue;
    }
    out.push(drop);
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

export function shouldFlagCtrDrop(group: AdGroupPerfInput): boolean {
  if (group.prior.ctr <= 0) {
    return false;
  }
  if (group.current.impressions < T.ctrDropMinImpressions) {
    return false;
  }
  const drop =
    (group.prior.ctr - group.current.ctr) / group.prior.ctr;
  return drop >= T.ctrDropRelative;
}

function periodLabel(input: OptimizationInput): {
  from: string;
  to: string;
  priorFrom?: string;
  priorTo?: string;
} {
  return {
    from: input.period.from,
    to: input.period.to,
    priorFrom: input.priorPeriod?.from,
    priorTo: input.priorPeriod?.to,
  };
}

function evidenceOf(
  campaign: CampaignPerfInput,
  targetCpl: number,
  input: OptimizationInput,
  extra: Partial<OptimizationRecommendation["evidence"]> = {},
) {
  const periods = periodLabel(input);
  return {
    impressions: campaign.metrics.impressions,
    clicks: campaign.metrics.clicks,
    spend: campaign.metrics.spend,
    conversions: campaign.metrics.conversions,
    ctr: campaign.metrics.ctr,
    cpc: campaign.metrics.cpc,
    cpl: campaign.metrics.cpl,
    target_cpl: targetCpl,
    period_from: periods.from,
    period_to: periods.to,
    prior_period_from: periods.priorFrom,
    prior_period_to: periods.priorTo,
    ...extra,
  };
}

function pauseRec(
  campaign: CampaignPerfInput,
  targetCpl: number,
  input: OptimizationInput,
) {
  const evidence = evidenceOf(campaign, targetCpl, input);
  return {
    type: "pause_campaign" as const,
    campaign_id: campaign.campaignId,
    campaign_external_id: campaign.externalCampaignId,
    evidence,
    action: { pause: true },
    fact: `За ${evidence.period_from}–${evidence.period_to}: клики ${evidence.clicks}, расход ${evidence.spend}, конверсий ${evidence.conversions} (CTR ${evidence.ctr}%) → рекомендую отключить кампанию.`,
  };
}

function cutBudgetRec(
  campaign: CampaignPerfInput,
  targetCpl: number,
  input: OptimizationInput,
) {
  const current = campaign.budgetDaily;
  const next = round2(current * T.budgetCutRatio);
  const evidence = evidenceOf(campaign, targetCpl, input, {
    current_budget: current,
    new_budget: next,
  });
  return {
    type: "reduce_budget" as const,
    campaign_id: campaign.campaignId,
    campaign_external_id: campaign.externalCampaignId,
    evidence,
    action: { budget_daily: next },
    fact: `За ${evidence.period_from}–${evidence.period_to}: CPL факт ${evidence.cpl} при цели ${evidence.target_cpl}, расход ${evidence.spend} → рекомендую снизить дневной бюджет с ${current} до ${next}.`,
  };
}

function ctrDropRec(
  group: AdGroupPerfInput,
  input: OptimizationInput,
): (Omit<OptimizationRecommendation, "rationale"> & { fact: string }) | null {
  if (!shouldFlagCtrDrop(group)) {
    return null;
  }
  const campaign = input.campaigns.find(
    (item) => item.campaignId === group.campaignId,
  );
  if (!campaign) {
    return null;
  }
  const current = campaign.budgetDaily;
  const next = round2(current * T.budgetCutRatio);
  const deltaPct = round2(
    ((group.prior.ctr - group.current.ctr) / group.prior.ctr) * 100,
  );
  const periods = periodLabel(input);
  const evidence = evidenceOf(campaign, input.targetCpl, input, {
    ad_group_name: group.adGroupName,
    ad_group_external_id: group.adGroupExternalId,
    ctr_prior: group.prior.ctr,
    ctr_current: group.current.ctr,
    ctr_delta_pct: deltaPct,
    current_budget: current,
    new_budget: next,
  });
  return {
    type: "reduce_budget" as const,
    campaign_id: campaign.campaignId,
    campaign_external_id: campaign.externalCampaignId,
    evidence,
    action: { budget_daily: next },
    fact: `Группа «${group.adGroupName}»: CTR упал с ${group.prior.ctr}% до ${group.current.ctr}% (−${deltaPct}%) за ${periods.from}–${periods.to} vs ${periods.priorFrom}–${periods.priorTo} → рекомендую снизить дневной бюджет кампании с ${current} до ${next}.`,
  };
}

function negativeRec(
  campaign: CampaignPerfInput,
  targetCpl: number,
  term: SearchTermInput,
  input: OptimizationInput,
) {
  const phrase = term.phrase.trim();
  const evidence = evidenceOf(campaign, targetCpl, input, {
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
    fact: `За ${evidence.period_from}–${evidence.period_to} запрос «${phrase}»: клики ${term.clicks}, расход ${term.spend}, конверсий ${term.conversions} → рекомендую добавить минус-слово.`,
  };
}
