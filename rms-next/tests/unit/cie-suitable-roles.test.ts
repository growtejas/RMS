import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  finalizeCandidateReportLlm,
  normalizeSuitableRoles,
  parseStoredCandidateReport,
} from "@/lib/services/cie/cie.schema";
import { canonicalizeRoleName, slugifyRole } from "@/lib/services/cie/role-catalog";

describe("CIE suitable roles normalization", () => {
  it("maps ETL alias to data_engineer", () => {
    const c = canonicalizeRoleName("ETL Engineer");
    assert.equal(c.roleId, "data_engineer");
    assert.equal(c.matched, true);
  });

  it("slugifies unknown titles", () => {
    assert.equal(slugifyRole("Foo Bar Baz!"), "foo_bar_baz");
  });

  it("normalizes legacy string array", () => {
    const out = normalizeSuitableRoles(["Data Engineer", "Unknown Fancy Title"]);
    assert.ok(out.some((r) => r.roleId === "data_engineer"));
    assert.ok(out.some((r) => r.roleId === "unknown_fancy_title"));
  });

  it("normalizes LLM partial objects", () => {
    const out = normalizeSuitableRoles([
      { displayName: "Backend Engineer", confidence: 0.9 },
      { displayName: "ETL Engineer", confidence: 0.7 },
    ]);
    assert.ok(out.find((r) => r.roleId === "backend_engineer"));
    assert.ok(out.find((r) => r.roleId === "data_engineer"));
  });

  it("parseStoredCandidateReport accepts legacy suitableRoles strings", () => {
    const raw = {
      summary: "x",
      strengths: [],
      weaknesses: [],
      primarySkills: [],
      secondarySkills: [],
      experienceLevel: "Mid",
      suitableRoles: ["Analytics Engineer"],
      educationInsights: { relevance: "High", notes: "n" },
      riskFlags: [],
      confidenceScore: 0.8,
    };
    const p = parseStoredCandidateReport(raw);
    assert.equal(p.ok, true);
    if (p.ok) {
      assert.equal(p.data.suitableRoles[0]?.roleId, "analytics_engineer");
    }
  });

  it("finalizeCandidateReportLlm maps displayName rows to roleIds", () => {
    const rep = finalizeCandidateReportLlm({
      summary: "s",
      strengths: [],
      weaknesses: [],
      primarySkills: [],
      secondarySkills: [],
      experienceLevel: "Junior",
      suitableRoles: [{ displayName: "Data Engineer", confidence: 0.95 }],
      educationInsights: { relevance: "Medium", notes: "n" },
      riskFlags: [],
      confidenceScore: 0.9,
    });
    assert.equal(rep.suitableRoles[0]?.roleId, "data_engineer");
    assert.equal(rep.suitableRoles[0]?.displayName, "Data Engineer");
  });
});
