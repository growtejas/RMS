import { test, expect } from "@playwright/test";

test("ranking run and applications bucket endpoints require auth", async ({
  request,
}) => {
  const run = await request.post("/api/ranking/run", {
    data: JSON.stringify({ requisition_item_id: 1 }),
    headers: { "Content-Type": "application/json" },
  });
  expect([401, 403]).toContain(run.status());

  const buckets = await request.get(
    "/api/applications?requisition_item_id=1&group_by=ats_bucket",
  );
  expect([401, 403]).toContain(buckets.status());
});
