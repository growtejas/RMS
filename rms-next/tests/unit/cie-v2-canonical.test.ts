import assert from "node:assert/strict";
import test from "node:test";

import { buildCieReportPayload } from "@/lib/services/cie/cie-llm";
import type { ParsedCandidate } from "@/lib/services/cie/cie.schema";
import type { V2ProcessorPayload } from "@/lib/services/resume-structure/strict-resume-v2-mapper";
import { v2ToParsedCandidate } from "@/lib/services/resume-structure/strict-resume-v2-mapper";
import type { StrictResumeV2 } from "@/lib/services/resume-structure/strict-resume-v2.schema";

const richV2: StrictResumeV2 = {
  schema: "strict_resume_v2",
  profile_type: "mid",
  profile_type_confidence: 0.85,
  warnings: [],
  core: {
    basicInfo: {
      name: { value: "Asha Patel", prov: { source: "header", confidence: 0.95 } },
      email: { value: "asha@example.com", prov: { source: "header", confidence: 0.95 } },
      phone: { value: null, prov: { source: "unknown", confidence: 0 } },
    },
    skills: [
      { name: "python", prov: { source: "skills_section", confidence: 0.9 } },
      { name: "airflow", prov: { source: "skills_section", confidence: 0.9 } },
      { name: "snowflake", prov: { source: "skills_section", confidence: 0.9 } },
    ],
    experience: [
      {
        company: "Acme Data",
        role: "Senior Data Engineer",
        location: "Bangalore",
        startDate: "2022-04",
        endDate: null,
        durationMonths: 36,
        bullets: [
          "Owned the daily Airflow DAG suite (200+ tasks)",
          "Cut warehouse spend by 28% via partition pruning",
        ],
        techStack: ["python", "snowflake", "airflow"],
        prov: { source: "experience_section", confidence: 0.95 },
      },
    ],
    projects: [],
    education: [
      {
        degree: "B.Tech",
        specialization: "Information Technology",
        university: "BITS Pilani",
        startDate: "2014-08",
        endDate: "2018-05",
        year: 2018,
        score: "8.4 CGPA",
        location: null,
        prov: { source: "education_section", confidence: 0.9 },
      },
    ],
  },
};

// `legacyFlat` represents the OLD stored parsed_json from a previous (lossy) projection.
// In the canonical pipeline this MUST be ignored on cache hit; v2 is authoritative.
const legacyFlat: ParsedCandidate = {
  basicInfo: { name: "Stale Name", email: "old@e.com", phone: "999" },
  skills: ["sql"],
  projects: [],
  experience: [{ company: "Old Co", role: "Old Role", years: 1 }],
  education: [],
};

test("v2ToParsedCandidate: produces canonical ParsedCandidate from v2", () => {
  const r = v2ToParsedCandidate(richV2);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.data.basicInfo.name, "Asha Patel");
  assert.equal(r.data.basicInfo.email, "asha@example.com");
  assert.deepEqual(r.data.skills.sort(), ["airflow", "python", "snowflake"]);
  assert.equal(r.data.experience.length, 1);
  assert.equal(r.data.experience[0]!.company, "Acme Data");
});

test("buildCieReportPayload: canonical v2 path emits processor payload, ignoring legacy flat input", () => {
  const payload = buildCieReportPayload({
    parsed: legacyFlat, // intentionally stale to prove v2 wins
    parsedV2: richV2,
    targetRole: null,
    legacyParserHints: null,
    candidateId: 7,
  });
  assert.equal(payload.parsedDataKind, "strict_resume_v2_processor");
  const proc = payload.parsedData as V2ProcessorPayload;
  assert.equal(proc.candidate_id, 7);
  // Canonical contact comes from v2, not the stale legacy flat:
  assert.equal(proc.contact.name, "Asha Patel");
  assert.equal(proc.contact.email, "asha@example.com");
  // The stale legacy company "Old Co" must not appear:
  const companies = proc.experience.map((e) => e.company);
  assert.deepEqual(companies, ["Acme Data"]);
  // Skills come from v2 list:
  assert.ok(proc.skills.includes("python"));
  assert.ok(proc.skills.includes("snowflake"));
  assert.ok(!proc.skills.includes("sql"));
});

test("buildCieReportPayload: total_experience_years surfaces at top level when v2 present", () => {
  const payload = buildCieReportPayload({
    parsed: legacyFlat,
    parsedV2: richV2,
    targetRole: null,
    legacyParserHints: null,
    candidateId: 1,
  });
  // 36 months → 3.0 years
  assert.equal(payload.total_experience_years, 3.0);
});
