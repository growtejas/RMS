import { test, expect } from "@playwright/test";

/**
 * Lightweight smoke: pipeline UI routes respond without server errors.
 * Full ATS flows require auth + seeded data (see docs/Candidate_Pipeline.txt §19).
 */
test.describe("Pipeline UI routes", () => {
  test("global candidates page is reachable", async ({ page }) => {
    const res = await page.goto("/ta/candidates", {
      waitUntil: "domcontentloaded",
    });
    expect(res?.status() ?? 0).toBeLessThan(500);
  });
});
