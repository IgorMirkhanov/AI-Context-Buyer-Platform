import {
  attributedCpl,
  buildAttributionSummary,
  HeuristicReportingLlm,
  InsightWriter,
  wrapAttributionSummary,
} from '@context-buyer/agents';

describe('Attribution summary', () => {
  it('computes attributed CPL from spend and CRM leads without an LLM', () => {
    expect(attributedCpl(1500, 5)).toBe(300);
    expect(attributedCpl(1500, 0)).toBeNull();
    const summary = buildAttributionSummary(1500, 3, 5, 250);
    expect(summary.leads).toBe(5);
    expect(summary.ads_conversions).toBe(3);
    expect(summary.attributed_cpl).toBe(300);
    expect(summary.vs_goal.status).toBe('worse');
    expect(summary.vs_goal.delta).toBe(50);
  });

  it('wraps already computed figures and rejects invented numbers', () => {
    const wrapped = wrapAttributionSummary(1500, 3, 5, 250);
    const blob = wrapped.insights.join(' ');
    expect(blob).toContain('5');
    expect(blob).toContain('3');
    expect(blob).toContain('1500');
    expect(blob).toContain('300');
    expect(blob).toContain('250');
    const liar: InsightWriter = {
      wrap: () => ({
        insights: ['Лидов 12 при CPL 8.', 'Кабинет врёт.'],
        prompt: '',
        response: '',
      }),
    };
    expect(() => wrapAttributionSummary(1500, 3, 5, 250, liar)).toThrow(
      /dropped computed figure/,
    );
  });

  it('heuristic wrap keeps HeuristicReportingLlm figures', () => {
    const wrapped = new HeuristicReportingLlm().wrap([
      'Лидов из CRM/коллтрекинга 5, конверсий в кабинете 3, расход 1500.',
    ]);
    expect(wrapped.insights[0]).toContain('5');
    expect(wrapped.insights[0]).toContain('1500');
  });
});
