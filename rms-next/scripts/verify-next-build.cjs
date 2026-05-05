"use strict";

/**
 * Ensures `next start` is not run with an empty or missing production output.
 * Dev uses `distDir: .next-dev`; production uses `.next` (see next.config.mjs).
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const buildId = path.join(root, ".next", "BUILD_ID");

if (!fs.existsSync(buildId)) {
  console.error(
    "[rms-next] No production build found (.next/BUILD_ID missing). Run `npm run build` before `npm run start`.",
  );
  console.error(
    "[rms-next] For local development use `npm run dev` (output goes to .next-dev, not .next).",
  );
  process.exit(1);
}
