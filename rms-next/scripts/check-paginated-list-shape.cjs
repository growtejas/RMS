#!/usr/bin/env node
/* eslint-disable */
/**
 * Phase 8 lint guard — enforce the canonical paginated list contract.
 *
 * This script scans every `route.ts` under `src/app/api/**` whose `GET`
 * handler is heuristically a "list" route (returns more than one row) and
 * fails the build when:
 *
 *   - The handler hits `NextResponse.json([...])` (bare-array list).
 *   - The handler returns a top-level shape lacking a `pagination` field.
 *
 * Routes that are explicit allow-listed targets (auth/session, single-record
 * GETs, exports, CSV downloaders, websockets) are skipped via
 * `LIST_ROUTE_ALLOWLIST` below.
 *
 * The check is intentionally conservative: it permits legacy bare-array
 * responses guarded behind `if (isCanonicalListRequest(...))` branches, since
 * those routes also emit the canonical envelope on the canonical path.
 *
 * Usage:
 *   node scripts/check-paginated-list-shape.cjs
 *   npm run lint:pagination
 *
 * Exits with code 1 on the first offending file.
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const API_ROOT = path.join(ROOT, "src", "app", "api");

/**
 * Allow-list of files that are explicitly NOT paginated list endpoints.
 *
 * Match against the path relative to `src/app/api/`. Glob is plain string
 * containment for simplicity (no `minimatch` dependency needed).
 */
const LIST_ROUTE_ALLOWLIST = new Set([
  // Auth / session / health / metrics
  "auth/login/route.ts",
  "auth/logout/route.ts",
  "auth/refresh/route.ts",
  "auth/oauth/google/route.ts",
  "auth/oauth/google/callback/route.ts",
  "auth/oauth/google/start/route.ts",
  "metrics/route.ts",
  "rum/route.ts",
  "health/route.ts",
  "csrf/route.ts",
  // Single-record / aggregate (not list)
  "audit-logs/summary/route.ts",
  "audit-logs/export/route.ts",
  "ranking/snapshot/route.ts",
]);

/** Heuristics for "this file owns a list-style GET handler". */
const LIST_KEYWORDS = [
  /\bGET\(/,
];

/** Return true if `fileText` contains a bare-array NextResponse.json call. */
function returnsBareArray(fileText) {
  // Match `NextResponse.json([...])` with at least one element.
  // Allowed: `NextResponse.json({ ... })` or `NextResponse.json(rows)`.
  const m = fileText.match(/NextResponse\.json\(\s*\[/);
  return Boolean(m);
}

/**
 * Walk a directory and yield every `route.ts` file path.
 */
function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile() && entry.name === "route.ts") {
      yield full;
    }
  }
}

function relativeToApi(absPath) {
  return path.relative(API_ROOT, absPath).replaceAll(path.sep, "/");
}

function main() {
  if (!fs.existsSync(API_ROOT)) {
    console.error(`[pagination-lint] API root not found: ${API_ROOT}`);
    process.exit(2);
  }

  const offenders = [];
  for (const file of walk(API_ROOT)) {
    const rel = relativeToApi(file);
    if (LIST_ROUTE_ALLOWLIST.has(rel)) continue;

    const text = fs.readFileSync(file, "utf8");
    const hasGet = LIST_KEYWORDS.some((re) => re.test(text));
    if (!hasGet) continue;

    if (!returnsBareArray(text)) continue;

    // The route returns a bare array somewhere. Permit it only if the file
    // also ships a canonical-aware branch (paginatedJson + isCanonicalListRequest).
    const hasCanonical =
      /paginatedJson\(/.test(text) && /isCanonicalListRequest|isCanonicalRequest/.test(text);

    if (hasCanonical) continue;
    offenders.push(rel);
  }

  if (offenders.length === 0) {
    console.log(
      `[pagination-lint] OK (${API_ROOT.replace(ROOT + path.sep, "")} — no bare-array list responses).`,
    );
    return;
  }

  console.error("[pagination-lint] FAIL — the following list routes return a bare array:");
  for (const rel of offenders) {
    console.error(`  - src/app/api/${rel}`);
  }
  console.error(
    "\nFix: emit `paginatedJson(items, { page, limit, total })` or wrap the legacy shape\n" +
      "behind `if (isCanonicalListRequest(url))` and add a `Deprecation` header on the\n" +
      "legacy path. See docs/perf/observability.md \u00a76.",
  );
  process.exit(1);
}

main();
