import assert from "node:assert/strict";
import test from "node:test";

import { buildFunnelRows, type StageDefinition, type FunnelStageInputs } from "@/lib/analytics/transformers/funnel";

const STAGES: StageDefinition[] = [
  { key: "applied", label: "Applied", sortOrder: 1, isTerminal: false, isHidden: false, stageType: "active" },
  { key: "screening", label: "Screening", sortOrder: 2, isTerminal: false, isHidden: false, stageType: "active" },
  { key: "tech", label: "Technical", sortOrder: 3, isTerminal: false, isHidden: false, stageType: "active" },
  { key: "rejected", label: "Rejected", sortOrder: 99, isTerminal: true, isHidden: false, stageType: "rejected" },
];

function makeInputs(entries: Array<[string, FunnelStageInputs]>): Map<string, FunnelStageInputs> {
  return new Map(entries);
}

test("buildFunnelRows ignores rejected/hidden stages and returns active stages in order", () => {
  const inputs = makeInputs([
    ["applied", { count: 100, agingDays: [], rejectionCount: 0, rejectionReasons: new Map() }],
    ["screening", { count: 60, agingDays: [], rejectionCount: 0, rejectionReasons: new Map() }],
    ["tech", { count: 30, agingDays: [], rejectionCount: 0, rejectionReasons: new Map() }],
  ]);
  const rows = buildFunnelRows(STAGES, inputs);
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((r) => r.key),
    ["applied", "screening", "tech"],
  );
});

test("conversion percentages reference previous stage count and saturate at 100", () => {
  const inputs = makeInputs([
    ["applied", { count: 100, agingDays: [], rejectionCount: 0, rejectionReasons: new Map() }],
    ["screening", { count: 50, agingDays: [], rejectionCount: 0, rejectionReasons: new Map() }],
    ["tech", { count: 25, agingDays: [], rejectionCount: 0, rejectionReasons: new Map() }],
  ]);
  const rows = buildFunnelRows(STAGES, inputs);
  assert.equal(rows[0].conversionPct, 100);
  assert.equal(rows[1].conversionPct, 50);
  assert.equal(rows[2].conversionPct, 50);
  assert.equal(rows[1].dropOffPct, 50);
});

test("empty inputs yield zero counts and 0 conversion (no NaN)", () => {
  const rows = buildFunnelRows(STAGES, new Map());
  for (const row of rows) {
    assert.equal(Number.isFinite(row.conversionPct), true);
    assert.equal(Number.isFinite(row.dropOffPct), true);
    assert.equal(row.count, 0);
    assert.equal(row.avgDaysInStage, 0);
  }
});

test("aging warning triggers when avg dwell exceeds threshold", () => {
  const inputs = makeInputs([
    ["applied", { count: 10, agingDays: [20, 30], rejectionCount: 0, rejectionReasons: new Map() }],
    ["screening", { count: 5, agingDays: [1], rejectionCount: 0, rejectionReasons: new Map() }],
    ["tech", { count: 1, agingDays: [], rejectionCount: 0, rejectionReasons: new Map() }],
  ]);
  const rows = buildFunnelRows(STAGES, inputs, { agingWarningDays: 14 });
  assert.equal(rows[0].agingWarning, true);
  assert.equal(rows[1].agingWarning, false);
});

test("rejection reasons return the most-frequent label as topRejectionReason", () => {
  const reasons = new Map<string, number>();
  reasons.set("Skill gap", 3);
  reasons.set("Cultural fit", 1);
  const inputs = makeInputs([
    [
      "screening",
      {
        count: 10,
        agingDays: [],
        rejectionCount: 4,
        rejectionReasons: reasons,
      },
    ],
  ]);
  const rows = buildFunnelRows(STAGES, inputs);
  const screening = rows.find((r) => r.key === "screening")!;
  assert.equal(screening.topRejectionReason, "Skill gap");
  assert.equal(screening.rejectionCount, 4);
});
