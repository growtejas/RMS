import { NextResponse } from "next/server";

import { verifyAccessToken } from "@/lib/auth/jwt";
import { normalizeRoleList, rolesMatchAny } from "@/lib/auth/normalize-roles";
import {
  findUserWithRolesById,
} from "@/lib/repositories/auth-user";
import { ACCESS_COOKIE, getCookie } from "@/lib/auth/cookies";

export type ApiUser = {
  userId: number;
  username: string;
  roles: string[];
};

export async function requireBearerUser(
  req: Request,
): Promise<ApiUser | NextResponse> {
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  const token = getCookie(req, ACCESS_COOKIE) ?? m?.[1] ?? null;
  if (!token) {
    return NextResponse.json({ detail: "Could not validate credentials" }, { status: 401 });
  }

  let payload: Awaited<ReturnType<typeof verifyAccessToken>>;
  try {
    payload = await verifyAccessToken(token);
  } catch {
    return NextResponse.json(
      { detail: "Could not validate credentials" },
      {
        status: 401,
      },
    );
  }

  const userId = payload.sub != null ? Number.parseInt(String(payload.sub), 10) : NaN;
  if (!Number.isFinite(userId)) {
    return NextResponse.json(
      { detail: "Could not validate credentials" },
      { status: 401 },
    );
  }

  const userWithRoles = await findUserWithRolesById(userId);
  if (!userWithRoles) {
    return NextResponse.json({ detail: "User not found" }, { status: 401 });
  }
  if (userWithRoles.user.isActive === false) {
    return NextResponse.json(
      { detail: "User account is inactive" },
      { status: 403 },
    );
  }

  const roles = normalizeRoleList(userWithRoles.roles);

  return {
    userId,
    username: userWithRoles.user.username,
    roles,
  };
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
