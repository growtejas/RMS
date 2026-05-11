import { NextResponse } from "next/server";

import { tryParseAuthorizationAccessToken } from "@/lib/auth/auth-header";
import { ACCESS_COOKIE, getCookie } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { normalizeRoleList } from "@/lib/auth/normalize-roles";
import { notePerfMs, notePerfTag, timePerf } from "@/lib/perf/request-perf";
import { findUserWithRolesById } from "@/lib/repositories/auth-user";
import {
  resolveOrganizationIdForUser,
  userBelongsToOrganization,
} from "@/lib/tenant/resolve-org";

import type { ApiUser, ApiUserWithActive } from "./api-guard";

/**
 * Phase 1 - Auth fast path.
 *
 * Two helpers, picked by HTTP method (the hybrid model selected during plan
 * approval):
 *
 *   - `requireGetIdentity`     -> claims-trust + Redis denylist (no DB)
 *   - `requireWriteIdentity`   -> LRU(userId -> ApiUser) + DB fallback
 *
 * Both share JWT verification and identical `ApiUser` return shape so the
 * existing `requireBearerUser` entry point can dispatch by `req.method`
 * without touching every route handler in `src/app/api/`.
 *
 * Rollout safety:
 *   - Every step is feature-flagged via `RMS_AUTH_FASTPATH=false` for
 *     instant rollback (see `requireBearerUser` dispatcher in api-guard.ts).
 *   - Tokens minted before this rollout don't carry `jti`; we fall through
 *     to the legacy DB-backed path for those instead of trusting them
 *     blindly (`auth_path: claims_partial`).
 *   - Redis is best-effort. If the denylist check fails we *do not* deny
 *     the request - short access TTL is the primary revocation mechanism.
 */

type AccessClaims = {
  sub: string;
  username: string;
  roles: string[];
  orgId: string;
  jti: string | null;
  /** Seconds since epoch of token expiry (jose returns numeric `exp`). */
  expSec: number | null;
};

function unauthorized(): NextResponse {
  return NextResponse.json(
    { detail: "Could not validate credentials" },
    { status: 401 },
  );
}

function tokenFromRequest(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  return (
    getCookie(req, ACCESS_COOKIE) ??
    tryParseAuthorizationAccessToken(auth) ??
    null
  );
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

async function verifyAndExtractClaims(
  token: string,
): Promise<AccessClaims | null> {
  let payload: Awaited<ReturnType<typeof verifyAccessToken>>;
  try {
    payload = await timePerf("auth_ms_jwt", () => verifyAccessToken(token));
  } catch {
    return null;
  }
  const sub = asString((payload as { sub?: unknown }).sub);
  if (!sub) return null;
  const userId = Number.parseInt(sub, 10);
  if (!Number.isFinite(userId)) return null;
  const username = asString((payload as { username?: unknown }).username) ?? "";
  const rawRoles = (payload as { roles?: unknown }).roles;
  const roles = normalizeRoleList(
    Array.isArray(rawRoles) ? rawRoles.map((r) => String(r)) : [],
  );
  const orgId = asString((payload as { org_id?: unknown }).org_id) ?? "";
  const jti = asString((payload as { jti?: unknown }).jti);
  const expRaw = (payload as { exp?: unknown }).exp;
  const expSec = typeof expRaw === "number" ? expRaw : null;
  return {
    sub,
    username,
    roles,
    orgId,
    jti,
    expSec,
  };
}

// ---------------------------------------------------------------------------
// Denylist (logout / role-change / forced revocation)
// ---------------------------------------------------------------------------

const denylistLocal = new Map<string, number>();
const DENYLIST_LOCAL_MAX = 5_000;
/** Local cache TTL for denylist hits (a "deny" decision sticks). */
const DENYLIST_HIT_TTL_MS = 30_000;
/** How long we trust a "miss" before re-checking Redis. */
const DENYLIST_MISS_TTL_MS = 5_000;

function lruTouch(map: Map<string, number>, key: string, value: number): void {
  if (map.size >= DENYLIST_LOCAL_MAX) {
    const first = map.keys().next().value;
    if (first != null) map.delete(first);
  }
  map.set(key, value);
}

async function isJtiDenied(jti: string): Promise<boolean> {
  const now = Date.now();
  const cached = denylistLocal.get(jti);
  if (cached != null) {
    if (cached > now) {
      // Cached state still valid. Positive value = "deny until ts",
      // negative value = "miss until ts" (we encode misses as -ts).
      return cached > 0 ? true : false;
    }
    denylistLocal.delete(jti);
  }
  if (!process.env.REDIS_URL) {
    // No Redis configured = no denylist. Treat as miss; trust short TTL.
    lruTouch(denylistLocal, jti, -(now + DENYLIST_MISS_TTL_MS));
    return false;
  }
  try {
    const start = Date.now();
    const { getSharedRedisConnection } = await import("@/lib/queue/redis");
    const redis = getSharedRedisConnection();
    const ttlMs = await redis.pttl(`auth:denylist:${jti}`);
    notePerfMs("auth_ms_denylist", Date.now() - start);
    if (ttlMs > 0) {
      lruTouch(
        denylistLocal,
        jti,
        now + Math.min(ttlMs, DENYLIST_HIT_TTL_MS),
      );
      return true;
    }
  } catch {
    // Best-effort.
  }
  lruTouch(denylistLocal, jti, -(now + DENYLIST_MISS_TTL_MS));
  return false;
}

/**
 * Publish a token jti to the Redis denylist with TTL = remaining access
 * lifetime (server clamps to >=1s, <=24h). No-op without Redis.
 */
export async function publishJtiDenylist(
  jti: string,
  expSec: number | null,
): Promise<void> {
  if (!jti || !process.env.REDIS_URL) return;
  let ttlMs: number;
  if (expSec != null) {
    ttlMs = Math.max(1_000, expSec * 1000 - Date.now());
  } else {
    // Default to access-token horizon (matches max ACCESS_TOKEN_EXPIRE_MINUTES).
    ttlMs = 60 * 60 * 1000;
  }
  ttlMs = Math.min(ttlMs, 24 * 60 * 60 * 1000);
  try {
    const { getSharedRedisConnection } = await import("@/lib/queue/redis");
    const redis = getSharedRedisConnection();
    await redis.set(`auth:denylist:${jti}`, "1", "PX", ttlMs);
  } catch {
    // Best-effort.
  }
}

// ---------------------------------------------------------------------------
// LRU identity cache for the write path
// ---------------------------------------------------------------------------

type CachedIdentity = {
  user: ApiUserWithActive;
  jti: string | null;
  expiresAt: number;
};

const identityLru = new Map<number, CachedIdentity>();
const IDENTITY_LRU_TTL_MS = 30_000;
const IDENTITY_LRU_MAX = 5_000;

function lruGetIdentity(userId: number): CachedIdentity | null {
  const e = identityLru.get(userId);
  if (!e) return null;
  if (e.expiresAt <= Date.now()) {
    identityLru.delete(userId);
    return null;
  }
  // Re-insert to move to most-recently-used position.
  identityLru.delete(userId);
  identityLru.set(userId, e);
  return e;
}

function lruSetIdentity(userId: number, entry: CachedIdentity): void {
  if (identityLru.size >= IDENTITY_LRU_MAX) {
    const first = identityLru.keys().next().value;
    if (first != null) identityLru.delete(first);
  }
  identityLru.set(userId, entry);
}

export function invalidateIdentityCache(userId: number): void {
  identityLru.delete(userId);
}

// ---------------------------------------------------------------------------
// Public guards
// ---------------------------------------------------------------------------

function fastPathDisabled(): boolean {
  return process.env.RMS_AUTH_FASTPATH === "false";
}

/**
 * GET fast path. Pure claims-trust: signature + denylist + (optional) shape
 * checks. Zero DB queries when claims are complete and the token is fresh.
 */
export async function requireGetIdentity(
  req: Request,
): Promise<ApiUser | NextResponse> {
  if (fastPathDisabled()) {
    const { requireBearerUser } = await import("./api-guard");
    return requireBearerUser(req);
  }
  const token = tokenFromRequest(req);
  if (!token) return unauthorized();
  const claims = await verifyAndExtractClaims(token);
  if (!claims) return unauthorized();

  if (claims.jti && (await isJtiDenied(claims.jti))) {
    notePerfTag("auth_path", "claims_denied");
    return unauthorized();
  }

  // Tokens minted before this rollout (no jti, no roles in token) -> degrade
  // gracefully. Maintains compatibility for the access-TTL window during
  // rollout without trusting an under-specified token.
  if (!claims.jti || !claims.orgId || claims.roles.length === 0) {
    notePerfTag("auth_path", "claims_partial");
    const { requireBearerUser } = await import("./api-guard");
    return requireBearerUser(req);
  }

  notePerfTag("auth_path", "claims");
  return {
    userId: Number.parseInt(claims.sub, 10),
    username: claims.username,
    roles: claims.roles,
    organizationId: claims.orgId,
  };
}

/**
 * Write/admin path. Verifies signature + denylist, then either returns a
 * cached identity (LRU keyed by userId, scoped to current jti) or performs
 * exactly one DB lookup to refresh it.
 */
export async function requireWriteIdentity(
  req: Request,
): Promise<ApiUser | NextResponse> {
  if (fastPathDisabled()) {
    const { requireBearerUser } = await import("./api-guard");
    return requireBearerUser(req);
  }
  const token = tokenFromRequest(req);
  if (!token) return unauthorized();
  const claims = await verifyAndExtractClaims(token);
  if (!claims) return unauthorized();

  if (claims.jti && (await isJtiDenied(claims.jti))) {
    notePerfTag("auth_path", "claims_denied");
    return unauthorized();
  }

  const userId = Number.parseInt(claims.sub, 10);
  const cached = lruGetIdentity(userId);
  if (cached && cached.jti === claims.jti) {
    if (!cached.user.isActive) {
      return NextResponse.json(
        { detail: "User account is inactive" },
        { status: 403 },
      );
    }
    notePerfTag("auth_path", "db_cached");
    const { isActive: _isActive, ...user } = cached.user;
    void _isActive;
    return user;
  }

  // Cache miss: single DB read, single org check.
  const userWithRoles = await timePerf("auth_ms_user_db", () =>
    findUserWithRolesById(userId),
  );
  if (!userWithRoles) {
    return NextResponse.json({ detail: "User not found" }, { status: 401 });
  }
  const dbRoles = normalizeRoleList(userWithRoles.roles);
  let organizationId = claims.orgId;
  if (organizationId) {
    const belongs = await timePerf("auth_ms_org_db", () =>
      userBelongsToOrganization(userId, organizationId),
    );
    if (!belongs) {
      organizationId = await timePerf("auth_ms_org_db", () =>
        resolveOrganizationIdForUser(userId),
      );
    }
  } else {
    organizationId = await timePerf("auth_ms_org_db", () =>
      resolveOrganizationIdForUser(userId),
    );
  }
  const fresh: ApiUserWithActive = {
    userId,
    username: userWithRoles.user.username,
    roles: dbRoles.length > 0 ? dbRoles : claims.roles,
    organizationId,
    isActive: userWithRoles.user.isActive !== false,
  };
  lruSetIdentity(userId, {
    user: fresh,
    jti: claims.jti,
    expiresAt: Date.now() + IDENTITY_LRU_TTL_MS,
  });
  if (!fresh.isActive) {
    return NextResponse.json(
      { detail: "User account is inactive" },
      { status: 403 },
    );
  }
  notePerfTag("auth_path", "db_fresh");
  const { isActive: _isActive, ...user } = fresh;
  void _isActive;
  return user;
}

/**
 * Tries to extract `(jti, expSec)` from the access token attached to the
 * request without doing any DB work. Used by `/api/auth/logout` to publish
 * the denylist entry.
 */
export async function tryReadAccessJti(
  req: Request,
): Promise<{ jti: string | null; expSec: number | null }> {
  const token = tokenFromRequest(req);
  if (!token) return { jti: null, expSec: null };
  const claims = await verifyAndExtractClaims(token);
  if (!claims) return { jti: null, expSec: null };
  return { jti: claims.jti, expSec: claims.expSec };
}
