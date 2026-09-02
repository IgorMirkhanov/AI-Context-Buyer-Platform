export type OptimizationPeriod = { from: string; to: string };

export function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Текущее и предыдущее 7-дневные окна (вчера включительно). */
export function optimizationComparePeriods(
  now: Date = new Date(),
): { current: OptimizationPeriod; prior: OptimizationPeriod } {
  const currentEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  currentEnd.setUTCDate(currentEnd.getUTCDate() - 1);
  const currentStart = new Date(currentEnd.getTime());
  currentStart.setUTCDate(currentStart.getUTCDate() - 6);

  const priorEnd = new Date(currentStart.getTime());
  priorEnd.setUTCDate(priorEnd.getUTCDate() - 1);
  const priorStart = new Date(priorEnd.getTime());
  priorStart.setUTCDate(priorStart.getUTCDate() - 6);

  return {
    current: {
      from: formatUtcDate(currentStart),
      to: formatUtcDate(currentEnd),
    },
    prior: {
      from: formatUtcDate(priorStart),
      to: formatUtcDate(priorEnd),
    },
  };
}

export function defaultOptimizationPeriod(
  now: Date = new Date(),
): OptimizationPeriod {
  return optimizationComparePeriods(now).current;
}
