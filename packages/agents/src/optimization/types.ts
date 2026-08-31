import { MetricsSummary } from "../reporting/types";

export type OptimizationRecType =
  | "pause_campaign"
  | "reduce_budget"
  | "add_negative";

export type SearchTermInput = {
  campaignId: string;
  phrase: string;
  clicks: number;
  spend: number;
  conversions: number;
};

export type CampaignPerfInput = {
  campaignId: string;
  externalCampaignId: string;
  budgetDaily: number;
  metrics: MetricsSummary;
};

export type OptimizationEvidence = {
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  ctr: number;
  cpc: number;
  cpl: number | null;
  target_cpl: number;
  phrase?: string;
  current_budget?: number;
  new_budget?: number;
  wasted_clicks?: number;
  wasted_spend?: number;
};

export type OptimizationAction = {
  pause?: boolean;
  budget_daily?: number;
  negative_phrases?: string[];
};

export type OptimizationRecommendation = {
  type: OptimizationRecType;
  campaign_id: string;
  campaign_external_id: string;
  evidence: OptimizationEvidence;
  action: OptimizationAction;
  rationale: string;
};

export type OptimizationPlan = {
  period: { from: string; to: string };
  recommendations: OptimizationRecommendation[];
};

export type OptimizationInput = {
  period: { from: string; to: string };
  targetCpl: number;
  campaigns: CampaignPerfInput[];
  searchTerms: SearchTermInput[];
};

export type OptimizationWriter = {
  wrap(facts: string[]): OptimizationWrapResult | Promise<OptimizationWrapResult>;
};

export type OptimizationWrapResult = {
  insights: string[];
  prompt: string;
  response: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  latencyMs?: number;
};

export const OPTIMIZATION_THRESHOLDS = {
  pauseMinSpend: 500,
  pauseMinClicks: 10,
  cplOverTarget: 1.5,
  budgetCutRatio: 0.8,
  wastedMinClicks: 3,
};
