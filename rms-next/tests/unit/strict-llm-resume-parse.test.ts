import test from "node:test";
import assert from "node:assert/strict";

import { parsedCandidateProfileZ } from "@/lib/services/resume-structure/resume-structure.schema";
import {
  parseStrictLlmResumeJson,
  validateStrictResumePhone,
} from "@/lib/services/resume-structure/strict-llm-resume-parse.schema";
import {
  strictExperienceRowToYears,
  strictLlmParseToParsedCandidate,
  strictLlmParseToParsedCandidateProfile,
} from "@/lib/services/resume-structure/strict-llm-resume-parse-mapper";

const minimalValid = {
  basicInfo: { name: "Jane Doe", email: "j@example.com", phone: null },
  skills: ["Python", "AWS"],
  experience: [
    {
      company: "Acme",
      role: "Engineer",
      startDate: "2020-01",
      endDate: "2022-06",
      durationMonths: null,
    },
  ],
  projects: [
    { title: "Data pipe", description: "ETL batch jobs", techStack: ["Python"] },
  ],
  education: [
    {
      degree: "BS Computer Science",
      specialization: null,
      university: "State U",
      year: 2019,
    },
  ],
};

test("parseStrictLlmResumeJson: accepts minimal valid payload", () => {
  const r = parseStrictLlmResumeJson(minimalValid);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.data.skills.length, 2);
    assert.equal(r.data.experience[0]!.company, "Acme");
  }
});

test("parseStrictLlmResumeJson: rejects extra top-level keys", () => {
  const r = parseStrictLlmResumeJson({ ...minimalValid, extraField: 1 });
  assert.equal(r.ok, false);
});

test("parseStrictLlmResumeJson: rejects invalid YYYY-MM", () => {
  const bad = {
    ...minimalValid,
    experience: [
      {
        company: "Acme",
        role: "Engineer",
        startDate: "2020-13",
        endDate: null,
        durationMonths: null,
      },
    ],
  };
  const r = parseStrictLlmResumeJson(bad);
  assert.equal(r.ok, false);
});

test("validateStrictResumePhone: rejects suspicious digit run", () => {
  assert.ok(validateStrictResumePhone("072022042025") != null);
  assert.equal(validateStrictResumePhone("+1 415 555 0100"), null);
});

test("strictExperienceRowToYears: uses durationMonths when set", () => {
  const y = strictExperienceRowToYears({
    company: "A",
    role: "R",
    startDate: null,
    endDate: null,
    durationMonths: 24,
  });
  assert.equal(y, 2);
});

test("strictExperienceRowToYears: derives from YYYY-MM range", () => {
  const y = strictExperienceRowToYears({
    company: "A",
    role: "R",
    startDate: "2020-01",
    endDate: "2021-01",
    durationMonths: null,
  });
  assert.ok(y != null && y > 0);
});

test("strictLlmParseToParsedCandidate: maps and passes acceptance", () => {
  const parsed = parseStrictLlmResumeJson(minimalValid);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const m = strictLlmParseToParsedCandidate(parsed.data);
  assert.equal(m.ok, true);
  if (m.ok) {
    assert.equal(m.data.basicInfo.email, "j@example.com");
    assert.ok(m.data.skills.includes("python") || m.data.skills.includes("aws"));
  }
});

test("strictLlmParseToParsedCandidateProfile: yields valid ParsedCandidateProfile", () => {
  const parsed = parseStrictLlmResumeJson(minimalValid);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const draft = parsedCandidateProfileZ.parse({
    name: null,
    email: null,
    phone: null,
    skills: [],
    projects: [],
    experience_years: null,
    experience_details: [],
    education: null,
    certifications: [],
    job_title: null,
    location: null,
    notice_period_days: null,
    employment: [],
  });
  const merged = strictLlmParseToParsedCandidateProfile(parsed.data, draft);
  const v = parsedCandidateProfileZ.safeParse(merged);
  assert.equal(v.success, true);
  if (v.success) {
    assert.ok(v.data.skills.length >= 1);
    assert.ok(v.data.employment.length >= 1);
  }
});
