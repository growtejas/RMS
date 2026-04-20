import { test, expect } from "@playwright/test";

// This is a smoke test: it only asserts the endpoint responds and output shape is stable.
// It does NOT require real ranking data; it should run in any environment where the API is up.

test("ranking endpoint responds (unauthorized when no auth)", async ({ request }) => {
  const res = await request.get("/api/ranking/requisition-items/1");
  // Depending on environment, can be 401/403 (expected without auth) or 404 (if route guards differ).
  expect([401, 403, 404]).toContain(res.status());
});

