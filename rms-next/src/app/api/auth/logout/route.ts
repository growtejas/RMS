import { NextResponse } from "next/server";

import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  CSRF_COOKIE,
  cookieOptions,
  csrfCookieOptions,
} from "@/lib/auth/cookies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ message: "Logged out" });
  res.cookies.set(ACCESS_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, "", { ...cookieOptions({ path: "/api/auth/refresh" }), maxAge: 0 });
  res.cookies.set(CSRF_COOKIE, "", { ...csrfCookieOptions(), maxAge: 0 });
  return res;
}

