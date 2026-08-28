import {
  AdPlatformConnector,
  Credentials,
  KeywordIdea,
  OAuthUrl,
  PerformanceDateRange,
  PerformanceSnapshot,
  PlatformAuth,
  SearchTermSnapshot,
} from "./types";
import {
  KeywordIdeasProvider,
  MockKeywordIdeasProvider,
} from "./keyword-ideas";
import { GoogleAdsApi, LiveGoogleAdsApi } from "./google-ads.api";

export const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_ADS_SCOPE = "https://www.googleapis.com/auth/adwords";

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  developerToken: string;
  loginCustomerId?: string;
  scope?: string;
};

export type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

export interface GoogleOAuthClient {
  exchangeAuthorizationCode(code: string): Promise<GoogleTokenResponse>;
  refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse>;
  listCustomerIds(accessToken: string): Promise<string[]>;
}

export function createGoogleOAuthClient(
  config: GoogleOAuthConfig,
): GoogleOAuthClient {
  return {
    async exchangeAuthorizationCode(code: string): Promise<GoogleTokenResponse> {
      return requestGoogleToken(config, {
        grant_type: "authorization_code",
        code,
        redirect_uri: config.redirectUri,
      });
    },

    async refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
      return requestGoogleToken(config, {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      });
    },

    async listCustomerIds(accessToken: string): Promise<string[]> {
      const res = await fetch(
        "https://googleads.googleapis.com/v18/customers:listAccessibleCustomers",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "developer-token": config.developerToken,
          },
        },
      );
      if (!res.ok) {
        throw new Error("Google Ads customer list failed");
      }
      const data = (await res.json()) as { resourceNames?: string[] };
      return (data.resourceNames ?? [])
        .map((name) => name.replace("customers/", "").replace(/-/g, ""))
        .filter(Boolean);
    },
  };
}

export class GoogleAdsConnector implements AdPlatformConnector {
  constructor(
    private readonly config: GoogleOAuthConfig,
    private readonly oauth: GoogleOAuthClient = createGoogleOAuthClient(config),
    private readonly keywordIdeas: KeywordIdeasProvider = new MockKeywordIdeasProvider(),
    private readonly api: GoogleAdsApi = new LiveGoogleAdsApi(
      config.developerToken,
      config.loginCustomerId,
    ),
  ) {}

  buildAuthorizeUrl(state: string): OAuthUrl {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      state,
      access_type: "offline",
      prompt: "consent",
      scope: this.config.scope ?? GOOGLE_ADS_SCOPE,
    });
    return { url: `${GOOGLE_AUTHORIZE_URL}?${params.toString()}` };
  }

  async authorize(projectId: string): Promise<OAuthUrl> {
    return this.buildAuthorizeUrl(projectId);
  }

  async handleOAuthCallback(
    projectId: string,
    code: string,
  ): Promise<Credentials> {
    if (!projectId) {
      throw new Error("projectId is required");
    }
    const token = await this.oauth.exchangeAuthorizationCode(code);
    if (!token.access_token) {
      throw new Error("Google OAuth did not return an access token");
    }
    const customers = await this.oauth.listCustomerIds(token.access_token);
    const externalAccountId =
      this.config.loginCustomerId?.replace(/-/g, "") || customers[0];
    if (!externalAccountId) {
      throw new Error("Google Ads customer id is missing");
    }
    const expiresIn = token.expires_in ?? 3600;
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      scopes: token.scope ?? this.config.scope ?? GOOGLE_ADS_SCOPE,
      externalAccountId,
    };
  }

  async refreshAccessToken(
    projectId: string,
    refreshToken: string,
  ): Promise<Credentials> {
    this.requireProject(projectId);
    if (!refreshToken) {
      throw new Error("Google refresh token is missing");
    }
    const token = await this.oauth.refreshAccessToken(refreshToken);
    if (!token.access_token) {
      throw new Error("Google OAuth did not return an access token");
    }
    const expiresIn = token.expires_in ?? 3600;
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? refreshToken,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      scopes: token.scope ?? this.config.scope ?? GOOGLE_ADS_SCOPE,
      externalAccountId: "",
    };
  }

  async createCampaign(
    projectId: string,
    campaignDraft: unknown,
    auth?: PlatformAuth,
  ): Promise<string> {
    this.requireProject(projectId);
    const draft = asDraft(campaignDraft);
    const googleAuth = toGoogleAuth(auth, projectId);
    const budget = await this.api.createBudget(
      googleAuth,
      `${draft.campaign.name} budget`,
      Math.round(draft.campaign.budget_daily * 1_000_000),
    );
    const campaignId = await this.api.createCampaign(googleAuth, {
      name: draft.campaign.name.slice(0, 255),
      budgetResource: budget,
      status: "PAUSED",
    });
    await this.api.pauseCampaign(googleAuth, campaignId);
    return campaignId;
  }

  async createAdGroups(
    projectId: string,
    campaignId: string,
    groups: unknown[],
    auth?: PlatformAuth,
  ): Promise<string[]> {
    this.requireProject(projectId);
    const names = groups.map((group) => {
      const name = (group as { name?: string }).name;
      if (!name) throw new Error("ad group name is required");
      return name.slice(0, 255);
    });
    return this.api.createAdGroups(toGoogleAuth(auth, projectId), campaignId, names);
  }

  async createAds(
    projectId: string,
    adGroupId: string,
    creatives: unknown[],
    auth?: PlatformAuth,
  ): Promise<string[]> {
    this.requireProject(projectId);
    const ads = creatives.map(asCreative).map((ad) => ({
      headlines: padHeadlines(ad.headline1, ad.headline2),
      descriptions: padDescriptions(ad.description, ad.headline2),
      finalUrl: ad.href,
    }));
    return this.api.createResponsiveSearchAds(
      toGoogleAuth(auth, projectId),
      adGroupId,
      ads,
    );
  }

  async addKeywords(
    projectId: string,
    adGroupId: string,
    keywords: unknown[],
    auth?: PlatformAuth,
  ): Promise<void> {
    this.requireProject(projectId);
    await this.api.addKeywords(
      toGoogleAuth(auth, projectId),
      adGroupId,
      keywords.map(asKeyword).filter(Boolean),
    );
  }

  async addNegativeKeywords(
    projectId: string,
    scope: unknown,
    negatives: unknown[],
    auth?: PlatformAuth,
  ): Promise<void> {
    this.requireProject(projectId);
    await this.api.addNegativeKeywords(
      toGoogleAuth(auth, projectId),
      asScope(scope),
      negatives.map(asKeyword).filter(Boolean),
    );
  }

  async setBudget(
    projectId: string,
    campaignId: string,
    budget: unknown,
    auth?: PlatformAuth,
  ): Promise<void> {
    this.requireProject(projectId);
    const amount =
      typeof budget === "number"
        ? budget
        : Number((budget as { daily?: number }).daily);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("budget must be a positive number");
    }
    const googleAuth = toGoogleAuth(auth, projectId);
    const resourceName = await this.api.getBudgetResource(
      googleAuth,
      campaignId,
    );
    if (!resourceName) {
      throw new Error("Google Ads campaign budget was not found");
    }
    await this.api.updateBudgetMicros(
      googleAuth,
      resourceName,
      Math.round(amount * 1_000_000),
    );
  }

  async getPerformance(
    projectId: string,
    dateRange: unknown,
    auth?: PlatformAuth,
  ): Promise<PerformanceSnapshot[]> {
    this.requireProject(projectId);
    const range = dateRange as PerformanceDateRange;
    if (!range?.from || !range.to) {
      throw new Error("date range from/to is required");
    }
    const rows = await this.api.searchPerformance(toGoogleAuth(auth, projectId), {
      from: range.from,
      to: range.to,
      campaignIds: range.campaignIds ?? [],
    });
    return rows.map((row) => {
      const ctr =
        row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0;
      const cpc = row.clicks > 0 ? row.spend / row.clicks : 0;
      const cpl = row.conversions > 0 ? row.spend / row.conversions : null;
      return { ...row, ctr, cpc, cpl };
    });
  }

  async getKeywordIdeas(
    seedKeywords: string[],
    geo: string[],
  ): Promise<KeywordIdea[]> {
    return this.keywordIdeas.getKeywordIdeas(seedKeywords, geo);
  }

  async getSearchTerms(
    projectId: string,
    dateRange: unknown,
    auth?: PlatformAuth,
  ): Promise<SearchTermSnapshot[]> {
    this.requireProject(projectId);
    const range = dateRange as PerformanceDateRange;
    if (!range?.from || !range.to) {
      throw new Error("date range from/to is required");
    }
    return this.api.getSearchTerms(toGoogleAuth(auth, projectId), {
      from: range.from,
      to: range.to,
      campaignIds: range.campaignIds ?? [],
    });
  }

  async pauseCampaign(
    projectId: string,
    campaignId: string,
    auth?: PlatformAuth,
  ): Promise<void> {
    return this.ensurePaused(projectId, campaignId, auth);
  }

  async ensurePaused(
    projectId: string,
    campaignId: string,
    auth?: PlatformAuth,
  ): Promise<void> {
    this.requireProject(projectId);
    await this.api.pauseCampaign(toGoogleAuth(auth, projectId), campaignId);
  }

  private requireProject(projectId: string): void {
    if (!projectId) {
      throw new Error("projectId is required");
    }
  }
}

function requestGoogleToken(
  config: GoogleOAuthConfig,
  extra: Record<string, string>,
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    ...extra,
  });
  return fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  }).then(async (res) => {
    if (!res.ok) {
      throw new Error("Google OAuth token request failed");
    }
    return (await res.json()) as GoogleTokenResponse;
  });
}

function toGoogleAuth(
  auth?: PlatformAuth,
  projectId?: string,
): {
  accessToken: string;
  customerId: string;
  projectId?: string;
} {
  if (!auth?.accessToken || !auth.clientLogin) {
    throw new Error("Google Ads access token and customer id are required");
  }
  const scoped = projectId ?? auth.projectId;
  if (!scoped) {
    throw new Error("projectId is required");
  }
  return {
    accessToken: auth.accessToken,
    customerId: auth.clientLogin.replace(/-/g, ""),
    projectId: scoped,
  };
}

function asDraft(value: unknown): {
  campaign: { name: string; budget_daily: number };
} {
  const draft = value as { campaign?: { name?: string; budget_daily?: number } };
  if (!draft.campaign?.name || !draft.campaign.budget_daily) {
    throw new Error("campaign draft is missing name or budget");
  }
  return draft as { campaign: { name: string; budget_daily: number } };
}

function asCreative(value: unknown): {
  headline1: string;
  headline2?: string;
  description: string;
  href: string;
} {
  const ad = value as {
    headline1?: string;
    headline2?: string;
    description?: string;
    href?: string;
  };
  if (!ad.headline1 || !ad.description || !ad.href) {
    throw new Error("ad is missing headline, description or href");
  }
  return ad as {
    headline1: string;
    headline2?: string;
    description: string;
    href: string;
  };
}

function asKeyword(value: unknown): string {
  if (typeof value === "string") return value.trim();
  const phrase = (value as { phrase?: string }).phrase;
  return (phrase ?? "").trim();
}

function asScope(value: unknown): { type: "campaign" | "ad_group"; id: string } {
  if (typeof value === "string") {
    return { type: "ad_group", id: value };
  }
  const scope = value as { type?: string; id?: string; campaignId?: string };
  if (scope.type === "campaign" && (scope.id || scope.campaignId)) {
    return { type: "campaign", id: String(scope.id ?? scope.campaignId) };
  }
  if (scope.id) return { type: "ad_group", id: String(scope.id) };
  throw new Error("negative keyword scope is invalid");
}

function padHeadlines(h1: string, h2?: string): string[] {
  const items = [h1.slice(0, 30), (h2 ?? h1).slice(0, 30), `${h1.slice(0, 22)} купить`.slice(0, 30)];
  const unique = [...new Set(items.filter(Boolean))];
  while (unique.length < 3) unique.push(`${h1.slice(0, 20)} ${unique.length + 1}`.slice(0, 30));
  return unique;
}

function padDescriptions(description: string, extra?: string): string[] {
  const first = description.slice(0, 90);
  const second = (extra || description).slice(0, 90);
  return second === first ? [first, `${first} Official store.`.slice(0, 90)] : [first, second];
}
