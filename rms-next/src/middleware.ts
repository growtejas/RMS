import { NextResponse, type NextRequest } from "next/server";

import { CSRF_COOKIE } from "@/lib/auth/cookies";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

function setSecurityHeaders(res: NextResponse) {
  // Baseline hardening; tuned to avoid breaking Next dev experience.
  if (isProd()) {
    res.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload",
    );
  }
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // Prefer CSP over X-Frame-Options; keep both for defense-in-depth.
  res.headers.set("X-Frame-Options", "DENY");

  const scriptSrc = isProd()
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
  // Note: we allow inline styles to avoid breaking common component libs; tighten once audited.
  const csp = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  res.headers.set("Content-Security-Policy", csp);
}

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // same-origin navigations often omit Origin
  return origin === req.nextUrl.origin;
}

function needsCsrf(req: NextRequest): boolean {
  const m = req.method.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return false;
  const p = req.nextUrl.pathname;
  // Allow auth bootstrap endpoints without CSRF.
  if (p === "/api/auth/login" || p === "/api/auth/refresh") return false;
  return p.startsWith("/api/");
}

export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  setSecurityHeaders(res);

  const incoming = req.headers.get(REQUEST_ID_HEADER);
  const reqId = incoming?.trim() ? incoming.trim() : newRequestId();
  res.headers.set(REQUEST_ID_HEADER, reqId);

  if (needsCsrf(req)) {
    if (!sameOrigin(req)) {
      const deny = NextResponse.json(
        { detail: "CSRF blocked (origin)" },
        { status: 403 },
      );
      setSecurityHeaders(deny);
      deny.headers.set(REQUEST_ID_HEADER, reqId);
      return deny;
    }
    const cookie = req.cookies.get(CSRF_COOKIE)?.value ?? "";
    const header = req.headers.get("x-csrf-token") ?? "";
    if (!cookie || !header || cookie !== header) {
      const deny = NextResponse.json(
        { detail: "CSRF token missing or invalid" },
        { status: 403 },
      );
      setSecurityHeaders(deny);
      deny.headers.set(REQUEST_ID_HEADER, reqId);
      return deny;
    }
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

