import test from "node:test";
import assert from "node:assert/strict";

import type { ParsedResumeArtifact } from "@/lib/queue/inbound-events-queue";
import { buildCandidateRankingSignals } from "@/lib/services/candidate-ranking-signals";
import type { ResumeStructuredDocumentV1 } from "@/lib/services/resume-structure/resume-structure.schema";
import { RESUME_STRUCTURE_SCHEMA_VERSION } from "@/lib/services/resume-structure/resume-structure.schema";

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

function minimalStructuredDoc(
  profile: Partial<ResumeStructuredDocumentV1["profile"]> &
    Pick<ResumeStructuredDocumentV1["profile"], "skills">,
): ResumeStructuredDocumentV1 {
  return {
    schema_version: RESUME_STRUCTURE_SCHEMA_VERSION,
    extractor: "rules_v2",
    extracted_at: new Date().toISOString(),
    source_hash: "a".repeat(64),
    profile: {
      name: null,
      email: null,
      phone: null,
      skills: profile.skills,
      projects: [],
      experience_years: profile.experience_years ?? null,
      experience_details: [],
      education: profile.education ?? null,
      certifications: [],
      job_title: null,
      location: null,
      employment: [],
    },
    confidence: { overall: 0.9 },
    field_confidence: {},
    warnings: [],
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

test("ranking signals: structured wins experience over DB when parse processed and skills non-empty", () => {
  const s = buildCandidateRankingSignals({
    candidate: {
      ...baseCandidate,
      totalExperienceYears: 8,
      candidateSkills: ["java"],
    },
    parsedArtifact: processedArtifact({
      experience_years: 2,
      skills: ["php"],
    }),
    structuredDocument: minimalStructuredDoc({
      skills: ["typescript", "react"],
      experience_years: 5,
    }),
  });
  assert.equal(s.ats.experience_years, 5);
  assert.equal(s.ats.experience_source, "structured");
  assert.ok(s.skills_normalized.includes("typescript"));
  assert.ok(s.skills_normalized.includes("react"));
  assert.ok(!s.skills_normalized.includes("java"));
  assert.ok(!s.skills_normalized.includes("php"));
});

test("ranking signals: structured wins education over DB when usable", () => {
  const s = buildCandidateRankingSignals({
    candidate: {
      ...baseCandidate,
      educationRaw: "B.Tech CS",
    },
    parsedArtifact: processedArtifact({ education_raw: "MCA" }),
    structuredDocument: minimalStructuredDoc({
      skills: ["go"],
      education: "MS Computer Science",
    }),
  });
  assert.equal(s.ats.education_raw, "MS Computer Science");
  assert.equal(s.ats.education_source, "structured");
});

test("ranking signals: without structured skills, union db and parser skills", () => {
  const s = buildCandidateRankingSignals({
    candidate: {
      ...baseCandidate,
      candidateSkills: ["java"],
    },
    parsedArtifact: processedArtifact({ skills: ["php"] }),
    structuredDocument: minimalStructuredDoc({ skills: [] }),
  });
  assert.ok(s.skills_normalized.includes("java"));
  assert.ok(s.skills_normalized.includes("php"));
});
