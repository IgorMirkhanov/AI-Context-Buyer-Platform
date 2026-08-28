import { createHash } from "crypto";
import { PlatformApiError } from "./types";

export type AttributionProviderName =
  | "bitrix24"
  | "amocrm"
  | "calltouch"
  | "roistat";

export type AttributionAuth = {
  accessToken: string;
  extra?: string;
};

export type ConversionRecord = {
  externalId: string;
  type: "lead" | "deal" | "call";
  occurredAt: string;
  amount: number | null;
  utmCampaign: string | null;
  phoneHash: string | null;
  title: string;
};

export interface AttributionApi {
  listConversions(
    auth: AttributionAuth,
    range: { from: string; to: string },
  ): Promise<ConversionRecord[]>;
}

export interface AttributionConnector {
  listConversions(
    projectId: string,
    dateRange: unknown,
    auth: AttributionAuth,
  ): Promise<ConversionRecord[]>;
  parseInbound(projectId: string, payload: unknown): ConversionRecord[];
}

export function hashPhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 5) return null;
  return createHash("sha256").update(digits).digest("hex");
}

export function redactSecret(value: string): string {
  return value
    .replace(/\/rest\/\d+\/[^/\s]+/gi, "/rest/***/***")
    .replace(/([?&](key|token|api[_-]?key)=)[^&\s]+/gi, "$1***");
}

export function createAttributionConnector(
  provider: AttributionProviderName,
  api: AttributionApi,
): AttributionConnector {
  return {
    async listConversions(projectId, dateRange, auth) {
      requireProject(projectId);
      if (!auth.accessToken) {
        throw new PlatformApiError(
          "Attribution source is not connected for this project",
          "auth",
          "missing token",
        );
      }
      const range = dateRange as { from?: string; to?: string };
      if (!range?.from || !range.to) {
        throw new Error("date range from/to is required");
      }
      try {
        return await api.listConversions(auth, { from: range.from, to: range.to });
      } catch (err) {
        if (err instanceof PlatformApiError) throw err;
        throw new PlatformApiError(
          `Ошибка ${provider}: ${redactSecret(err instanceof Error ? err.message : "request failed")}`,
          provider,
          redactSecret(String(err)),
        );
      }
    },
    parseInbound(projectId, payload) {
      requireProject(projectId);
      return parseInboundPayload(provider, payload);
    },
  };
}

export class MockAttributionApi implements AttributionApi {
  constructor(private readonly provider: AttributionProviderName) {}

  calls: Array<{ method: string; payload: unknown }> = [];

  async listConversions(
    auth: AttributionAuth,
    range: { from: string; to: string },
  ): Promise<ConversionRecord[]> {
    if (!auth.accessToken) {
      throw new PlatformApiError(
        "Attribution source is not connected for this project",
        "auth",
        "missing token",
      );
    }
    this.calls.push({ method: "listConversions", payload: { range, extra: auth.extra } });
    const type: ConversionRecord["type"] =
      this.provider === "calltouch" ? "call" : "lead";
    return [
      {
        externalId: `${this.provider}-1`,
        type,
        occurredAt: `${range.to}T12:00:00.000Z`,
        amount: this.provider === "amocrm" ? 15000 : null,
        utmCampaign: "555",
        phoneHash: hashPhone("79001234567"),
        title: type === "call" ? "Звонок" : "Заявка с сайта",
      },
      {
        externalId: `${this.provider}-2`,
        type,
        occurredAt: `${range.to}T15:00:00.000Z`,
        amount: null,
        utmCampaign: null,
        phoneHash: null,
        title: type === "call" ? "Звонок без UTM" : "Заявка без UTM",
      },
    ];
  }
}

export class LiveBitrix24Api implements AttributionApi {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async listConversions(
    auth: AttributionAuth,
    range: { from: string; to: string },
  ): Promise<ConversionRecord[]> {
    const base = auth.accessToken.replace(/\/$/, "");
    const res = await this.fetchImpl(`${base}/crm.lead.list.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filter: { ">=DATE_CREATE": range.from, "<=DATE_CREATE": range.to },
        select: ["ID", "TITLE", "DATE_CREATE", "UTM_CAMPAIGN", "OPPORTUNITY", "PHONE"],
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      result?: Array<Record<string, unknown>>;
      error_description?: string;
    };
    if (!res.ok) {
      throw new PlatformApiError(
        `Bitrix24 отклонил запрос: ${redactSecret(json.error_description ?? `HTTP ${res.status}`)}`,
        "bitrix24",
        redactSecret(json.error_description ?? `HTTP ${res.status}`),
      );
    }
    return (json.result ?? []).map((row) => fromBitrixLead(row));
  }
}

export class LiveAmoCrmApi implements AttributionApi {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async listConversions(
    auth: AttributionAuth,
    range: { from: string; to: string },
  ): Promise<ConversionRecord[]> {
    const subdomain = auth.extra?.trim();
    if (!subdomain) {
      throw new PlatformApiError(
        "Для amoCRM нужен поддомен",
        "amocrm",
        "missing subdomain",
      );
    }
    const res = await this.fetchImpl(
      `https://${subdomain}.amocrm.ru/api/v4/leads?filter[updated_at][from]=${Date.parse(`${range.from}T00:00:00Z`) / 1000}&filter[updated_at][to]=${Date.parse(`${range.to}T23:59:59Z`) / 1000}`,
      { headers: { Authorization: `Bearer ${auth.accessToken}` } },
    );
    const json = (await res.json().catch(() => ({}))) as {
      _embedded?: { leads?: Array<Record<string, unknown>> };
      title?: string;
    };
    if (!res.ok) {
      throw new PlatformApiError(
        `amoCRM отклонил запрос: HTTP ${res.status}`,
        "amocrm",
        `HTTP ${res.status}`,
      );
    }
    return (json._embedded?.leads ?? []).map((row) => ({
      externalId: String(row.id ?? ""),
      type: "lead" as const,
      occurredAt: new Date(Number(row.created_at ?? 0) * 1000).toISOString(),
      amount: row.price == null ? null : Number(row.price),
      utmCampaign: asString(row.utm_campaign),
      phoneHash: null,
      title: asString(row.name) || "Сделка amoCRM",
    }));
  }
}

export class LiveCalltouchApi implements AttributionApi {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async listConversions(
    auth: AttributionAuth,
    range: { from: string; to: string },
  ): Promise<ConversionRecord[]> {
    const siteId = auth.extra?.trim();
    if (!siteId) {
      throw new PlatformApiError(
        "Для Calltouch нужен siteId",
        "calltouch",
        "missing siteId",
      );
    }
    const params = new URLSearchParams({
      dateFrom: range.from,
      dateTo: range.to,
    });
    const res = await this.fetchImpl(
      `https://api.calltouch.ru/calls-service/RestAPI/${siteId}/calls-diary/calls?${params.toString()}`,
      { headers: { AccessToken: auth.accessToken } },
    );
    const json = (await res.json().catch(() => [])) as
      | Array<Record<string, unknown>>
      | { records?: Array<Record<string, unknown>> };
    if (!res.ok) {
      throw new PlatformApiError(
        `Calltouch отклонил запрос: HTTP ${res.status}`,
        "calltouch",
        `HTTP ${res.status}`,
      );
    }
    const rows = Array.isArray(json) ? json : (json.records ?? []);
    return rows.map((row) => ({
      externalId: String(row.callId ?? row.id ?? ""),
      type: "call" as const,
      occurredAt: String(row.date ?? `${range.to}T00:00:00.000Z`),
      amount: null,
      utmCampaign: asString(row.utmCampaign ?? row.utm_campaign),
      phoneHash: hashPhone(asString(row.callerNumber ?? row.phone)),
      title: "Звонок",
    }));
  }
}

export class LiveRoistatApi implements AttributionApi {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async listConversions(
    auth: AttributionAuth,
    range: { from: string; to: string },
  ): Promise<ConversionRecord[]> {
    const project = auth.extra?.trim();
    if (!project) {
      throw new PlatformApiError(
        "Для Roistat нужен project id",
        "roistat",
        "missing project",
      );
    }
    const params = new URLSearchParams({
      key: auth.accessToken,
      project,
      from: range.from,
      to: range.to,
    });
    const res = await this.fetchImpl(
      `https://cloud.roistat.com/api/v1/project/leads?${params.toString()}`,
    );
    const json = (await res.json().catch(() => ({}))) as {
      data?: Array<Record<string, unknown>>;
      error?: string;
    };
    if (!res.ok || json.error) {
      throw new PlatformApiError(
        `Roistat отклонил запрос: ${redactSecret(json.error ?? `HTTP ${res.status}`)}`,
        "roistat",
        redactSecret(json.error ?? `HTTP ${res.status}`),
      );
    }
    return (json.data ?? []).map((row) => ({
      externalId: String(row.id ?? ""),
      type: "lead" as const,
      occurredAt: String(row.date ?? `${range.to}T00:00:00.000Z`),
      amount: row.cost == null ? null : Number(row.cost),
      utmCampaign: asString(row.utm_campaign),
      phoneHash: hashPhone(asString(row.phone)),
      title: asString(row.title) || "Лид Roistat",
    }));
  }
}

export function parseInboundPayload(
  provider: AttributionProviderName,
  payload: unknown,
): ConversionRecord[] {
  const body = (payload ?? {}) as Record<string, unknown>;
  if (provider === "bitrix24") {
    const fields = (body.fields as Record<string, unknown> | undefined) ?? body;
    const id = String(fields.ID ?? fields.id ?? body.id ?? "");
    if (!id) return [];
    return [fromBitrixLead({ ...fields, ID: id })];
  }
  if (provider === "calltouch") {
    const id = String(body.callId ?? body.id ?? "");
    if (!id) return [];
    return [
      {
        externalId: id,
        type: "call",
        occurredAt: String(body.date ?? new Date().toISOString()),
        amount: null,
        utmCampaign: asString(body.utmCampaign ?? body.utm_campaign),
        phoneHash: hashPhone(asString(body.callerNumber ?? body.phone)),
        title: "Звонок",
      },
    ];
  }
  if (provider === "amocrm") {
    const leads =
      (body.leads as { add?: Array<Record<string, unknown>> } | undefined)?.add ??
      [];
    return leads
      .map((row) => ({
        externalId: String(row.id ?? ""),
        type: "lead" as const,
        occurredAt: new Date().toISOString(),
        amount: row.price == null ? null : Number(row.price),
        utmCampaign: asString(row.utm_campaign),
        phoneHash: null,
        title: asString(row.name) || "Сделка amoCRM",
      }))
      .filter((row) => row.externalId);
  }
  const id = String(body.id ?? "");
  if (!id) return [];
  return [
    {
      externalId: id,
      type: "lead",
      occurredAt: String(body.date ?? new Date().toISOString()),
      amount: body.cost == null ? null : Number(body.cost),
      utmCampaign: asString(body.utm_campaign),
      phoneHash: hashPhone(asString(body.phone)),
      title: asString(body.title) || "Лид Roistat",
    },
  ];
}

function fromBitrixLead(row: Record<string, unknown>): ConversionRecord {
  const phoneRaw = Array.isArray(row.PHONE)
    ? asString((row.PHONE[0] as { VALUE?: string } | undefined)?.VALUE)
    : asString(row.PHONE);
  return {
    externalId: String(row.ID ?? row.id ?? ""),
    type: "lead",
    occurredAt: String(row.DATE_CREATE ?? new Date().toISOString()),
    amount: row.OPPORTUNITY == null || row.OPPORTUNITY === "" ? null : Number(row.OPPORTUNITY),
    utmCampaign: asString(row.UTM_CAMPAIGN ?? row.utm_campaign),
    phoneHash: hashPhone(phoneRaw),
    title: asString(row.TITLE) || "Лид Bitrix24",
  };
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return value == null ? null : String(value);
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function requireProject(projectId: string): void {
  if (!projectId) {
    throw new Error("projectId is required");
  }
}
