import { NextResponse } from "next/server";

import { tryResolveBearerUserAllowInactive } from "@/lib/auth/api-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/session — same identity as `/auth/me` but always **200** so
 * the browser does not log a 401 for “not signed in” during client bootstrap.
 */
export async function GET(req: Request) {
  const user = await tryResolveBearerUserAllowInactive(req);
  if (!user) {
    return NextResponse.json({ authenticated: false });
  }
  return NextResponse.json({
    authenticated: true,
    user_id: user.userId,
    username: user.username,
    roles: user.roles,
    organization_id: user.organizationId,
    is_active: user.isActive,
  });
}
