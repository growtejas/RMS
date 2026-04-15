import { NextResponse } from "next/server";

import { verifyRefreshToken } from "@/lib/auth/jwt";
import { refreshForUserId } from "@/lib/services/auth-service";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  CSRF_COOKIE,
  cookieOptions,
  csrfCookieOptions,
  newCsrfToken,
  getCookie,
} from "@/lib/auth/cookies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const token = getCookie(req, REFRESH_COOKIE);
    if (!token) {
      return NextResponse.json({ detail: "Could not validate credentials" }, { status: 401 });
    }

    let payload;
    try {
      payload = await verifyRefreshToken(token);
    } catch {
      return NextResponse.json(
        { detail: "Could not validate credentials" },
        { status: 401 },
      );
    }

    const sub = payload.sub;
    const userId = sub != null ? Number.parseInt(String(sub), 10) : NaN;
    if (!Number.isFinite(userId)) {
      return NextResponse.json(
        { detail: "Could not validate credentials" },
        { status: 401 },
      );
    }

    const result = await refreshForUserId(userId);
    if (!result.ok) {
      return NextResponse.json(
        { detail: result.error.detail },
        { status: result.error.status },
      );
    }
    const csrf = newCsrfToken();
    const res = NextResponse.json({
      token_type: "bearer",
      user_id: result.body.user_id,
      username: result.body.username,
      roles: result.body.roles,
      csrf_token: csrf,
    });
    res.cookies.set(ACCESS_COOKIE, result.body.access_token, cookieOptions());
    if (result.body.refresh_token) {
      res.cookies.set(
        REFRESH_COOKIE,
        result.body.refresh_token,
        cookieOptions({ path: "/api/auth/refresh" }),
      );
    }
    res.cookies.set(CSRF_COOKIE, csrf, csrfCookieOptions());
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    if (message.includes("DATABASE_URL")) {
      return NextResponse.json(
        { detail: "Server misconfigured: database connection" },
        { status: 503 },
      );
    }
    if (message.includes("JWT_SECRET_KEY") || message.includes("SECRET_KEY")) {
      return NextResponse.json(
        { detail: "Server misconfigured: JWT secret" },
        { status: 503 },
      );
    }
    console.error("[auth/refresh]", e);
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
}
