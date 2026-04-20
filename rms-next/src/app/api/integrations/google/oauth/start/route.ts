import { NextResponse } from "next/server";

import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/integrations/google/oauth/start — feature-flagged OAuth bootstrap (stub).
 * Wire NextAuth / Google provider + encrypted token storage on `organizations.google_oauth_tokens`.
 */
export async function GET(req: Request) {
  const user = await requireBearerUser(req);
  if (user instanceof NextResponse) {
    return user;
  }
  const denied = requireAnyRole(user, "Admin", "HR");
  if (denied) {
    return denied;
  }
  if (process.env.GOOGLE_WORKSPACE_INTEGRATION_ENABLED !== "true") {
    return NextResponse.json({ detail: "Google integration disabled" }, { status: 404 });
  }
  const url = new URL(req.url);
  const redirect = `${url.origin}/api/integrations/google/oauth/callback`;
  return NextResponse.json({
    message: "OAuth stub — configure Google client id/secret and replace with redirect URL",
    organization_id: user.organizationId,
    redirect_uri: redirect,
  });
}
