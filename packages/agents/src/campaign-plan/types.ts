import type { LlmUsage } from "../semantic/types";

export type CampaignPlanClusterInput = {
  name: string;
  category: string;
  keyword_count: number;
  sample_keywords: string[];
};

export type CampaignPlanBriefInput = {
  project_name: string;
  geo: string[];
  usp: string[];
  target_audience: string[];
};

export type CampaignPlanAdGroup = {
  name: string;
  cluster_names: string[];
};

export type CampaignPlanCampaign = {
  name: string;
  rationale: string;
  ad_groups: CampaignPlanAdGroup[];
};

export type CampaignPlan = {
  campaigns: CampaignPlanCampaign[];
};

export type CampaignPlanWriter = {
  plan(
    brief: CampaignPlanBriefInput,
    clusters: CampaignPlanClusterInput[],
  ): Promise<{ plan: CampaignPlan; usage: LlmUsage }>;
};
