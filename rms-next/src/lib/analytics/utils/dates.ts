/**
 * Timezone-safe date helpers for analytics.
 *
 * All bucketing happens in UTC because the database stores timestamps in
 * UTC and analytics aggregates are not display-tier outputs (the UI is
 * responsible for tz formatting). Avoids the toDateString() drift bug
 * that surfaces when reports run near midnight in non-UTC tz.
 */

const MS_PER_DAY = 86_400_000;

export function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function isoDay(value: Date | string): string {
  const d = toDate(value);
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

export function isoMonth(value: Date | string): string {
  const d = toDate(value);
  if (!d) return "";
  return d.toISOString().slice(0, 7);
}

export function diffDays(later: Date | string, earlier: Date | string): number {
  const a = toDate(later);
  const b = toDate(earlier);
  if (!a || !b) return 0;
  return Math.max(0, (a.getTime() - b.getTime()) / MS_PER_DAY);
}

export function diffHours(later: Date | string, earlier: Date | string): number {
  const a = toDate(later);
  const b = toDate(earlier);
  if (!a || !b) return 0;
  return Math.max(0, (a.getTime() - b.getTime()) / 3_600_000);
}

/** Build an inclusive sequence of UTC day buckets ending today. */
export function lastNDayBuckets(n: number): Array<{ key: string; start: Date; end: Date }> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const out: Array<{ key: string; start: Date; end: Date }> = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const start = new Date(today.getTime() - i * MS_PER_DAY);
    const end = new Date(start.getTime() + MS_PER_DAY);
    out.push({ key: start.toISOString().slice(0, 10), start, end });
  }
  return out;
}

/** Build an inclusive sequence of UTC month buckets ending in current month. */
export function lastNMonthBuckets(n: number): Array<{ key: string; start: Date; end: Date }> {
  const out: Array<{ key: string; start: Date; end: Date }> = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i -= 1) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1));
    out.push({ key: start.toISOString().slice(0, 7), start, end });
  }
  return out;
}
