import { NextResponse } from "next/server";

import { requireBearerUser } from "@/lib/auth/api-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/auth/me — cookie-authenticated session info. */
export async function GET(req: Request) {
  const user = await requireBearerUser(req);
  if (user instanceof NextResponse) {
    return user;
  }
  return NextResponse.json({
    user_id: user.userId,
    username: user.username,
    roles: user.roles,
  });
}

