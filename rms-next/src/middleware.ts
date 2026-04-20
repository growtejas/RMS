import { NextResponse, type NextRequest } from "next/server";

import { tryParseAuthorizationAccessToken } from "@/lib/auth/auth-header";
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
    // Resume PDF preview uses <iframe src={blob:...}> after authenticated fetch.
    "frame-src 'self' blob:",
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

/** JWT in Authorization is not auto-sent on cross-site requests like cookies; skip double-submit CSRF for those calls. */
function hasAuthorizationAccessToken(req: NextRequest): boolean {
  return tryParseAuthorizationAccessToken(req.headers.get("authorization")) != null;
}

/**
 * Local / staging convenience for curl, Postman, or SPA-on-other-port without CSRF wiring.
 * Ignored when NODE_ENV=production so it cannot be left on by mistake in prod.
 */
function isCsrfDisabledForNonProd(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const v = process.env.API_CSRF_DISABLE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  setSecurityHeaders(res);

  const incoming = req.headers.get(REQUEST_ID_HEADER);
  const reqId = incoming?.trim() ? incoming.trim() : newRequestId();
  res.headers.set(REQUEST_ID_HEADER, reqId);

  if (needsCsrf(req) && !isCsrfDisabledForNonProd() && !hasAuthorizationAccessToken(req)) {
    if (!sameOrigin(req)) {
      const deny = NextResponse.json(
        isProd()
          ? { detail: "CSRF blocked (origin)" }
          : {
              detail: "CSRF blocked (origin)",
              hint: "Call the API from the same origin as the Next app, or send Authorization: Bearer <jwt>, or set API_CSRF_DISABLE=true in .env.local (dev only).",
            },
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
        isProd()
          ? { detail: "CSRF token missing or invalid" }
          : {
              detail: "CSRF token missing or invalid",
              hint: "Send Authorization: Bearer <access_token>, or header x-csrf-token equal to the rfm_csrf cookie value after login. Local dev only: API_CSRF_DISABLE=true in .env.local.",
            },
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

