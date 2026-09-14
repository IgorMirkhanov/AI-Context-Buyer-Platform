import { KeywordIdea, PlatformApiError } from "./types";
import {
  googleGeoTargetConstants,
  googleLanguageForGeo,
} from "./google-geo";
import { defaultProjectApiLimiter, ProjectApiLimiter } from "./project-rate-limit";

const KEYWORD_SEED_CHUNK = 20;

export type GoogleAdsAuth = {
  accessToken: string;
  customerId: string;
  projectId?: string;
};

export type GoogleAdsMutateResult = { resourceName?: string };

export type GooglePerformanceRow = {
  date: string;
  externalCampaignId: string;
  adGroupExternalId?: string;
  adGroupName?: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
};

export type GoogleAccountCampaignRow = {
  externalCampaignId: string;
  name: string;
  status: "active" | "paused" | "archived";
  dailyBudget: number | null;
};

export interface GoogleAdsApi {
  createBudget(
    auth: GoogleAdsAuth,
    name: string,
    amountMicros: number,
  ): Promise<string>;
  createCampaign(
    auth: GoogleAdsAuth,
    campaign: {
      name: string;
      budgetResource: string;
      status: "PAUSED";
    },
  ): Promise<string>;
  pauseCampaign(auth: GoogleAdsAuth, campaignId: string): Promise<void>;
  updateBudgetMicros(
    auth: GoogleAdsAuth,
    budgetResource: string,
    amountMicros: number,
  ): Promise<void>;
  createAdGroups(
    auth: GoogleAdsAuth,
    campaignId: string,
    names: string[],
  ): Promise<string[]>;
  createResponsiveSearchAds(
    auth: GoogleAdsAuth,
    adGroupId: string,
    ads: Array<{
      headlines: string[];
      descriptions: string[];
      finalUrl: string;
    }>,
  ): Promise<string[]>;
  addKeywords(
    auth: GoogleAdsAuth,
    adGroupId: string,
    keywords: string[],
  ): Promise<void>;
  addNegativeKeywords(
    auth: GoogleAdsAuth,
    scope: { type: "campaign" | "ad_group"; id: string },
    negatives: string[],
    excludeTexts?: string[],
  ): Promise<void>;
  searchPerformance(
    auth: GoogleAdsAuth,
    range: { from: string; to: string; campaignIds: string[] },
  ): Promise<GooglePerformanceRow[]>;
  searchAccountCampaigns(auth: GoogleAdsAuth): Promise<GoogleAccountCampaignRow[]>;
  probeConnection(auth: GoogleAdsAuth): Promise<void>;
  getBudgetResource(
    auth: GoogleAdsAuth,
    campaignId: string,
  ): Promise<string | null>;
  getSearchTerms(
    auth: GoogleAdsAuth,
    range: { from: string; to: string; campaignIds: string[] },
  ): Promise<
    Array<{
      campaignId: string;
      phrase: string;
      clicks: number;
      spend: number;
      conversions: number;
    }>
  >;
  generateKeywordIdeas(
    auth: GoogleAdsAuth,
    seedKeywords: string[],
    geo: string[],
  ): Promise<KeywordIdea[]>;
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

/** Current Google Ads REST major version (v18 returned HTML 404 after sunset). */
export const GOOGLE_ADS_API_VERSION = "v25";

export class LiveGoogleAdsApi implements GoogleAdsApi {
  constructor(
    private readonly developerToken: string,
    private readonly loginCustomerId?: string,
    private readonly version = GOOGLE_ADS_API_VERSION,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly limiter: ProjectApiLimiter = defaultProjectApiLimiter,
  ) {}

  async createBudget(
    auth: GoogleAdsAuth,
    name: string,
    amountMicros: number,
  ): Promise<string> {
    const results = await this.mutate(auth, "campaignBudgets", [
      {
        create: {
          name,
          amountMicros: String(Math.max(0, Math.round(amountMicros))),
          deliveryMethod: "STANDARD",
          explicitlyShared: false,
        },
      },
    ]);
    return results[0];
  }

  async createCampaign(
    auth: GoogleAdsAuth,
    campaign: { name: string; budgetResource: string; status: "PAUSED" },
  ): Promise<string> {
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + 1);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 30);
    end.setUTCHours(23, 59, 59, 0);
    // v25 Campaign.start_date_time / end_date_time: "yyyy-MM-dd HH:mm:ss"
    // (customer timezone; UTC is fine for create when TZ unknown).
    const fmt = (d: Date) =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}`;

    const results = await this.mutate(auth, "campaigns", [
      {
        create: {
          name: campaign.name,
          status: "PAUSED",
          advertisingChannelType: "SEARCH",
          campaignBudget: campaign.budgetResource,
          // Empty ManualCpc matches Google Ads API samples (v25).
          manualCpc: {},
          // Required since Google Ads API ~v19.2 / EU political ads regulation.
          containsEuPoliticalAdvertising:
            "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
          networkSettings: {
            targetGoogleSearch: true,
            targetSearchNetwork: true,
            targetContentNetwork: false,
            targetPartnerSearchNetwork: false,
          },
          startDateTime: fmt(start),
          endDateTime: fmt(end),
        },
      },
    ]);
    return idFromResource(results[0]);
  }

  async pauseCampaign(auth: GoogleAdsAuth, campaignId: string): Promise<void> {
    await this.mutate(auth, "campaigns", [
      {
        update: {
          resourceName: resource(auth.customerId, "campaigns", campaignId),
          status: "PAUSED",
        },
        updateMask: "status",
      },
    ]);
  }

  async updateBudgetMicros(
    auth: GoogleAdsAuth,
    budgetResource: string,
    amountMicros: number,
  ): Promise<void> {
    await this.mutate(auth, "campaignBudgets", [
      {
        update: {
          resourceName: budgetResource,
          amountMicros: String(amountMicros),
        },
        updateMask: "amount_micros",
      },
    ]);
  }

  async createAdGroups(
    auth: GoogleAdsAuth,
    campaignId: string,
    names: string[],
  ): Promise<string[]> {
    const results = await this.mutate(
      auth,
      "adGroups",
      names.map((name) => ({
        create: {
          name,
          status: "PAUSED",
          campaign: resource(auth.customerId, "campaigns", campaignId),
        },
      })),
    );
    return results.map(idFromResource);
  }

  async createResponsiveSearchAds(
    auth: GoogleAdsAuth,
    adGroupId: string,
    ads: Array<{
      headlines: string[];
      descriptions: string[];
      finalUrl: string;
    }>,
  ): Promise<string[]> {
    const results = await this.mutate(
      auth,
      "adGroupAds",
      ads.map((ad) => ({
        create: {
          adGroup: resource(auth.customerId, "adGroups", adGroupId),
          status: "PAUSED",
          ad: {
            finalUrls: [ad.finalUrl],
            responsiveSearchAd: {
              headlines: ad.headlines.slice(0, 15).map((text) => ({ text })),
              descriptions: ad.descriptions.slice(0, 4).map((text) => ({ text })),
            },
          },
        },
      })),
    );
    return results.map(idFromResource);
  }

  async addKeywords(
    auth: GoogleAdsAuth,
    adGroupId: string,
    keywords: string[],
  ): Promise<void> {
    if (keywords.length === 0) return;
    await this.mutate(
      auth,
      "adGroupCriteria",
      keywords.map((text) => ({
        create: {
          adGroup: resource(auth.customerId, "adGroups", adGroupId),
          keyword: { text, matchType: "PHRASE" },
        },
      })),
    );
  }

  async addNegativeKeywords(
    auth: GoogleAdsAuth,
    scope: { type: "campaign" | "ad_group"; id: string },
    negatives: string[],
    excludeTexts: string[] = [],
  ): Promise<void> {
    // Same text+matchType as an existing positive criterion → IMMUTABLE_FIELD
    // on `negative` (cannot flip polarity; must remove then recreate).
    const cleaned = sanitizeNegativeKeywords(negatives, excludeTexts);
    if (cleaned.length === 0) return;
    if (scope.type === "campaign") {
      await this.mutate(
        auth,
        "campaignCriteria",
        cleaned.map((text) => ({
          create: {
            campaign: resource(auth.customerId, "campaigns", scope.id),
            negative: true,
            keyword: { text, matchType: "PHRASE" },
          },
        })),
      );
      return;
    }
    await this.mutate(
      auth,
      "adGroupCriteria",
      cleaned.map((text) => ({
        create: {
          adGroup: resource(auth.customerId, "adGroups", scope.id),
          negative: true,
          keyword: { text, matchType: "PHRASE" },
        },
      })),
    );
  }

  async searchPerformance(
    auth: GoogleAdsAuth,
    range: { from: string; to: string; campaignIds: string[] },
  ): Promise<GooglePerformanceRow[]> {
    if (range.campaignIds.length === 0) return [];
    const ids = range.campaignIds.join(",");
    const query = `SELECT campaign.id, segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date BETWEEN '${range.from}' AND '${range.to}' AND campaign.id IN (${ids})`;
    const payload = await this.request<{
      results?: Array<{
        campaign?: { id?: string };
        segments?: { date?: string };
        metrics?: {
          impressions?: string;
          clicks?: string;
          costMicros?: string;
          conversions?: number;
        };
      }>;
    }>(auth, `customers/${auth.customerId}/googleAds:search`, { query });
    return (payload.results ?? []).map((row) => {
      const spend = Number(row.metrics?.costMicros ?? 0) / 1_000_000;
      return {
        date: row.segments?.date ?? range.from,
        externalCampaignId: String(row.campaign?.id ?? ""),
        impressions: Number(row.metrics?.impressions ?? 0),
        clicks: Number(row.metrics?.clicks ?? 0),
        spend,
        conversions: Number(row.metrics?.conversions ?? 0),
      };
    });
  }

  async searchAccountCampaigns(
    auth: GoogleAdsAuth,
  ): Promise<GoogleAccountCampaignRow[]> {
    const payload = await this.request<{
      results?: Array<{
        campaign?: {
          id?: string;
          name?: string;
          status?: string;
        };
        campaignBudget?: {
          amountMicros?: string;
        };
      }>;
    }>(auth, `customers/${auth.customerId}/googleAds:search`, {
      query:
        "SELECT campaign.id, campaign.name, campaign.status, campaign_budget.amount_micros FROM campaign",
    });
    return (payload.results ?? []).map((row) => ({
      externalCampaignId: String(row.campaign?.id ?? ""),
      name: row.campaign?.name?.trim() || `Кампания ${row.campaign?.id ?? ""}`,
      status: mapGoogleCampaignStatus(row.campaign?.status),
      dailyBudget:
        row.campaignBudget?.amountMicros != null
          ? Number(row.campaignBudget.amountMicros) / 1_000_000
          : null,
    }));
  }

  async probeConnection(auth: GoogleAdsAuth): Promise<void> {
    await this.request(
      auth,
      `customers/${auth.customerId}/googleAds:search`,
      {
        query: "SELECT campaign.id FROM campaign LIMIT 1",
      },
    );
  }

  async getBudgetResource(
    auth: GoogleAdsAuth,
    campaignId: string,
  ): Promise<string | null> {
    const payload = await this.request<{
      results?: Array<{ campaign?: { campaignBudget?: string } }>;
    }>(
      auth,
      `customers/${auth.customerId}/googleAds:search`,
      {
        query: `SELECT campaign.campaign_budget FROM campaign WHERE campaign.id = ${campaignId} LIMIT 1`,
      },
    );
    return payload.results?.[0]?.campaign?.campaignBudget ?? null;
  }

  async getSearchTerms(
    auth: GoogleAdsAuth,
    range: { from: string; to: string; campaignIds: string[] },
  ): Promise<
    Array<{
      campaignId: string;
      phrase: string;
      clicks: number;
      spend: number;
      conversions: number;
    }>
  > {
    void range;
    if (!auth.accessToken || !auth.customerId) {
      throw new PlatformApiError(
        "Google Ads is not connected for this project",
        "getSearchTerms",
        "missing token or customer id",
      );
    }
    return [];
  }

  async generateKeywordIdeas(
    auth: GoogleAdsAuth,
    seedKeywords: string[],
    geo: string[],
  ): Promise<KeywordIdea[]> {
    const seeds = seedKeywords
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 200);
    if (seeds.length === 0) {
      return [];
    }
    const geoTargets = googleGeoTargetConstants(geo);
    const language = googleLanguageForGeo(geo);
    const ideas: KeywordIdea[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < seeds.length; i += KEYWORD_SEED_CHUNK) {
      const chunk = seeds.slice(i, i + KEYWORD_SEED_CHUNK);
      const payload = await this.request<{
        results?: Array<{
          text?: string;
          keywordIdeaMetrics?: {
            avgMonthlySearches?: string | number;
            competition?: string;
          };
        }>;
      }>(auth, `customers/${auth.customerId}:generateKeywordIdeas`, {
        language,
        geoTargetConstants: geoTargets,
        includeAdultKeywords: false,
        keywordPlanNetwork: "GOOGLE_SEARCH",
        keywordSeed: { keywords: chunk },
      });

      for (const row of payload.results ?? []) {
        const mapped = mapGenerateKeywordIdeaResult(row);
        if (!mapped) continue;
        if (seen.has(mapped.phrase)) continue;
        seen.add(mapped.phrase);
        ideas.push(mapped);
      }
    }

    // Limited API access sometimes returns rows without volume; keep seeds so
    // semantic clustering is not empty (mock-quality floor, live when metrics exist).
    if (ideas.length === 0) {
      for (const seed of seeds) {
        const phrase = seed.trim().toLowerCase().replace(/\s+/g, " ");
        if (!phrase || seen.has(phrase)) continue;
        seen.add(phrase);
        ideas.push({
          phrase,
          frequency: 1,
          competition: null,
          source: "google_keyword_planner",
        });
      }
    }

    return ideas;
  }

  private async mutate(
    auth: GoogleAdsAuth,
    service: string,
    operations: unknown[],
  ): Promise<string[]> {
    const payload = await this.request<{
      results?: GoogleAdsMutateResult[];
    }>(auth, `customers/${auth.customerId}/${service}:mutate`, { operations });
    const names = (payload.results ?? [])
      .map((item) => item.resourceName)
      .filter((item): item is string => Boolean(item));
    if (names.length === 0) {
      throw new PlatformApiError(
        "Google Ads mutate returned no resource names",
        service,
        "empty results",
      );
    }
    return names;
  }

  private async request<T>(
    auth: GoogleAdsAuth,
    path: string,
    body: unknown,
  ): Promise<T> {
    if (!auth.accessToken || !auth.customerId) {
      throw new PlatformApiError(
        "Google Ads is not connected for this project",
        path,
        "missing token or customer id",
      );
    }
    let lastError: unknown;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const res = await this.limiter.schedule(
        auth.projectId ?? "",
        "google_ads",
        () =>
          this.fetchImpl(
            `https://googleads.googleapis.com/${this.version}/${path}`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${auth.accessToken}`,
                "developer-token": this.developerToken,
                "Content-Type": "application/json",
                ...(this.loginCustomerId
                  ? { "login-customer-id": this.loginCustomerId.replace(/-/g, "") }
                  : {}),
              },
              body: JSON.stringify(body),
            },
          ),
      );
      const json = (await res.json().catch(() => ({}))) as T & {
        error?: {
          message?: string;
          status?: string;
          details?: unknown[];
        };
      };
      if (res.ok) return json;
      const details = formatGoogleAdsError(json.error, res.status);
      if (RETRYABLE.has(res.status) && attempt < 4) {
        await sleep(400 * 2 ** attempt);
        continue;
      }
      throw new PlatformApiError(
        humanizeGoogleError(details),
        path,
        details,
        RETRYABLE.has(res.status),
      );
    }
    throw lastError instanceof Error
      ? lastError
      : new PlatformApiError("Google Ads request failed", path, String(lastError));
  }
}

export class MockGoogleAdsApi implements GoogleAdsApi {
  nextId = 7000;
  calls: Array<{ method: string; payload: unknown }> = [];
  failAt: string | null = null;
  budgets = new Map<string, string>();

  accountCampaigns: GoogleAccountCampaignRow[] = [
    {
      externalCampaignId: "7001",
      name: "Google кампания",
      status: "paused",
      dailyBudget: 3000,
    },
  ];

  private take(method: string, payload: unknown): string {
    this.calls.push({ method, payload });
    if (this.failAt === method) {
      throw new PlatformApiError(
        `Mock Google policy violation at ${method}`,
        method,
        "POLICY_FINDING",
        false,
      );
    }
    this.nextId += 1;
    return String(this.nextId);
  }

  async createBudget(
    auth: GoogleAdsAuth,
    name: string,
    amountMicros: number,
  ): Promise<string> {
    requireGoogleAuth(auth);
    const id = this.take("createBudget", { name, amountMicros });
    return `customers/${auth.customerId}/campaignBudgets/${id}`;
  }

  async createCampaign(
    auth: GoogleAdsAuth,
    campaign: { name: string; budgetResource: string; status: "PAUSED" },
  ): Promise<string> {
    requireGoogleAuth(auth);
    const id = this.take("createCampaign", campaign);
    this.budgets.set(id, campaign.budgetResource);
    return id;
  }

  async pauseCampaign(auth: GoogleAdsAuth, campaignId: string): Promise<void> {
    requireGoogleAuth(auth);
    this.calls.push({ method: "pauseCampaign", payload: campaignId });
  }

  async updateBudgetMicros(
    auth: GoogleAdsAuth,
    budgetResource: string,
    amountMicros: number,
  ): Promise<void> {
    requireGoogleAuth(auth);
    this.take("setBudget", { budgetResource, amountMicros });
  }

  async createAdGroups(
    auth: GoogleAdsAuth,
    campaignId: string,
    names: string[],
  ): Promise<string[]> {
    requireGoogleAuth(auth);
    return names.map((name) => this.take("createAdGroups", { campaignId, name }));
  }

  async createResponsiveSearchAds(
    auth: GoogleAdsAuth,
    adGroupId: string,
    ads: Array<{ headlines: string[]; descriptions: string[]; finalUrl: string }>,
  ): Promise<string[]> {
    requireGoogleAuth(auth);
    return ads.map((ad) => this.take("createAds", { adGroupId, ad }));
  }

  async addKeywords(
    auth: GoogleAdsAuth,
    adGroupId: string,
    keywords: string[],
  ): Promise<void> {
    requireGoogleAuth(auth);
    this.take("addKeywords", { adGroupId, keywords });
  }

  async addNegativeKeywords(
    auth: GoogleAdsAuth,
    scope: { type: "campaign" | "ad_group"; id: string },
    negatives: string[],
    excludeTexts: string[] = [],
  ): Promise<void> {
    requireGoogleAuth(auth);
    const cleaned = sanitizeNegativeKeywords(negatives, excludeTexts);
    this.calls.push({
      method: "addNegativeKeywords",
      payload: { scope, negatives: cleaned, excludeTexts },
    });
  }

  async searchPerformance(
    auth: GoogleAdsAuth,
    range: { from: string; to: string; campaignIds: string[] },
  ): Promise<GooglePerformanceRow[]> {
    requireGoogleAuth(auth);
    this.calls.push({ method: "getPerformance", payload: range });
    return range.campaignIds.map((id) => ({
      date: range.to,
      externalCampaignId: id,
      impressions: 120,
      clicks: 12,
      spend: 360,
      conversions: 2,
    }));
  }

  async searchAccountCampaigns(
    auth: GoogleAdsAuth,
  ): Promise<GoogleAccountCampaignRow[]> {
    requireGoogleAuth(auth);
    this.calls.push({ method: "fetchAllAccountCampaigns", payload: {} });
    return this.accountCampaigns.map((row) => ({ ...row }));
  }

  async probeConnection(auth: GoogleAdsAuth): Promise<void> {
    requireGoogleAuth(auth);
    this.calls.push({ method: "verifyConnection", payload: {} });
    if (this.failAt === "verifyConnection") {
      throw new PlatformApiError(
        "Request had insufficient authentication scopes",
        "verifyConnection",
        "HTTP 403",
        false,
      );
    }
  }

  async getBudgetResource(
    auth: GoogleAdsAuth,
    campaignId: string,
  ): Promise<string | null> {
    requireGoogleAuth(auth);
    return this.budgets.get(campaignId) ?? null;
  }

  async getSearchTerms(
    auth: GoogleAdsAuth,
    range: { from: string; to: string; campaignIds: string[] },
  ): Promise<
    Array<{
      campaignId: string;
      phrase: string;
      clicks: number;
      spend: number;
      conversions: number;
    }>
  > {
    requireGoogleAuth(auth);
    this.calls.push({ method: "getSearchTerms", payload: range });
    return range.campaignIds.map((id) => ({
      campaignId: id,
      phrase: "скачать бесплатно",
      clicks: 8,
      spend: 240,
      conversions: 0,
    }));
  }

  async generateKeywordIdeas(
    auth: GoogleAdsAuth,
    seedKeywords: string[],
    geo: string[],
  ): Promise<KeywordIdea[]> {
    requireGoogleAuth(auth);
    this.calls.push({
      method: "generateKeywordIdeas",
      payload: { seedKeywords, geo },
    });
    if (this.failAt === "generateKeywordIdeas") {
      throw new PlatformApiError(
        humanizeGoogleError(
          "The developer token is only allowed to access test accounts",
        ),
        "generateKeywordIdeas",
        "The developer token is only allowed to access test accounts",
      );
    }
    return seedKeywords
      .map((seed) => seed.trim().toLowerCase())
      .filter(Boolean)
      .map((phrase) => ({
        phrase,
        frequency: 100,
        competition: "MEDIUM",
        source: "google_keyword_planner",
      }));
  }
}

function requireGoogleAuth(auth: GoogleAdsAuth): void {
  if (!auth.accessToken || !auth.customerId) {
    throw new PlatformApiError(
      "Google Ads is not connected for this project",
      "auth",
      "missing token or customer id",
    );
  }
}

export function mapGoogleCampaignStatus(
  status?: string,
): "active" | "paused" | "archived" {
  const normalized = (status ?? "").toUpperCase();
  if (normalized === "REMOVED") {
    return "archived";
  }
  if (normalized === "ENABLED") {
    return "active";
  }
  return "paused";
}

export function sanitizeNegativeKeywords(
  negatives: string[],
  excludeTexts: string[] = [],
): string[] {
  const exclude = new Set(
    excludeTexts
      .map((text) => text.trim().toLowerCase())
      .filter(Boolean),
  );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of negatives) {
    const text = raw.trim().replace(/\s+/g, " ");
    if (!text) continue;
    const key = text.toLowerCase();
    if (exclude.has(key) || seen.has(key)) continue;
    // Google Ads keyword text limit (80 chars).
    if (text.length > 80) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

export function formatGoogleAdsError(
  error:
    | {
        message?: string;
        status?: string;
        details?: unknown[];
      }
    | undefined,
  httpStatus: number,
): string {
  const base = error?.message || `HTTP ${httpStatus}`;
  const bits: string[] = [base];
  for (const detail of error?.details ?? []) {
    if (!detail || typeof detail !== "object") continue;
    const row = detail as {
      errors?: Array<{
        message?: string;
        errorCode?: Record<string, string>;
        location?: { fieldPathElements?: Array<{ fieldName?: string }> };
      }>;
    };
    for (const item of row.errors ?? []) {
      const fields = (item.location?.fieldPathElements ?? [])
        .map((el) => el.fieldName)
        .filter(Boolean)
        .join(".");
      const codes = item.errorCode
        ? Object.entries(item.errorCode)
            .filter(([, v]) => v && v !== "UNSPECIFIED")
            .map(([k, v]) => `${k}=${v}`)
            .join(",")
        : "";
      const part = [item.message, fields ? `field=${fields}` : "", codes]
        .filter(Boolean)
        .join(" · ");
      if (part) bits.push(part);
    }
  }
  return bits.join(" | ").slice(0, 800);
}

export function humanizeGoogleError(details: string): string {
  const lower = details.toLowerCase();
  if (isGoogleAdsAccessLevelError(details)) {
    return (
      "Google Ads API отклонил запрос: у developer token пока нет Basic Access " +
      "(доступ только к тестовым аккаунтам). Пока Google не одобрит Basic Access — " +
      "поставьте GOOGLE_ADS_MOCK=1 для локальной семантики, либо используйте тестовый customer id. " +
      `Детали: ${details}`
    );
  }
  if (lower.includes("policy") || lower.includes("disapproved")) {
    return `Google Ads отклонил материалы: ${details}`;
  }
  if (lower.includes("auth") || lower.includes("token") || lower.includes("unauth")) {
    return `Нет доступа к кабинету Google Ads: ${details}`;
  }
  return `Ошибка Google Ads: ${details}`;
}

/** Explorer / test-account-only developer token and related auth denials. */
export function isGoogleAdsAccessLevelError(details: string): boolean {
  const lower = details.toLowerCase();
  return (
    lower.includes("developer token") ||
    lower.includes("test account") ||
    lower.includes("only allowed for test") ||
    lower.includes("basic access") ||
    lower.includes("permission_denied") ||
    lower.includes("permission denied") ||
    lower.includes("user_permission_denied") ||
    lower.includes("authorizationerror") ||
    (lower.includes("authorization") && lower.includes("denied")) ||
    lower.includes("not allowed for this customer") ||
    lower.includes("customer not enabled")
  );
}

/**
 * Keep Planner rows with positive search volume.
 * Competition UNSPECIFIED/UNKNOWN is common on limited API access — do not drop those.
 */
export function mapGenerateKeywordIdeaResult(row: {
  text?: string;
  keywordIdeaMetrics?: {
    avgMonthlySearches?: string | number;
    competition?: string;
  };
}): KeywordIdea | null {
  const phrase = (row.text ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!phrase) return null;
  const metrics = row.keywordIdeaMetrics;
  if (!metrics) return null;
  const raw = metrics.avgMonthlySearches;
  if (raw === undefined || raw === null || raw === "") return null;
  const frequency = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(frequency) || frequency <= 0) return null;
  const competition = (metrics.competition ?? "").toUpperCase();
  const usableCompetition =
    competition &&
    competition !== "UNSPECIFIED" &&
    competition !== "UNKNOWN"
      ? competition
      : null;
  return {
    phrase,
    frequency,
    competition: usableCompetition,
    source: "google_keyword_planner",
  };
}

function resource(customerId: string, kind: string, id: string): string {
  return `customers/${customerId}/${kind}/${id}`;
}

function idFromResource(name: string): string {
  const parts = name.split("/");
  return parts[parts.length - 1] ?? name;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
