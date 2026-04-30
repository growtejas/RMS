import { NextResponse } from "next/server";

import { cookieOptions, getCookie } from "@/lib/auth/cookies";
import { getGoogleOAuthRedirectUri } from "@/lib/integrations/google-oauth-redirect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/integrations/google/oauth/start — Google login bootstrap.
 */
export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || "";
  if (!clientId) {
    return NextResponse.json({ detail: "Google OAuth not configured (GOOGLE_CLIENT_ID)" }, { status: 503 });
  }
  const url = new URL(req.url);
  const redirectUri = getGoogleOAuthRedirectUri(req);
  const next = url.searchParams.get("next")?.trim() || "/";

  const state = crypto.randomUUID();
  const verifierBytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(verifierBytes);
  const verifier = Buffer.from(verifierBytes).toString("base64url");
  const challengeBytes = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  const challenge = Buffer.from(new Uint8Array(challengeBytes)).toString("base64url");

  const scope =
    process.env.GOOGLE_OAUTH_SCOPES?.trim() ||
    "openid email profile https://www.googleapis.com/auth/calendar.events";

  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.searchParams.set("client_id", clientId);
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", scope);
  auth.searchParams.set("state", state);
  auth.searchParams.set("code_challenge", challenge);
  auth.searchParams.set("code_challenge_method", "S256");
  auth.searchParams.set("access_type", "offline");
  auth.searchParams.set("prompt", "consent");

  const res = NextResponse.redirect(auth.toString());
  // short-lived cookies for callback validation
  res.cookies.set("g_oauth_state", state, cookieOptions({ maxAgeSeconds: 10 * 60 }));
  res.cookies.set("g_oauth_verifier", verifier, cookieOptions({ maxAgeSeconds: 10 * 60 }));
  res.cookies.set("g_oauth_next", next, cookieOptions({ maxAgeSeconds: 10 * 60 }));
  // Preserve existing cookie token if present; this is a login flow.
  const existing = getCookie(req, "rfm_access");
  if (existing) {
    res.headers.set("X-Auth-Already-Logged-In", "1");
  }
  return res;
}
