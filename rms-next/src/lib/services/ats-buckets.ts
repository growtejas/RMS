/**
 * ATS quality buckets for applications (persisted on `applications.ats_bucket`).
 * Thresholds are configurable via env (0–100 scale, inclusive lower bounds for higher tiers).
 */

export const ATS_BUCKET_KEYS = [
  "BEST",
  "VERY_GOOD",
  "GOOD",
  "AVERAGE",
  "NOT_SUITABLE",
] as const;

export type AtsBucket = (typeof ATS_BUCKET_KEYS)[number];

function parseThreshold(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Defaults: high bar for BEST, wide AVERAGE band, bottom = NOT_SUITABLE.
 * BEST >= 85, VERY_GOOD >= 70, GOOD >= 55, AVERAGE >= 35, else NOT_SUITABLE.
 */
export function resolveAtsBucketThresholds(): {
  bestMin: number;
  veryGoodMin: number;
  goodMin: number;
  averageMin: number;
} {
  return {
    bestMin: parseThreshold("ATS_BUCKET_BEST_MIN", 85),
    veryGoodMin: parseThreshold("ATS_BUCKET_VERY_GOOD_MIN", 70),
    goodMin: parseThreshold("ATS_BUCKET_GOOD_MIN", 55),
    averageMin: parseThreshold("ATS_BUCKET_AVERAGE_MIN", 35),
  };
}

export function getAtsBucketFromFinalScore(finalScore: number): AtsBucket {
  const t = resolveAtsBucketThresholds();
  if (!Number.isFinite(finalScore)) {
    return "NOT_SUITABLE";
  }
  if (finalScore >= t.bestMin) {
    return "BEST";
  }
  if (finalScore >= t.veryGoodMin) {
    return "VERY_GOOD";
  }
  if (finalScore >= t.goodMin) {
    return "GOOD";
  }
  if (finalScore >= t.averageMin) {
    return "AVERAGE";
  }
  return "NOT_SUITABLE";
}

export function isAtsBucket(v: string | null | undefined): v is AtsBucket {
  return v != null && (ATS_BUCKET_KEYS as readonly string[]).includes(v);
}
