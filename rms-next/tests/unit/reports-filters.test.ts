import assert from "node:assert/strict";
import test from "node:test";

import { parseReportFilters } from "@/lib/reports/filters";

test("parseReportFilters parses typed filters and clamps pagination", () => {
  const url = new URL(
    "http://localhost:3000/api/reports/pipeline-funnel?from=2026-05-01&to=2026-05-10&requisitionIds=12,13&recruiterIds=3,4&source=LinkedIn,Referral&page=0&limit=999",
  );
  const out = parseReportFilters(url);
  assert.equal(out.page, 1);
  assert.equal(out.limit, 100);
  assert.deepEqual(out.requisitionIds, [12, 13]);
  assert.deepEqual(out.recruiterIds, [3, 4]);
  assert.deepEqual(out.source, ["LinkedIn", "Referral"]);
  assert.equal(typeof out.from, "string");
  assert.equal(typeof out.to, "string");
});

test("parseReportFilters drops invalid values and keeps defaults", () => {
  const url = new URL(
    "http://localhost:3000/api/reports/pipeline-funnel?recruiterIds=1,a,2&department=Engineering,,Finance&page=abc&limit=abc",
  );
  const out = parseReportFilters(url);
  assert.equal(out.page, 1);
  assert.equal(out.limit, 25);
  assert.deepEqual(out.recruiterIds, [1, 2]);
  assert.deepEqual(out.department, ["Engineering", "Finance"]);
});
