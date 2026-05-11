import { NextResponse } from "next/server";

import { verifyAccessToken } from "@/lib/auth/jwt";
import { normalizeRoleList, rolesMatchAny } from "@/lib/auth/normalize-roles";
import {
  findUserWithRolesById,
} from "@/lib/repositories/auth-user";
import { tryParseAuthorizationAccessToken } from "@/lib/auth/auth-header";
import { ACCESS_COOKIE, getCookie } from "@/lib/auth/cookies";
import { notePerfTag, timePerf } from "@/lib/perf/request-perf";
import {
  resolveOrganizationIdForUser,
  userBelongsToOrganization,
} from "@/lib/tenant/resolve-org";

export type ApiUser = {
  userId: number;
  username: string;
  roles: string[];
  /** Active tenant for ATS-scoped queries. */
  organizationId: string;
};

export type ApiUserWithActive = ApiUser & { isActive: boolean };

async function resolveUserFromRequest(
  req: Request,
): Promise<
  | { ok: true; user: ApiUserWithActive }
  | { ok: false; response: NextResponse }
> {
  const auth = req.headers.get("authorization") ?? "";
  const token =
    getCookie(req, ACCESS_COOKIE) ?? tryParseAuthorizationAccessToken(auth) ?? null;
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        { detail: "Could not validate credentials" },
        { status: 401 },
      ),
    };
  }

  let payload: Awaited<ReturnType<typeof verifyAccessToken>>;
  try {
    payload = await timePerf("auth_ms_jwt", () => verifyAccessToken(token));
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { detail: "Could not validate credentials" },
        { status: 401 },
      ),
    };
  }

  const userId = payload.sub != null ? Number.parseInt(String(payload.sub), 10) : NaN;
  if (!Number.isFinite(userId)) {
    return {
      ok: false,
      response: NextResponse.json(
        { detail: "Could not validate credentials" },
        { status: 401 },
      ),
    };
  }

  // Default attribution for the legacy DB-backed path; the fast path overrides
  // this tag in identity-fastpath.ts.
  notePerfTag("auth_path", "db_full");

  const userWithRoles = await timePerf("auth_ms_user_db", () =>
    findUserWithRolesById(userId),
  );
  if (!userWithRoles) {
    return {
      ok: false,
      response: NextResponse.json({ detail: "User not found" }, { status: 401 }),
    };
  }

  const roles = normalizeRoleList(userWithRoles.roles);

  const claimOrgRaw = (payload as { org_id?: unknown }).org_id;
  const claimOrg =
    typeof claimOrgRaw === "string" && claimOrgRaw.length > 0 ? claimOrgRaw : null;
  let organizationId: string;
  if (claimOrg) {
    const belongs = await timePerf("auth_ms_org_db", () =>
      userBelongsToOrganization(userId, claimOrg),
    );
    organizationId = belongs
      ? claimOrg
      : await timePerf("auth_ms_org_db", () =>
          resolveOrganizationIdForUser(userId),
        );
  } else {
    organizationId = await timePerf("auth_ms_org_db", () =>
      resolveOrganizationIdForUser(userId),
    );
  }

  return {
    ok: true,
    user: {
      userId,
      username: userWithRoles.user.username,
      roles,
      organizationId,
      isActive: userWithRoles.user.isActive !== false,
    },
  };
}

function isReadMethod(method: string): boolean {
  const m = method.toUpperCase();
  return m === "GET" || m === "HEAD" || m === "OPTIONS";
}

/**
 * Hybrid auth entry point used by the 161 route handlers in `src/app/api/`.
 *
 *   - GET / HEAD / OPTIONS  -> claims-trust fast path (no DB).
 *   - everything else        -> LRU-cached DB-backed identity.
 *
 * Routes do not need to change. The fast path is a no-op (delegates back
 * to the legacy resolver) when `RMS_AUTH_FASTPATH=false` so we have an
 * instant rollback flag.
 */
export async function requireBearerUser(
  req: Request,
): Promise<ApiUser | NextResponse> {
  if (process.env.RMS_AUTH_FASTPATH !== "false") {
    const { requireGetIdentity, requireWriteIdentity } = await import(
      "./identity-fastpath"
    );
    return isReadMethod(req.method)
      ? requireGetIdentity(req)
      : requireWriteIdentity(req);
  }
  return legacyRequireBearerUser(req);
}

/**
 * Legacy DB-backed resolver, kept exported for explicit "always do the
 * full DB validation" call sites (e.g. /auth/refresh) and as the rollback
 * target for `RMS_AUTH_FASTPATH=false`.
 */
export async function legacyRequireBearerUser(
  req: Request,
): Promise<ApiUser | NextResponse> {
  const resolved = await resolveUserFromRequest(req);
  if (!resolved.ok) {
    return resolved.response;
  }
  if (!resolved.user.isActive) {
    return NextResponse.json(
      { detail: "User account is inactive" },
      { status: 403 },
    );
  }
  const { isActive: _isActive, ...user } = resolved.user;
  void _isActive;
  return user;
}

/** Like {@link requireBearerUser} but does not block inactive accounts (used for access-request onboarding). */
export async function requireBearerUserAllowInactive(
  req: Request,
): Promise<ApiUserWithActive | NextResponse> {
  const resolved = await resolveUserFromRequest(req);
  if (!resolved.ok) {
    return resolved.response;
  }
  return resolved.user;
}

/** Resolves a bearer session or returns `null` (no 401 — for `/api/auth/session` bootstrap). */
export async function tryResolveBearerUserAllowInactive(
  req: Request,
): Promise<ApiUserWithActive | null> {
  const resolved = await resolveUserFromRequest(req);
  if (!resolved.ok) {
    return null;
  }
  return resolved.user;
}

export function requireAnyRole(
  user: ApiUser,
  ...requiredRoles: string[]
): NextResponse | null {
  if (!rolesMatchAny(user.roles, requiredRoles)) {
    const yours = user.roles.length ? user.roles.join(", ") : "(none)";
    return NextResponse.json(
      {
        detail: `Access denied. Required one of: ${requiredRoles.join(", ")}. Your roles: ${yours}`,
      },
      { status: 403 },
    );
  }
  return null;
}
