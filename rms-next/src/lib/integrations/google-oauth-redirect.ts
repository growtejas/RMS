const CALLBACK_PATH = "/api/integrations/google/oauth/callback";

/**
 * Public browser origin for this app, used to build the Google `redirect_uri` when
 * `GOOGLE_OAUTH_REDIRECT_URL` is unset. Prefer this over `new URL(req.url).origin` when
 * the request is behind a reverse proxy (see `x-forwarded-*`), or set
 * `GOOGLE_OAUTH_PUBLIC_ORIGIN` explicitly (e.g. `https://app.example.com`).
 */
export function resolveRequestPublicOrigin(req: Request): string {
  const url = new URL(req.url);
  const explicit = process.env.GOOGLE_OAUTH_PUBLIC_ORIGIN?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto");
  if (forwardedHost) {
    const h = forwardedHost.split(",")[0]?.trim() ?? forwardedHost;
    const p =
      forwardedProto?.split(",")[0]?.trim() ||
      (url.protocol === "https:" ? "https" : "http");
    return `${p}://${h}`;
  }
  return url.origin;
}

/**
 * Full redirect URI for Google (must match **exactly** in Google Cloud → OAuth client
 * → Authorized redirect URIs, and must use the same value in /oauth/start and token exchange).
 */
export function getGoogleOAuthRedirectUri(req: Request): string {
  const fromEnv = process.env.GOOGLE_OAUTH_REDIRECT_URL?.trim();
  if (fromEnv) {
    // In local/dev, a host mismatch (e.g. IP vs nip.io) causes OAuth temp cookies
    // to be set on one host and callback to land on another, failing state checks.
    try {
      const envUrl = new URL(fromEnv);
      const reqUrl = new URL(req.url);
      const hostMismatch = envUrl.host !== reqUrl.host;
      if (process.env.NODE_ENV !== "production" && hostMismatch) {
        return `${resolveRequestPublicOrigin(req)}${CALLBACK_PATH}`;
      }
      return envUrl.toString();
    } catch {
      // If env value is malformed, safely fall back to request-derived origin.
      return `${resolveRequestPublicOrigin(req)}${CALLBACK_PATH}`;
    }
  }
  return `${resolveRequestPublicOrigin(req)}${CALLBACK_PATH}`;
}

export { CALLBACK_PATH as GOOGLE_OAUTH_CALLBACK_PATH };
