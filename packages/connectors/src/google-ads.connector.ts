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
import { GoogleAdsApi, LiveGoogleAdsApi, GOOGLE_ADS_API_VERSION } from "./google-ads.api";

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
  mock?: boolean;
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

export function createMockGoogleOAuthClient(
  config?: Pick<GoogleOAuthConfig, "loginCustomerId">,
): GoogleOAuthClient {
  const customerId =
    config?.loginCustomerId?.replace(/-/g, "") || "1112223333";
  return {
    async exchangeAuthorizationCode(): Promise<GoogleTokenResponse> {
      return {
        access_token: "mock-google-access",
        refresh_token: "mock-google-refresh",
        expires_in: 3600,
        scope: GOOGLE_ADS_SCOPE,
      };
    },
    async refreshAccessToken(): Promise<GoogleTokenResponse> {
      return {
        access_token: "mock-google-access-rotated",
        refresh_token: "mock-google-refresh",
        expires_in: 3600,
        scope: GOOGLE_ADS_SCOPE,
      };
    },
    async listCustomerIds(): Promise<string[]> {
      return [customerId];
    },
  };
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
        `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers:listAccessibleCustomers`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "developer-token": config.developerToken,
          },
        },
      );
      const bodyText = await res.text();
      let data: {
        resourceNames?: string[];
        error?: { message?: string; status?: string; code?: number };
      } = {};
      try {
        data = bodyText ? (JSON.parse(bodyText) as typeof data) : {};
      } catch {
        data = {};
      }
      if (!res.ok) {
        const googleMessage =
          data.error?.message ||
          (bodyText.trim() ? bodyText.slice(0, 500) : `HTTP ${res.status}`);
        const details = [
          `HTTP ${res.status}`,
          data.error?.status,
          data.error?.code != null ? `code=${data.error.code}` : null,
          googleMessage,
        ]
          .filter(Boolean)
          .join(" · ");
        // Structured JSON (same shape as apps/api JsonLogger) — connectors have no Nest DI.
        // eslint-disable-next-line no-console
        console.error(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            level: "error",
            context: "GoogleAdsOAuthClient.listCustomerIds",
            requestId: null,
            message: `Google Ads customer list failed: ${details}`,
          }),
        );
        throw new Error(`Google Ads customer list failed: ${details}`);
      }
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
    if (this.config.mock) {
      const url = new URL(this.config.redirectUri);
      url.searchParams.set("code", "mock-google");
      url.searchParams.set("state", state);
      return { url: url.toString() };
    }
    if (!this.config.clientId?.trim()) {
      throw new Error("GOOGLE_ADS_CLIENT_ID is required when GOOGLE_ADS_MOCK is off");
    }
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
    const geo = draft.campaign.geo?.length ? draft.campaign.geo : ["RU"];
    await this.api.setCampaignLocations(googleAuth, campaignId, geo);
    await this.api.setCampaignLanguage(googleAuth, campaignId, geo);
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
    const usedHeadlines = new Set<string>();
    const usedDescriptions = new Set<string>();
    const ads = creatives.map(asCreative).map((ad, index) => ({
      headlines: ensureMinUniqueAssets(
        padHeadlines(ad.headline1, ad.headline2, index),
        usedHeadlines,
        3,
        30,
        ad.headline1 || "Оффер",
      ),
      descriptions: ensureMinUniqueAssets(
        padDescriptions(ad.description, ad.headline2, index),
        usedDescriptions,
        2,
        90,
        ad.description || "Описание",
      ),
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

  async setCampaignGeo(
    projectId: string,
    campaignId: string,
    geo: string[],
    auth?: PlatformAuth,
  ): Promise<void> {
    this.requireProject(projectId);
    const targets = geo.length > 0 ? geo : ["RU"];
    await this.api.setCampaignLocations(
      toGoogleAuth(auth, projectId),
      campaignId,
      targets,
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
      // Caller may pass positives as trailing strings via scope; connector
      // layer keeps exclude empty — campaigns.service filters before call.
      [],
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
    auth?: PlatformAuth,
  ): Promise<KeywordIdea[]> {
    return this.keywordIdeas.getKeywordIdeas(seedKeywords, geo, auth);
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

  async fetchAllAccountCampaigns(
    projectId: string,
    auth?: PlatformAuth,
  ): Promise<AccountCampaignSummary[]> {
    this.requireProject(projectId);
    return this.api.searchAccountCampaigns(toGoogleAuth(auth, projectId));
  }

  async verifyConnection(
    projectId: string,
    auth?: PlatformAuth,
  ): Promise<ConnectionVerificationResult> {
    this.requireProject(projectId);
    try {
      await this.api.probeConnection(toGoogleAuth(auth, projectId));
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: connectionVerificationMessage(err) };
    }
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
  campaign: { name: string; budget_daily: number; geo?: string[] };
} {
  const draft = value as {
    campaign?: { name?: string; budget_daily?: number; geo?: string[] };
  };
  if (!draft.campaign?.name || !draft.campaign.budget_daily) {
    throw new Error("campaign draft is missing name or budget");
  }
  return draft as {
    campaign: { name: string; budget_daily: number; geo?: string[] };
  };
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

function padHeadlines(h1: string, h2?: string, variant = 0): string[] {
  const base = h1.trim().slice(0, 30);
  const second = (h2?.trim() || "").slice(0, 30);
  const suffix = variant === 0 ? "купить" : variant === 1 ? "цена" : "заказать";
  const candidates = [
    base,
    second && second.toLowerCase() !== base.toLowerCase() ? second : "",
    `${base.slice(0, Math.max(1, 30 - suffix.length - 1))} ${suffix}`.slice(0, 30),
    `${base.slice(0, 24)} ${variant + 1}`.slice(0, 30),
    `Доставка — ${base}`.slice(0, 30),
    `Официально — ${base}`.slice(0, 30),
  ];
  return uniqueAssetTexts(candidates, 3, 30, base || "Оффер");
}

function padDescriptions(
  description: string,
  extra?: string,
  variant = 0,
): string[] {
  const first = description.trim().slice(0, 90);
  const secondRaw = (extra || "").trim().slice(0, 90);
  const alt =
    variant === 0
      ? "Доставка и гарантия. Официальный магазин."
      : variant === 1
        ? "Подбор и консультация. Быстрый заказ."
        : "Выгодные цены. Работаем с юрлицами.";
  const candidates = [
    first,
    secondRaw && secondRaw.toLowerCase() !== first.toLowerCase()
      ? secondRaw
      : "",
    `${first.slice(0, 60)} ${alt}`.slice(0, 90),
    alt,
  ];
  return uniqueAssetTexts(candidates, 2, 90, first || alt);
}

/** Case-insensitive unique texts; pad to `min` with numbered suffixes. */
function uniqueAssetTexts(
  candidates: string[],
  min: number,
  maxLen: number,
  seed: string,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of candidates) {
    const text = raw.replace(/\s+/g, " ").trim().slice(0, maxLen);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  let n = out.length + 1;
  while (out.length < min) {
    const text = `${seed.slice(0, Math.max(1, maxLen - 4))} ${n}`.slice(
      0,
      maxLen,
    );
    const key = text.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(text);
    }
    n += 1;
    if (n > 30) break;
  }
  return out;
}

/**
 * Google Ads rejects the same headline/description text across RSA creates
 * in one mutate (`DUPLICATE_ASSET`). Keep a batch-wide used set and pad to min.
 */
function ensureUniqueAssets(
  texts: string[],
  used: Set<string>,
  maxLen: number,
): string[] {
  const out: string[] = [];
  for (const raw of texts) {
    let text = raw.replace(/\s+/g, " ").trim().slice(0, maxLen);
    if (!text) continue;
    let key = text.toLowerCase();
    let attempt = 1;
    while (used.has(key) && attempt < 20) {
      const suffix = ` ${attempt}`;
      text = `${raw.slice(0, Math.max(1, maxLen - suffix.length))}${suffix}`.slice(
        0,
        maxLen,
      );
      key = text.toLowerCase();
      attempt += 1;
    }
    if (used.has(key)) continue;
    used.add(key);
    out.push(text);
  }
  return out;
}

function ensureMinUniqueAssets(
  texts: string[],
  used: Set<string>,
  min: number,
  maxLen: number,
  seed: string,
): string[] {
  const out = ensureUniqueAssets(texts, used, maxLen);
  let n = out.length + 1;
  while (out.length < min && n < 40) {
    const padded = ensureUniqueAssets(
      [`${seed.trim().slice(0, Math.max(1, maxLen - 4))} ${n}`],
      used,
      maxLen,
    );
    out.push(...padded);
    n += 1;
  }
  return out;
}
