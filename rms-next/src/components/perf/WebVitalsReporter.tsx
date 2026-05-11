"use client";

import { useEffect } from "react";
import type { Metric } from "web-vitals";

/**
 * Phase 8 - browser RUM emitter. Mounted once at the app root so we
 * cover every route. Each Web Vitals sample is `navigator.sendBeacon`-ed
 * to `/api/rum` (best-effort, never blocks navigation).
 *
 * We also emit the navigation timing's hydration interval as a synthetic
 * metric so the dashboards can correlate hydration with INP regressions.
 */
function postRum(payload: Record<string, unknown>): void {
  try {
    const body = JSON.stringify(payload);
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/rum", blob);
      return;
    }
    void fetch("/api/rum", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  } catch {
    // Silently drop - RUM must not break navigation.
  }
}

function reportVital(metric: Metric, route: string): void {
  postRum({
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    id: metric.id,
    navigationType: metric.navigationType,
    route,
    ts: Date.now(),
  });
}

export function WebVitalsReporter() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const route = window.location.pathname;
    let cancelled = false;
    void import("web-vitals")
      .then((mod) => {
        if (cancelled) return;
        mod.onLCP((m) => reportVital(m, route));
        mod.onINP((m) => reportVital(m, route));
        mod.onCLS((m) => reportVital(m, route));
        mod.onTTFB((m) => reportVital(m, route));
        mod.onFCP((m) => reportVital(m, route));
      })
      .catch(() => undefined);

    // Hydration / TTI proxy from the navigation entry. Reported once per
    // page load. `loadEventEnd - responseStart` is a stable approximation
    // of "page is interactive enough to render".
    try {
      const entries = performance.getEntriesByType(
        "navigation",
      ) as PerformanceNavigationTiming[];
      const nav = entries[0];
      if (nav && Number.isFinite(nav.loadEventEnd - nav.responseStart)) {
        const hydrationMs = Math.max(0, nav.loadEventEnd - nav.responseStart);
        postRum({
          name: "HYDRATION",
          value: hydrationMs,
          hydration_ms: hydrationMs,
          route,
          ts: Date.now(),
        });
      }
    } catch {
      /* best-effort */
    }
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
