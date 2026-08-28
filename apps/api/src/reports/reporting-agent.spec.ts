import {
  aggregateMetrics,
  buildPerformanceReport,
  compareToTarget,
  HeuristicReportingLlm,
  InsightWriter,
} from '@context-buyer/agents';
import { parsePerformanceTsv } from '@context-buyer/connectors';

const rows = [
  {
    date: '2026-08-20',
    impressions: 400,
    clicks: 20,
    spend: 600,
    conversions: 2,
  },
  {
    date: '2026-08-21',
    impressions: 600,
    clicks: 30,
    spend: 900,
    conversions: 3,
  },
];

describe('Reporting Agent metrics', () => {
  it('aggregates totals and derived rates from concrete numbers', () => {
    const metrics = aggregateMetrics(rows);
    expect(metrics.impressions).toBe(1000);
    expect(metrics.clicks).toBe(50);
    expect(metrics.spend).toBe(1500);
    expect(metrics.conversions).toBe(5);
    expect(metrics.ctr).toBe(5);
    expect(metrics.cpc).toBe(30);
    expect(metrics.cpl).toBe(300);
  });

  it('compares CPL to target_cpl without an LLM', () => {
    const worse = compareToTarget(300, 250);
    expect(worse.status).toBe('worse');
    expect(worse.delta).toBe(50);
    expect(compareToTarget(200, 250).status).toBe('better');
    expect(compareToTarget(null, 250).status).toBe('no_conversions');
  });
});

describe('Reporting Agent insights', () => {
  it('heuristic LLM only wraps already computed figures', () => {
    const report = buildPerformanceReport(rows, 250, {
      from: '2026-08-20',
      to: '2026-08-21',
    });
    const blob = report.insights.join(' ');
    expect(report.insights.length).toBeGreaterThanOrEqual(2);
    expect(blob).toContain('1000');
    expect(blob).toContain('50');
    expect(blob).toContain('1500');
    expect(blob).toContain('5');
    expect(blob).toContain('30');
    expect(blob).toContain('300');
    expect(blob).toContain('250');
    expect(report.metrics.cpl).toBe(300);
    expect(report.vs_goal.target_cpl).toBe(250);
  });

  it('rejects an LLM that invents numbers instead of wrapping facts', () => {
    const liar: InsightWriter = {
      wrap: () => ({
        insights: [
          'CPL составил 12 рублей при цели 8.',
          'Расход вырос без опоры на факты.',
        ],
        prompt: '',
        response: '',
      }),
    };
    expect(() =>
      buildPerformanceReport(
        rows,
        250,
        { from: '2026-08-20', to: '2026-08-21' },
        liar,
      ),
    ).toThrow(/dropped computed figure/);
  });

  it('keeps heuristic wrap output aligned with HeuristicReportingLlm', () => {
    const facts = ['CPL факт 300, цель 250, дельта 50.'];
    const wrapped = new HeuristicReportingLlm().wrap(facts);
    expect(wrapped.insights[0]).toContain('300');
    expect(wrapped.insights[0]).toContain('250');
  });
});

describe('Yandex Direct performance TSV', () => {
  it('parses CAMPAIGN_PERFORMANCE_REPORT rows', () => {
    const tsv = [
      'Date\tCampaignId\tImpressions\tClicks\tConversions\tCost',
      '2026-08-21\t555\t100\t10\t2\t200.5',
    ].join('\n');
    const rowsParsed = parsePerformanceTsv(tsv);
    expect(rowsParsed).toEqual([
      {
        date: '2026-08-21',
        externalCampaignId: '555',
        impressions: 100,
        clicks: 10,
        conversions: 2,
        spend: 200.5,
      },
    ]);
  });
});
