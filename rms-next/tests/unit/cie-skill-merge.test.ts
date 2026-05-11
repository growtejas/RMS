import assert from "node:assert/strict";
import test from "node:test";

import { mergeAtsSkillsWithV2 } from "@/lib/services/cie/cie-ats-align";

test("mergeAtsSkillsWithV2: v2 skills are always preserved (case-insensitive)", () => {
  const out = mergeAtsSkillsWithV2(
    ["Python", "PySpark", "AWS"],
    ["python", "sql", "aws"],
  );
  // v2 entries first; ATS-only "sql" appended
  assert.deepEqual(out.merged, ["python", "pyspark", "aws", "sql"]);
  assert.equal(out.v2Count, 3);
  assert.equal(out.atsCount, 3);
  assert.equal(out.atsAdded, 1);
});

test("mergeAtsSkillsWithV2: ATS-only skills append in order", () => {
  const out = mergeAtsSkillsWithV2(["python"], ["airflow", "dbt"]);
  assert.deepEqual(out.merged, ["python", "airflow", "dbt"]);
  assert.equal(out.atsAdded, 2);
});

test("mergeAtsSkillsWithV2: empty v2 falls back to ATS only", () => {
  const out = mergeAtsSkillsWithV2([], ["sql", "snowflake"]);
  assert.deepEqual(out.merged, ["sql", "snowflake"]);
  assert.equal(out.v2Count, 0);
  assert.equal(out.atsAdded, 2);
});

test("mergeAtsSkillsWithV2: blank entries are dropped, not crashing", () => {
  const out = mergeAtsSkillsWithV2(["python", "  "], ["", "sql"]);
  assert.deepEqual(out.merged, ["python", "sql"]);
  assert.ok(out.dropped >= 1);
});

test("mergeAtsSkillsWithV2: cap at 80 prevents runaway growth", () => {
  const big = Array.from({ length: 200 }, (_, i) => `skill-${i}`);
  const out = mergeAtsSkillsWithV2(big, []);
  assert.equal(out.merged.length, 80);
});
