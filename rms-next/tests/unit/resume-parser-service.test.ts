import test from "node:test";
import assert from "node:assert/strict";

import { normalizedResumeExtension } from "@/lib/services/resume-parser-service";

test("normalizedResumeExtension: URL query must not poison extension", () => {
  assert.equal(
    normalizedResumeExtension("http://example.com/files/cv.pdf?sig=abc"),
    ".pdf",
  );
});

test("normalizedResumeExtension: strips query on local-ish paths", () => {
  assert.equal(normalizedResumeExtension("/data/cv.pdf?v=1"), ".pdf");
});
