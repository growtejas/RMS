/** Simple in-memory rate limiter for unauthenticated public routes (per server instance). */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function windowMs(): number {
  const w = Number.parseInt(process.env.PUBLIC_RATE_LIMIT_WINDOW_MS ?? "60000", 10);
  return Number.isFinite(w) && w > 0 ? w : 60_000;
}

function maxHits(): number {
  const m = Number.parseInt(process.env.PUBLIC_RATE_LIMIT_MAX ?? "30", 10);
  return Number.isFinite(m) && m > 0 ? m : 30;
}

export function allowPublicRequest(key: string): boolean {
  const now = Date.now();
  const win = windowMs();
  const cap = maxHits();
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + win });
    return true;
  }
  if (b.count >= cap) {
    return false;
  }
  b.count += 1;
  return true;
}
