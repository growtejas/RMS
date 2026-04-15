/**
 * Returns true if the access token should be refreshed (missing exp or within
 * `skewSeconds` of expiry). Avoids calling /auth/refresh on every full reload.
 */
export function accessTokenNeedsRefresh(
  token: string,
  skewSeconds = 300,
): boolean {
  try {
    const payload = token.split(".")[1];
    if (!payload) {
      return true;
    }
    const decoded = JSON.parse(atob(payload)) as { exp?: number };
    const exp = decoded.exp;
    if (typeof exp !== "number") {
      return true;
    }
    const now = Math.floor(Date.now() / 1000);
    return exp - now < skewSeconds;
  } catch {
    return true;
  }
}
