import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_PAGE_SIZE } from "@/lib/pagination/contract";
import {
  limitSchema,
  pageSchema,
  parseListQueryParams,
  parsePaginationParams,
  qSchema,
  sortSchemaFor,
} from "@/lib/pagination/zod";

test("pageSchema defaults missing/invalid input to 1", () => {
  assert.equal(pageSchema.parse(null), 1);
  assert.equal(pageSchema.parse(undefined), 1);
  assert.equal(pageSchema.parse(""), 1);
  assert.equal(pageSchema.parse("abc"), 1);
  assert.equal(pageSchema.parse("0"), 1);
  assert.equal(pageSchema.parse("-5"), 1);
  assert.equal(pageSchema.parse("3"), 3);
  assert.equal(pageSchema.parse(7), 7);
});

test("limitSchema defaults to DEFAULT_PAGE_SIZE on missing/invalid input", () => {
  assert.equal(limitSchema.parse(null), DEFAULT_PAGE_SIZE);
  assert.equal(limitSchema.parse(""), DEFAULT_PAGE_SIZE);
  assert.equal(limitSchema.parse("abc"), DEFAULT_PAGE_SIZE);
  assert.equal(limitSchema.parse("10"), DEFAULT_PAGE_SIZE);
  assert.equal(limitSchema.parse("17"), DEFAULT_PAGE_SIZE);
});

test("limitSchema accepts only the canonical whitelist 25/50/100", () => {
  assert.equal(limitSchema.parse("25"), 25);
  assert.equal(limitSchema.parse("50"), 50);
  assert.equal(limitSchema.parse("100"), 100);
});

test("qSchema trims and normalizes empty strings to null", () => {
  assert.equal(qSchema.parse(null), null);
  assert.equal(qSchema.parse(""), null);
  assert.equal(qSchema.parse("   "), null);
  assert.equal(qSchema.parse("  hello  "), "hello");
});

test("sortSchemaFor falls back when value is not in whitelist", () => {
  const allowed = ["created_desc", "created_asc", "name_asc"] as const;
  const schema = sortSchemaFor(allowed, "created_desc");
  assert.equal(schema.parse(null), "created_desc");
  assert.equal(schema.parse(""), "created_desc");
  assert.equal(schema.parse("not_in_set"), "created_desc");
  assert.equal(schema.parse("name_asc"), "name_asc");
  assert.equal(schema.parse("  created_asc  "), "created_asc");
});

test("parsePaginationParams reads `page` and `limit` from URL", () => {
  const url = new URL("https://x.test/api/foo?page=3&limit=50&q=ada");
  const result = parsePaginationParams(url);
  assert.equal(result.page, 3);
  assert.equal(result.limit, 50);
});

test("parseListQueryParams composes pagination + q + sort", () => {
  const url = new URL(
    "https://x.test/api/foo?page=2&limit=100&q=ada&sort=name_asc",
  );
  const result = parseListQueryParams(url, {
    sort: { allowed: ["created_desc", "name_asc"], fallback: "created_desc" },
  });
  assert.equal(result.page, 2);
  assert.equal(result.limit, 100);
  assert.equal(result.q, "ada");
  assert.equal(result.sort, "name_asc");
});

test("parseListQueryParams uses defaults when query string is empty", () => {
  const url = new URL("https://x.test/api/foo");
  const result = parseListQueryParams(url, {
    sort: { allowed: ["created_desc"], fallback: "created_desc" },
  });
  assert.equal(result.page, 1);
  assert.equal(result.limit, DEFAULT_PAGE_SIZE);
  assert.equal(result.q, null);
  assert.equal(result.sort, "created_desc");
});
