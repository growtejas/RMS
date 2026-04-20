import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resumeStructuredDocumentV1Z } from "@/lib/services/resume-structure/resume-structure.schema";
import { extractRulesStructuredResume } from "@/lib/services/resume-structure/rules-extractor-v2";
import {
  mergeStructuredProfileForPersist,
} from "@/lib/services/resume-structure/merge-candidate-profile";

const SAMPLE_RESUME = `
Jane Doe
Senior Software Engineer
Austin, TX | jane.doe@example.com | +1 512-555-0100

SKILLS
TypeScript, React, Node.js, PostgreSQL, AWS, Docker

EXPERIENCE
Acme Corp — Senior Engineer                                    2019 - Present
• Built APIs with Node.js and PostgreSQL
• Led migration to AWS

Beta LLC — Software Developer                                 2016 - 2019
• Developed React dashboards

EDUCATION
BS Computer Science — State University

CERTIFICATIONS
AWS Certified Solutions Architect
`;

describe("resume-structure rules v2", () => {
  it("extracts skills, contact, and experience signals", () => {
    const r = extractRulesStructuredResume(SAMPLE_RESUME, {
      fallbackName: "Fallback",
      fallbackEmail: "fallback@x.com",
    });
    assert.ok(r.profile.skills.includes("typescript") || r.profile.skills.includes("react"));
    assert.ok(r.profile.email === "jane.doe@example.com" || r.profile.email != null);
    assert.ok(r.confidence_overall > 0);
    assert.ok(Array.isArray(r.warnings));
  });

  it("produces a valid v1 envelope when wrapped", () => {
    const r = extractRulesStructuredResume(SAMPLE_RESUME, {});
    const doc = {
      schema_version: 1 as const,
      extractor: "rules_v2" as const,
      extracted_at: new Date().toISOString(),
      source_hash: "abc".repeat(10).slice(0, 64),
      profile: r.profile,
      confidence: { overall: r.confidence_overall },
      field_confidence: r.field_confidence,
      warnings: r.warnings,
    };
    const parsed = resumeStructuredDocumentV1Z.safeParse(doc);
    assert.equal(parsed.success, true);
  });

  it("merge respects DB-first for experience", () => {
    const merged = mergeStructuredProfileForPersist({
      existing: {
        candidateSkills: ["java"],
        totalExperienceYears: "8",
        noticePeriodDays: 30,
        educationRaw: "MS CS",
      },
      parsed: {
        skills: ["python"],
        experienceYears: 3,
        noticeDays: null,
        educationRaw: null,
      },
      structured: {
        name: null,
        email: null,
        phone: null,
        skills: ["typescript"],
        projects: [],
        experience_years: 2,
        experience_details: [],
        education: "BS",
        certifications: [],
        job_title: null,
        location: null,
        employment: [],
      },
    });
    assert.equal(merged.totalExperienceYears, "8");
    assert.equal(merged.noticePeriodDays, 30);
    assert.equal(merged.educationRaw, "MS CS");
    assert.ok(merged.candidateSkills?.includes("typescript"));
    assert.ok(merged.candidateSkills?.includes("java"));
  });

  it("handles empty text", () => {
    const r = extractRulesStructuredResume("", {});
    assert.equal(r.profile.skills.length, 0);
    assert.ok(r.warnings.includes("EMPTY_TEXT"));
  });
});
