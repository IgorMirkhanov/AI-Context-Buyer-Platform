import {
  aggregateMetrics,
  buildAnalyticsView,
  buildDailySeries,
  forecastPacing,
  periodEndingOn,
} from '@context-buyer/agents';

function yandexCampaignDay(id: string, date: string) {
  const seed = Number(id.replace(/\D/g, '').slice(-4) || '1') || 1;
  const day = Number(date.slice(8, 10));
  return {
    impressions: 200 + seed + day * 10,
    clicks: 10 + (seed % 7) + (day % 5),
    spend: 400 + seed + day * 20,
    conversions: 1 + (day % 3),
  };
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

function mockSnapshots(from: string, to: string) {
  const dates: string[] = [];
  for (
    let cursor = new Date(`${from}T00:00:00.000Z`);
    cursor <= new Date(`${to}T00:00:00.000Z`);
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  const campaignIds = ['camp-a', 'camp-b'];
  const weights = [0.6, 0.4];
  return dates.flatMap((date) =>
    campaignIds.flatMap((campaignId) => {
      const totals = yandexCampaignDay(campaignId, date);
      const impressions = splitByWeights(totals.impressions, weights);
      const clicks = splitByWeights(totals.clicks, weights);
      const spend = splitByWeights(totals.spend, weights);
      const conversions = splitByWeights(totals.conversions, weights);
      return weights.map((_, index) => ({
        date,
        campaignId,
        adGroupExternalId: `${campaignId}-g${index + 1}`,
        adGroupName: `Группа ${index + 1}`,
        impressions: impressions[index],
        clicks: clicks[index],
        spend: spend[index],
        conversions: conversions[index],
      }));
    }),
  );
}

const WINDOW_TO = '2026-08-27';
const FROM_90 = periodEndingOn(WINDOW_TO, 90).from;
const FROM_30 = periodEndingOn(WINDOW_TO, 30).from;
const FROM_7 = periodEndingOn(WINDOW_TO, 7).from;
const SNAPSHOTS = mockSnapshots(FROM_90, WINDOW_TO);

function sumField(
  rows: Array<{ impressions: number; clicks: number; spend: number; conversions: number }>,
  field: 'impressions' | 'clicks' | 'spend' | 'conversions',
) {
  return rows.reduce((sum, row) => sum + row[field], 0);
}

describe('analytics chart aggregation', () => {
  it('rolls ad-group rows up by date without double-counting a campaign', () => {
    const day = SNAPSHOTS.filter(
      (row) => row.date === WINDOW_TO && row.campaignId === 'camp-a',
    );
    expect(day).toHaveLength(2);
    const totals = yandexCampaignDay('camp-a', WINDOW_TO);
    expect(sumField(day, 'impressions')).toBe(totals.impressions);
    expect(sumField(day, 'clicks')).toBe(totals.clicks);
    expect(sumField(day, 'spend')).toBe(totals.spend);
    expect(sumField(day, 'conversions')).toBe(totals.conversions);
  });

  it('aggregates 7/30/90-day windows from the same snapshot set', () => {
    const in7 = SNAPSHOTS.filter((row) => row.date >= FROM_7);
    const in30 = SNAPSHOTS.filter((row) => row.date >= FROM_30);
    const series7 = buildDailySeries(SNAPSHOTS, FROM_7, WINDOW_TO);
    const series30 = buildDailySeries(SNAPSHOTS, FROM_30, WINDOW_TO);
    const series90 = buildDailySeries(SNAPSHOTS, FROM_90, WINDOW_TO);

    expect(series7).toHaveLength(7);
    expect(series30).toHaveLength(30);
    expect(series90).toHaveLength(90);

    expect(sumField(series7, 'impressions')).toBe(sumField(in7, 'impressions'));
    expect(sumField(series7, 'clicks')).toBe(sumField(in7, 'clicks'));
    expect(sumField(series7, 'spend')).toBe(sumField(in7, 'spend'));
    expect(sumField(series30, 'impressions')).toBe(sumField(in30, 'impressions'));
    expect(sumField(series90, 'impressions')).toBe(
      sumField(SNAPSHOTS, 'impressions'),
    );
    expect(sumField(series7, 'impressions')).toBeLessThan(
      sumField(series30, 'impressions'),
    );
    expect(sumField(series30, 'impressions')).toBeLessThan(
      sumField(series90, 'impressions'),
    );

    const derived7 = aggregateMetrics(series7);
    expect(derived7.impressions).toBe(sumField(series7, 'impressions'));
    expect(derived7.clicks).toBe(sumField(series7, 'clicks'));
    const expectedCtr =
      derived7.impressions > 0
        ? Math.round(((derived7.clicks / derived7.impressions) * 100) * 100) / 100
        : 0;
    expect(derived7.ctr).toBe(expectedCtr);
  });

  it('fills missing days with zeros so the chart length matches the period', () => {
    const sparse = SNAPSHOTS.filter((row) => row.date === FROM_7);
    const series = buildDailySeries(sparse, FROM_7, WINDOW_TO);
    expect(series).toHaveLength(7);
    expect(series[0].impressions).toBeGreaterThan(0);
    expect(series.slice(1).every((row) => row.impressions === 0)).toBe(true);
  });

  it('builds campaign and ad-group drill-down series that sum to the project total', () => {
    const view = buildAnalyticsView({
      snapshots: SNAPSHOTS,
      campaigns: [
        {
          id: 'camp-a',
          name: 'Кампания A',
          externalCampaignId: '1001',
          status: 'paused',
        },
        {
          id: 'camp-b',
          name: 'Кампания B',
          externalCampaignId: '1002',
          status: 'paused',
        },
      ],
      period: { from: FROM_7, to: WINDOW_TO },
      dailyBudget: 1000,
      currency: 'RUB',
    });
    const fromCampaigns = view.campaigns.reduce(
      (sum, camp) => sum + camp.metrics.impressions,
      0,
    );
    const fromGroups = view.adGroups.reduce(
      (sum, group) => sum + group.metrics.impressions,
      0,
    );
    expect(view.adGroups).toHaveLength(4);
    expect(fromCampaigns).toBe(view.series.reduce((s, r) => s + r.impressions, 0));
    expect(fromGroups).toBe(fromCampaigns);
  });
});

describe('budget pacing forecast', () => {
  it('returns a null forecast when there are no snapshots', () => {
    const pacing = forecastPacing({
      dailyBudget: 1000,
      periodDays: 30,
      elapsedDays: 0,
      daysWithData: 0,
      actualSpend: 0,
    });
    expect(pacing.plan).toBe(30000);
    expect(pacing.actual).toBe(0);
    expect(pacing.forecast).toBeNull();
    expect(pacing.paceDaily).toBeNull();
  });

  it('projects the rest of the period from a single day of spend', () => {
    const pacing = forecastPacing({
      dailyBudget: 1000,
      periodDays: 30,
      elapsedDays: 1,
      daysWithData: 1,
      actualSpend: 500,
    });
    expect(pacing.plan).toBe(30000);
    expect(pacing.actual).toBe(500);
    expect(pacing.paceDaily).toBe(500);
    expect(pacing.forecast).toBe(15000);
  });

  it('equals actual spend when a full month of data has elapsed', () => {
    const pacing = forecastPacing({
      dailyBudget: 1000,
      periodDays: 30,
      elapsedDays: 30,
      daysWithData: 30,
      actualSpend: 28000,
    });
    expect(pacing.plan).toBe(30000);
    expect(pacing.actual).toBe(28000);
    expect(pacing.forecast).toBe(28000);
  });

  it('omits the plan when the brief has no daily budget', () => {
    const pacing = forecastPacing({
      dailyBudget: null,
      periodDays: 30,
      elapsedDays: 1,
      daysWithData: 1,
      actualSpend: 400,
    });
    expect(pacing.plan).toBeNull();
    expect(pacing.forecast).toBe(12000);
  });
});
