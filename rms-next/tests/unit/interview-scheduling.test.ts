import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { intervalsOverlap } from "@/lib/repositories/interviews-repo";

describe("interview scheduling intervalsOverlap", () => {
  it("returns true when windows overlap", () => {
    const a0 = new Date("2026-04-23T10:00:00.000Z");
    const a1 = new Date("2026-04-23T11:00:00.000Z");
    const b0 = new Date("2026-04-23T10:30:00.000Z");
    const b1 = new Date("2026-04-23T11:30:00.000Z");
    assert.equal(intervalsOverlap(a0, a1, b0, b1), true);
  });

  it("returns false when one window ends exactly when the other starts", () => {
    const a0 = new Date("2026-04-23T10:00:00.000Z");
    const a1 = new Date("2026-04-23T11:00:00.000Z");
    const b0 = new Date("2026-04-23T11:00:00.000Z");
    const b1 = new Date("2026-04-23T12:00:00.000Z");
    assert.equal(intervalsOverlap(a0, a1, b0, b1), false);
  });

  it("returns false for disjoint windows", () => {
    const a0 = new Date("2026-04-23T08:00:00.000Z");
    const a1 = new Date("2026-04-23T09:00:00.000Z");
    const b0 = new Date("2026-04-23T10:00:00.000Z");
    const b1 = new Date("2026-04-23T11:00:00.000Z");
    assert.equal(intervalsOverlap(a0, a1, b0, b1), false);
  });
});
