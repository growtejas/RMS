import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  aiEvaluationOutputSchema,
  blendDeterministicWithAi,
  computeAiCompositeScore,
  resolveAiBlendWeight,
} from "@/lib/services/ai-evaluation/ai-evaluation.schema";

describe("ai-evaluation schema", () => {
  it("computeAiCompositeScore matches spec weights", () => {
    const s = computeAiCompositeScore({
      project_complexity: 100,
      growth_trajectory: 0,
      company_reputation: 0,
      jd_alignment: 0,
    });
    assert.equal(s, 30);
    const flat = computeAiCompositeScore({
      project_complexity: 80,
      growth_trajectory: 70,
      company_reputation: 60,
      jd_alignment: 75,
    });
    assert.ok(flat > 70 && flat < 76);
  });

  it("resolveAiBlendWeight", () => {
    assert.equal(resolveAiBlendWeight(0.6), 0.3);
    assert.equal(resolveAiBlendWeight(0.5), 0.3);
    assert.equal(resolveAiBlendWeight(0.49), 0.1);
    assert.equal(resolveAiBlendWeight(NaN), 0);
  });

  it("blendDeterministicWithAi", () => {
    const a = blendDeterministicWithAi(80, 60, 0.8);
    assert.ok(Math.abs(a - (0.7 * 80 + 0.3 * 60)) < 0.01);
    const b = blendDeterministicWithAi(80, 60, 0.4);
    assert.ok(Math.abs(b - (0.9 * 80 + 0.1 * 60)) < 0.01);
  });

  it("rejects invalid output", () => {
    const bad = aiEvaluationOutputSchema.safeParse({
      project_complexity: 101,
      growth_trajectory: 50,
      company_reputation: 50,
      jd_alignment: 50,
      confidence: 0.5,
      summary: "short",
      risks: [],
    });
    assert.equal(bad.success, false);
  });

  it("accepts valid output", () => {
    const ok = aiEvaluationOutputSchema.safeParse({
      project_complexity: 70,
      growth_trajectory: 65,
      company_reputation: 55,
      jd_alignment: 72,
      confidence: 0.82,
      summary: "Solid alignment with role requirements.",
      risks: ["Limited production scale"],
    });
    assert.equal(ok.success, true);
  });
});
