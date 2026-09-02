/** Интервал регулярных прогонов Optimization Agent (см. docs/13_OPTIMIZATION_SCHEDULE.md). */
export const OPTIMIZATION_RECURRING_DAYS = 7;

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** Первый прогон — сразу после публикации кампании. */
export function initialOptimizationNextRun(launchedAt: Date): Date {
  return launchedAt;
}

/**
 * Следующий прогон после успешного run:
 * - после стартового (день 0) → ровно +7 дней от запуска;
 * - далее → каждые 7 дней от последнего прогона.
 */
export function nextOptimizationAfterRun(
  launchedAt: Date,
  previousLastRunAt: Date | null,
  runFinishedAt: Date,
): Date {
  if (!previousLastRunAt) {
    return addDays(launchedAt, OPTIMIZATION_RECURRING_DAYS);
  }
  return addDays(runFinishedAt, OPTIMIZATION_RECURRING_DAYS);
}

export function isOptimizationDue(
  launchedAt: Date | null | undefined,
  nextRunAt: Date | null | undefined,
  now: Date,
): boolean {
  if (!launchedAt) {
    return false;
  }
  if (!nextRunAt) {
    return true;
  }
  return now.getTime() >= nextRunAt.getTime();
}
