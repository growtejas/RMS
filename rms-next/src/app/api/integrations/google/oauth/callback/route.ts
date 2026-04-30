import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getDb } from "@/lib/db";
import { normalizeRoleList } from "@/lib/auth/normalize-roles";
import { cookieOptions, csrfCookieOptions, newCsrfToken, getCookie, ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE } from "@/lib/auth/cookies";
import { createAccessToken, createRefreshToken } from "@/lib/auth/jwt";
import { hashPassword } from "@/lib/auth/password";
import { tryResolveBearerUserAllowInactive } from "@/lib/auth/api-guard";
import {
  listRoleNamesForUser,
  findUserByEmail,
  findUserByUsername,
} from "@/lib/repositories/auth-user";
import { organizationMembers, users, userOauthIdentities } from "@/lib/db/schema";
import { resolveDefaultOrganizationId } from "@/lib/tenant/resolve-org";
import { getGoogleOAuthRedirectUri } from "@/lib/integrations/google-oauth-redirect";
import { persistGoogleUserToken } from "@/lib/integrations/google-calendar-meet";

type GoogleTokenResponse = {
  access_token: string;
  id_token?: string;
  expires_in?: number;
  token_type?: string;
  refresh_token?: string;
  scope?: string;
};

type GoogleUserInfo = {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  hd?: string;
};

function isAllowedCompanyEmail(email: string): boolean {
  return email.toLowerCase().endsWith("@rbmsoft.com");
}

function safeRedirectPath(raw: string | null): string {
  if (!raw) return "/";
  // Only allow same-site paths to avoid open redirects.
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/";
}

function usernameBaseFromEmail(email: string): string {
  const localPart = email.split("@")[0] ?? "";
  const cleaned = localPart
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 50);
  return cleaned || "user";
}

async function resolveUniqueUsername(base: string): Promise<string> {
  const trimmed = base.slice(0, 50);
  const first = await findUserByUsername(trimmed);
  if (!first) return trimmed;
  for (let i = 2; i <= 9999; i += 1) {
    const suffix = String(i);
    const candidate = `${trimmed.slice(0, 50 - suffix.length)}${suffix}`;
    // eslint-disable-next-line no-await-in-loop -- small bounded loop
    const exists = await findUserByUsername(candidate);
    if (!exists) return candidate;
  }
  return `${Date.now()}`.slice(-10);
}

/** Google OAuth callback: exchange code → userinfo, domain-gate, issue RMS session cookies. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const stateCookie = getCookie(req, "g_oauth_state");
  const verifier = getCookie(req, "g_oauth_verifier");
  const nextCookie = getCookie(req, "g_oauth_next");
  const nextPath = safeRedirectPath(nextCookie);

  if (!code || !state || !stateCookie || stateCookie !== state || !verifier) {
    // If the browser already has a valid RMS session (e.g. stale callback URL
    // after repeated OAuth starts), avoid bouncing back to login.
    const existing = await tryResolveBearerUserAllowInactive(req);
    if (existing) {
      if (!existing.isActive || existing.roles.length === 0) {
        return NextResponse.redirect(`${url.origin}/access-request`);
      }
      return NextResponse.redirect(`${url.origin}${nextPath || "/"}`);
    }
    return NextResponse.redirect(`${url.origin}/login?error=oauth_state`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || "";
  const redirectUri = getGoogleOAuthRedirectUri(req);
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${url.origin}/login?error=oauth_config`);
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  if (!tokenRes.ok) {
    return NextResponse.redirect(`${url.origin}/login?error=oauth_exchange`);
  }
  const tokens = (await tokenRes.json()) as GoogleTokenResponse;
  if (!tokens.access_token) {
    return NextResponse.redirect(`${url.origin}/login?error=oauth_tokens`);
  }

  const userinfoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userinfoRes.ok) {
    return NextResponse.redirect(`${url.origin}/login?error=oauth_userinfo`);
  }
  const info = (await userinfoRes.json()) as GoogleUserInfo;
  const email = String(info.email || "").trim().toLowerCase();
  const sub = String(info.sub || "").trim();
  const name = String(info.name || "").trim();
  if (!email || !sub) {
    return NextResponse.redirect(`${url.origin}/login?error=oauth_profile`);
  }
  if (!isAllowedCompanyEmail(email)) {
    return NextResponse.redirect(`${url.origin}/login?error=domain`);
  }

  // Find or create user.
  const db = getDb();
  let user: Awaited<ReturnType<typeof findUserByUsername>> | null = null;
  const [oauthBySub] = await db
    .select({
      userId: users.userId,
      username: users.username,
      email: users.email,
      passwordHash: users.passwordHash,
      isActive: users.isActive,
      createdAt: users.createdAt,
      lastLogin: users.lastLogin,
      employeeId: users.employeeId,
    })
    .from(userOauthIdentities)
    .innerJoin(users, eq(users.userId, userOauthIdentities.userId))
    .where(
      and(
        eq(userOauthIdentities.provider, "google"),
        eq(userOauthIdentities.providerSub, sub),
      ),
    )
    .limit(1);
  user = oauthBySub ?? null;
  if (!user) {
    const [oauthByEmail] = await db
      .select({
        userId: users.userId,
        username: users.username,
        email: users.email,
        passwordHash: users.passwordHash,
        isActive: users.isActive,
        createdAt: users.createdAt,
        lastLogin: users.lastLogin,
        employeeId: users.employeeId,
      })
      .from(userOauthIdentities)
      .innerJoin(users, eq(users.userId, userOauthIdentities.userId))
      .where(
        and(
          eq(userOauthIdentities.provider, "google"),
          eq(userOauthIdentities.email, email),
        ),
      )
      .limit(1);
    user = oauthByEmail ?? null;
  }
  if (!user) {
    user = await findUserByEmail(email);
  }
  if (!user) {
    // Legacy compatibility: old oauth users were created with username=email.
    user = await findUserByUsername(email);
  }
  if (!user) {
    const password = crypto.randomUUID() + crypto.randomUUID();
    const username = await resolveUniqueUsername(usernameBaseFromEmail(email));
    const [created] = await db
      .insert(users)
      .values({
        username,
        email,
        passwordHash: hashPassword(password),
        isActive: false,
        createdAt: new Date(),
        lastLogin: null,
        employeeId: null,
      })
      .returning({
        userId: users.userId,
        username: users.username,
        email: users.email,
        passwordHash: users.passwordHash,
        isActive: users.isActive,
        createdAt: users.createdAt,
        lastLogin: users.lastLogin,
        employeeId: users.employeeId,
      });
    user = created ?? null;
  }
  if (!user.email || user.email !== email) {
    await db
      .update(users)
      .set({ email })
      .where(eq(users.userId, user.userId));
    user = { ...user, email };
  }
  if (!user) {
    return NextResponse.redirect(`${url.origin}/login?error=user_create`);
  }

  // Ensure org membership (default org as primary).
  const defaultOrgId = await resolveDefaultOrganizationId();
  await db
    .insert(organizationMembers)
    .values({ userId: user.userId, organizationId: defaultOrgId, isPrimary: true })
    .onConflictDoNothing();

  // Persist Google token for Calendar/Meet generation (user-level; org fallback handled separately).
  await persistGoogleUserToken({
    organizationId: defaultOrgId,
    userId: user.userId,
    token: {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope: tokens.scope,
      token_type: tokens.token_type,
      expiry_date:
        Date.now() + Math.max(0, (tokens.expires_in ?? 3600) - 30) * 1000,
    },
  });

  // Upsert oauth identity.
  await db
    .insert(userOauthIdentities)
    .values({
      userId: user.userId,
      provider: "google",
      providerSub: sub,
      email,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [userOauthIdentities.provider, userOauthIdentities.providerSub],
      set: { email, userId: user.userId },
    });

  const rawRoles = await listRoleNamesForUser(user.userId);
  const roles = normalizeRoleList(rawRoles);

  const access_token = await createAccessToken({
    sub: String(user.userId),
    username: user.username,
    roles,
    orgId: defaultOrgId,
  });
  const refresh_token = await createRefreshToken({
    sub: String(user.userId),
    username: user.username,
    roles,
    orgId: defaultOrgId,
  });

  const csrf = newCsrfToken();
  const needsAccessRequest = user.isActive === false || roles.length === 0;
  const dest = needsAccessRequest ? "/access-request" : nextPath;

  const res = NextResponse.redirect(`${url.origin}${dest}`);
  res.cookies.set(ACCESS_COOKIE, access_token, cookieOptions());
  res.cookies.set(REFRESH_COOKIE, refresh_token, cookieOptions({ path: "/api/auth/refresh" }));
  res.cookies.set(CSRF_COOKIE, csrf, csrfCookieOptions());
  // Clear oauth temp cookies.
  res.cookies.set("g_oauth_state", "", { ...cookieOptions(), maxAge: 0 });
  res.cookies.set("g_oauth_verifier", "", { ...cookieOptions(), maxAge: 0 });
  res.cookies.set("g_oauth_next", "", { ...cookieOptions(), maxAge: 0 });
  if (name) {
    res.headers.set("X-OAuth-Name", name);
  }
  return res;
}
