import {
  buildAnalyticsView,
  defaultReportPeriod,
  formatCabinetSpend,
  periodEndingOn,
  sumCampaignSpend,
} from '@context-buyer/agents';
import { parsePerformanceTsv } from '@context-buyer/connectors';

function yandexCampaignDay(externalId: string, date: string) {
  const seed = Number(externalId.replace(/\D/g, '').slice(-4) || '1') || 1;
  const day = Number(date.slice(8, 10));
  return {
    impressions: 200 + seed + day * 10,
    clicks: 10 + (seed % 7) + (day % 5),
    spend: 400 + seed + day * 20,
    conversions: 1 + (day % 3),
  };
}

function mockConnectorRows(from: string, to: string, externalIds: string[]) {
  const dates: string[] = [];
  for (
    let cursor = new Date(`${from}T00:00:00.000Z`);
    cursor <= new Date(`${to}T00:00:00.000Z`);
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates.flatMap((date) =>
    externalIds.flatMap((externalCampaignId) => {
      const totals = yandexCampaignDay(externalCampaignId, date);
      return [
        {
          date,
          externalCampaignId,
          adGroupExternalId: `${externalCampaignId}-g1`,
          adGroupName: 'Группа 1',
          ...totals,
        },
        {
          date,
          externalCampaignId,
          adGroupExternalId: `${externalCampaignId}-g2`,
          adGroupName: 'Группа 2',
          impressions: Math.floor(totals.impressions / 2),
          clicks: Math.floor(totals.clicks / 2),
          spend: Math.floor(totals.spend / 2),
          conversions: Math.floor(totals.conversions / 2),
        },
      ];
    }),
  );
}

function snapshotsFromConnector(
  rows: ReturnType<typeof mockConnectorRows>,
  campaignIdByExternal: Record<string, string>,
) {
  return rows.map((row) => ({
    date: row.date,
    campaignId: campaignIdByExternal[row.externalCampaignId],
    adGroupExternalId: row.adGroupExternalId,
    adGroupName: row.adGroupName,
    impressions: row.impressions,
    clicks: row.clicks,
    spend: row.spend,
    conversions: row.conversions,
  }));
}

describe('spend7d summary', () => {
  const asOf = new Date('2026-08-28T15:00:00.000Z');
  const period7d = defaultReportPeriod(7, asOf);

  it('aggregates mock Yandex Direct rows over a rolling 7-day window', () => {
    const connectorRows = mockConnectorRows(
      period7d.from,
      period7d.to,
      ['1001', '1002'],
    );
    const snapshots = snapshotsFromConnector(connectorRows, {
      '1001': 'camp-a',
      '1002': 'camp-b',
    });
    const view = buildAnalyticsView({
      snapshots,
      campaigns: [
        {
          id: 'camp-a',
          name: 'Кампания A',
          externalCampaignId: '1001',
          status: 'active',
        },
        {
          id: 'camp-b',
          name: 'Кампания B',
          externalCampaignId: '1002',
          status: 'active',
        },
      ],
      period: period7d,
      dailyBudget: null,
      currency: 'RUB',
    });
    const amount = sumCampaignSpend(view.campaigns);
    const perDay = connectorRows.reduce((sum, row) => sum + row.spend, 0);
    expect(amount).toBe(perDay);
    expect(formatCabinetSpend(amount, 'RUB')).toMatch(/₽$/);
    expect(amount).toBeGreaterThan(0);
  });

  it('aggregates parsed live Direct TSV rows the same way', () => {
    const tsv = [
      'Date\tCampaignId\tImpressions\tClicks\tConversions\tCost',
      '2026-08-21\t555\t100\t10\t2\t200.5',
      '2026-08-22\t555\t120\t12\t1\t180',
      '2026-08-21\t777\t80\t8\t0\t90.25',
    ].join('\n');
    const parsed = parsePerformanceTsv(tsv);
    const snapshots = parsed.map((row) => ({
      date: row.date,
      campaignId: row.externalCampaignId === '555' ? 'c-555' : 'c-777',
      adGroupExternalId: '',
      impressions: row.impressions,
      clicks: row.clicks,
      spend: row.spend,
      conversions: row.conversions,
    }));
    const period = { from: '2026-08-21', to: '2026-08-22' };
    const view = buildAnalyticsView({
      snapshots,
      campaigns: [
        {
          id: 'c-555',
          name: 'Live A',
          externalCampaignId: '555',
          status: 'active',
        },
        {
          id: 'c-777',
          name: 'Live B',
          externalCampaignId: '777',
          status: 'active',
        },
      ],
      period,
      dailyBudget: null,
      currency: 'KZT',
    });
    expect(sumCampaignSpend(view.campaigns)).toBe(470.75);
    expect(formatCabinetSpend(470.75, 'KZT')).toBe('470,75 ₸');
  });

  it('matches periodEndingOn with defaultReportPeriod(7)', () => {
    expect(defaultReportPeriod(7, asOf)).toEqual(
      periodEndingOn('2026-08-27', 7),
    );
  });
});
