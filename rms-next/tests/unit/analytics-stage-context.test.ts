import assert from "node:assert/strict";
import test from "node:test";

import { buildStageContext } from "@/lib/analytics/pipeline/stages-service";
import type { StageDefinition } from "@/lib/analytics/transformers/funnel";

const STAGES: StageDefinition[] = [
  { key: "applied", label: "Applied", sortOrder: 1, isTerminal: false, isHidden: false, stageType: "active" },
  { key: "shortlisted", label: "Shortlisted", sortOrder: 2, isTerminal: false, isHidden: false, stageType: "active" },
  { key: "tech_round", label: "Technical Round", sortOrder: 3, isTerminal: false, isHidden: false, stageType: "active" },
  { key: "hired", label: "Hired", sortOrder: 4, isTerminal: true, isHidden: false, stageType: "active" },
  { key: "rejected", label: "Rejected", sortOrder: 99, isTerminal: true, isHidden: false, stageType: "rejected" },
];

test("mapToStageKey resolves canonical keys, labels, and reject heuristics", () => {
  const ctx = buildStageContext(STAGES);
  assert.equal(ctx.mapToStageKey("applied"), "applied");
  assert.equal(ctx.mapToStageKey("Applied"), "applied");
  assert.equal(ctx.mapToStageKey("Technical Round"), "tech_round");
  assert.equal(ctx.mapToStageKey("Hired/joined"), "hired");
  assert.equal(ctx.mapToStageKey("rejected by hiring manager"), "rejected");
  assert.equal(ctx.mapToStageKey(null), null);
  assert.equal(ctx.mapToStageKey(""), null);
});

test("active filter excludes hidden and reject stages", () => {
  const ctx = buildStageContext(STAGES);
  const activeKeys = ctx.active.map((s) => s.key);
  assert.deepEqual(activeKeys, ["applied", "shortlisted", "tech_round", "hired"]);
});

test("hidden flag removes stage from active funnel ordering", () => {
  const ctx = buildStageContext(
    STAGES.map((s) => (s.key === "shortlisted" ? { ...s, isHidden: true } : s)),
  );
  const activeKeys = ctx.active.map((s) => s.key);
  assert.deepEqual(activeKeys, ["applied", "tech_round", "hired"]);
});

test("hireKeys derives from terminal active stages", () => {
  const ctx = buildStageContext(STAGES);
  assert.deepEqual(Array.from(ctx.hireKeys), ["hired"]);
});
