/**
 * Extract access token from `Authorization` for API routes / CSRF bypass.
 * Accepts `Bearer <token>` (case-insensitive) or a raw JWT (three dot-separated segments).
 */
export function tryParseAuthorizationAccessToken(
  authorizationHeader: string | null | undefined,
): string | null {
  const raw = authorizationHeader?.trim() ?? "";
  if (!raw) return null;
  const m = /^Bearer\s+(\S+)/i.exec(raw);
  if (m?.[1]) return m[1];
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(raw)) {
    return raw;
  }
  return null;
}
