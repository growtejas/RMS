import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  buildPaginationMeta,
  computePagePosition,
  isPageSize,
} from "@/lib/pagination/contract";

test("PAGE_SIZE_OPTIONS is the canonical 25/50/100 whitelist", () => {
  assert.deepEqual([...PAGE_SIZE_OPTIONS], [25, 50, 100]);
  assert.equal(DEFAULT_PAGE_SIZE, 25);
  assert.equal(MAX_PAGE_SIZE, 100);
});

test("isPageSize accepts only whitelisted values", () => {
  assert.equal(isPageSize(25), true);
  assert.equal(isPageSize(50), true);
  assert.equal(isPageSize(100), true);
  assert.equal(isPageSize(10), false);
  assert.equal(isPageSize(20), false);
  assert.equal(isPageSize(75), false);
  assert.equal(isPageSize("25"), false);
  assert.equal(isPageSize(null), false);
});

test("computePagePosition clamps page above totalPages", () => {
  const r = computePagePosition({ pageRequested: 99, total: 80, limit: 25 });
  assert.equal(r.totalPages, 4);
  assert.equal(r.page, 4);
  assert.equal(r.offset, 75);
});

test("computePagePosition coerces page < 1 to 1", () => {
  const r = computePagePosition({ pageRequested: -3, total: 80, limit: 25 });
  assert.equal(r.page, 1);
  assert.equal(r.offset, 0);
});

test("computePagePosition returns offset 0 + page 1 when total is 0", () => {
  const r = computePagePosition({ pageRequested: 5, total: 0, limit: 25 });
  assert.equal(r.totalPages, 0);
  assert.equal(r.page, 1);
  assert.equal(r.offset, 0);
});

test("buildPaginationMeta sets hasNextPage and hasPreviousPage correctly mid-list", () => {
  const m = buildPaginationMeta({ page: 2, limit: 25, total: 187 });
  assert.equal(m.totalPages, 8);
  assert.equal(m.page, 2);
  assert.equal(m.hasNextPage, true);
  assert.equal(m.hasPreviousPage, true);
});

test("buildPaginationMeta sets hasPreviousPage false on page 1", () => {
  const m = buildPaginationMeta({ page: 1, limit: 50, total: 100 });
  assert.equal(m.hasPreviousPage, false);
  assert.equal(m.hasNextPage, true);
});

test("buildPaginationMeta sets hasNextPage false on last page", () => {
  const m = buildPaginationMeta({ page: 4, limit: 25, total: 100 });
  assert.equal(m.totalPages, 4);
  assert.equal(m.hasNextPage, false);
  assert.equal(m.hasPreviousPage, true);
});

test("buildPaginationMeta floors fractional total inputs", () => {
  const m = buildPaginationMeta({ page: 1, limit: 25, total: 49.9 });
  assert.equal(m.total, 49);
  assert.equal(m.totalPages, 2);
});

test("buildPaginationMeta clamps page above the corrected totalPages", () => {
  const m = buildPaginationMeta({ page: 99, limit: 25, total: 60 });
  assert.equal(m.totalPages, 3);
  assert.equal(m.page, 3);
});

test("buildPaginationMeta with empty result reports zeroed totals", () => {
  const m = buildPaginationMeta({ page: 1, limit: 25, total: 0 });
  assert.equal(m.total, 0);
  assert.equal(m.totalPages, 0);
  assert.equal(m.hasNextPage, false);
  assert.equal(m.hasPreviousPage, false);
});
