import assert from "node:assert/strict";
import test from "node:test";

import { parsedCandidateLikelyCorrupted } from "@/lib/services/cie/cie-parsed-candidate-quality";
import type { ParsedCandidate } from "@/lib/services/cie/cie.schema";

const minimal = (): ParsedCandidate => ({
  basicInfo: { name: "A", email: null, phone: null },
  skills: [],
  projects: [],
  experience: [],
  education: [],
});

test("parsedCandidateLikelyCorrupted: clean v2-style projection is false", () => {
  const p: ParsedCandidate = {
    ...minimal(),
    skills: ["python", "sql"],
    experience: [
      { company: "Acme", role: "Engineer", years: 2 },
      { company: "Beta", role: "Dev", years: 1 },
    ],
    education: [{ degree: "BS CS", specialization: null, university: "X", year: 2020, score: null }],
  };
  assert.equal(parsedCandidateLikelyCorrupted(p), false);
});

test("parsedCandidateLikelyCorrupted: many placeholder companies triggers", () => {
  const p: ParsedCandidate = {
    ...minimal(),
    skills: ["python"],
    experience: Array.from({ length: 8 }, (_, i) => ({
      company: "—",
      role: `bullet fragment ${i}`,
      years: 0.3,
    })),
  };
  assert.equal(parsedCandidateLikelyCorrupted(p), true);
});

test("parsedCandidateLikelyCorrupted: pipe-heavy fake degree triggers", () => {
  const p: ParsedCandidate = {
    ...minimal(),
    experience: [{ company: "X", role: "Y", years: 1 }],
    education: [
      {
        degree: "A (2024) | • foo | • bar | • baz",
        specialization: null,
        university: "—",
        year: 2024,
        score: null,
      },
    ],
  };
  assert.equal(parsedCandidateLikelyCorrupted(p), true);
});

test("parsedCandidateLikelyCorrupted: broken parenthesis skills triggers", () => {
  const p: ParsedCandidate = {
    ...minimal(),
    skills: ["cloud & devops: aws (s3", "glue)", "query)"],
    experience: [{ company: "Acme", role: "Eng", years: 2 }],
  };
  assert.equal(parsedCandidateLikelyCorrupted(p), true);
});
