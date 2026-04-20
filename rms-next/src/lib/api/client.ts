import axios from "axios";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const parts = document.cookie.split(";").map((p) => p.trim());
  for (const p of parts) {
    if (!p) continue;
    const eq = p.indexOf("=");
    if (eq <= 0) continue;
    const k = p.slice(0, eq);
    if (k === name) {
      return decodeURIComponent(p.slice(eq + 1));
    }
  }
  return null;
}

/**
 * Browser: always call this Next app’s `/api` on the current origin so login and
 * XHR work even when an old dev bundle still inlines a stale `NEXT_PUBLIC_*` URL
 * (e.g. port 8000). Server / tests: `NEXT_PUBLIC_API_BASE_URL` or localhost default.
 */
function defaultApiBaseURL(): string | undefined {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/api`;
  }
  const env = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (env && env !== "undefined") {
    return env.replace(/\/$/, "");
  }
  return "http://127.0.0.1:3000/api";
}

export const apiClient = axios.create({
  baseURL: defaultApiBaseURL(),
  withCredentials: true,
  /** Ranking and some DB-heavy routes can exceed 25s on cold DB or large payloads. */
  timeout: 120_000,
  headers: {
    "Content-Type": "application/json",
  },
  xsrfCookieName: "rfm_csrf",
  xsrfHeaderName: "x-csrf-token",
});

apiClient.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    config.baseURL = `${window.location.origin}/api`;
  }
  // Normalize URLs: avoid Next.js 308 redirects on trailing slashes (e.g. `/skills/` → `/skills`).
  // Only touches relative string URLs; absolute URLs are left as-is.
  if (typeof config.url === "string") {
    const u = config.url;
    if (u.startsWith("/") && u.length > 1 && u.endsWith("/")) {
      config.url = u.replace(/\/+$/, "");
    }
  }
  if (config.data instanceof FormData) {
    const h = config.headers;
    if (h && typeof (h as { delete?: (k: string) => void }).delete === "function") {
      (h as { delete: (k: string) => void }).delete("Content-Type");
    } else if (h && typeof h === "object") {
      delete (h as Record<string, unknown>)["Content-Type"];
    }
  }
  // CSRF token: middleware expects header on unsafe methods.
  const method = (config.method ?? "get").toUpperCase();
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    const csrf = readCookie("rfm_csrf");
    if (csrf) {
      config.headers = config.headers ?? {};
      (config.headers as Record<string, string>)["x-csrf-token"] = csrf;
    }
  }
  return config;
});
