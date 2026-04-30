import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { interviewerFeedbackPostBody } from "@/lib/validators/interview-scorecard";

describe("interviewerFeedbackPostBody", () => {
  it("requires recommendation", () => {
    const r = interviewerFeedbackPostBody.safeParse({
      strengths: "x",
    });
    assert.equal(r.success, false);
  });

  it("accepts minimal valid payload", () => {
    const r = interviewerFeedbackPostBody.safeParse({
      recommendation: "yes",
    });
    assert.equal(r.success, true);
    if (r.success) {
      assert.equal(r.data.recommendation, "yes");
    }
  });

  it("accepts strengths weakness notes", () => {
    const r = interviewerFeedbackPostBody.safeParse({
      recommendation: "neutral",
      strengths: "Good communication",
      weaknesses: "Limited domain depth",
      notes: "Would hire with mentorship",
    });
    assert.equal(r.success, true);
  });
});
