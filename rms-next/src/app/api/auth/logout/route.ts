import { NextResponse } from "next/server";

import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  CSRF_COOKIE,
  cookieOptions,
  csrfCookieOptions,
} from "@/lib/auth/cookies";
import {
  publishJtiDenylist,
  tryReadAccessJti,
} from "@/lib/auth/identity-fastpath";
import { withRequestPerf } from "@/lib/perf/request-perf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return withRequestPerf("POST /api/auth/logout", async () => {
    // Read jti before we destroy the cookies so we can revoke it.
    const { jti, expSec } = await tryReadAccessJti(req);
    if (jti) {
      await publishJtiDenylist(jti, expSec);
    }
    const res = NextResponse.json({ message: "Logged out" });
    res.cookies.set(ACCESS_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
    res.cookies.set(REFRESH_COOKIE, "", {
      ...cookieOptions({ path: "/api/auth/refresh" }),
      maxAge: 0,
    });
    res.cookies.set(CSRF_COOKIE, "", { ...csrfCookieOptions(), maxAge: 0 });
    return res;
  });
}

