import test from "node:test";
import assert from "node:assert/strict";

import {
  coerceExternalLlmResumeProfile,
  extractNumericFieldConfidenceFromLlmJson,
  stripNonProfileKeysForZod,
} from "@/lib/services/resume-structure/llm-profile-coercion";
import { parsedCandidateProfileZ } from "@/lib/services/resume-structure/resume-structure.schema";

const externalSample = {
  full_name: "RRRR",
  emails: ["RRRR@gmail.com"],
  phones: ["8888888889"],
  total_experience_years: 9,
  skills: [
    "JavaScript",
    "TypeScript",
    "React",
    "React Native",
    "Node.js",
    "Next.js",
    "NestJS",
    "Redux",
    "Zustand",
  ],
  education: ["Bachelor degree in Computer Science"],
  confidence: {
    experience: 0.95,
    skills: 0.85,
  },
};

test("coerceExternalLlmResumeProfile: external alias shape passes parsedCandidateProfileZ", () => {
  const coerced = coerceExternalLlmResumeProfile(externalSample);
  const r = parsedCandidateProfileZ.safeParse(coerced);
  assert.equal(r.success, true);
  if (r.success) {
    assert.equal(r.data.name, "RRRR");
    assert.equal(r.data.email, "RRRR@gmail.com");
    assert.equal(r.data.phone, "8888888889");
    assert.equal(r.data.experience_years, 9);
    assert.ok(r.data.education?.includes("Bachelor"));
    assert.ok(r.data.skills.includes("react"));
    assert.ok(r.data.skills.includes("typescript"));
  }
});

test("stripNonProfileKeysForZod + strict profile accepts canonical LLM payload with confidence sibling", () => {
  const payload = {
    name: "A",
    email: "a@b.co",
    phone: null,
    skills: ["react"],
    projects: [],
    experience_years: 2,
    experience_details: [],
    education: "BS CS",
    certifications: [],
    job_title: null,
    location: null,
    employment: [],
    confidence: { skills: 0.9 },
  };
  const stripped = stripNonProfileKeysForZod(payload as Record<string, unknown>);
  const r = parsedCandidateProfileZ.safeParse(stripped);
  assert.equal(r.success, true);
});

test("extractNumericFieldConfidenceFromLlmJson: maps numeric bands (skills + experience only)", () => {
  const fc = extractNumericFieldConfidenceFromLlmJson(externalSample);
  assert.ok(fc);
  assert.equal(fc!.contact, undefined);
  assert.equal(fc!.experience_years, "high");
  assert.equal(fc!.skills, "high");
  assert.equal(fc!.education, undefined);
});

test("coerceExternalLlmResumeProfile: empty input yields minimal valid profile", () => {
  const r = parsedCandidateProfileZ.safeParse(coerceExternalLlmResumeProfile(null));
  assert.equal(r.success, true);
  if (r.success) {
    assert.equal(r.data.name, null);
    assert.deepEqual(r.data.skills, []);
  }
});

test("coerceExternalLlmResumeProfile: strips Languages – prefix and normalizes skill", () => {
  const coerced = coerceExternalLlmResumeProfile({
    full_name: "X",
    emails: ["x@y.co"],
    phones: [],
    total_experience_years: 1,
    skills: ["Languages – Python", "ML/AI Tools – TensorFlow"],
    education: ["BS Computer Science"],
    confidence: { skills: 0.9, experience: 0.8 },
  });
  const r = parsedCandidateProfileZ.safeParse(coerced);
  assert.equal(r.success, true);
  if (r.success) {
    assert.ok(r.data.skills.includes("python"));
    assert.ok(r.data.skills.some((s) => s.includes("tensor") || s === "tensorflow"));
  }
});

test("coerceExternalLlmResumeProfile: skips date range in phones and uses real number", () => {
  const coerced = coerceExternalLlmResumeProfile({
    full_name: "X",
    emails: ["x@y.co"],
    phones: ["2019 - 2023", "+1 234 567 8900"],
    total_experience_years: 2,
    skills: ["Java"],
    education: [],
    confidence: { skills: 0.8, experience: 0.8 },
  });
  const r = parsedCandidateProfileZ.safeParse(coerced);
  assert.equal(r.success, true);
  if (r.success) {
    assert.equal(r.data.phone, "12345678900");
  }
});

test("coerceExternalLlmResumeProfile: skips invalid email in list", () => {
  const coerced = coerceExternalLlmResumeProfile({
    full_name: "X",
    emails: ["not-an-email", "valid@example.com"],
    phones: ["8888888888"],
    total_experience_years: null,
    skills: [],
    education: [],
    confidence: { skills: 0.5, experience: 0.5 },
  });
  const r = parsedCandidateProfileZ.safeParse(coerced);
  assert.equal(r.success, true);
  if (r.success) {
    assert.equal(r.data.email, "valid@example.com");
  }
});

test("coerceExternalLlmResumeProfile: expands parenthetical skills", () => {
  const coerced = coerceExternalLlmResumeProfile({
    full_name: "X",
    emails: ["x@y.co"],
    phones: [],
    total_experience_years: 1,
    skills: ["Python (Pandas, NumPy)"],
    education: [],
    confidence: { skills: 0.9, experience: 0.8 },
  });
  const r = parsedCandidateProfileZ.safeParse(coerced);
  assert.equal(r.success, true);
  if (r.success) {
    assert.ok(r.data.skills.includes("python"));
    assert.ok(r.data.skills.includes("pandas"));
    assert.ok(r.data.skills.includes("numpy"));
  }
});

test("coerceExternalLlmResumeProfile: normalizes phone to digits only", () => {
  const coerced = coerceExternalLlmResumeProfile({
    full_name: "X",
    emails: ["x@y.co"],
    phones: ["+1 (234) 567-8900"],
    total_experience_years: 0,
    skills: [],
    education: [],
    confidence: { skills: 0.7, experience: 0.6 },
  });
  const r = parsedCandidateProfileZ.safeParse(coerced);
  assert.equal(r.success, true);
  if (r.success) {
    assert.equal(r.data.phone, "12345678900");
    assert.match(r.data.phone!, /^\d+$/);
  }
});

test("coerceExternalLlmResumeProfile: sklearn alias via normalizeSkill", () => {
  const coerced = coerceExternalLlmResumeProfile({
    full_name: "X",
    emails: ["x@y.co"],
    phones: [],
    total_experience_years: 1,
    skills: ["Scikit-learn"],
    education: [],
    confidence: { skills: 0.9, experience: 0.8 },
  });
  const r = parsedCandidateProfileZ.safeParse(coerced);
  assert.equal(r.success, true);
  if (r.success) {
    assert.ok(r.data.skills.includes("scikit learn"));
  }
});
