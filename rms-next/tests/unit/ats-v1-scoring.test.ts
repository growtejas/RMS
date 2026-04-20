import test from "node:test";
import assert from "node:assert/strict";

import {
  computeAtsV1Score,
  bandFromItemSkillLevel,
  normalizeSkill,
  resolveRequiredSkillsForRanking,
} from "@/lib/services/ats-v1-scoring";

test("ATS V1: experience ratio caps at 1.0 and penalizes overqualification", () => {
  const base = computeAtsV1Score({
    candidateExperienceYears: 4,
    requiredExperienceYears: 4,
    noticePeriodDays: 0,
    jobSkillLevel: "MID",
    jobEducationRequirement: null,
    candidateEducationRaw: null,
  });
  assert.ok(base.score_0_100 > 0);

  const over = computeAtsV1Score({
    candidateExperienceYears: 20,
    requiredExperienceYears: 5,
    noticePeriodDays: 0,
    jobSkillLevel: "MID",
    jobEducationRequirement: null,
    candidateEducationRaw: null,
  });
  // doc behavior: if cand > 2x req => expScore=0.7, so score shouldn't be maximal.
  assert.ok(over.experience <= 0.7);
});

test("ATS V1: notice period mapping", () => {
  const immediate = computeAtsV1Score({
    candidateExperienceYears: 3,
    requiredExperienceYears: 3,
    noticePeriodDays: 0,
    jobSkillLevel: "MID",
    jobEducationRequirement: null,
    candidateEducationRaw: null,
  });
  const long = computeAtsV1Score({
    candidateExperienceYears: 3,
    requiredExperienceYears: 3,
    noticePeriodDays: 120,
    jobSkillLevel: "MID",
    jobEducationRequirement: null,
    candidateEducationRaw: null,
  });
  assert.ok(immediate.notice > long.notice);
});

test("ATS V1: partial-data penalty when multiple inputs missing", () => {
  const s = computeAtsV1Score({
    candidateExperienceYears: null,
    requiredExperienceYears: 3,
    noticePeriodDays: null,
    jobSkillLevel: "MID",
    jobEducationRequirement: "btech",
    candidateEducationRaw: null,
  });
  assert.equal(s.partial_data, true);
  assert.ok(s.flags.includes("partial_data"));
});

test("ATS V1: single missing field applies milder penalty than full data", () => {
  const full = computeAtsV1Score({
    candidateExperienceYears: 3,
    requiredExperienceYears: 3,
    noticePeriodDays: 0,
    jobSkillLevel: "MID",
    jobEducationRequirement: null,
    candidateEducationRaw: null,
  });
  const missingNotice = computeAtsV1Score({
    candidateExperienceYears: 3,
    requiredExperienceYears: 3,
    noticePeriodDays: null,
    jobSkillLevel: "MID",
    jobEducationRequirement: null,
    candidateEducationRaw: null,
  });
  assert.ok(missingNotice.score_0_100 < full.score_0_100);
  assert.ok(missingNotice.flags.includes("partial_candidate_data"));
});

test("normalizeSkill maps dotted aliases", () => {
  assert.equal(normalizeSkill("React.js"), "react");
  assert.equal(normalizeSkill("node.js"), "node");
});

test("resolveRequiredSkillsForRanking falls back to JD narrative tokens", () => {
  const list = resolveRequiredSkillsForRanking({
    rankingRequiredSkills: null,
    requirements: null,
    jdNarrative: "We need strong python and postgresql experience",
    maxNarrativeTokens: 10,
  });
  assert.ok(list.includes("python"));
  assert.ok(list.includes("postgresql"));
});

test("ATS V1: bandFromItemSkillLevel parses common labels", () => {
  assert.equal(bandFromItemSkillLevel("Junior"), "JUNIOR");
  assert.equal(bandFromItemSkillLevel("Sr Engineer"), "SENIOR");
  assert.equal(bandFromItemSkillLevel("L2"), "MID");
});

test("ATS V1: structured skill match aligns score and explain counts", () => {
  const baseInput = {
    candidateExperienceYears: 5,
    requiredExperienceYears: 3,
    noticePeriodDays: 30,
    jobSkillLevel: "MID" as const,
    jobEducationRequirement: null,
    candidateEducationRaw: null,
  };
  const full = computeAtsV1Score({
    ...baseInput,
    structuredSkillMatch: { requiredCount: 4, matchedCount: 4 },
  });
  const none = computeAtsV1Score({
    ...baseInput,
    structuredSkillMatch: { requiredCount: 4, matchedCount: 0 },
  });
  const noReq = computeAtsV1Score({
    ...baseInput,
    structuredSkillMatch: undefined,
  });
  assert.ok(full.score_0_100 > none.score_0_100);
  assert.equal(full.required_skills_count, 4);
  assert.equal(full.matched_skills_count, 4);
  assert.equal(full.skills_alignment, 1);
  assert.equal(none.skills_alignment, 0);
  assert.equal(noReq.required_skills_count, undefined);
  assert.ok(Math.abs(full.score_0_100 - noReq.score_0_100) < 0.001);
});

