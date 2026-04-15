export const ACCESS_COOKIE = "rfm_access";
export const REFRESH_COOKIE = "rfm_refresh";
export const CSRF_COOKIE = "rfm_csrf";

export function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

export function cookieOptions(params?: { path?: string; maxAgeSeconds?: number }) {
  return {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax" as const,
    path: params?.path ?? "/",
    ...(params?.maxAgeSeconds != null ? { maxAge: params.maxAgeSeconds } : {}),
  };
}

export function csrfCookieOptions() {
  return {
    httpOnly: false,
    secure: isProd(),
    sameSite: "lax" as const,
    path: "/",
  };
}

function bytesToBase64Url(bytes: Uint8Array): string {
  // Convert to base64url without importing Node-only modules (Edge-safe).
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  // btoa exists in Edge/runtime; Node 20 also provides it via undici in Next runtime.
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function newCsrfToken(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export function parseCookieHeader(req: Request): Record<string, string> {
  const header = req.headers.get("cookie") ?? "";
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const p = part.trim();
    if (!p) continue;
    const eq = p.indexOf("=");
    if (eq <= 0) continue;
    const k = p.slice(0, eq).trim();
    const v = p.slice(eq + 1).trim();
    if (!k) continue;
    out[k] = decodeURIComponent(v);
  }
  return out;
}

export function getCookie(req: Request, name: string): string | null {
  const map = parseCookieHeader(req);
  return map[name] ?? null;
}

