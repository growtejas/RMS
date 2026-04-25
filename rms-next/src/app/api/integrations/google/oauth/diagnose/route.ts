import { NextResponse } from "next/server";

import {
  getGoogleOAuthRedirectUri,
  resolveRequestPublicOrigin,
} from "@/lib/integrations/google-oauth-redirect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/integrations/google/oauth/diagnose
 * Returns the exact `redirect_uri` this server sends to Google for **this** request
 * (same host/proto as the browser). Add that value to
 * Google Cloud → Credentials → your Web client → Authorized redirect URIs.
 */
export async function GET(req: Request) {
  const id = process.env.GOOGLE_CLIENT_ID?.trim() || "";
  const fromEnv = Boolean(process.env.GOOGLE_OAUTH_REDIRECT_URL?.trim());
  return NextResponse.json({
    google_oauth_client_id: id,
    used_GOOGLE_OAUTH_REDIRECT_url_env: fromEnv,
    /** Copy-paste this string into "Authorized redirect URIs" in Google Cloud (must be exact, including no trailing slash). */
    add_this_redirect_uri_to_google_cloud: getGoogleOAuthRedirectUri(req),
    resolved_public_origin: resolveRequestPublicOrigin(req),
    raw_request_url: req.url,
    forwarded_host: req.headers.get("x-forwarded-host") ?? null,
    forwarded_proto: req.headers.get("x-forwarded-proto") ?? null,
  });
}
