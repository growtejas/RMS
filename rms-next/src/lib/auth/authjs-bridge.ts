/**
 * Auth.js v5 bridge strategy (see docs/ATS_GAP_MATRIX.md):
 * - Today: custom JWT in httpOnly cookie + Bearer, with `org_id` claim for tenant scope.
 * - Next: mount Auth.js (`auth.ts`) with the same `org_id` / user id in session,
 *   validate either session or legacy JWT in `requireBearerUser`, then retire JWT-only flow.
 *
 * This module is a placeholder so shared helpers can import a single entry point later.
 */
export type AuthBridgePhase = "jwt-primary" | "dual-read" | "authjs-primary";

export function getAuthBridgePhase(): AuthBridgePhase {
  const p = process.env.AUTH_BRIDGE_PHASE?.trim();
  if (p === "dual-read" || p === "authjs-primary") {
    return p;
  }
  return "jwt-primary";
}
