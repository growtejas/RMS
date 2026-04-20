"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const nextDir = path.join(root, ".next");

/** Artifacts written by `next build` but not used by a healthy `next dev` tree. */
const prodMarkers = [
  path.join(nextDir, "next-server.js.nft.json"),
  path.join(nextDir, "required-server-files.json"),
];

function hasProdBuildArtifacts() {
  return prodMarkers.some((p) => fs.existsSync(p));
}

if (hasProdBuildArtifacts()) {
  fs.rmSync(nextDir, { recursive: true, force: true });
  console.warn(
    "[rms-next] Removed `.next` from a previous `next build` so `next dev` can compile. Run `npm run build` before production.",
  );
}
