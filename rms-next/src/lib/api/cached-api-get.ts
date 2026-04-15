import type { AxiosRequestConfig } from "axios";

import { apiClient } from "@/lib/api/client";

export type CachedGetConfig = AxiosRequestConfig & {
  cacheTtlMs?: number;
  bypassCache?: boolean;
};

const DEFAULT_TTL_MS = 45_000;

const store = new Map<string, { at: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

function normalizeRelativeUrl(url: string): string {
  if (url.startsWith("/") && url.length > 1) {
    return url.replace(/\/+$/, "");
  }
  return url;
}

function keyFor(url: string, config?: AxiosRequestConfig): string {
  url = normalizeRelativeUrl(url);
  const p = config?.params;
  if (
    p &&
    typeof p === "object" &&
    !Array.isArray(p) &&
    !(p instanceof URLSearchParams)
  ) {
    const rec = p as Record<string, unknown>;
    const sorted = Object.keys(rec)
      .sort()
      .map((k) => `${k}=${String(rec[k])}`)
      .join("&");
    return sorted ? `${url}?${sorted}` : url;
  }
  return url;
}

/**
 * GET with short TTL + in-flight dedupe. Response body is returned (not AxiosResponse).
 * Do not use for frequently polled endpoints unless you pass bypassCache or a low ttl.
 */
export async function cachedApiGet<T>(
  url: string,
  config?: CachedGetConfig,
): Promise<T> {
  url = normalizeRelativeUrl(url);
  const cacheTtlMs = config?.cacheTtlMs ?? DEFAULT_TTL_MS;
  const bypassCache = config?.bypassCache ?? false;
  const axiosConfig: AxiosRequestConfig = { ...(config ?? {}) };
  delete (axiosConfig as Record<string, unknown>).cacheTtlMs;
  delete (axiosConfig as Record<string, unknown>).bypassCache;

  const key = `GET ${keyFor(url, axiosConfig)}`;

  if (!bypassCache) {
    const hit = store.get(key);
    if (hit && Date.now() - hit.at < cacheTtlMs) {
      return hit.data as T;
    }
    const pending = inflight.get(key);
    if (pending) {
      return pending as Promise<T>;
    }
  }

  const promise = apiClient
    .get<T>(url, axiosConfig)
    .then((res) => {
      const data = res.data as T;
      if (!bypassCache) {
        store.set(key, { at: Date.now(), data });
      }
      inflight.delete(key);
      return data;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });

  if (!bypassCache) {
    inflight.set(key, promise);
  }

  return promise as Promise<T>;
}

/** Drop cached GETs whose key contains this substring (e.g. "/skills/"). */
export function invalidateCachedApiGetByUrlSubstring(substring: string): void {
  for (const k of Array.from(store.keys())) {
    if (k.includes(substring)) {
      store.delete(k);
    }
  }
}
