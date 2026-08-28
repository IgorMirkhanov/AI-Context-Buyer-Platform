import { aggregateMetrics, round2 } from "./metrics";
import { enumerateUtcDates, inclusiveDayCount } from "./period";
import {
  AnalyticsAdGroupSlice,
  AnalyticsCampaignMeta,
  AnalyticsCampaignSlice,
  AnalyticsSnapshotRow,
  AnalyticsView,
  ChartPoint,
  DailyMetrics,
  PacingForecast,
} from "./types";

export function isObservedDay(row: DailyMetrics): boolean {
  return (
    row.impressions > 0 ||
    row.clicks > 0 ||
    row.spend > 0 ||
    row.conversions > 0
  );
}

export function toChartPoint(row: DailyMetrics): ChartPoint {
  const metrics = aggregateMetrics([row]);
  return {
    date: row.date,
    impressions: row.impressions,
    clicks: row.clicks,
    spend: metrics.spend,
    conversions: row.conversions,
    ctr: metrics.ctr,
    cpc: metrics.cpc,
    cpl: metrics.cpl,
  };
}

function emptyDay(date: string): DailyMetrics {
  return {
    date,
    impressions: 0,
    clicks: 0,
    spend: 0,
    conversions: 0,
  };
}

function addRows(a: DailyMetrics, b: DailyMetrics): DailyMetrics {
  return {
    date: a.date,
    impressions: a.impressions + b.impressions,
    clicks: a.clicks + b.clicks,
    spend: a.spend + b.spend,
    conversions: a.conversions + b.conversions,
  };
}

/** Sum snapshots that share a date, then fill every day in [from, to]. */
export function buildDailySeries(
  rows: DailyMetrics[],
  from: string,
  to: string,
): ChartPoint[] {
  const byDate = new Map<string, DailyMetrics>();
  for (const row of rows) {
    if (row.date < from || row.date > to) continue;
    const prev = byDate.get(row.date);
    byDate.set(row.date, prev ? addRows(prev, row) : { ...row, date: row.date });
  }
  return enumerateUtcDates(from, to).map((date) =>
    toChartPoint(byDate.get(date) ?? emptyDay(date)),
  );
}

export function forecastPacing(input: {
  dailyBudget: number | null;
  periodDays: number;
  elapsedDays: number;
  daysWithData: number;
  actualSpend: number;
  currency?: string;
}): PacingForecast {
  const periodDays = Math.max(0, Math.trunc(input.periodDays));
  const elapsedDays = Math.max(0, Math.trunc(input.elapsedDays));
  const daysWithData = Math.max(0, Math.trunc(input.daysWithData));
  const actual = round2(input.actualSpend);
  const dailyBudget =
    input.dailyBudget != null && input.dailyBudget > 0
      ? input.dailyBudget
      : null;
  const plan =
    dailyBudget != null && periodDays > 0
      ? round2(dailyBudget * periodDays)
      : null;
  const currency = input.currency ?? "";
  if (daysWithData === 0 || periodDays === 0) {
    return {
      dailyBudget,
      currency,
      periodDays,
      elapsedDays,
      daysWithData,
      plan,
      actual,
      forecast: null,
      paceDaily: null,
    };
  }
  const paceDaily = round2(actual / daysWithData);
  if (elapsedDays >= periodDays) {
    return {
      dailyBudget,
      currency,
      periodDays,
      elapsedDays,
      daysWithData,
      plan,
      actual,
      forecast: actual,
      paceDaily,
    };
  }
  const remaining = periodDays - elapsedDays;
  return {
    dailyBudget,
    currency,
    periodDays,
    elapsedDays,
    daysWithData,
    plan,
    actual,
    forecast: round2(actual + paceDaily * remaining),
    paceDaily,
  };
}

function groupKey(row: AnalyticsSnapshotRow): string {
  return row.adGroupExternalId ?? "";
}

function groupLabel(row: AnalyticsSnapshotRow): string {
  if (row.adGroupName && row.adGroupName.trim()) return row.adGroupName.trim();
  const id = groupKey(row);
  return id ? `Группа ${id}` : "Кампания целиком";
}

export function buildAnalyticsView(input: {
  snapshots: AnalyticsSnapshotRow[];
  campaigns: AnalyticsCampaignMeta[];
  period: { from: string; to: string };
  dailyBudget: number | null;
  currency: string;
}): AnalyticsView {
  const { from, to } = input.period;
  const inWindow = input.snapshots.filter(
    (row) => row.date >= from && row.date <= to,
  );
  const series = buildDailySeries(inWindow, from, to);
  const observed = series.filter(isObservedDay).length;
  const actualSpend = series.reduce((sum, row) => sum + row.spend, 0);
  const periodDays = inclusiveDayCount(from, to);
  const pacing = forecastPacing({
    dailyBudget: input.dailyBudget,
    periodDays,
    elapsedDays: observed,
    daysWithData: observed,
    actualSpend,
    currency: input.currency,
  });

  const campaigns: AnalyticsCampaignSlice[] = input.campaigns.map((meta) => {
    const rows = inWindow.filter((row) => row.campaignId === meta.id);
    const campSeries = buildDailySeries(rows, from, to);
    return {
      ...meta,
      series: campSeries,
      metrics: aggregateMetrics(campSeries),
    };
  });

  const groups = new Map<
    string,
    { campaignId: string; externalId: string; name: string; rows: DailyMetrics[] }
  >();
  for (const row of inWindow) {
    const externalId = groupKey(row);
    const key = `${row.campaignId}\0${externalId}`;
    const prev = groups.get(key);
    const point: DailyMetrics = {
      date: row.date,
      impressions: row.impressions,
      clicks: row.clicks,
      spend: row.spend,
      conversions: row.conversions,
    };
    if (prev) {
      prev.rows.push(point);
      if (!prev.name || prev.name === "Кампания целиком" || prev.name.startsWith("Группа ")) {
        const nextName = groupLabel(row);
        if (nextName !== prev.name && row.adGroupName) prev.name = nextName;
      }
    } else {
      groups.set(key, {
        campaignId: row.campaignId,
        externalId,
        name: groupLabel(row),
        rows: [point],
      });
    }
  }

  const adGroups: AnalyticsAdGroupSlice[] = [...groups.values()].map((group) => {
    const groupSeries = buildDailySeries(group.rows, from, to);
    return {
      campaignId: group.campaignId,
      externalId: group.externalId,
      name: group.name,
      series: groupSeries,
      metrics: aggregateMetrics(groupSeries),
    };
  });

  return { series, campaigns, adGroups, pacing };
}

export function buildAttributedLeadsSeries(
  events: Array<{ occurredAt: string }>,
  from: string,
  to: string,
): Array<{ date: string; leads: number }> {
  const byDate = new Map<string, number>();
  for (const event of events) {
    const date = event.occurredAt.slice(0, 10);
    if (date < from || date > to) continue;
    byDate.set(date, (byDate.get(date) ?? 0) + 1);
  }
  return enumerateUtcDates(from, to).map((date) => ({
    date,
    leads: byDate.get(date) ?? 0,
  }));
}
