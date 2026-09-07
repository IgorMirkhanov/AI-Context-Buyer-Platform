import {
  AdPlatformConnector,
  AccountCampaignSummary,
  connectionVerificationMessage,
  Credentials,
  ConnectionVerificationResult,
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
import { LiveYandexDirectApi, YandexDirectApi } from "./yandex-direct.api";
import { toYandexMoney, yandexRegionIds } from "./yandex-geo";

export const YANDEX_AUTHORIZE_URL = "https://oauth.yandex.ru/authorize";
export const YANDEX_TOKEN_URL = "https://oauth.yandex.ru/token";
export const YANDEX_LOGIN_INFO_URL = "https://login.yandex.ru/info?format=json";
export const YANDEX_DEFAULT_OAUTH_SCOPE = "direct:api";

export type YandexOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope?: string;
  mock?: boolean;
};

export type YandexTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
};

export interface YandexOAuthClient {
  exchangeAuthorizationCode(code: string): Promise<YandexTokenResponse>;
  refreshAccessToken(refreshToken: string): Promise<YandexTokenResponse>;
  getAccountLogin(accessToken: string): Promise<string>;
}

export function createMockYandexOAuthClient(): YandexOAuthClient {
  return {
    async exchangeAuthorizationCode(): Promise<YandexTokenResponse> {
      return {
        access_token: "mock-yandex-access",
        refresh_token: "mock-yandex-refresh",
        expires_in: 3600,
        scope: "direct:api",
      };
    },
    async refreshAccessToken(): Promise<YandexTokenResponse> {
      return {
        access_token: "mock-yandex-access-rotated",
        refresh_token: "mock-yandex-refresh",
        expires_in: 3600,
        scope: "direct:api",
      };
    },
    async getAccountLogin(): Promise<string> {
      return "mock-direct-login";
    },
  };
}

export function createYandexOAuthClient(
  config: YandexOAuthConfig,
): YandexOAuthClient {
  return {
    async exchangeAuthorizationCode(code: string): Promise<YandexTokenResponse> {
      return requestYandexToken(config, {
        grant_type: "authorization_code",
        code,
      });
    },

    async refreshAccessToken(refreshToken: string): Promise<YandexTokenResponse> {
      return requestYandexToken(config, {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      });
    },

    async getAccountLogin(accessToken: string): Promise<string> {
      const res = await fetch(YANDEX_LOGIN_INFO_URL, {
        headers: { Authorization: `OAuth ${accessToken}` },
      });
      if (!res.ok) {
        throw new Error("Yandex account info request failed");
      }
      const data = (await res.json()) as { login?: string; id?: string };
      const login = data.login ?? data.id;
      if (!login) {
        throw new Error("Yandex account login is missing");
      }
      return login;
    },
  };
}

export class YandexDirectConnector implements AdPlatformConnector {
  constructor(
    private readonly config: YandexOAuthConfig,
    private readonly oauth: YandexOAuthClient = createYandexOAuthClient(config),
    private readonly keywordIdeas: KeywordIdeasProvider = new MockKeywordIdeasProvider(),
    private readonly api: YandexDirectApi = new LiveYandexDirectApi(),
  ) {}

  buildAuthorizeUrl(state: string): OAuthUrl {
    if (this.config.mock) {
      const url = new URL(this.config.redirectUri);
      url.searchParams.set("code", "mock-yandex");
      url.searchParams.set("state", state);
      return { url: url.toString() };
    }
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      state,
      force_confirm: "yes",
      scope: resolveConfiguredYandexScope(this.config),
    });
    return { url: `${YANDEX_AUTHORIZE_URL}?${params.toString()}` };
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
      throw new Error("Yandex OAuth did not return an access token");
    }
    const externalAccountId = await this.oauth.getAccountLogin(
      token.access_token,
    );
    const expiresIn = token.expires_in ?? 60 * 60 * 24 * 365;
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      scopes: resolveYandexOAuthScopes(token, this.config),
      externalAccountId,
    };
  }

  async refreshAccessToken(
    projectId: string,
    refreshToken: string,
  ): Promise<Credentials> {
    this.requireProject(projectId);
    if (!refreshToken) {
      throw new Error("Yandex refresh token is missing");
    }
    const token = await this.oauth.refreshAccessToken(refreshToken);
    if (!token.access_token) {
      throw new Error("Yandex OAuth did not return an access token");
    }
    const expiresIn = token.expires_in ?? 60 * 60 * 24 * 365;
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? refreshToken,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      scopes: resolveYandexOAuthScopes(token, this.config),
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
    const ids = await this.api.addCampaigns(requireAuth(auth, projectId), [
      {
        Name: draft.campaign.name.slice(0, 255),
        StartDate: todayUtc(),
        DailyBudget: {
          Amount: toYandexMoney(draft.campaign.budget_daily),
          Mode: "STANDARD",
        },
        TextCampaign: {
          BiddingStrategy: {
            Search: { BiddingStrategyType: "HIGHEST_POSITION" },
            Network: { BiddingStrategyType: "SERVING_OFF" },
          },
        },
      },
    ]);
    const campaignId = ids[0];
    await this.api.suspendCampaigns(requireAuth(auth, projectId), [campaignId]);
    return String(campaignId);
  }

  async createAdGroups(
    projectId: string,
    campaignId: string,
    groups: unknown[],
    auth?: PlatformAuth,
  ): Promise<string[]> {
    this.requireProject(projectId);
    const regionIds = yandexRegionIds(geoFromGroups(groups));
    const payload = groups.map((group) => {
      const item = asAdGroup(group);
      return {
        Name: item.name.slice(0, 255),
        CampaignId: Number(campaignId),
        RegionIds: item.regionIds ?? regionIds,
      };
    });
    const ids = await this.api.addAdGroups(requireAuth(auth, projectId), payload);
    return ids.map(String);
  }

  async createAds(
    projectId: string,
    adGroupId: string,
    creatives: unknown[],
    auth?: PlatformAuth,
  ): Promise<string[]> {
    this.requireProject(projectId);
    const ads = creatives.map(asCreative);
    const token = requireAuth(auth, projectId);
    const href = ads[0]?.href ?? "https://example.com";
    let sitelinkSetIds: number[] = [];
    let calloutIds: number[] = [];
    try {
      const sets = ads
        .map((ad) =>
          (ad.sitelinks ?? [])
            .slice(0, 8)
            .map((Title) => ({ Title: Title.slice(0, 30), Href: href })),
        )
        .filter((set) => set.length > 0);
      if (sets.length > 0) {
        sitelinkSetIds = await this.api.addSitelinkSets(token, sets);
      }
    } catch {
      sitelinkSetIds = [];
    }
    try {
      const texts = [...new Set(ads.flatMap((ad) => ad.callouts ?? []))]
        .map((text) => (text ?? "").slice(0, 25))
        .filter(Boolean)
        .slice(0, 8);
      if (texts.length > 0) {
        calloutIds = await this.api.addCallouts(token, texts);
      }
    } catch {
      calloutIds = [];
    }
    const payload = ads.map((ad, index) => ({
      AdGroupId: Number(adGroupId),
      TextAd: {
        Title: ad.headline1.slice(0, 56),
        Title2: (ad.headline2 ?? "").slice(0, 30) || undefined,
        Text: ad.description.slice(0, 81),
        Href: ad.href,
        Mobile: "NO",
        ...(sitelinkSetIds[index]
          ? { SitelinkSetId: sitelinkSetIds[index] }
          : {}),
        ...(calloutIds.length > 0
          ? {
              CalloutSetting: {
                AdExtensions: calloutIds.map((AdExtensionId) => ({
                  AdExtensionId,
                })),
              },
            }
          : {}),
      },
    }));
    const ids = await this.api.addAds(token, payload);
    return ids.map(String);
  }

  async addKeywords(
    projectId: string,
    adGroupId: string,
    keywords: unknown[],
    auth?: PlatformAuth,
  ): Promise<void> {
    this.requireProject(projectId);
    const phrases = keywords.map(asKeyword).filter(Boolean);
    if (phrases.length === 0) return;
    await this.api.addKeywords(
      requireAuth(auth, projectId),
      phrases.map((Keyword) => ({
        AdGroupId: Number(adGroupId),
        Keyword,
      })),
    );
  }

  async addNegativeKeywords(
    projectId: string,
    scope: unknown,
    negatives: unknown[],
    auth?: PlatformAuth,
  ): Promise<void> {
    this.requireProject(projectId);
    const phrases = negatives.map(asKeyword).filter(Boolean);
    const target = asScope(scope);
    if (target.type === "campaign") {
      await this.api.updateCampaignNegatives(
        requireAuth(auth, projectId),
        Number(target.id),
        phrases,
      );
      return;
    }
    await this.api.updateAdGroupNegatives(
      requireAuth(auth, projectId),
      Number(target.id),
      phrases,
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
    await this.api.updateDailyBudget(
      requireAuth(auth, projectId),
      Number(campaignId),
      toYandexMoney(amount),
    );
  }

  async getPerformance(
    projectId: string,
    dateRange: unknown,
    auth?: PlatformAuth,
  ): Promise<PerformanceSnapshot[]> {
    this.requireProject(projectId);
    const range = asDateRange(dateRange);
    const rows = await this.api.getCampaignPerformance(
      requireAuth(auth, projectId),
      range,
    );
    return rows.map((row) => {
      const ctr =
        row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0;
      const cpc = row.clicks > 0 ? row.spend / row.clicks : 0;
      const cpl = row.conversions > 0 ? row.spend / row.conversions : null;
      return {
        date: row.date,
        externalCampaignId: row.externalCampaignId,
        adGroupExternalId: row.adGroupExternalId,
        adGroupName: row.adGroupName,
        impressions: row.impressions,
        clicks: row.clicks,
        spend: row.spend,
        conversions: row.conversions,
        ctr,
        cpc,
        cpl,
      };
    });
  }

  async ensurePaused(
    projectId: string,
    campaignId: string,
    auth?: PlatformAuth,
  ): Promise<void> {
    this.requireProject(projectId);
    await this.api.suspendCampaigns(requireAuth(auth, projectId), [Number(campaignId)]);
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
    const range = asDateRange(dateRange);
    return this.api.getSearchTerms(requireAuth(auth, projectId), range);
  }

  async pauseCampaign(
    projectId: string,
    campaignId: string,
    auth?: PlatformAuth,
  ): Promise<void> {
    return this.ensurePaused(projectId, campaignId, auth);
  }

  async fetchAllAccountCampaigns(
    projectId: string,
    auth?: PlatformAuth,
  ): Promise<AccountCampaignSummary[]> {
    this.requireProject(projectId);
    return this.api.getAccountCampaigns(requireAuth(auth, projectId));
  }

  async verifyConnection(
    projectId: string,
    auth?: PlatformAuth,
  ): Promise<ConnectionVerificationResult> {
    this.requireProject(projectId);
    try {
      await this.api.probeConnection(requireAuth(auth, projectId));
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: connectionVerificationMessage(err) };
    }
  }

  private requireProject(projectId: string): void {
    if (!projectId) {
      throw new Error("projectId is required");
    }
  }
}

type DraftLike = {
  campaign: {
    name: string;
    budget_daily: number;
    geo?: string[];
    href?: string;
  };
};

type AdGroupLike = {
  name: string;
  geo?: string[];
  regionIds?: number[];
};

type CreativeLike = {
  headline1: string;
  headline2?: string;
  description: string;
  href: string;
  sitelinks?: string[];
  callouts?: string[];
};

function resolveConfiguredYandexScope(config: YandexOAuthConfig): string {
  return config.scope?.trim() || YANDEX_DEFAULT_OAUTH_SCOPE;
}

function resolveYandexOAuthScopes(
  token: YandexTokenResponse,
  config: YandexOAuthConfig,
): string {
  return token.scope?.trim() || resolveConfiguredYandexScope(config);
}

function requestYandexToken(
  config: YandexOAuthConfig,
  extra: Record<string, string>,
): Promise<YandexTokenResponse> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    ...extra,
  });
  return fetch(YANDEX_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  }).then(async (res) => {
    if (!res.ok) {
      throw new Error("Yandex OAuth token request failed");
    }
    return (await res.json()) as YandexTokenResponse;
  });
}

function requireAuth(auth?: PlatformAuth, projectId?: string): PlatformAuth {
  if (!auth?.accessToken) {
    throw new Error("Yandex Direct access token is required");
  }
  const scoped = projectId ?? auth.projectId;
  if (!scoped) {
    throw new Error("projectId is required");
  }
  return { ...auth, projectId: scoped };
}

function asDraft(value: unknown): DraftLike {
  const draft = value as DraftLike;
  if (!draft?.campaign?.name || !draft.campaign.budget_daily) {
    throw new Error("campaign draft is missing name or budget");
  }
  return draft;
}

function asAdGroup(value: unknown): AdGroupLike {
  const group = value as AdGroupLike;
  if (!group?.name) {
    throw new Error("ad group name is required");
  }
  return group;
}

function asCreative(value: unknown): CreativeLike {
  const ad = value as CreativeLike;
  if (!ad?.headline1 || !ad.description || !ad.href) {
    throw new Error("ad is missing headline, description or href");
  }
  return {
    ...ad,
    sitelinks: ad.sitelinks ?? [],
    callouts: ad.callouts ?? [],
  };
}

function asKeyword(value: unknown): string {
  if (typeof value === "string") return value.trim();
  const phrase = (value as { phrase?: string; Keyword?: string }).phrase
    ?? (value as { Keyword?: string }).Keyword;
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
  if (scope.id) {
    return { type: "ad_group", id: String(scope.id) };
  }
  throw new Error("negative keyword scope is invalid");
}

function geoFromGroups(groups: unknown[]): string[] {
  for (const group of groups) {
    const geo = (group as AdGroupLike).geo;
    if (geo && geo.length > 0) return geo;
  }
  return ["RU"];
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function asDateRange(value: unknown): {
  from: string;
  to: string;
  campaignIds: string[];
} {
  const range = value as PerformanceDateRange;
  if (!range?.from || !range.to) {
    throw new Error("date range from/to is required");
  }
  return {
    from: range.from,
    to: range.to,
    campaignIds: range.campaignIds ?? [],
  };
}
