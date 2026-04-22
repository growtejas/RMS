/**
 * Shared resume contact validation (rules extractor + LLM coercion).
 * Phones stored digits-only; emails use a pragmatic pattern.
 */

const LOOSE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isPlausibleResumeEmail(s: string): boolean {
  return LOOSE_EMAIL_RE.test(s.trim());
}

/** Reject year ranges, bare years, and date-like strings mistaken for phones. */
export function looksLikeYearOrDateRangeNotPhone(s: string): boolean {
  const t = s.trim();
  if (/^\d{4}$/.test(t)) return true;
  if (/\b20\d{2}\s*[-–—]\s*20\d{2}\b/.test(t)) return true;
  if (/\b20\d{2}\s*[-–—]\s*\d{4}\b/.test(t)) return true;
  if (/\b20\d{2}\s*[-–—]\s*present\b/i.test(t)) return true;
  if (/\d{1,2}\/\d{4}/.test(t)) return true;
  if (/^\d{4}\s*[-–—]\s*$/i.test(t)) return true;
  return false;
}

export function hasEnoughPhoneDigits(s: string): boolean {
  return (s.match(/\d/g) ?? []).length >= 7;
}

export function phoneToDigitsOnly(s: string): string {
  return s.replace(/\D/g, "").slice(0, 19);
}

export function pickFirstValidResumeEmail(emails: string[], maxLen: number): string | null {
  for (const item of emails) {
    const t = item.trim();
    if (t && isPlausibleResumeEmail(t)) return t.slice(0, maxLen);
  }
  return null;
}

/** First plausible phone string as digits-only, or null. */
export function pickFirstValidResumePhone(candidates: string[]): string | null {
  for (const item of candidates) {
    const t = item.trim().slice(0, 60);
    if (!t) continue;
    if (looksLikeYearOrDateRangeNotPhone(t)) continue;
    if (!hasEnoughPhoneDigits(t)) continue;
    const digits = phoneToDigitsOnly(t);
    if (digits.length >= 7) return digits.slice(0, 60);
  }
  return null;
}
