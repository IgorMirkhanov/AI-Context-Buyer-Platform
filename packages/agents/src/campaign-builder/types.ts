export type CampaignAd = {
  ab_group: string;
  creative_ids: string[];
  headline1: string;
  headline2: string;
  description: string;
  sitelinks: string[];
  callouts: string[];
  href: string;
};

export type CampaignAdGroup = {
  name: string;
  cluster_name: string;
  keywords: string[];
  negative_keywords: string[];
  ads: CampaignAd[];
};

export type PublishCheckpoint = {
  step:
    | "idle"
    | "createCampaign"
    | "setBudget"
    | "createAdGroups"
    | "createAds"
    | "addKeywords"
    | "addNegativeKeywords"
    | "done";
  externalCampaignId?: string;
  adGroups?: Array<{
    name: string;
    externalId?: string;
    adsCreated?: boolean;
    keywordsAdded?: boolean;
    negativesAdded?: boolean;
  }>;
  error?: string;
};

export type CampaignDraftStructure = {
  campaign: {
    name: string;
    type: "search";
    budget_daily: number;
    currency: string;
    bidding_strategy: "manual_cpc";
    geo: string[];
    schedule: { days: string[]; hours: string };
    href: string;
    initial_status: "paused";
  };
  ad_groups: CampaignAdGroup[];
  global_negatives: string[];
  publish?: PublishCheckpoint;
};

export type CampaignBuilderInput = {
  projectName: string;
  websiteUrl: string;
  geo: string[];
  budgetDaily: number;
  currency: string;
  global_negatives: string[];
  clusters: Array<{
    name: string;
    keywords: string[];
    negative_keywords: string[];
    ads: Array<{
      ab_group: string;
      creative_ids: string[];
      headline1: string;
      headline2: string;
      description: string;
      sitelinks: string[];
      callouts: string[];
    }>;
  }>;
};
