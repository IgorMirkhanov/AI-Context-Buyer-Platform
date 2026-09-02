import {
  aggregateMetrics,
  AUTOPILOT_GATES,
  buildOptimizationPlan,
  evaluateAutopilotEligibility,
  HeuristicOptimizationLlm,
  isWastedTerm,
  OPTIMIZATION_THRESHOLDS,
  OptimizationWriter,
  shouldCutBudget,
  shouldFlagCtrDrop,
  shouldPause,
} from '@context-buyer/agents';

const campaignZeroConv = {
  campaignId: 'camp-1',
  externalCampaignId: '555',
  budgetDaily: 5000,
  metrics: aggregateMetrics([
    {
      date: '2026-08-20',
      impressions: 800,
      clicks: 40,
      spend: 800,
      conversions: 0,
    },
  ]),
};

const campaignExpensiveCpl = {
  campaignId: 'camp-2',
  externalCampaignId: '556',
  budgetDaily: 5000,
  metrics: aggregateMetrics([
    {
      date: '2026-08-20',
      impressions: 400,
      clicks: 20,
      spend: 1000,
      conversions: 2,
    },
  ]),
};

describe('Optimization Agent rules', () => {
  it('pauses a campaign with spend and clicks but zero conversions', () => {
    expect(campaignZeroConv.metrics.spend).toBe(800);
    expect(campaignZeroConv.metrics.clicks).toBe(40);
    expect(campaignZeroConv.metrics.conversions).toBe(0);
    expect(shouldPause(campaignZeroConv)).toBe(true);
    expect(shouldCutBudget(campaignZeroConv, 300)).toBe(false);
  });

  it('cuts budget when CPL is worse than 1.5x target', () => {
    expect(campaignExpensiveCpl.metrics.cpl).toBe(500);
    expect(shouldCutBudget(campaignExpensiveCpl, 300)).toBe(true);
    expect(500).toBeGreaterThan(300 * OPTIMIZATION_THRESHOLDS.cplOverTarget);
    expect(shouldPause(campaignExpensiveCpl)).toBe(false);
  });

  it('flags wasted search terms without conversions', () => {
    expect(
      isWastedTerm({
        campaignId: '555',
        phrase: 'скачать бесплатно',
        clicks: 8,
        spend: 240,
        conversions: 0,
      }),
    ).toBe(true);
    expect(
      isWastedTerm({
        campaignId: '555',
        phrase: 'купить asus',
        clicks: 8,
        spend: 240,
        conversions: 1,
      }),
    ).toBe(false);
  });
  it('flags CTR drop on ad group with period comparison', () => {
    expect(
      shouldFlagCtrDrop({
        campaignId: 'camp-1',
        externalCampaignId: '555',
        adGroupExternalId: 'ag-1',
        adGroupName: 'Группа A',
        prior: aggregateMetrics([
          {
            date: '2026-08-18',
            impressions: 500,
            clicks: 25,
            spend: 200,
            conversions: 1,
          },
        ]),
        current: aggregateMetrics([
          {
            date: '2026-08-25',
            impressions: 500,
            clicks: 10,
            spend: 200,
            conversions: 1,
          },
        ]),
      }),
    ).toBe(true);
  });
});

describe('Optimization Agent plan', () => {
  it('builds proposed actions with computed figures in the rationale', async () => {
    const plan = await buildOptimizationPlan({
      period: { from: '2026-08-20', to: '2026-08-26' },
      priorPeriod: { from: '2026-08-13', to: '2026-08-19' },
      targetCpl: 300,
      campaigns: [campaignZeroConv, campaignExpensiveCpl],
      searchTerms: [
        {
          campaignId: 'camp-1',
          phrase: 'скачать бесплатно',
          clicks: 8,
          spend: 240,
          conversions: 0,
        },
      ],
    });
    expect(plan.recommendations.every((item) => item.rationale.length > 0)).toBe(
      true,
    );
    const pause = plan.recommendations.find(
      (item) => item.type === 'pause_campaign',
    );
    const cut = plan.recommendations.find(
      (item) => item.type === 'reduce_budget',
    );
    const minus = plan.recommendations.find(
      (item) => item.type === 'add_negative',
    );
    expect(pause?.rationale).toContain('800');
    expect(pause?.rationale).toContain('40');
    expect(pause?.rationale).toContain('0');
    expect(pause?.action.pause).toBe(true);
    expect(cut?.evidence.cpl).toBe(500);
    expect(cut?.rationale).toContain('500');
    expect(cut?.rationale).toContain('300');
    expect(cut?.action.budget_daily).toBe(4000);
    expect(minus?.action.negative_phrases).toContain('скачать бесплатно');
    expect(minus?.rationale).toContain('8');
    expect(minus?.rationale).toContain('240');
  });

  it('rejects an LLM that invents numbers instead of wrapping facts', async () => {
    const liar: OptimizationWriter = {
      wrap: () => ({
        insights: ['CPL составил 12 при цели 8, отключайте всё.'],
        prompt: '',
        response: '',
      }),
    };
    await expect(
      buildOptimizationPlan(
        {
          period: { from: '2026-08-20', to: '2026-08-26' },
          priorPeriod: { from: '2026-08-13', to: '2026-08-19' },
          targetCpl: 300,
          campaigns: [campaignZeroConv],
          searchTerms: [],
        },
        liar,
      ),
    ).rejects.toThrow(/dropped computed figure/);
  });

  it('heuristic wrap keeps HeuristicOptimizationLlm figures', () => {
    const facts = [
      'Клики 40, расход 800, конверсий 0 (CTR 5%) → рекомендую отключить кампанию.',
    ];
    const wrapped = new HeuristicOptimizationLlm().wrap(facts);
    expect(wrapped.insights[0]).toContain('800');
    expect(wrapped.insights[0]).toContain('0');
  });
});

describe('Autopilot eligibility', () => {
  it('stays off until enough recommendations were reviewed and applied', () => {
    const fresh = evaluateAutopilotEligibility({
      applied: 0,
      rejected: 0,
      failed: 0,
      proposed: 2,
      approved: 0,
    });
    expect(fresh.eligible).toBe(false);
    expect(fresh.reasons.length).toBeGreaterThan(0);
  });

  it('becomes eligible after the quality gate', () => {
    const ready = evaluateAutopilotEligibility({
      applied: 3,
      rejected: 1,
      failed: 0,
      proposed: 0,
      approved: 0,
    });
    expect(ready.stats.reviewed).toBe(4);
    expect(ready.stats.acceptRate).toBe(0.75);
    expect(ready.eligible).toBe(true);
    expect(ready.reasons).toEqual([]);
  });

  it('rejects a low accept rate even with many reviews', () => {
    const poor = evaluateAutopilotEligibility({
      applied: 1,
      rejected: 5,
      failed: 0,
      proposed: 0,
      approved: 0,
    });
    expect(poor.eligible).toBe(false);
    expect(poor.stats.acceptRate).toBeLessThan(AUTOPILOT_GATES.minAcceptRate);
  });
});
