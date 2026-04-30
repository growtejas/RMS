import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { aggregateScorecardRatings } from "@/lib/validators/interview-scorecard";

describe("aggregateScorecardRatings", () => {
  it("returns null average when no overall_rating", () => {
    const r = aggregateScorecardRatings([{ scores: { recommendation: "yes" } }]);
    assert.equal(r.count, 0);
    assert.equal(r.average_overall, null);
  });

  it("averages overall_rating from score rows", () => {
    const r = aggregateScorecardRatings([
      { scores: { overall_rating: 4 } },
      { scores: { overall_rating: 2 } },
    ]);
    assert.equal(r.count, 2);
    assert.equal(r.average_overall, 3);
  });
});
