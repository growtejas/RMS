"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const nextDir = path.join(root, ".next-dev");

/** Artifacts written by `next build` but not used by a healthy `next dev` tree. */
const prodMarkers = [
  // If a dev tree somehow contains prod build markers, wipe it.
  path.join(nextDir, "next-server.js.nft.json"),
  path.join(nextDir, "required-server-files.json"),
];

function hasProdBuildArtifacts() {
  return prodMarkers.some((p) => fs.existsSync(p));
}

/**
 * After dependency or route changes, incremental `.next-dev` can list vendor chunks
 * in `server/app/**` bundles that no longer exist under `server/vendor-chunks/`
 * (e.g. "Cannot find module './vendor-chunks/lucide-react.js'"). Scrub when detected.
 */
function devTreeReferencesMissingVendorChunks() {
  const appDir = path.join(nextDir, "server", "app");
  const vcDir = path.join(nextDir, "server", "vendor-chunks");
  if (!fs.existsSync(appDir) || !fs.existsSync(vcDir)) {
    return false;
  }

  const chunkRe = /vendor-chunks\/([^"]+)/g;
  const referenced = new Set();

  /** App Router compiled entry names that embed the async vendor chunk list. */
  const routeEntryRe = /^(page|layout|route|loading|template|default)\.js$/;

  function normalizeChunkId(raw) {
    let id = raw.trim();
    if (id.endsWith(".js")) {
      id = id.slice(0, -3);
    }
    return id;
  }

  function walk(dir) {
    let ents;
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of ents) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
      } else if (ent.isFile() && routeEntryRe.test(ent.name)) {
        let txt;
        try {
          txt = fs.readFileSync(full, "utf8");
        } catch {
          continue;
        }
        if (!txt.includes("__webpack_require__.X(")) {
          continue;
        }
        chunkRe.lastIndex = 0;
        let m;
        while ((m = chunkRe.exec(txt)) !== null) {
          referenced.add(normalizeChunkId(m[1]));
        }
      }
    }
  }

  walk(appDir);

  for (const id of referenced) {
    if (!id) {
      continue;
    }
    const chunkFile = path.join(vcDir, `${id}.js`);
    if (!fs.existsSync(chunkFile)) {
      console.warn(
        `[rms-next] Stale dev cache: missing vendor-chunks/${id}.js (referenced by a route bundle).`,
      );
      return true;
    }
  }
  return false;
}

const prodLeak = hasProdBuildArtifacts();
const staleVendor = fs.existsSync(nextDir) && devTreeReferencesMissingVendorChunks();

if ((prodLeak || staleVendor) && fs.existsSync(nextDir)) {
  fs.rmSync(nextDir, { recursive: true, force: true });
  if (prodLeak) {
    console.warn(
      "[rms-next] Removed `.next-dev` artifacts so `next dev` can compile cleanly. Run `npm run build` before production.",
    );
  } else {
    console.warn(
      "[rms-next] Removed `.next-dev` for a clean compile (stale vendor chunks). If this repeats often, run `npm run dev:clean`.",
    );
  }
}
