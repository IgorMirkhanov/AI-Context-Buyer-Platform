export type DailyMetrics = {
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
};

export type MetricsSummary = {
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  ctr: number;
  cpc: number;
  cpl: number | null;
};

export type GoalComparison = {
  target_cpl: number;
  actual_cpl: number | null;
  delta: number | null;
  status: "better" | "worse" | "on_target" | "no_conversions";
};

export type PerformanceReport = {
  period: { from: string; to: string };
  metrics: MetricsSummary;
  vs_goal: GoalComparison;
  insights: string[];
};

export type InsightWriter = {
  wrap(facts: string[]): { insights: string[]; prompt: string; response: string };
};

export type ChartPoint = DailyMetrics & {
  ctr: number;
  cpc: number;
  cpl: number | null;
};

export type PacingForecast = {
  dailyBudget: number | null;
  currency: string;
  periodDays: number;
  elapsedDays: number;
  daysWithData: number;
  plan: number | null;
  actual: number;
  forecast: number | null;
  paceDaily: number | null;
};

export type AnalyticsSnapshotRow = DailyMetrics & {
  campaignId: string;
  adGroupExternalId?: string;
  adGroupName?: string;
};

export type AnalyticsCampaignMeta = {
  id: string;
  name: string;
  externalCampaignId: string;
  status: string;
  source?: "platform" | "external";
};

export type AnalyticsCampaignSlice = AnalyticsCampaignMeta & {
  metrics: MetricsSummary;
  series: ChartPoint[];
};

export type AnalyticsAdGroupSlice = {
  campaignId: string;
  externalId: string;
  name: string;
  metrics: MetricsSummary;
  series: ChartPoint[];
};

export type AnalyticsView = {
  series: ChartPoint[];
  campaigns: AnalyticsCampaignSlice[];
  adGroups: AnalyticsAdGroupSlice[];
  pacing: PacingForecast;
};

export type Spend7dSummary = {
  amount: number;
  currency: string;
  period: { from: string; to: string };
};
