/**
 * Contract tests for docs/PHASE_0_DATABASE_CHECKLIST.md and docs/PHASE_1_INGESTION_DECISION.md.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applications, candidates } from "@/lib/db/schema";
import { applicationCreateBody } from "@/lib/validators/applications";
import {
  candidateCreateBody,
  applicationStageBody,
} from "@/lib/validators/candidates";

describe("Phase 0: schema contracts (applications)", () => {
  it("uses current_stage not stage; exposes ats_bucket", () => {
    assert.equal(applications.currentStage.name, "current_stage");
    assert.equal(applications.atsBucket?.name, "ats_bucket");
  });

  it("candidates rows are scoped to requisition line columns", () => {
    assert.equal(candidates.requisitionItemId.name, "requisition_item_id");
    assert.equal(candidates.requisitionId.name, "requisition_id");
    assert.equal(candidates.organizationId.name, "organization_id");
    assert.equal(candidates.personId.name, "person_id");
  });
});

describe("Phase 1: ingestion validators (adopted per-line model)", () => {
  it("candidate create requires requisition_item_id and requisition_id", () => {
    const ok = candidateCreateBody.safeParse({
      requisition_item_id: 1,
      requisition_id: 2,
      full_name: "Test User",
      email: "test@example.com",
    });
    assert.ok(ok.success);
    const bad = candidateCreateBody.safeParse({
      requisition_id: 2,
      full_name: "Test User",
      email: "test@example.com",
    });
    assert.ok(!bad.success);
  });

  it("application create requires candidate_id and requisition_item_id", () => {
    const ok = applicationCreateBody.safeParse({
      candidate_id: 10,
      requisition_item_id: 5,
    });
    assert.ok(ok.success);
    const bad = applicationCreateBody.safeParse({
      candidate_id: 10,
    });
    assert.ok(!bad.success);
  });

  it("application stage body accepts INTERVIEW alias as Interviewing", () => {
    const parsed = applicationStageBody.safeParse({
      new_stage: "INTERVIEW",
    });
    assert.ok(parsed.success);
    assert.equal(parsed.data?.new_stage, "Interviewing");
  });
});

describe("Phase 1: duplicate application policy (Candidate Pipeline §13, §18)", () => {
  it("applications.candidate_id column name matches API body candidate_id", () => {
    assert.equal(applications.candidateId.name, "candidate_id");
  });

  it("application create body is stable for idempotent POST /api/applications", () => {
    const ok = applicationCreateBody.safeParse({
      candidate_id: 99,
      requisition_item_id: 5,
    });
    assert.ok(ok.success);
  });
});
