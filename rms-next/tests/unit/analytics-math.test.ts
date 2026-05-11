import assert from "node:assert/strict";
import test from "node:test";

import { average, pct, percentile, roundTo, safeNumber, sum } from "@/lib/analytics/utils/math";

test("pct returns 0 for zero denominator without NaN", () => {
  assert.equal(pct(5, 0), 0);
  assert.equal(pct(0, 0), 0);
});

test("pct rounds to two decimals with stable arithmetic", () => {
  assert.equal(pct(1, 3), 33.33);
  assert.equal(pct(2, 3), 66.67);
});

test("safeNumber coerces strings and rejects NaN", () => {
  assert.equal(safeNumber("3.5"), 3.5);
  assert.equal(safeNumber("abc"), 0);
  assert.equal(safeNumber(NaN), 0);
  assert.equal(safeNumber(undefined, 9), 9);
});

test("roundTo handles non-finite values without polluting output", () => {
  assert.equal(roundTo(Number.POSITIVE_INFINITY, 2), 0);
  assert.equal(roundTo(0.123456789, 4), 0.1235);
});

test("average ignores invalid entries via safeNumber", () => {
  assert.equal(average([1, 2, 3]), 2);
  assert.equal(average([]), 0);
});

test("sum is stable for empty input", () => {
  assert.equal(sum([]), 0);
  assert.equal(sum([1, 2, 3]), 6);
});

test("percentile handles unsorted input and out-of-range probabilities", () => {
  assert.equal(percentile([5, 1, 3, 2, 4], 0.5), 3);
  assert.equal(percentile([5, 1, 3, 2, 4], -1), 1);
  assert.equal(percentile([5, 1, 3, 2, 4], 2), 5);
});
