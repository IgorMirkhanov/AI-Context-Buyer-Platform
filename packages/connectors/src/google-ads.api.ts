import { PlatformApiError } from "./types";
import { defaultProjectApiLimiter, ProjectApiLimiter } from "./project-rate-limit";

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
  ): Promise<void>;
  searchPerformance(
    auth: GoogleAdsAuth,
    range: { from: string; to: string; campaignIds: string[] },
  ): Promise<GooglePerformanceRow[]>;
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
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export class LiveGoogleAdsApi implements GoogleAdsApi {
  constructor(
    private readonly developerToken: string,
    private readonly loginCustomerId?: string,
    private readonly version = "v18",
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
          amountMicros: String(amountMicros),
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
    const results = await this.mutate(auth, "campaigns", [
      {
        create: {
          name: campaign.name,
          status: "PAUSED",
          advertisingChannelType: "SEARCH",
          campaignBudget: campaign.budgetResource,
          manualCpc: { enhancedCpcEnabled: false },
          networkSettings: {
            targetGoogleSearch: true,
            targetSearchNetwork: true,
            targetContentNetwork: false,
          },
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
  ): Promise<void> {
    if (negatives.length === 0) return;
    if (scope.type === "campaign") {
      await this.mutate(
        auth,
        "campaignCriteria",
        negatives.map((text) => ({
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
      negatives.map((text) => ({
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
        error?: { message?: string; status?: string };
      };
      if (res.ok) return json;
      const details = json.error?.message || `HTTP ${res.status}`;
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
  ): Promise<void> {
    requireGoogleAuth(auth);
    this.calls.push({ method: "addNegativeKeywords", payload: { scope, negatives } });
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

export function humanizeGoogleError(details: string): string {
  const lower = details.toLowerCase();
  if (lower.includes("policy") || lower.includes("disapproved")) {
    return `Google Ads отклонил материалы: ${details}`;
  }
  if (lower.includes("auth") || lower.includes("token") || lower.includes("unauth")) {
    return `Нет доступа к кабинету Google Ads: ${details}`;
  }
  return `Ошибка Google Ads: ${details}`;
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
