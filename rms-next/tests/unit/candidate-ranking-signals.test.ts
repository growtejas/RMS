import test from "node:test";
import assert from "node:assert/strict";

import { buildCandidateRankingSignals } from "@/lib/services/candidate-ranking-signals";
import type { ParsedResumeArtifact } from "@/lib/queue/inbound-events-queue";

const baseCandidate = {
  candidateSkills: null,
  totalExperienceYears: null,
  noticePeriodDays: null,
  educationRaw: null,
};

function processedArtifact(parsedData: Record<string, unknown>): ParsedResumeArtifact {
  return {
    parserProvider: "fallback-local",
    parserVersion: "v1",
    status: "processed",
    sourceResumeRef: "/tmp/x.pdf",
    rawText: "Sample resume with 5 years experience",
    parsedData,
    errorMessage: null,
  };
}

test("ranking signals: DB wins over parser for ATS fields", () => {
  const s = buildCandidateRankingSignals({
    candidate: {
      ...baseCandidate,
      totalExperienceYears: 8,
      noticePeriodDays: 14,
      educationRaw: "B.Tech CS",
    },
    parsedArtifact: processedArtifact({
      experience_years: 2,
      notice_period_days: 90,
      education_raw: "MCA",
    }),
  });
  assert.equal(s.ats.experience_years, 8);
  assert.equal(s.ats.experience_source, "db");
  assert.equal(s.ats.notice_period_days, 14);
  assert.equal(s.ats.notice_source, "db");
  assert.equal(s.ats.education_raw, "B.Tech CS");
  assert.equal(s.ats.education_source, "db");
});

test("ranking signals: parser fills gaps when DB missing", () => {
  const s = buildCandidateRankingSignals({
    candidate: baseCandidate,
    parsedArtifact: processedArtifact({
      experience_years: 4,
      notice_period_days: 30,
      education_raw: "B.E.",
      skills: ["React", "node"],
    }),
  });
  assert.equal(s.ats.experience_years, 4);
  assert.equal(s.ats.experience_source, "parser");
  assert.equal(s.ats.notice_period_days, 30);
  assert.equal(s.ats.notice_source, "parser");
  assert.equal(s.ats.education_raw, "B.E.");
  assert.equal(s.ats.education_source, "parser");
  assert.ok(s.skills_normalized.includes("react"));
  assert.ok(s.skills_normalized.includes("node"));
});

test("ranking signals: no artifact => skipped and no ATS from parser", () => {
  const s = buildCandidateRankingSignals({
    candidate: baseCandidate,
    parsedArtifact: null,
  });
  assert.equal(s.parse_status, "skipped");
  assert.equal(s.resume_plain_text, null);
  assert.equal(s.ats.experience_source, "none");
});
