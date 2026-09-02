import {
  initialOptimizationNextRun,
  isOptimizationDue,
  nextOptimizationAfterRun,
  OPTIMIZATION_RECURRING_DAYS,
} from '@context-buyer/agents';

describe('optimization schedule', () => {
  const launched = new Date('2026-09-01T10:00:00.000Z');

  it('marks launch day as immediately due', () => {
    const next = initialOptimizationNextRun(launched);
    expect(next.toISOString()).toBe(launched.toISOString());
    expect(isOptimizationDue(launched, next, launched)).toBe(true);
  });

  it('schedules day-7 run after the launch pass', () => {
    const launchRun = new Date('2026-09-01T12:00:00.000Z');
    const next = nextOptimizationAfterRun(launched, null, launchRun);
    expect(next.toISOString()).toBe('2026-09-08T12:00:00.000Z');
    expect(
      isOptimizationDue(launched, next, new Date('2026-09-07T23:59:59.000Z')),
    ).toBe(false);
    expect(
      isOptimizationDue(launched, next, new Date('2026-09-08T10:00:00.000Z')),
    ).toBe(true);
  });

  it('repeats every 7 days after the weekly baseline', () => {
    const firstWeekly = new Date('2026-09-08T09:00:00.000Z');
    const second = nextOptimizationAfterRun(launched, firstWeekly, firstWeekly);
    expect(second.toISOString()).toBe('2026-09-15T09:00:00.000Z');
  });

  it('documents recurring interval constant', () => {
    expect(OPTIMIZATION_RECURRING_DAYS).toBe(7);
  });
});
