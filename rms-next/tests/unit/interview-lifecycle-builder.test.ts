import test from "node:test";
import assert from "node:assert/strict";

import { buildLifecyclePayloadForApplication } from "@/lib/services/interview-lifecycle-service";
import type { InterviewRow } from "@/lib/repositories/interviews-repo";

function baseIv(
  overrides: Partial<InterviewRow> & Pick<InterviewRow, "id" | "roundNumber" | "status">,
): InterviewRow {
  const now = new Date();
  return {
    id: overrides.id,
    candidateId: 1,
    requisitionItemId: 1,
    applicationId: 10,
    roundNumber: overrides.roundNumber,
    roundName: overrides.roundName ?? null,
    roundType: overrides.roundType ?? null,
    interviewMode: null,
    interviewerName: null,
    scheduledAt: overrides.scheduledAt ?? now,
    endTime: overrides.endTime ?? now,
    timezone: "UTC",
    meetingLink: null,
    googleCalendarEventId: null,
    location: null,
    notes: null,
    status: overrides.status,
    result: overrides.result ?? null,
    feedback: null,
    conductedBy: null,
    createdBy: null,
    updatedBy: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as InterviewRow;
}

test("buildLifecyclePayloadForApplication: no interviews", () => {
  const p = buildLifecyclePayloadForApplication({
    applicationId: 10,
    candidateId: 1,
    currentStage: "Shortlisted",
    interviewRows: [],
  });
  assert.equal(p.is_rejected, false);
  assert.equal(p.can_schedule_next, true);
  assert.equal(p.next_round_number, 1);
  const iv = p.top_level.find((s) => s.key === "Interviewing");
  assert.ok(iv?.rounds);
  assert.equal(iv!.rounds!.length, 0);
});

test("buildLifecyclePayloadForApplication: unknown stage falls back in derive", () => {
  const p = buildLifecyclePayloadForApplication({
    applicationId: 10,
    candidateId: 1,
    currentStage: "LegacyCustom",
    interviewRows: [],
  });
  assert.ok(p.top_level.length >= 5);
});

test("buildLifecyclePayloadForApplication: rejected stage", () => {
  const p = buildLifecyclePayloadForApplication({
    applicationId: 10,
    candidateId: 1,
    currentStage: "Rejected",
    interviewRows: [],
  });
  assert.equal(p.is_rejected, true);
});

test("buildLifecyclePayloadForApplication: latest completed fail implies rejected", () => {
  const rows = [
    baseIv({
      id: 1,
      roundNumber: 1,
      status: "COMPLETED",
      result: "FAIL",
    }),
  ];
  const p = buildLifecyclePayloadForApplication({
    applicationId: 10,
    candidateId: 1,
    currentStage: "Interviewing",
    interviewRows: rows,
  });
  assert.equal(p.is_rejected, true);
});

test("buildLifecyclePayloadForApplication: cancelled rounds omitted from payload", () => {
  const rows = [
    baseIv({
      id: 1,
      roundNumber: 1,
      status: "CANCELLED",
      result: null,
    }),
    baseIv({
      id: 2,
      roundNumber: 2,
      status: "SCHEDULED",
      result: null,
    }),
  ];
  const p = buildLifecyclePayloadForApplication({
    applicationId: 10,
    candidateId: 1,
    currentStage: "Interviewing",
    interviewRows: rows,
  });
  const iv = p.top_level.find((s) => s.key === "Interviewing");
  assert.equal(iv?.rounds?.length, 1);
  assert.equal(iv?.rounds?.[0]?.interview_id, 2);
});

test("buildLifecyclePayloadForApplication: RESCHEDULED maps to lifecycle status", () => {
  const rows = [
    baseIv({
      id: 1,
      roundNumber: 1,
      status: "RESCHEDULED",
      result: null,
    }),
  ];
  const p = buildLifecyclePayloadForApplication({
    applicationId: 10,
    candidateId: 1,
    currentStage: "Interviewing",
    interviewRows: rows,
  });
  const iv = p.top_level.find((s) => s.key === "Interviewing");
  assert.equal(iv?.rounds?.[0]?.status, "rescheduled");
});
