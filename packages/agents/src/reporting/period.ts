export function addUtcDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function enumerateUtcDates(from: string, to: string): string[] {
  if (from > to) return [];
  const out: string[] = [];
  for (let cur = from; cur <= to; cur = addUtcDays(cur, 1)) {
    out.push(cur);
  }
  return out;
}

export function inclusiveDayCount(from: string, to: string): number {
  return enumerateUtcDates(from, to).length;
}

export function periodEndingOn(
  to: string,
  days: number,
): { from: string; to: string } {
  const span = Math.max(1, Math.trunc(days));
  return { from: addUtcDays(to, -(span - 1)), to };
}

/** Yesterday UTC back `days` inclusive — same window as GET /reports default. */
export function defaultReportPeriod(
  days = 7,
  asOf: Date = new Date(),
): { from: string; to: string } {
  const end = new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()),
  );
  end.setUTCDate(end.getUTCDate() - 1);
  return periodEndingOn(end.toISOString().slice(0, 10), days);
}
