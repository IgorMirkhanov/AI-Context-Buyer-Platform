"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { formatCabinetSpend, cabinetCurrencySymbol } from "@/lib/cabinet-currency";
import type { CampaignRef } from "@/lib/project-campaign-refs";
import { ProjectContextPanel } from "@/components/project-context-panel";
import { cabinetCampaignUrl } from "@/lib/ad-platform-links";
import { Alert } from "@/ui/alert";
import { Badge } from "@/ui/badge";
import { btnClass } from "@/ui/button";
import { Card, CardHint, CardTitle } from "@/ui/card";
import { AreaChart, BarChart } from "@/ui/charts";
import { KpiCard, KpiGrid, SegmentedControl, StatusDot } from "@/ui/kpi";
import { TermHint, BeginnerNote } from "@/ui/term-hint";

export type ChartPoint = {
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  ctr?: number;
  cpc?: number;
  cpl?: number | null;
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

export type ReportResult = {
  report: {
    period: { from: string; to: string };
    metrics: MetricsSummary;
    vs_goal: {
      target_cpl: number;
      actual_cpl: number | null;
      delta: number | null;
      status: string;
    };
    insights: string[];
  };
  series: ChartPoint[];
  campaigns?: Array<{
    id: string;
    name: string;
    externalCampaignId: string;
    status: string;
    source?: "platform" | "external";
    metrics: MetricsSummary;
    series: ChartPoint[];
  }>;
  adGroups?: Array<{
    campaignId: string;
    externalId: string;
    name: string;
    metrics: MetricsSummary;
    series: ChartPoint[];
  }>;
  pacing?: {
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
  spend7d?: {
    amount: number;
    currency: string;
    period: { from: string; to: string };
  };
  llmUsage?: {
    calls: number;
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
  };
};

export type AttributionResult = {
  period: { from: string; to: string };
  connections: Array<{ provider: string; inboundUrl: string }>;
  events: Array<{
    id: string;
    provider: string;
    type: string;
    title: string;
    occurredAt: string;
    utmCampaign: string | null;
    amount: number | null;
  }>;
  summary: {
    leads: number;
    ads_conversions: number;
    spend: number;
    attributed_cpl: number | null;
    vs_goal: { target_cpl: number; status: string };
    insights: string[];
  };
};

type PeriodDays = 7 | 30 | 90;
type CampaignSourceFilter = "all" | "platform" | "external";
type CabinetMetric =
  | "impressions"
  | "clicks"
  | "ctr"
  | "cpc"
  | "spend"
  | "conversions"
  | "cpl";

const CABINET_METRICS: Array<{ key: CabinetMetric; label: string }> = [
  { key: "impressions", label: "Показы" },
  { key: "clicks", label: "Клики" },
  { key: "ctr", label: "CTR" },
  { key: "cpc", label: "CPC" },
  { key: "spend", label: "Расход" },
  { key: "conversions", label: "Конверсии кабинета" },
  { key: "cpl", label: "CPL кабинета" },
];

function addUtcDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function periodForDays(days: PeriodDays): { from: string; to: string } {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const to = end.toISOString().slice(0, 10);
  return { from: addUtcDays(to, -(days - 1)), to };
}

function enumerateDates(from: string, to: string): string[] {
  const out: string[] = [];
  for (let cur = from; cur <= to; cur = addUtcDays(cur, 1)) out.push(cur);
  return out;
}

function metricValue(point: ChartPoint, key: CabinetMetric): number {
  if (key === "ctr") return point.ctr ?? 0;
  if (key === "cpc") return point.cpc ?? 0;
  if (key === "cpl") return point.cpl ?? 0;
  return point[key];
}

function formatMetric(value: number, key: CabinetMetric): string {
  if (key === "ctr") return `${value.toFixed(2)}%`;
  if (key === "cpc" || key === "spend" || key === "cpl") return value.toFixed(2);
  return String(Math.round(value));
}

function goalTone(status: string): "success" | "danger" | "info" | "draft" {
  if (status === "better") return "success";
  if (status === "worse") return "danger";
  if (status === "on_target") return "info";
  return "draft";
}

function goalLabel(status: string): string {
  if (status === "better") return "ниже цели";
  if (status === "worse") return "выше цели";
  if (status === "on_target") return "на цели";
  return "нет конверсий";
}

export function AnalyticsPanel({
  projectId,
  report: seedReport,
  attribution: seedAttribution,
  pending,
  readOnly,
  inboundHint,
  attrProvider,
  attrToken,
  attrExtra,
  setAttrProvider,
  setAttrToken,
  setAttrExtra,
  onCollectReport,
  onConnectAttribution,
  onCollectAttribution,
  cabinetConnected,
  cabinetNeedsReconnect = false,
  hasPlatformCampaigns,
  hasAnyCampaigns,
  hasCampaignDraft,
  reportError,
  analyzedWebsiteUrl = null,
  platform = "yandex_direct",
  campaignRefs = [],
}: {
  projectId: string;
  report: ReportResult | null;
  attribution: AttributionResult | null;
  pending: boolean;
  readOnly: boolean;
  inboundHint: string | null;
  attrProvider: string;
  attrToken: string;
  attrExtra: string;
  setAttrProvider: (value: string) => void;
  setAttrToken: (value: string) => void;
  setAttrExtra: (value: string) => void;
  onCollectReport: () => Promise<void>;
  onConnectAttribution: () => Promise<void>;
  onCollectAttribution: () => Promise<void>;
  cabinetConnected: boolean;
  cabinetNeedsReconnect?: boolean;
  hasPlatformCampaigns: boolean;
  hasAnyCampaigns: boolean;
  hasCampaignDraft: boolean;
  reportError: string | null;
  analyzedWebsiteUrl?: string | null;
  platform?: string;
  campaignRefs?: CampaignRef[];
}) {
  const [days, setDays] = useState<PeriodDays>(7);
  const [sourceFilter, setSourceFilter] = useState<CampaignSourceFilter>("all");
  const [metric, setMetric] = useState<CabinetMetric>("spend");
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [adGroupId, setAdGroupId] = useState<string | null>(null);
  const [view, setView] = useState<ReportResult | null>(seedReport);
  const [attribution, setAttribution] = useState<AttributionResult | null>(
    seedAttribution,
  );

  useEffect(() => {
    let cancelled = false;
    const { from, to } = periodForDays(days);
    const reportMatches =
      seedReport?.report.period.from === from &&
      seedReport?.report.period.to === to &&
      sourceFilter === "all";
    const attrMatches =
      seedAttribution?.period.from === from &&
      seedAttribution?.period.to === to;
    if (reportMatches) setView(seedReport);
    else {
      void api<ReportResult>(
        `/projects/${projectId}/reports?from=${from}&to=${to}&source=${sourceFilter}`,
      )
        .then((data) => {
          if (!cancelled) setView(data);
        })
        .catch(() => undefined);
    }
    if (attrMatches) setAttribution(seedAttribution);
    else {
      void api<AttributionResult>(
        `/projects/${projectId}/attribution?from=${from}&to=${to}`,
      )
        .then((data) => {
          if (!cancelled) setAttribution(data);
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [days, projectId, seedReport, seedAttribution, sourceFilter]);

  const selectedCampaign = (view?.campaigns ?? []).find(
    (item) => item.id === campaignId,
  );
  const groups = (view?.adGroups ?? []).filter((item) =>
    campaignId ? item.campaignId === campaignId : true,
  );
  const selectedGroup = groups.find(
    (item) =>
      item.campaignId === campaignId && item.externalId === adGroupId,
  );

  const chartSeries = selectedGroup?.series
    ?? selectedCampaign?.series
    ?? view?.series
    ?? [];
  const chartMetrics = selectedGroup?.metrics
    ?? selectedCampaign?.metrics
    ?? view?.report.metrics;

  const leads = useMemo(() => {
    const period = view?.report.period ?? attribution?.period;
    if (!period) return [];
    const byDate = new Map<string, number>();
    for (const event of attribution?.events ?? []) {
      const date = event.occurredAt.slice(0, 10);
      if (date < period.from || date > period.to) continue;
      byDate.set(date, (byDate.get(date) ?? 0) + 1);
    }
    return enumerateDates(period.from, period.to).map((date) => ({
      date,
      leads: byDate.get(date) ?? 0,
    }));
  }, [attribution, view]);

  return (
    <>
      <Card>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Аналитика кабинета</CardTitle>
            <CardHint>
              {view
                ? `${view.report.period.from} — ${view.report.period.to}`
                : "Снимков ещё нет. После запуска кампании нажмите «Обновить статистику»."}
            </CardHint>
          </div>
          <StatusDot
            tone={
              cabinetNeedsReconnect
                ? "warn"
                : cabinetConnected
                  ? "ok"
                  : "off"
            }
            label={
              cabinetNeedsReconnect
                ? "нужен reconnect"
                : cabinetConnected
                  ? "кабинет online"
                  : "кабинет offline"
            }
          />
        </div>
        <div className="mb-3">
          <ProjectContextPanel
            websiteUrl={analyzedWebsiteUrl}
            platform={platform}
            connected={cabinetConnected}
            needsReconnect={cabinetNeedsReconnect}
            campaignRefs={campaignRefs}
            compact
          />
        </div>
        {cabinetNeedsReconnect ? (
          <Alert tone="danger" className="mb-3" title="Требуется переподключение">
            OAuth-токен есть, но API рекламного кабинета недоступен. Переподключите
            кабинет в блоке «Подключение кабинета» выше.
          </Alert>
        ) : !cabinetConnected ? (
          <Alert tone="alert" className="mb-3" title="Кабинет не подключён">
            Подключите {`Яндекс Директ / Google Ads`} в блоке «Подключение кабинета»
            выше — без OAuth статистику из рекламной платформы не получить.
          </Alert>
        ) : !hasAnyCampaigns ? (
          <Alert tone="info" className="mb-3" title="Кабинет подключён — ждём список кампаний">
            OAuth работает. Синхронизация кампаний из кабинета выполняется автоматически
            (раз в несколько часов) или после нажатия «Обновить статистику».
            {!hasPlatformCampaigns && hasCampaignDraft ? (
              <>
                {" "}
                Черновик платформы готов — откройте вкладку{" "}
                <Link
                  href={`/projects/${projectId}?tab=campaign`}
                  className="font-medium underline"
                >
                  «Кампания»
                </Link>
                , чтобы запустить свою кампанию.
              </>
            ) : null}
          </Alert>
        ) : !hasPlatformCampaigns ? (
          <Alert tone="info" className="mb-3" title="Только кампании из кабинета">
            В аналитике показаны кампании, созданные до подключения платформы.
            Оптимизация и автопилот применяются только к кампаниям, запущенным через платформу.
          </Alert>
        ) : null}
        {reportError ? (
          <Alert tone="danger" className="mb-3">
            {reportError}
          </Alert>
        ) : null}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            ariaLabel="Период отчёта"
            value={String(days) as "7" | "30" | "90"}
            options={[
              { value: "7", label: "7 дней" },
              { value: "30", label: "30 дней" },
              { value: "90", label: "90 дней" },
            ]}
            onChange={(v) => {
              setDays(Number(v) as PeriodDays);
              setCampaignId(null);
              setAdGroupId(null);
            }}
          />
          <SegmentedControl
            ariaLabel="Источник кампаний"
            value={sourceFilter}
            options={[
              { value: "all", label: "Все" },
              { value: "platform", label: "Платформа" },
              { value: "external", label: "Из кабинета" },
            ]}
            onChange={(v) => {
              setSourceFilter(v);
              setCampaignId(null);
              setAdGroupId(null);
            }}
          />
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            className={btnClass("primary")}
            onClick={() => void onCollectReport()}
            disabled={pending || readOnly || !cabinetConnected || !hasAnyCampaigns}
          >
            {pending ? "Собираем…" : "Обновить статистику"}
          </button>
          {cabinetConnected && !hasAnyCampaigns && hasCampaignDraft ? (
            <Link
              href={`/projects/${projectId}?tab=campaign`}
              className={btnClass("secondary")}
            >
              Перейти к публикации
            </Link>
          ) : null}
        </div>
        {view ? (
          <div className="flex flex-col gap-4 text-sm">
            <Spend7dBlock spend7d={view.spend7d} />
            <div className="flex flex-wrap items-center gap-2">
              <Badge kind="info">Рекламный кабинет</Badge>
              <span className="text-xs text-[var(--fg-muted)]">
                Показы, клики и расход — из Директа / Google Ads, не из CRM
              </span>
            </div>
            <KpiGrid cols={5}>
              <KpiCard
                label="Показы"
                value={(chartMetrics?.impressions ?? view.report.metrics.impressions).toLocaleString("ru-RU")}
                spark={chartSeries.map((p) => p.impressions)}
                hint={`${days} дн. · drill-down ниже`}
              />
              <KpiCard
                label="Клики"
                value={(chartMetrics?.clicks ?? view.report.metrics.clicks).toLocaleString("ru-RU")}
                spark={chartSeries.map((p) => p.clicks)}
                tone="secondary"
              />
              <KpiCard
                label="Расход"
                value={String(chartMetrics?.spend ?? view.report.metrics.spend)}
                spark={chartSeries.map((p) => p.spend)}
                hint="из кабинета"
              />
              <KpiCard
                label={<TermHint term="cpl">CPL / цель</TermHint>}
                value={`${chartMetrics?.cpl ?? view.report.metrics.cpl ?? "—"} / ${view.report.vs_goal.target_cpl}`}
                tone={
                  view.report.vs_goal.status === "worse"
                    ? "danger"
                    : view.report.vs_goal.status === "better"
                      ? "secondary"
                      : "accent"
                }
              />
              <KpiCard
                label="LLM $"
                value={
                  view.llmUsage
                    ? `$${view.llmUsage.costUsd.toFixed(4)}`
                    : "—"
                }
                hint="по project_id · вкладка Расходы"
              />
            </KpiGrid>
            <div className="grid gap-4 lg:grid-cols-2">
              <CplGoalMeter
                actual={view.report.vs_goal.actual_cpl}
                target={view.report.vs_goal.target_cpl}
                status={view.report.vs_goal.status}
              />
              <PacingBar pacing={view.pacing} />
            </div>
            <div className="flex flex-wrap gap-2">
              {CABINET_METRICS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={metric === item.key}
                  className={btnClass(
                    metric === item.key ? "primary" : "secondary",
                    "px-3 py-1 text-xs",
                  )}
                  onClick={() => setMetric(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <AreaChart
              points={chartSeries.map((point) => ({
                date: point.date,
                value: metricValue(point, metric),
              }))}
              label={CABINET_METRICS.find((item) => item.key === metric)?.label ?? metric}
              format={(value) => formatMetric(value, metric)}
              emptyHint="Графика пока нет — нажмите «Обновить статистику» после показов."
            />
            {(view.campaigns?.length ?? 0) > 0 && !selectedCampaign ? (
              <BarChart
                label="Расход по кампаниям"
                items={(view.campaigns ?? []).map((c) => ({
                  id: c.id,
                  label: c.name,
                  value: c.metrics.spend,
                }))}
                format={(v) => v.toFixed(2)}
              />
            ) : null}
            <DrillNav
              campaignName={selectedCampaign?.name ?? null}
              groupName={selectedGroup?.name ?? null}
              onAll={() => {
                setCampaignId(null);
                setAdGroupId(null);
              }}
              onCampaign={() => setAdGroupId(null)}
            />
            {!selectedCampaign ? (
              <BreakdownTable
                caption="Кампании"
                platform={platform}
                rows={(view.campaigns ?? []).map((item) => ({
                  id: item.id,
                  name: item.name,
                  metrics: item.metrics,
                  status: item.status,
                  source: item.source,
                  externalCampaignId: item.externalCampaignId,
                }))}
                onSelect={(id) => {
                  setCampaignId(id);
                  setAdGroupId(null);
                }}
              />
            ) : (
              <BreakdownTable
                caption="Группы объявлений"
                platform={platform}
                rows={groups.map((item) => ({
                  id: `${item.campaignId}:${item.externalId}`,
                  name: item.name,
                  metrics: item.metrics,
                }))}
                selectedId={
                  selectedGroup
                    ? `${selectedGroup.campaignId}:${selectedGroup.externalId}`
                    : null
                }
                onSelect={(id) => {
                  const ext = id.split(":").slice(1).join(":");
                  setAdGroupId(ext);
                }}
                empty="По группам пока только итог кампании — кабинет отдал строки без AdGroupId."
              />
            )}
            {view.report.insights.length > 0 ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {view.report.insights.map((item) => (
                  <li
                    key={item}
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg)]/60 px-3 py-2 text-xs text-[var(--fg-muted)]"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="font-mono text-[11px] text-[var(--fg-faint)]">
              CTR {view.report.metrics.ctr}% · CPC {view.report.metrics.cpc} ·
              цель CPL {view.report.vs_goal.status}
            </p>
          </div>
        ) : null}
      </Card>

      <Card>
        <CardTitle>Сквозная аналитика</CardTitle>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge kind="alert">CRM / Calltouch / Roistat</Badge>
          <span className="text-xs text-[var(--fg-muted)]">
            Лиды и attributed CPL не смешиваются с кликами и расходом кабинета
          </span>
        </div>
        <CardHint>
          Лиды из Bitrix24 / amoCRM / Calltouch / Roistat сравниваются с
          расходом кампании. Телефоны хранятся только как hash. Токен
          шифруется и в UI не возвращается.
        </CardHint>
        <div className="mb-3 flex flex-col gap-2">
          <select
            className="ui-input"
            value={attrProvider}
            onChange={(event) => setAttrProvider(event.target.value)}
          >
            <option value="bitrix24">Bitrix24</option>
            <option value="amocrm">amoCRM</option>
            <option value="calltouch">Calltouch</option>
            <option value="roistat">Roistat</option>
          </select>
          <input
            className="ui-input"
            placeholder={
              attrProvider === "bitrix24"
                ? "Webhook URL Bitrix24"
                : "API-токен"
            }
            value={attrToken}
            onChange={(event) => setAttrToken(event.target.value)}
          />
          {attrProvider !== "bitrix24" ? (
            <input
              className="ui-input"
              placeholder={
                attrProvider === "amocrm"
                  ? "Поддомен amoCRM"
                  : attrProvider === "calltouch"
                    ? "siteId Calltouch"
                    : "project id Roistat"
              }
              value={attrExtra}
              onChange={(event) => setAttrExtra(event.target.value)}
            />
          ) : null}
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            className={btnClass("primary")}
            onClick={() => void onConnectAttribution()}
            disabled={pending || readOnly || !attrToken}
          >
            Подключить источник
          </button>
          <button
            className={btnClass("secondary")}
            onClick={() => void onCollectAttribution()}
            disabled={pending || readOnly}
          >
            Подтянуть лиды
          </button>
        </div>
        {inboundHint ? (
          <p className="mb-3 text-xs text-[var(--fg-muted)]">{inboundHint}</p>
        ) : null}
        {attribution?.connections.length ? (
          <p className="mb-2 text-xs text-[var(--fg-muted)]">
            Подключено:{" "}
            {attribution.connections.map((item) => item.provider).join(", ")}
          </p>
        ) : null}
        {attribution ? (
          <div className="flex flex-col gap-3 text-sm">
            <KpiGrid cols={4}>
              <KpiCard label="Лиды CRM" value={String(attribution.summary.leads)} tone="alert" />
              <KpiCard
                label="Конверсии кабинета"
                value={String(attribution.summary.ads_conversions)}
              />
              <KpiCard
                label={<TermHint term="cpl">Attributed CPL</TermHint>}
                value={String(attribution.summary.attributed_cpl ?? "—")}
                tone="secondary"
              />
              <KpiCard
                label="Цель CPL"
                value={String(attribution.summary.vs_goal.target_cpl)}
              />
            </KpiGrid>
            <AttributedCplMeter
              actual={attribution.summary.attributed_cpl}
              target={attribution.summary.vs_goal.target_cpl}
              status={attribution.summary.vs_goal.status}
            />
            <AreaChart
              points={leads.map((row) => ({ date: row.date, value: row.leads }))}
              label="Лиды CRM по дням"
              format={(value) => String(Math.round(value))}
              tone="alert"
              emptyHint="Лидов за период нет."
            />
            <ul className="grid gap-2 sm:grid-cols-2">
              {attribution.summary.insights.map((item) => (
                <li
                  key={item}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg)]/60 px-3 py-2 text-xs text-[var(--fg-muted)]"
                >
                  {item}
                </li>
              ))}
            </ul>
            {attribution.events.length > 0 ? (
              <ul className="text-xs text-[var(--fg-muted)]">
                {attribution.events.slice(0, 8).map((item) => (
                  <li key={item.id}>
                    {item.provider} · {item.type} · {item.title}
                    {item.utmCampaign ? ` · utm ${item.utmCampaign}` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[var(--fg-muted)]">Лидов за период нет.</p>
            )}
          </div>
        ) : null}
      </Card>
    </>
  );
}

function Spend7dBlock({
  spend7d,
}: {
  spend7d?: ReportResult["spend7d"];
}) {
  if (!spend7d) return null;
  const label = formatCabinetSpend(spend7d.amount, spend7d.currency);
  return (
    <div className="ui-kpi">
      <p className="text-[11px] text-[var(--outline)]">Потрачено за 7 дней</p>
      <p className="mt-1 font-mono text-3xl font-semibold tracking-tight">{label}</p>
      <p className="mt-2 border-t border-[var(--border)] pt-2 font-mono text-[11px] text-[var(--fg-faint)]">
        {spend7d.period.from} — {spend7d.period.to} · сумма по кампаниям из
        кабинета
        {spend7d.amount === 0
          ? " · нажмите «Обновить статистику» после показов"
          : ""}
      </p>
    </div>
  );
}

function DrillNav({
  campaignName,
  groupName,
  onAll,
  onCampaign,
}: {
  campaignName: string | null;
  groupName: string | null;
  onAll: () => void;
  onCampaign: () => void;
}) {
  return (
    <p className="text-xs text-[var(--fg-muted)]">
      <button type="button" className="underline" onClick={onAll}>
        Все кампании
      </button>
      {campaignName ? (
        <>
          {" · "}
          <button type="button" className="underline" onClick={onCampaign}>
            {campaignName}
          </button>
        </>
      ) : null}
      {groupName ? <> · {groupName}</> : null}
    </p>
  );
}

function BreakdownTable({
  caption,
  platform,
  rows,
  selectedId,
  onSelect,
  empty,
}: {
  caption: string;
  platform?: string;
  rows: Array<{
    id: string;
    name: string;
    metrics: MetricsSummary;
    status?: string;
    source?: "platform" | "external";
    externalCampaignId?: string;
  }>;
  selectedId?: string | null;
  onSelect: (id: string) => void;
  empty?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-xs text-[var(--fg-muted)]">
        {empty ??
          "Нет разбивки за период. Выберите кампанию выше или нажмите «Обновить статистику»."}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="ui-table">
        <caption className="mb-1 text-left text-xs text-[var(--fg-muted)]">
          {caption}
        </caption>
        <thead>
          <tr>
            <th className="py-1 pr-3">Название</th>
            <th className="py-1 pr-3">Показы</th>
            <th className="py-1 pr-3">Клики</th>
            <th className="py-1 pr-3">Расход</th>
            <th className="py-1">
              <TermHint term="cpl">CPL</TermHint>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const cabinetUrl =
              row.externalCampaignId != null
                ? cabinetCampaignUrl(platform ?? "yandex_direct", row.externalCampaignId)
                : null;
            return (
            <tr
              key={row.id}
              className={
                selectedId === row.id
                  ? "bg-[var(--status-info-bg)]"
                  : "hover:bg-[var(--bg-mid)]"
              }
            >
              <td className="py-1 pr-3">
                <button
                  type="button"
                  className="text-left underline"
                  onClick={() => onSelect(row.id)}
                >
                  {row.name}
                </button>
                <div className="mt-1 flex flex-wrap gap-1">
                  {row.source === "external" ? (
                    <Badge kind="draft">из кабинета</Badge>
                  ) : row.source === "platform" ? (
                    <Badge kind="info">платформа</Badge>
                  ) : null}
                  {row.status === "archived" ? (
                    <Badge kind="draft">архив</Badge>
                  ) : null}
                </div>
                {row.externalCampaignId ? (
                  <p className="mt-1 text-xs text-[var(--fg-muted)]">
                    ID:{" "}
                    {cabinetUrl ? (
                      <a
                        href={cabinetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono underline-offset-2 hover:underline"
                        onClick={(event) => event.stopPropagation()}
                      >
                        №{row.externalCampaignId}
                      </a>
                    ) : (
                      <span className="font-mono">№{row.externalCampaignId}</span>
                    )}
                  </p>
                ) : null}
              </td>
              <td className="py-1 pr-3">{row.metrics.impressions}</td>
              <td className="py-1 pr-3">{row.metrics.clicks}</td>
              <td className="py-1 pr-3">{row.metrics.spend}</td>
              <td className="py-1">{row.metrics.cpl ?? "—"}</td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PacingBar({
  pacing,
}: {
  pacing?: ReportResult["pacing"];
}) {
  if (!pacing) return null;
  const max = Math.max(pacing.plan ?? 0, pacing.actual, pacing.forecast ?? 0, 1);
  const planPct = pacing.plan != null ? (pacing.plan / max) * 100 : 0;
  const actualPct = (pacing.actual / max) * 100;
  const forecastPct =
    pacing.forecast != null ? (pacing.forecast / max) * 100 : null;
  const unit = cabinetCurrencySymbol(pacing.currency);
  return (
    <div>
      <p className="mb-1 text-xs font-medium">
        <TermHint term="pacing">Пейсинг бюджета</TermHint>
      </p>
      <BeginnerNote term="pacing" className="mb-2" />
      <p className="mb-2 text-xs text-[var(--fg-muted)]">
        План {pacing.plan == null ? "—" : `${pacing.plan} ${unit}`} · факт{" "}
        {pacing.actual} {unit}
        {pacing.forecast == null
          ? " · прогноз недоступен (нет расхода)"
          : ` · прогноз ${pacing.forecast} ${unit}`}
      </p>
      <div className="relative h-4 overflow-hidden rounded-full bg-[var(--bg-high)]">
        {pacing.plan != null ? (
          <div
            className="absolute inset-y-0 left-0 bg-[var(--status-info-bg)]"
            style={{ width: `${planPct}%` }}
          />
        ) : null}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)]"
          style={{ width: `${actualPct}%` }}
        />
        {forecastPct != null ? (
          <div
            className="absolute top-0 h-full w-0.5 bg-[var(--status-alert-fg)]"
            style={{ left: `${forecastPct}%` }}
            title="Прогноз"
          />
        ) : null}
      </div>
      <p className="mt-1 text-[11px] text-[var(--fg-muted)]">
        Полоса — факт, маркер — прогноз на конец периода при текущем темпе.
        {pacing.daysWithData === 0
          ? " Нет дней с расходом."
          : pacing.elapsedDays >= pacing.periodDays
            ? " Период закрыт, прогноз равен факту."
            : ""}
      </p>
    </div>
  );
}

function CplGoalMeter({
  actual,
  target,
  status,
}: {
  actual: number | null;
  target: number;
  status: string;
}) {
  const hasTarget = target > 0;
  const max = Math.max(actual ?? 0, hasTarget ? target : 0, 1) * 1.25;
  const actualPct = actual == null ? 0 : (actual / max) * 100;
  const targetPct = hasTarget ? (target / max) * 100 : null;
  return (
    <Alert
      tone={
        status === "better"
          ? "success"
          : status === "worse"
            ? "danger"
            : "info"
      }
      title="CPL кабинета vs цель из брифа"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge kind={goalTone(status)}>{goalLabel(status)}</Badge>
        <span>
          факт {actual ?? "—"}
          {hasTarget ? ` · цель ${target}` : " · цель не задана в брифе"}
        </span>
      </div>
      <div className="relative h-3 overflow-hidden rounded-full bg-[var(--bg)]/60">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-current opacity-70"
          style={{ width: `${actualPct}%` }}
        />
        {targetPct != null ? (
          <div
            className="absolute top-0 h-full w-0.5 bg-[var(--fg)]"
            style={{ left: `${targetPct}%` }}
            title="target_cpl"
          />
        ) : null}
      </div>
    </Alert>
  );
}

function AttributedCplMeter({
  actual,
  target,
  status,
}: {
  actual: number | null;
  target: number;
  status: string;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--status-alert-border)] bg-[var(--status-alert-bg)] px-3 py-2">
      <p className="mb-1 text-xs font-medium">Attributed CPL vs цель</p>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge kind={goalTone(status)}>{goalLabel(status)}</Badge>
        <span>
          факт {actual ?? "—"} · цель {target || "не задана"}
        </span>
      </div>
    </div>
  );
}
