import test from "node:test";
import assert from "node:assert/strict";

import {
  mapRankedCandidateToEvaluationCard,
  bandToUserLabel,
  type RankingRowForEvaluationCard,
} from "@/components/evaluation/mapRankedCandidateToEvaluationCard";

const ctx = {
  requiredExperienceYears: 4,
  requiredSkillsCount: 4,
};

function baseRow(
  overrides: Partial<RankingRowForEvaluationCard> = {},
): RankingRowForEvaluationCard {
  return {
    candidate_id: 1,
    full_name: "Test User",
    score: { final_score: 72 },
    meta: { skill_match_ratio: 0.75 },
    explain: {
      matched_skills: ["React", "Node"],
      missing_skills: ["AWS"],
      ai_score: 65,
      ai_summary: "Strong delivery. Cloud depth is limited.",
      ai_risks: ["Limited DevOps exposure"],
      ai_confidence: 0.72,
      ranking_signals: { ats: { experience_years: 5 } },
    },
    ...overrides,
  };
}

function collectText(m: ReturnType<typeof mapRankedCandidateToEvaluationCard>): string {
  return JSON.stringify(m).toLowerCase();
}

test("bandToUserLabel maps tiers", () => {
  assert.equal(bandToUserLabel("high"), "High");
  assert.equal(bandToUserLabel("medium"), "Medium");
  assert.equal(bandToUserLabel("low"), "Low");
});

test("fit labels and rounding from final score", () => {
  const m = mapRankedCandidateToEvaluationCard(
    baseRow({ score: { final_score: 84.2 } }),
    ctx,
  );
  assert.equal(m.finalScoreRounded, 84);
  assert.equal(m.fitLabel, "Strong Fit");
});

test("deterministic score drives headline when AI blend changes final_score", () => {
  const m = mapRankedCandidateToEvaluationCard(
    baseRow({
      score: { final_score: 88, deterministic_final_score: 72 },
    }),
    ctx,
  );
  assert.equal(m.finalScoreRounded, 72);
  assert.equal(m.aiBlendedRankScoreRounded, 88);
  assert.equal(m.fitLabel, "Good Fit");
});

test("highlights capped at 4 and risks at 3", () => {
  const m = mapRankedCandidateToEvaluationCard(
    baseRow({
      explain: {
        matched_skills: ["A", "B", "C", "D"],
        missing_skills: ["X", "Y", "Z"],
        ai_risks: ["r1", "r2", "r3"],
        ai_summary: "One. Two. Three. Four.",
        ai_score: 50,
        ai_confidence: 0.5,
        ranking_signals: { ats: { experience_years: 2 } },
      },
    }),
    ctx,
  );
  assert.ok(m.highlights.length <= 4);
  assert.ok(m.risks.length <= 3);
  assert.ok(m.rankingWhy.length <= 3);
});

test("no AI score yields unavailable messaging, no numeric strength", () => {
  const m = mapRankedCandidateToEvaluationCard(
    baseRow({
      explain: {
        matched_skills: ["Java"],
        missing_skills: [],
        ranking_signals: { ats: { experience_years: 4 } },
      },
    }),
    ctx,
  );
  assert.equal(m.ai.score, null);
  assert.equal(m.ai.strengthLabel, null);
  assert.ok(
    m.ai.summaryLines.some((l) =>
      l.toLowerCase().includes("not available"),
    ),
  );
});

test("output does not leak engineer jargon from internal fields", () => {
  const m = mapRankedCandidateToEvaluationCard(baseRow(), ctx);
  const blob = collectText(m);
  for (const bad of [
    "semantic",
    "keyword_score",
    "vector",
    "ats v1",
    "cosine",
  ]) {
    assert.ok(
      !blob.includes(bad),
      `unexpected token ${bad} in ${blob.slice(0, 200)}`,
    );
  }
});
