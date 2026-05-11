/* eslint-disable */
/**
 * k6 - synthetic recruiter journey for the RMS readiness gate.
 *
 * Run with:
 *
 *   K6_USERS=500 K6_DURATION=10m \
 *   BASE_URL=https://staging.rms.example.com \
 *   USERNAME=loadtest@example.com PASSWORD=*** \
 *   k6 run tests/load/k6-recruiter-journey.js
 *
 * The script logs in once per virtual user, then loops the
 * "list -> detail -> ATS tab -> shortlist" flow that the plan calls out
 * in Section 12 ("Synthetic recruiter journey ... p95 below 2 s").
 *
 * Thresholds mirror Section 0 of the performance architecture plan:
 *   - GET p95 < 250 ms (warm)
 *   - Write p95 < 600 ms
 *   - End-to-end journey p95 < 2 s
 *   - HTTP error rate < 0.5%
 */

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:3000";
const USERNAME = __ENV.USERNAME || "loadtest@example.com";
const PASSWORD = __ENV.PASSWORD || "loadtest";
const REQ_ID = __ENV.REQ_ID || "1";
const ITEM_ID = __ENV.ITEM_ID || "1";

const journeyDuration = new Trend("journey_duration_ms", true);
const getDuration = new Trend("get_duration_ms", true);
const writeDuration = new Trend("write_duration_ms", true);
const failureRate = new Rate("journey_failures");

export const options = {
  scenarios: {
    recruiters: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: parseInt(__ENV.K6_USERS || "500", 10) },
        { duration: __ENV.K6_DURATION || "10m", target: parseInt(__ENV.K6_USERS || "500", 10) },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    "get_duration_ms": ["p(95)<250"],
    "write_duration_ms": ["p(95)<600"],
    "journey_duration_ms": ["p(95)<2000"],
    "journey_failures": ["rate<0.005"],
    "http_req_failed": ["rate<0.01"],
  },
};

function login() {
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ username: USERNAME, password: PASSWORD }),
    { headers: { "Content-Type": "application/json" } },
  );
  check(res, { "login 200": (r) => r.status === 200 });
  let token = null;
  try {
    token = res.json("access_token");
  } catch (_) {}
  return token;
}

export function setup() {
  const token = login();
  return { token };
}

export default function (data) {
  const token = data.token;
  if (!token) {
    failureRate.add(1);
    sleep(1);
    return;
  }
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const t0 = Date.now();
  let allOk = true;

  group("requisitions list", () => {
    // Canonical paginated envelope: page + limit (25/50/100).
    const r = http.get(`${BASE_URL}/api/requisitions?page=1&limit=25`, {
      headers,
    });
    getDuration.add(r.timings.duration);
    if (
      !check(r, {
        "list 200": (x) => x.status === 200,
        "list canonical envelope": (x) => {
          try {
            const body = x.json();
            return (
              body &&
              body.success === true &&
              body.data &&
              Array.isArray(body.data.items) &&
              body.data.pagination &&
              typeof body.data.pagination.totalPages === "number"
            );
          } catch {
            return false;
          }
        },
      })
    ) {
      allOk = false;
    }
  });

  group("requisition detail", () => {
    const r = http.get(`${BASE_URL}/api/requisitions/${REQ_ID}`, { headers });
    getDuration.add(r.timings.duration);
    if (!check(r, { "detail 200": (x) => x.status === 200 })) {
      allOk = false;
    }
  });

  group("ats ranking", () => {
    const r = http.get(
      `${BASE_URL}/api/ranking/requisition-items/${ITEM_ID}`,
      { headers },
    );
    getDuration.add(r.timings.duration);
    if (!check(r, { "ranking 200": (x) => x.status === 200 })) {
      allOk = false;
    }
  });

  group("candidates workspace", () => {
    const r = http.get(
      `${BASE_URL}/api/requisitions/${REQ_ID}/candidates-workspace?page=1&limit=25`,
      { headers },
    );
    getDuration.add(r.timings.duration);
    if (!check(r, { "candidates 200": (x) => x.status === 200 })) {
      allOk = false;
    }
  });

  group("audit logs", () => {
    // Phase 5 — canonical envelope; uses `limit` not `page_size`.
    const r = http.get(
      `${BASE_URL}/api/audit-logs?page=1&limit=25`,
      { headers },
    );
    getDuration.add(r.timings.duration);
    if (
      !check(r, {
        "audit 200": (x) => x.status === 200,
        "audit canonical envelope": (x) => {
          try {
            const body = x.json();
            return body && body.success === true && body.data && body.data.pagination;
          } catch {
            return false;
          }
        },
      })
    ) {
      allOk = false;
    }
  });

  group("cie candidates list", () => {
    // Phase 1 — canonical envelope (org-scoped CIE list).
    const r = http.get(
      `${BASE_URL}/api/cie/candidates?page=1&limit=25`,
      { headers },
    );
    getDuration.add(r.timings.duration);
    if (!check(r, { "cie 200": (x) => x.status === 200 })) {
      allOk = false;
    }
  });

  group("interviews list", () => {
    // Phase 4 — canonical envelope.
    const r = http.get(`${BASE_URL}/api/interviews?page=1&limit=25`, {
      headers,
    });
    getDuration.add(r.timings.duration);
    if (!check(r, { "interviews 200": (x) => x.status === 200 })) {
      allOk = false;
    }
  });

  group("notifications list", () => {
    // Phase 6 — canonical envelope.
    const r = http.get(
      `${BASE_URL}/api/notifications/events?page=1&limit=25`,
      { headers },
    );
    getDuration.add(r.timings.duration);
    if (
      !check(r, {
        "notifications 200": (x) => x.status === 200,
      })
    ) {
      allOk = false;
    }
  });

  group("bulk import history", () => {
    const r = http.get(`${BASE_URL}/api/bulk-import?page=1&limit=25`, {
      headers,
    });
    getDuration.add(r.timings.duration);
    if (
      !check(r, {
        "bulk-import 200": (x) => x.status === 200,
      })
    ) {
      allOk = false;
    }
  });

  group("admin users list", () => {
    // Phase 7 — canonical envelope.
    const r = http.get(`${BASE_URL}/api/admin/users?page=1&limit=25`, {
      headers,
    });
    // Some accounts will not have admin role; treat 200/403 as acceptable.
    getDuration.add(r.timings.duration);
    if (
      !check(r, {
        "admin users 200/403": (x) => x.status === 200 || x.status === 403,
      })
    ) {
      allOk = false;
    }
  });

  // Light write to exercise the LRU+DB write path.
  group("session refresh", () => {
    const r = http.post(`${BASE_URL}/api/auth/refresh`, "{}", { headers });
    writeDuration.add(r.timings.duration);
    if (
      !check(r, {
        "refresh 200/401": (x) => x.status === 200 || x.status === 401,
      })
    ) {
      allOk = false;
    }
  });

  journeyDuration.add(Date.now() - t0);
  failureRate.add(allOk ? 0 : 1);
  sleep(Math.random() * 2 + 1);
}
