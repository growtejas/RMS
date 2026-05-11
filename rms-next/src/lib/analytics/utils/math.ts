/**
 * Deterministic math helpers used across all analytics modules.
 *
 * Every report transformation goes through these so we get consistent
 * rounding, NaN/Infinity guarding, and percentage semantics. No Math.random
 * is allowed anywhere in analytics output paths.
 */

export function safeNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export function roundTo(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return 0;
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** Percentage in 0-100 with two-decimal precision. Returns 0 when denominator is 0. */
export function pct(numerator: number, denominator: number, decimals = 2): number {
  const n = safeNumber(numerator);
  const d = safeNumber(denominator);
  if (d <= 0) return 0;
  return roundTo((n / d) * 100, decimals);
}

export function average(values: number[], decimals = 2): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, v) => acc + safeNumber(v), 0);
  return roundTo(sum / values.length, decimals);
}

export function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + safeNumber(v), 0);
}

/** Numerically stable percentile (linear interpolation, supports out-of-order input). */
export function percentile(values: number[], p: number, decimals = 2): number {
  if (values.length === 0) return 0;
  const clamped = Math.min(1, Math.max(0, p));
  const sorted = [...values].sort((a, b) => a - b);
  const rank = clamped * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return roundTo(sorted[lo], decimals);
  const weight = rank - lo;
  return roundTo(sorted[lo] * (1 - weight) + sorted[hi] * weight, decimals);
}
