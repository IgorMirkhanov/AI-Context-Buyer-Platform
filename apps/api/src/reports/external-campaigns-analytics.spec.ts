import {
  buildAnalyticsView,
  defaultReportPeriod,
} from '@context-buyer/agents';
import { CampaignSource, LiveCampaignStatus } from '@prisma/client';
import { filterCampaignsBySource } from './reports.service';

describe('external campaigns in analytics', () => {
  const period = defaultReportPeriod(7);
  const campaigns = [
    {
      id: 'camp-platform',
      name: 'Платформенная',
      externalCampaignId: '555',
      status: LiveCampaignStatus.paused,
      source: CampaignSource.platform,
    },
    {
      id: 'camp-archived',
      name: 'Старая архивная',
      externalCampaignId: '9001',
      status: LiveCampaignStatus.archived,
      source: CampaignSource.external,
    },
  ];
  const snapshots = [
    {
      date: period.from,
      campaignId: 'camp-platform',
      adGroupExternalId: 'g1',
      impressions: 100,
      clicks: 10,
      spend: 500,
      conversions: 1,
    },
    {
      date: period.from,
      campaignId: 'camp-archived',
      adGroupExternalId: 'g1',
      impressions: 50,
      clicks: 5,
      spend: 200,
      conversions: 0,
    },
  ];

  it('includes archived external campaign in all-cabinet analytics view', () => {
    const filtered = filterCampaignsBySource(campaigns, 'all');
    const ids = new Set(filtered.map((item) => item.id));
    const view = buildAnalyticsView({
      snapshots: snapshots.filter((row) => ids.has(row.campaignId)),
      campaigns: filtered,
      period,
      dailyBudget: null,
      currency: 'RUB',
    });
    const archived = view.campaigns.find((item) => item.id === 'camp-archived');
    expect(archived).toBeDefined();
    expect(archived?.status).toBe('archived');
    expect(archived?.source).toBe('external');
  });

  it('filters platform-only analytics slice', () => {
    const filtered = filterCampaignsBySource(campaigns, 'platform');
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe('camp-platform');
  });
});
