export const PACING_WINDOW_DAYS = 7;

export const OPEN_RECOMMENDATION_STATUSES = [
  "proposed",
  "approved",
  "failed",
] as const;

export type PacingTone = "under" | "on_track" | "over" | "unknown";

export function toFiniteNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "object" && value !== null && "toNumber" in value) {
    const n = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function expectedSpend(
  dailyBudget: number | null,
  days = PACING_WINDOW_DAYS,
): number | null {
  if (dailyBudget == null || dailyBudget <= 0 || days <= 0) return null;
  return dailyBudget * days;
}

export function pacingPercent(
  spend: number,
  dailyBudget: number | null,
  days = PACING_WINDOW_DAYS,
): number | null {
  const expected = expectedSpend(dailyBudget, days);
  if (expected == null || expected === 0) return null;
  return (spend / expected) * 100;
}

export function pacingTone(percent: number | null): PacingTone {
  if (percent == null || !Number.isFinite(percent)) return "unknown";
  if (percent < 80) return "under";
  if (percent > 120) return "over";
  return "on_track";
}

export function cplFromSpend(spend: number, conversions: number): number | null {
  if (conversions <= 0) return null;
  return spend / conversions;
}

export function countOpenRecommendations(
  statuses: ReadonlyArray<string>,
): number {
  const open = new Set<string>(OPEN_RECOMMENDATION_STATUSES);
  return statuses.filter((status) => open.has(status)).length;
}

export function countUnreadAlerts(
  rows: ReadonlyArray<{ acknowledgedAt: Date | null }>,
): number {
  return rows.filter((row) => row.acknowledgedAt == null).length;
}
