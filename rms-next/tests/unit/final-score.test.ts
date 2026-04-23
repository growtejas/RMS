import assert from "node:assert/strict";
import test, { describe, it } from "node:test";

import { computeFinalScore } from "@/lib/services/scoring/final-score";
import { resolveRankingEngine } from "@/lib/services/scoring/ranking-engine";

describe("scoring: resolveRankingEngine", () => {
  test("defaults to ai_only", () => {
    const prev = process.env.RANKING_ENGINE;
    delete process.env.RANKING_ENGINE;
    try {
      const r = resolveRankingEngine();
      assert.equal(r.engine, "ai_only");
      assert.equal(r.deterministicSubmode, "hybrid");
    } finally {
      if (prev == null) delete process.env.RANKING_ENGINE;
      else process.env.RANKING_ENGINE = prev;
    }
  });

  test("legacy submodes map to deterministic engine", () => {
    const prev = process.env.RANKING_ENGINE;
    process.env.RANKING_ENGINE = "ats_v1";
    try {
      const r = resolveRankingEngine();
      assert.equal(r.engine, "deterministic");
      assert.equal(r.deterministicSubmode, "ats_v1");
    } finally {
      if (prev == null) delete process.env.RANKING_ENGINE;
      else process.env.RANKING_ENGINE = prev;
    }
  });
});

describe("scoring: computeFinalScore", () => {
  it("ai_only uses ai_score when present", () => {
    const r = computeFinalScore({
      engine: "ai_only",
      deterministicSubmode: "hybrid",
      deterministicFinalScore: 62,
      aiScore: 88,
      aiConfidence: 0.8,
      aiCacheHit: true,
      requiredSkillsCount: 5,
      matchedRequiredSkillsCount: 3,
      requiredExperienceYears: 5,
      candidateExperienceYears: 5,
    });
    assert.equal(r.finalScore, 88);
    assert.equal(r.deterministicFallbackUsed, false);
  });

  it("ai_only falls back to deterministic when AI unavailable", () => {
    const r = computeFinalScore({
      engine: "ai_only",
      deterministicSubmode: "hybrid",
      deterministicFinalScore: 62,
      aiScore: null,
      aiConfidence: null,
      aiCacheHit: false,
      requiredSkillsCount: 0,
      matchedRequiredSkillsCount: 0,
      requiredExperienceYears: null,
      candidateExperienceYears: null,
    });
    assert.equal(r.finalScore, null);
    assert.equal(r.deterministicFallbackUsed, false);
    assert.ok(r.explainFlags.some((f) => f.includes("no_score")));
  });

  it("applies required-skill cap when no required skill matches", () => {
    const r = computeFinalScore({
      engine: "ai_only",
      deterministicSubmode: "hybrid",
      deterministicFinalScore: 20,
      aiScore: 95,
      aiConfidence: 0.9,
      aiCacheHit: true,
      requiredSkillsCount: 6,
      matchedRequiredSkillsCount: 0,
      requiredExperienceYears: null,
      candidateExperienceYears: null,
    });
    assert.ok(r.finalScore != null && r.finalScore <= 55);
    assert.ok(r.explainFlags.includes("cap:no_required_skill_match"));
  });

  it("flags low AI confidence", () => {
    const r = computeFinalScore({
      engine: "ai_only",
      deterministicSubmode: "hybrid",
      deterministicFinalScore: 20,
      aiScore: 70,
      aiConfidence: 0.2,
      aiCacheHit: true,
      requiredSkillsCount: 0,
      matchedRequiredSkillsCount: 0,
      requiredExperienceYears: null,
      candidateExperienceYears: null,
    });
    assert.ok(r.explainFlags.includes("LOW_CONFIDENCE"));
    assert.equal(r.finalScore, 63);
  });
});

