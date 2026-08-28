import { PlatformApiError } from "./types";
import { defaultProjectApiLimiter, ProjectApiLimiter } from "./project-rate-limit";

export type YandexAuth = {
  accessToken: string;
  clientLogin?: string;
  projectId?: string;
};

export type YandexAddResult = { Id?: number; Errors?: YandexActionError[] };
export type YandexActionError = {
  Code?: number;
  Message?: string;
  Details?: string;
};

export type YandexPerformanceRow = {
  date: string;
  externalCampaignId: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  adGroupExternalId?: string;
  adGroupName?: string;
};

export interface YandexDirectApi {
  addCampaigns(
    auth: YandexAuth,
    campaigns: unknown[],
  ): Promise<number[]>;
  suspendCampaigns(auth: YandexAuth, ids: number[]): Promise<void>;
  updateDailyBudget(
    auth: YandexAuth,
    campaignId: number,
    amount: number,
  ): Promise<void>;
  updateCampaignNegatives(
    auth: YandexAuth,
    campaignId: number,
    negatives: string[],
  ): Promise<void>;
  addAdGroups(auth: YandexAuth, groups: unknown[]): Promise<number[]>;
  updateAdGroupNegatives(
    auth: YandexAuth,
    adGroupId: number,
    negatives: string[],
  ): Promise<void>;
  addAds(auth: YandexAuth, ads: unknown[]): Promise<number[]>;
  addKeywords(auth: YandexAuth, keywords: unknown[]): Promise<number[]>;
  addSitelinkSets(
    auth: YandexAuth,
    sets: Array<Array<{ Title: string; Href: string }>>,
  ): Promise<number[]>;
  addCallouts(auth: YandexAuth, texts: string[]): Promise<number[]>;
  getCampaignPerformance(
    auth: YandexAuth,
    range: { from: string; to: string; campaignIds: string[] },
  ): Promise<YandexPerformanceRow[]>;
  getSearchTerms(
    auth: YandexAuth,
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

const RETRYABLE_HTTP = new Set([429, 500, 502, 503, 504]);
const RETRYABLE_CODES = new Set([506, 509, 513, 8300, 8302]);

export class LiveYandexDirectApi implements YandexDirectApi {
  constructor(
    private readonly baseUrl = "https://api.direct.yandex.com/json/v5",
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly limiter: ProjectApiLimiter = defaultProjectApiLimiter,
  ) {}

  async addCampaigns(auth: YandexAuth, campaigns: unknown[]): Promise<number[]> {
    const data = await this.call<{ AddResults?: YandexAddResult[] }>(
      auth,
      "campaigns",
      "add",
      { Campaigns: campaigns },
      "createCampaign",
    );
    return idsFromAdd(data.AddResults, "createCampaign");
  }

  async suspendCampaigns(auth: YandexAuth, ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await this.call(
      auth,
      "campaigns",
      "suspend",
      { SelectionCriteria: { Ids: ids } },
      "suspendCampaign",
    );
  }

  async updateDailyBudget(
    auth: YandexAuth,
    campaignId: number,
    amount: number,
  ): Promise<void> {
    await this.call(
      auth,
      "campaigns",
      "update",
      {
        Campaigns: [
          {
            Id: campaignId,
            DailyBudget: { Amount: amount, Mode: "STANDARD" },
          },
        ],
      },
      "setBudget",
    );
  }

  async updateCampaignNegatives(
    auth: YandexAuth,
    campaignId: number,
    negatives: string[],
  ): Promise<void> {
    if (negatives.length === 0) return;
    await this.call(
      auth,
      "campaigns",
      "update",
      {
        Campaigns: [
          {
            Id: campaignId,
            NegativeKeywords: { Items: negatives.slice(0, 7) },
          },
        ],
      },
      "addNegativeKeywords",
    );
  }

  async addAdGroups(auth: YandexAuth, groups: unknown[]): Promise<number[]> {
    const data = await this.call<{ AddResults?: YandexAddResult[] }>(
      auth,
      "adgroups",
      "add",
      { AdGroups: groups },
      "createAdGroups",
    );
    return idsFromAdd(data.AddResults, "createAdGroups");
  }

  async updateAdGroupNegatives(
    auth: YandexAuth,
    adGroupId: number,
    negatives: string[],
  ): Promise<void> {
    if (negatives.length === 0) return;
    await this.call(
      auth,
      "adgroups",
      "update",
      {
        AdGroups: [
          { Id: adGroupId, NegativeKeywords: { Items: negatives } },
        ],
      },
      "addNegativeKeywords",
    );
  }

  async addAds(auth: YandexAuth, ads: unknown[]): Promise<number[]> {
    const data = await this.call<{ AddResults?: YandexAddResult[] }>(
      auth,
      "ads",
      "add",
      { Ads: ads },
      "createAds",
    );
    return idsFromAdd(data.AddResults, "createAds");
  }

  async addKeywords(auth: YandexAuth, keywords: unknown[]): Promise<number[]> {
    const data = await this.call<{ AddResults?: YandexAddResult[] }>(
      auth,
      "keywords",
      "add",
      { Keywords: keywords },
      "addKeywords",
    );
    return idsFromAdd(data.AddResults, "addKeywords");
  }

  async addSitelinkSets(
    auth: YandexAuth,
    sets: Array<Array<{ Title: string; Href: string }>>,
  ): Promise<number[]> {
    if (sets.length === 0) return [];
    const data = await this.call<{ AddResults?: YandexAddResult[] }>(
      auth,
      "sitelinks",
      "add",
      {
        SitelinksSets: sets.map((Sitelinks) => ({ Sitelinks })),
      },
      "createAds",
    );
    return idsFromAdd(data.AddResults, "createAds");
  }

  async addCallouts(auth: YandexAuth, texts: string[]): Promise<number[]> {
    if (texts.length === 0) return [];
    const data = await this.call<{ AddResults?: YandexAddResult[] }>(
      auth,
      "adextensions",
      "add",
      {
        AdExtensions: texts.map((CalloutText) => ({
          Callout: { CalloutText },
        })),
      },
      "createAds",
    );
    return idsFromAdd(data.AddResults, "createAds");
  }

  async getCampaignPerformance(
    auth: YandexAuth,
    range: { from: string; to: string; campaignIds: string[] },
  ): Promise<YandexPerformanceRow[]> {
    requireAuth(auth, "getPerformance");
    if (range.campaignIds.length === 0) return [];
    const tsv = await this.fetchReport(auth, {
      SelectionCriteria: {
        DateFrom: range.from,
        DateTo: range.to,
        Filter: [
          {
            Field: "CampaignId",
            Operator: "IN",
            Values: range.campaignIds,
          },
        ],
      },
      FieldNames: [
        "Date",
        "CampaignId",
        "Impressions",
        "Clicks",
        "Conversions",
        "Cost",
      ],
      ReportName: `perf-${range.from}-${range.to}`,
      ReportType: "CAMPAIGN_PERFORMANCE_REPORT",
      DateRangeType: "CUSTOM_DATE",
      Format: "TSV",
      IncludeVAT: "NO",
    });
    return parsePerformanceTsv(tsv);
  }

  async getSearchTerms(
    auth: YandexAuth,
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
    requireAuth(auth, "getSearchTerms");
    void range;
    return [];
  }

  private async fetchReport(
    auth: YandexAuth,
    params: unknown,
  ): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const res = await this.limiter.schedule(
        auth.projectId ?? "",
        "yandex_direct",
        () =>
          this.fetchImpl(`${this.baseUrl}/reports`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${auth.accessToken}`,
              "Content-Type": "application/json; charset=utf-8",
              skipReportHeader: "true",
              skipReportSummary: "true",
              returnMoneyInMicros: "false",
              processingMode: "auto",
              ...(auth.clientLogin ? { "Client-Login": auth.clientLogin } : {}),
            },
            body: JSON.stringify({ params }),
          }),
      );
      if (res.status === 200) {
        return res.text();
      }
      if (res.status === 201 || res.status === 202) {
        const retryAfter = Number(res.headers.get("retryIn") ?? "5");
        await sleep(Math.max(1000, retryAfter * 1000));
        continue;
      }
      const payload = (await res.json().catch(() => ({}))) as {
        error?: { error_detail?: string; error_string?: string };
      };
      const details =
        payload.error?.error_detail ||
        payload.error?.error_string ||
        `HTTP ${res.status}`;
      throw new PlatformApiError(
        humanizeDirectError(details, "getPerformance"),
        "getPerformance",
        details,
        RETRYABLE_HTTP.has(res.status),
      );
    }
    throw new PlatformApiError(
      "Yandex Direct report timed out",
      "getPerformance",
      "retries exhausted",
      true,
    );
  }

  private async call<T>(
    auth: YandexAuth,
    service: string,
    method: string,
    params: unknown,
    step: string,
  ): Promise<T> {
    requireAuth(auth, step);
    let lastError: unknown;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const res = await this.limiter.schedule(
          auth.projectId ?? "",
          "yandex_direct",
          () =>
            this.fetchImpl(`${this.baseUrl}/${service}`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${auth.accessToken}`,
                "Content-Type": "application/json; charset=utf-8",
                Accept: "application/json",
                ...(auth.clientLogin
                  ? { "Client-Login": auth.clientLogin }
                  : {}),
              },
              body: JSON.stringify({ method, params }),
            }),
        );
        const payload = (await res.json().catch(() => ({}))) as {
          error?: {
            error_code?: number;
            error_string?: string;
            error_detail?: string;
          };
          result?: T;
        };
        if (!res.ok || payload.error) {
          const code = payload.error?.error_code ?? res.status;
          const details =
            payload.error?.error_detail ||
            payload.error?.error_string ||
            `HTTP ${res.status}`;
          const retryable =
            RETRYABLE_HTTP.has(res.status) || RETRYABLE_CODES.has(code);
          if (retryable && attempt < 4) {
            await sleep(400 * 2 ** attempt);
            continue;
          }
          throw new PlatformApiError(
            humanizeDirectError(details, step),
            step,
            details,
            retryable,
          );
        }
        return (payload.result ?? {}) as T;
      } catch (err) {
        lastError = err;
        if (err instanceof PlatformApiError) {
          if (err.retryable && attempt < 4) {
            await sleep(400 * 2 ** attempt);
            continue;
          }
          throw err;
        }
        if (attempt < 4) {
          await sleep(400 * 2 ** attempt);
          continue;
        }
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new PlatformApiError("Yandex Direct request failed", step, String(lastError));
  }
}

function splitByWeights(total: number, weights: number[]): number[] {
  const sumW = weights.reduce((a, b) => a + b, 0);
  const out: number[] = [];
  let used = 0;
  for (let i = 0; i < weights.length; i += 1) {
    if (i === weights.length - 1) {
      out.push(total - used);
    } else {
      const n = Math.round((total * weights[i]) / sumW);
      out.push(n);
      used += n;
    }
  }
  return out;
}

function splitAdGroups(totals: {
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
}): Array<{
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
}> {
  const weights = [0.6, 0.4];
  const impressions = splitByWeights(totals.impressions, weights);
  const clicks = splitByWeights(totals.clicks, weights);
  const spend = splitByWeights(totals.spend, weights);
  const conversions = splitByWeights(totals.conversions, weights);
  return weights.map((_, index) => ({
    impressions: impressions[index],
    clicks: clicks[index],
    spend: spend[index],
    conversions: conversions[index],
  }));
}

export class MockYandexDirectApi implements YandexDirectApi {
  nextId = 1000;
  calls: Array<{ method: string; payload: unknown }> = [];

  failAt: string | null = null;

  private take(method: string, payload: unknown): number {
    this.calls.push({ method, payload });
    if (this.failAt === method) {
      throw new PlatformApiError(
        `Mock policy violation at ${method}`,
        method,
        "POLICY_VIOLATION",
        false,
      );
    }
    this.nextId += 1;
    return this.nextId;
  }

  async addCampaigns(auth: YandexAuth, campaigns: unknown[]): Promise<number[]> {
    requireAuth(auth, "createCampaign");
    return campaigns.map(() => this.take("createCampaign", campaigns));
  }

  async suspendCampaigns(auth: YandexAuth, ids: number[]): Promise<void> {
    requireAuth(auth, "suspendCampaign");
    this.calls.push({ method: "suspendCampaign", payload: ids });
  }

  async updateDailyBudget(
    auth: YandexAuth,
    campaignId: number,
    amount: number,
  ): Promise<void> {
    requireAuth(auth, "setBudget");
    this.take("setBudget", { campaignId, amount });
  }

  async updateCampaignNegatives(
    auth: YandexAuth,
    campaignId: number,
    negatives: string[],
  ): Promise<void> {
    requireAuth(auth, "addNegativeKeywords");
    this.calls.push({
      method: "addNegativeKeywords",
      payload: { campaignId, negatives },
    });
  }

  async addAdGroups(auth: YandexAuth, groups: unknown[]): Promise<number[]> {
    requireAuth(auth, "createAdGroups");
    return groups.map(() => this.take("createAdGroups", groups));
  }

  async updateAdGroupNegatives(
    auth: YandexAuth,
    adGroupId: number,
    negatives: string[],
  ): Promise<void> {
    requireAuth(auth, "addNegativeKeywords");
    this.calls.push({
      method: "addNegativeKeywords",
      payload: { adGroupId, negatives },
    });
  }

  async addAds(auth: YandexAuth, ads: unknown[]): Promise<number[]> {
    requireAuth(auth, "createAds");
    return ads.map(() => this.take("createAds", ads));
  }

  async addKeywords(auth: YandexAuth, keywords: unknown[]): Promise<number[]> {
    requireAuth(auth, "addKeywords");
    return keywords.map(() => this.take("addKeywords", keywords));
  }

  async addSitelinkSets(
    auth: YandexAuth,
    sets: Array<Array<{ Title: string; Href: string }>>,
  ): Promise<number[]> {
    requireAuth(auth, "createAds");
    return sets.map(() => this.take("sitelinks", sets));
  }

  async addCallouts(auth: YandexAuth, texts: string[]): Promise<number[]> {
    requireAuth(auth, "createAds");
    return texts.map(() => this.take("callouts", texts));
  }

  async getCampaignPerformance(
    auth: YandexAuth,
    range: { from: string; to: string; campaignIds: string[] },
  ): Promise<YandexPerformanceRow[]> {
    requireAuth(auth, "getPerformance");
    this.calls.push({ method: "getPerformance", payload: range });
    const rows: YandexPerformanceRow[] = [];
    const from = new Date(`${range.from}T00:00:00Z`);
    const to = new Date(`${range.to}T00:00:00Z`);
    for (const id of range.campaignIds) {
      for (let cursor = new Date(from); cursor <= to; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
        const seed = Number(id.replace(/\D/g, "").slice(-4) || "1") || 1;
        const day = cursor.getUTCDate();
        const impressions = 200 + seed + day * 10;
        const clicks = 10 + (seed % 7) + (day % 5);
        const spend = 400 + seed + day * 20;
        const conversions = 1 + (day % 3);
        const date = cursor.toISOString().slice(0, 10);
        const groups = splitAdGroups({
          impressions,
          clicks,
          spend,
          conversions,
        });
        groups.forEach((group, index) => {
          rows.push({
            date,
            externalCampaignId: id,
            adGroupExternalId: `${id}-g${index + 1}`,
            adGroupName: `Группа ${index + 1}`,
            ...group,
          });
        });
      }
    }
    return rows;
  }

  async getSearchTerms(
    auth: YandexAuth,
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
    requireAuth(auth, "getSearchTerms");
    this.calls.push({ method: "getSearchTerms", payload: range });
    return range.campaignIds.flatMap((id) =>
      ["скачать бесплатно", "торрент asus", "crack ключ"].map((phrase) => ({
        campaignId: id,
        phrase,
        clicks: 8,
        spend: 240,
        conversions: 0,
      })),
    );
  }
}

function requireAuth(auth: YandexAuth, step: string): void {
  if (!auth.accessToken) {
    throw new PlatformApiError(
      "Yandex Direct is not connected for this project",
      step,
      "missing access token",
    );
  }
}

function idsFromAdd(results: YandexAddResult[] | undefined, step: string): number[] {
  if (!results || results.length === 0) {
    throw new PlatformApiError("Yandex Direct returned no IDs", step, "empty AddResults");
  }
  return results.map((item, index) => {
    if (item.Errors && item.Errors.length > 0) {
      const details = item.Errors.map(
        (err) => err.Details || err.Message || `code ${err.Code}`,
      ).join("; ");
      throw new PlatformApiError(humanizeDirectError(details, step), step, details);
    }
    if (!item.Id) {
      throw new PlatformApiError(
        "Yandex Direct did not return an object id",
        step,
        `row ${index}`,
      );
    }
    return item.Id;
  });
}

export function humanizeDirectError(details: string, step: string): string {
  const lower = details.toLowerCase();
  if (lower.includes("policy") || lower.includes("модерац") || lower.includes("запрещ")) {
    return `Яндекс Директ отклонил материалы (${step}): ${details}`;
  }
  if (lower.includes("auth") || lower.includes("token") || lower.includes("login")) {
    return `Нет доступа к кабинету Яндекс Директа (${step}): ${details}`;
  }
  if (lower.includes("point") || lower.includes("units") || lower.includes("лимит")) {
    return `Превышен лимит API Яндекс Директа (${step}). Повторите позже.`;
  }
  return `Ошибка Яндекс Директа на шаге ${step}: ${details}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parsePerformanceTsv(tsv: string): YandexPerformanceRow[] {
  const lines = tsv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split("\t").map((item) => item.trim());
  const idx = (name: string) => header.indexOf(name);
  const dateI = idx("Date");
  const idI = idx("CampaignId");
  const impI = idx("Impressions");
  const clickI = idx("Clicks");
  const convI = idx("Conversions");
  const costI = idx("Cost");
  return lines.slice(1).map((line) => {
    const cols = line.split("\t");
    return {
      date: cols[dateI] ?? "",
      externalCampaignId: String(cols[idI] ?? ""),
      impressions: Number(cols[impI] ?? 0) || 0,
      clicks: Number(cols[clickI] ?? 0) || 0,
      conversions: Number(cols[convI] ?? 0) || 0,
      spend: Number(cols[costI] ?? 0) || 0,
    };
  });
}
