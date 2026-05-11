import assert from "node:assert/strict";
import test from "node:test";

import { buildCieReportPayload } from "@/lib/services/cie/cie-llm";
import type { ParsedCandidate } from "@/lib/services/cie/cie.schema";
import type { V2ProcessorPayload } from "@/lib/services/resume-structure/strict-resume-v2-mapper";
import type { StrictResumeV2 } from "@/lib/services/resume-structure/strict-resume-v2.schema";

const flat: ParsedCandidate = {
  basicInfo: { name: "Divjot Singh", email: "x@y.z", phone: null },
  skills: ["python", "sql"],
  projects: [],
  experience: [{ company: "RBM Software", role: "Data Engineer", years: 1 }],
  education: [],
};

const richV2: StrictResumeV2 = {
  schema: "strict_resume_v2",
  profile_type: "mid",
  profile_type_confidence: 0.8,
  warnings: [],
  core: {
    basicInfo: {
      name: { value: "Divjot Singh", prov: { source: "header", confidence: 0.9 } },
      email: { value: "x@y.z", prov: { source: "header", confidence: 0.9 } },
      phone: { value: null, prov: { source: "unknown", confidence: 0 } },
    },
    skills: [
      { name: "python", prov: { source: "skills_section", confidence: 0.9 } },
      { name: "sql", prov: { source: "skills_section", confidence: 0.9 } },
    ],
    experience: [
      {
        company: "RBM Software",
        role: "Data Engineer",
        location: null,
        startDate: "2025-06",
        endDate: null,
        durationMonths: null,
        bullets: ["Engineered scalable PySpark ETL pipelines"],
        techStack: ["pyspark", "aws"],
        prov: { source: "experience_section", confidence: 0.9 },
      },
    ],
    projects: [],
    education: [],
  },
};

test("buildCieReportPayload: prefers strict_resume_v2_processor when v2 provided", () => {
  const payload = buildCieReportPayload({
    parsed: flat,
    parsedV2: richV2,
    targetRole: null,
    legacyParserHints: null,
    candidateId: 42,
  });
  assert.equal(payload.parsedDataKind, "strict_resume_v2_processor");
  const processor = payload.parsedData as V2ProcessorPayload;
  assert.equal(processor.schema, "candidate_processor_v1");
  assert.equal(processor.candidate_id, 42);
  assert.equal(processor.experience[0]!.highlights[0], "Engineered scalable PySpark ETL pipelines");
  assert.deepEqual(processor.experience[0]!.tech_stack, ["pyspark", "aws"]);
  assert.equal(processor.contact.email, "x@y.z");
  assert.equal(payload.legacyParserHints, undefined);
});

test("buildCieReportPayload: falls back to flat ParsedCandidate when no v2", () => {
  const payload = buildCieReportPayload({
    parsed: flat,
    parsedV2: null,
    targetRole: "Data Engineer",
    legacyParserHints: { experience_years: 1, notice_period_days: 30 },
  });
  assert.equal(payload.parsedDataKind, "parsed_candidate_flat");
  assert.deepEqual(payload.parsedData, flat);
  assert.equal(payload.targetRole, "Data Engineer");
  assert.deepEqual(payload.legacyParserHints, {
    experience_years: 1,
    notice_period_days: 30,
  });
});

test("buildCieReportPayload: drops legacyParserHints when both fields null", () => {
  const payload = buildCieReportPayload({
    parsed: flat,
    parsedV2: null,
    targetRole: null,
    legacyParserHints: { experience_years: null, notice_period_days: null },
  });
  assert.equal(payload.legacyParserHints, undefined);
});
