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

export type AtsBucketMode = "static" | "dynamic_relative";

function parseThreshold(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

function parseRelativeThreshold(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return fallback;
  // Accept both 0..1 and percentage-style 0..100 values.
  const normalized = n > 1 ? n / 100 : n;
  return Math.max(0, Math.min(1, normalized));
}

export function resolveAtsBucketMode(): AtsBucketMode {
  const raw = process.env.ATS_BUCKET_MODE?.trim().toLowerCase();
  if (raw === "dynamic_relative" || raw === "dynamic" || raw === "relative") {
    return "dynamic_relative";
  }
  return "static";
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
    bestMin: parseThreshold("ATS_BUCKET_BEST_MIN", 60),
    veryGoodMin: parseThreshold("ATS_BUCKET_VERY_GOOD_MIN", 40),
    goodMin: parseThreshold("ATS_BUCKET_GOOD_MIN", 30),
    averageMin: parseThreshold("ATS_BUCKET_AVERAGE_MIN", 20),
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

/**
 * Dynamic bucket placement relative to top score in the same requisition item.
 * Input must be in 0..1 where 1 means "same as top candidate".
 */
export function getAtsBucketFromRelativeScore(relativeScore: number): AtsBucket {
  const bestMin = parseRelativeThreshold("ATS_BUCKET_REL_BEST_MIN", 0.9);
  const veryGoodMin = parseRelativeThreshold("ATS_BUCKET_REL_VERY_GOOD_MIN", 0.75);
  const goodMin = parseRelativeThreshold("ATS_BUCKET_REL_GOOD_MIN", 0.6);
  const averageMin = parseRelativeThreshold("ATS_BUCKET_REL_AVERAGE_MIN", 0.4);
  const r = Math.max(0, Math.min(1, relativeScore));
  if (!Number.isFinite(r)) return "NOT_SUITABLE";
  if (r >= bestMin) return "BEST";
  if (r >= veryGoodMin) return "VERY_GOOD";
  if (r >= goodMin) return "GOOD";
  if (r >= averageMin) return "AVERAGE";
  return "NOT_SUITABLE";
}

export function isAtsBucket(v: string | null | undefined): v is AtsBucket {
  return v != null && (ATS_BUCKET_KEYS as readonly string[]).includes(v);
}
