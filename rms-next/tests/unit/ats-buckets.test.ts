import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";

import {
  getAtsBucketFromFinalScore,
  resolveAtsBucketThresholds,
} from "@/lib/services/ats-buckets";

describe("ats-buckets", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    delete process.env.ATS_BUCKET_BEST_MIN;
    delete process.env.ATS_BUCKET_VERY_GOOD_MIN;
    delete process.env.ATS_BUCKET_GOOD_MIN;
    delete process.env.ATS_BUCKET_AVERAGE_MIN;
  });

  afterEach(() => {
    process.env = { ...prev };
  });

  it("maps scores to buckets with defaults", () => {
    const t = resolveAtsBucketThresholds();
    assert.equal(t.bestMin, 85);
    assert.equal(getAtsBucketFromFinalScore(95), "BEST");
    assert.equal(getAtsBucketFromFinalScore(85), "BEST");
    assert.equal(getAtsBucketFromFinalScore(84.9), "VERY_GOOD");
    assert.equal(getAtsBucketFromFinalScore(70), "VERY_GOOD");
    assert.equal(getAtsBucketFromFinalScore(55), "GOOD");
    assert.equal(getAtsBucketFromFinalScore(35), "AVERAGE");
    assert.equal(getAtsBucketFromFinalScore(34.9), "NOT_SUITABLE");
    assert.equal(getAtsBucketFromFinalScore(Number.NaN), "NOT_SUITABLE");
  });

  it("respects env thresholds", () => {
    process.env.ATS_BUCKET_BEST_MIN = "90";
    process.env.ATS_BUCKET_AVERAGE_MIN = "40";
    assert.equal(getAtsBucketFromFinalScore(89), "VERY_GOOD");
    assert.equal(getAtsBucketFromFinalScore(90), "BEST");
    assert.equal(getAtsBucketFromFinalScore(40), "AVERAGE");
  });
});
