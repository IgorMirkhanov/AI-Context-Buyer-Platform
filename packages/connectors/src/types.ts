export type OAuthUrl = { url: string };

export type KeywordIdea = {
  phrase: string;
  frequency: number;
  source: string;
};

export type Credentials = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  scopes: string;
  externalAccountId: string;
};

export type PlatformAuth = {
  accessToken: string;
  clientLogin?: string;
  projectId?: string;
};

export type PerformanceDateRange = {
  from: string;
  to: string;
  campaignIds?: string[];
};

export type PerformanceSnapshot = {
  date: string;
  externalCampaignId: string;
  adGroupExternalId?: string;
  adGroupName?: string;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  conversions: number;
  cpl: number | null;
  spend: number;
};

export class NotImplementedError extends Error {
  constructor(method: string) {
    super(`${method} is not implemented yet`);
    this.name = "NotImplementedError";
  }
}

export class PlatformApiError extends Error {
  constructor(
    message: string,
    public readonly step: string,
    public readonly details: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "PlatformApiError";
  }
}

export function isPlatformRateLimitError(err: unknown): boolean {
  const text =
    err instanceof PlatformApiError
      ? `${err.message} ${err.details}`
      : err instanceof Error
        ? err.message
        : String(err);
  return /\b429\b|rate[- ]?limit|too many requests|лимит запросов/i.test(text);
}

export type SearchTermSnapshot = {
  campaignId: string;
  phrase: string;
  clicks: number;
  spend: number;
  conversions: number;
};

export type AccountCampaignStatus = "active" | "paused" | "archived";

export type AccountCampaignSummary = {
  externalCampaignId: string;
  name: string;
  status: AccountCampaignStatus;
  dailyBudget?: number | null;
};

export type ConnectionVerificationResult =
  | { ok: true }
  | { ok: false; reason: string };

const CONNECTION_VERIFY_PATTERNS = [
  /invalid oauth token/i,
  /oauth token is missing/i,
  /insufficient/i,
  /permission/i,
  /unauthorized/i,
  /\b401\b/,
  /\b403\b/,
  /access denied/i,
  /authentication/i,
  /недостаточно прав/i,
  /нет прав/i,
  /not connected/i,
];

export function connectionVerificationMessage(err: unknown): string {
  if (err instanceof PlatformApiError) {
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return "Проверка подключения к рекламному кабинету не удалась";
}

export function isConnectionVerificationError(err: unknown): boolean {
  if (err instanceof PlatformApiError) {
    const text = `${err.message} ${err.details}`;
    if (CONNECTION_VERIFY_PATTERNS.some((pattern) => pattern.test(text))) {
      return true;
    }
    return !err.retryable;
  }
  if (err instanceof Error) {
    return CONNECTION_VERIFY_PATTERNS.some((pattern) =>
      pattern.test(err.message),
    );
  }
  return false;
}

export interface AdPlatformConnector {
  authorize(projectId: string): Promise<OAuthUrl>;
  handleOAuthCallback(projectId: string, code: string): Promise<Credentials>;
  createCampaign(
    projectId: string,
    campaignDraft: unknown,
    auth?: PlatformAuth,
  ): Promise<string>;
  createAdGroups(
    projectId: string,
    campaignId: string,
    groups: unknown[],
    auth?: PlatformAuth,
  ): Promise<string[]>;
  createAds(
    projectId: string,
    adGroupId: string,
    creatives: unknown[],
    auth?: PlatformAuth,
  ): Promise<string[]>;
  addKeywords(
    projectId: string,
    adGroupId: string,
    keywords: unknown[],
    auth?: PlatformAuth,
  ): Promise<void>;
  addNegativeKeywords(
    projectId: string,
    scope: unknown,
    negatives: unknown[],
    auth?: PlatformAuth,
  ): Promise<void>;
  setBudget(
    projectId: string,
    campaignId: string,
    budget: unknown,
    auth?: PlatformAuth,
  ): Promise<void>;
  getPerformance(
    projectId: string,
    dateRange: unknown,
    auth?: PlatformAuth,
  ): Promise<PerformanceSnapshot[]>;
  getKeywordIdeas(seedKeywords: string[], geo: string[]): Promise<KeywordIdea[]>;
  getSearchTerms(
    projectId: string,
    dateRange: unknown,
    auth?: PlatformAuth,
  ): Promise<SearchTermSnapshot[]>;
  pauseCampaign(
    projectId: string,
    campaignId: string,
    auth?: PlatformAuth,
  ): Promise<void>;
  fetchAllAccountCampaigns(
    projectId: string,
    auth?: PlatformAuth,
  ): Promise<AccountCampaignSummary[]>;
  refreshAccessToken(
    projectId: string,
    refreshToken: string,
  ): Promise<Credentials>;
  verifyConnection(
    projectId: string,
    auth?: PlatformAuth,
  ): Promise<ConnectionVerificationResult>;
}

export function assertStageNotReached(method: string): never {
  throw new NotImplementedError(method);
}
