import { NextResponse } from "next/server";

import { loginWithPassword } from "@/lib/services/auth-service";
import { loginBodySchema } from "@/lib/validators/auth";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  CSRF_COOKIE,
  cookieOptions,
  csrfCookieOptions,
  newCsrfToken,
} from "@/lib/auth/cookies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ detail: "Invalid JSON" }, { status: 400 });
    }

    const parsed = loginBodySchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return NextResponse.json({ detail: msg }, { status: 422 });
    }

    const result = await loginWithPassword(
      parsed.data.username,
      parsed.data.password,
    );
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
    console.error("[auth/login]", e);
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
}
