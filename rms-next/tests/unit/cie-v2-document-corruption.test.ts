import assert from "node:assert/strict";
import test from "node:test";

import { v2DocumentLikelyCorrupted } from "@/lib/services/cie/cie-parsed-candidate-quality";
import type { StrictResumeV2 } from "@/lib/services/resume-structure/strict-resume-v2.schema";

const baseV2 = (): StrictResumeV2 => ({
  schema: "strict_resume_v2",
  profile_type: "mid",
  profile_type_confidence: 0.9,
  warnings: [],
  core: {
    basicInfo: {
      name: { value: "Asha", prov: { source: "header", confidence: 0.9 } },
      email: { value: "a@b.c", prov: { source: "header", confidence: 0.9 } },
      phone: { value: null, prov: { source: "unknown", confidence: 0 } },
    },
    skills: [
      { name: "python", prov: { source: "skills_section", confidence: 0.9 } },
    ],
    experience: [
      {
        company: "Acme",
        role: "Backend Engineer",
        location: null,
        startDate: "2022-01",
        endDate: null,
        durationMonths: 36,
        bullets: ["Owned the realtime API"],
        techStack: ["go", "kafka"],
        prov: { source: "experience_section", confidence: 0.9 },
      },
    ],
    projects: [],
    education: [
      {
        degree: "B.Tech",
        specialization: "CS",
        university: "IIT",
        startDate: "2014-08",
        endDate: "2018-05",
        year: 2018,
        score: "8.7/10",
        location: null,
        prov: { source: "education_section", confidence: 0.9 },
      },
    ],
  },
});

test("v2DocumentLikelyCorrupted: clean doc returns ok", () => {
  const r = v2DocumentLikelyCorrupted(baseV2(), { min: 0.7, median: 0.9 });
  assert.equal(r.ok, true);
});

test("v2DocumentLikelyCorrupted: fragmented experience with empty company", () => {
  const doc = baseV2();
  doc.core.experience = [
    {
      company: "—",
      role: "Improved API throughput by 40%",
      location: null,
      startDate: null,
      endDate: null,
      durationMonths: null,
      bullets: [],
      techStack: [],
      prov: { source: "experience_section", confidence: 0.4 },
    },
    {
      company: "",
      role: "Built realtime pipelines",
      location: null,
      startDate: null,
      endDate: null,
      durationMonths: null,
      bullets: [],
      techStack: [],
      prov: { source: "experience_section", confidence: 0.4 },
    },
  ];
  const r = v2DocumentLikelyCorrupted(doc, { min: 0.4, median: 0.4 });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.reasons.includes("fragmented_experience"));
  }
});

test("v2DocumentLikelyCorrupted: section leakage in education degree", () => {
  const doc = baseV2();
  doc.core.education[0]!.degree =
    "B.Tech Computer Science | Honors thesis on graphs | TA for DBMS course | Member of GDSC | Won hackathon";
  const r = v2DocumentLikelyCorrupted(doc);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.reasons.includes("section_leakage_education"));
  }
});

test("v2DocumentLikelyCorrupted: fragmented project titles", () => {
  const doc = baseV2();
  doc.core.projects = [
    {
      title: "Leveraged BERT for sentiment analysis",
      description: "x",
      techStack: [],
      startDate: null,
      endDate: null,
      link: null,
      prov: { source: "projects_section", confidence: 0.5 },
    },
    {
      title: "Implemented pipeline using Airflow",
      description: "y",
      techStack: [],
      startDate: null,
      endDate: null,
      link: null,
      prov: { source: "projects_section", confidence: 0.5 },
    },
  ];
  const r = v2DocumentLikelyCorrupted(doc);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.reasons.includes("fragmented_projects"));
  }
});

test("v2DocumentLikelyCorrupted: low prov confidence floor (median < 0.25)", () => {
  const doc = baseV2();
  const r = v2DocumentLikelyCorrupted(doc, { min: 0.1, median: 0.2 });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.reasons.includes("low_prov_confidence_floor"));
  }
});

test("v2DocumentLikelyCorrupted: blank skill triggers", () => {
  const doc = baseV2();
  doc.core.skills.push({
    name: "   ",
    prov: { source: "skills_section", confidence: 0.5 },
  });
  const r = v2DocumentLikelyCorrupted(doc);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.reasons.includes("skill_blank_entries"));
  }
});

test("v2DocumentLikelyCorrupted: unbalanced parens in skills", () => {
  const doc = baseV2();
  doc.core.skills.push({
    name: "react (hooks",
    prov: { source: "skills_section", confidence: 0.5 },
  });
  const r = v2DocumentLikelyCorrupted(doc);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.reasons.includes("skill_unbalanced_parens"));
  }
});
