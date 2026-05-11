import assert from "node:assert/strict";
import test from "node:test";

import { normalizeReportParams, qk } from "@/lib/query/keys";

test("normalizeReportParams strips empty/undefined values and sorts keys", () => {
  const a = normalizeReportParams({ from: "", to: "2026-05-10", page: 2, limit: undefined });
  const b = normalizeReportParams({ to: "2026-05-10", page: "2" });
  assert.deepEqual(a, b);
  assert.deepEqual(Object.keys(a), ["page", "to"]);
});

test("equivalent filter sets produce identical cache keys", () => {
  const k1 = JSON.stringify(qk.reports.pipelineFunnel({ source: "LinkedIn", page: 1, limit: 25 }));
  const k2 = JSON.stringify(
    qk.reports.pipelineFunnel({ limit: 25, page: 1, source: "LinkedIn", department: "" }),
  );
  assert.equal(k1, k2);
});

test("differing filter sets produce different cache keys", () => {
  const k1 = JSON.stringify(qk.reports.pipelineFunnel({ source: "LinkedIn" }));
  const k2 = JSON.stringify(qk.reports.pipelineFunnel({ source: "Referral" }));
  assert.notEqual(k1, k2);
});
