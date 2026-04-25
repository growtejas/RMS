import { NextResponse } from "next/server";

import { verifyAccessToken } from "@/lib/auth/jwt";
import { normalizeRoleList, rolesMatchAny } from "@/lib/auth/normalize-roles";
import {
  findUserWithRolesById,
} from "@/lib/repositories/auth-user";
import { tryParseAuthorizationAccessToken } from "@/lib/auth/auth-header";
import { ACCESS_COOKIE, getCookie } from "@/lib/auth/cookies";
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
    payload = await verifyAccessToken(token);
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

  const userWithRoles = await findUserWithRolesById(userId);
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
  if (claimOrg && (await userBelongsToOrganization(userId, claimOrg))) {
    organizationId = claimOrg;
  } else {
    organizationId = await resolveOrganizationIdForUser(userId);
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

export async function requireBearerUser(
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
