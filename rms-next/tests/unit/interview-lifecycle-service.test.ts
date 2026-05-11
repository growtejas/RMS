import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canScheduleNextRoundFromRows,
  colorForRound,
  colorForStage,
  pickLatestActiveRound,
  toDbResult,
  toLifecycleResult,
  toLifecycleStatus,
} from "@/lib/services/interview-lifecycle-service";
import type { InterviewRow } from "@/lib/repositories/interviews-repo";

function row(partial: Partial<InterviewRow>): InterviewRow {
  // Minimal stub satisfying the parts of InterviewRow used by the service.
  // Anything not consumed by the helpers gets a defensible default.
  const base = {
    id: 1,
    candidateId: 1,
    requisitionItemId: null,
    applicationId: 100,
    roundNumber: 1,
    roundName: "Screening",
    roundType: "TECHNICAL",
    interviewMode: "ONLINE",
    interviewerName: null,
    scheduledAt: new Date("2026-05-10T10:00:00.000Z"),
    endTime: new Date("2026-05-10T11:00:00.000Z"),
    timezone: "UTC",
    meetingLink: null,
    googleCalendarEventId: null,
    location: null,
    notes: null,
    status: "SCHEDULED",
    result: null,
    feedback: null,
    conductedBy: null,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as InterviewRow;
  return { ...base, ...partial };
}

describe("interview-lifecycle-service vocab mapping", () => {
  it("maps DB status uppercase to lifecycle vocab", () => {
    assert.equal(toLifecycleStatus("SCHEDULED"), "scheduled");
    assert.equal(toLifecycleStatus("COMPLETED"), "completed");
    assert.equal(toLifecycleStatus("CANCELLED"), "cancelled");
    assert.equal(toLifecycleStatus("NO_SHOW"), "no_show");
    assert.equal(toLifecycleStatus(null), "scheduled");
    assert.equal(toLifecycleStatus("garbage"), "scheduled");
  });

  it("maps DB result uppercase to lifecycle vocab", () => {
    assert.equal(toLifecycleResult("PASS"), "passed");
    assert.equal(toLifecycleResult("FAIL"), "failed");
    assert.equal(toLifecycleResult("HOLD"), "hold");
    assert.equal(toLifecycleResult(null), "pending");
    assert.equal(toLifecycleResult(""), "pending");
  });

  it("maps lifecycle vocab back to DB result", () => {
    assert.equal(toDbResult("passed"), "PASS");
    assert.equal(toDbResult("failed"), "FAIL");
    assert.equal(toDbResult("hold"), "HOLD");
    assert.equal(toDbResult("pending"), null);
  });
});

describe("interview-lifecycle-service color rules", () => {
  it("scheduled → blue, no_show → orange, cancelled → grey", () => {
    assert.equal(colorForRound("scheduled", "pending"), "blue");
    assert.equal(colorForRound("rescheduled", "pending"), "blue");
    assert.equal(colorForRound("no_show", "pending"), "orange");
    assert.equal(colorForRound("cancelled", "pending"), "grey");
  });

  it("completed + passed → green; completed + failed → red; completed + pending → yellow", () => {
    assert.equal(colorForRound("completed", "passed"), "green");
    assert.equal(colorForRound("completed", "failed"), "red");
    assert.equal(colorForRound("completed", "hold"), "yellow");
    assert.equal(colorForRound("completed", "pending"), "yellow");
  });

  it("colorForStage reflects pipeline state", () => {
    assert.equal(colorForStage("not_started"), "grey");
    assert.equal(colorForStage("current"), "blue");
    assert.equal(colorForStage("past"), "green");
    assert.equal(colorForStage("rejected"), "red");
  });
});

describe("interview-lifecycle-service: pickLatestActiveRound", () => {
  it("returns null when there are no active rounds", () => {
    assert.equal(pickLatestActiveRound([]), null);
  });

  it("ignores cancelled rounds", () => {
    const r1 = row({ id: 1, roundNumber: 1, status: "CANCELLED" });
    const r2 = row({ id: 2, roundNumber: 2, status: "SCHEDULED" });
    assert.equal(pickLatestActiveRound([r1, r2])?.id, 2);
  });

  it("picks the highest roundNumber, breaking ties by latest scheduledAt", () => {
    const r1 = row({
      id: 1,
      roundNumber: 2,
      scheduledAt: new Date("2026-05-01T10:00:00Z"),
    });
    const r2 = row({
      id: 2,
      roundNumber: 2,
      scheduledAt: new Date("2026-05-02T10:00:00Z"),
    });
    const r3 = row({
      id: 3,
      roundNumber: 1,
      scheduledAt: new Date("2026-05-09T10:00:00Z"),
    });
    assert.equal(pickLatestActiveRound([r1, r2, r3])?.id, 2);
  });
});

describe("interview-lifecycle-service: canScheduleNextRoundFromRows", () => {
  it("allows scheduling when no rounds exist", () => {
    assert.equal(canScheduleNextRoundFromRows([]), true);
  });

  it("blocks when latest active round is SCHEDULED", () => {
    const r = row({ status: "SCHEDULED", result: null });
    assert.equal(canScheduleNextRoundFromRows([r]), false);
  });

  it("blocks when latest active round is COMPLETED + pending result", () => {
    const r = row({ status: "COMPLETED", result: null });
    assert.equal(canScheduleNextRoundFromRows([r]), false);
  });

  it("blocks when latest active round is COMPLETED + FAIL", () => {
    const r = row({ status: "COMPLETED", result: "FAIL" });
    assert.equal(canScheduleNextRoundFromRows([r]), false);
  });

  it("blocks when latest active round is COMPLETED + HOLD", () => {
    const r = row({ status: "COMPLETED", result: "HOLD" });
    assert.equal(canScheduleNextRoundFromRows([r]), false);
  });

  it("allows when latest active round is COMPLETED + PASS", () => {
    const r = row({ status: "COMPLETED", result: "PASS" });
    assert.equal(canScheduleNextRoundFromRows([r]), true);
  });

  it("allows when only cancelled rounds exist", () => {
    const r1 = row({ id: 1, status: "CANCELLED", result: null });
    const r2 = row({
      id: 2,
      roundNumber: 2,
      status: "CANCELLED",
      result: "FAIL",
    });
    assert.equal(canScheduleNextRoundFromRows([r1, r2]), true);
  });

  it("evaluates only the latest active round (NO_SHOW blocks scheduling)", () => {
    const r1 = row({ id: 1, roundNumber: 1, status: "COMPLETED", result: "PASS" });
    const r2 = row({
      id: 2,
      roundNumber: 2,
      status: "NO_SHOW",
      result: null,
    });
    assert.equal(canScheduleNextRoundFromRows([r1, r2]), false);
  });
});
