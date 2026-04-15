/**
 * Port of `_user_roles_to_system_roles` in `workflow_engine_v2.py`.
 */

import { normalizeRoleName } from "@/lib/auth/normalize-roles";
import {
  SystemRole,
  type SystemRoleName,
} from "@/lib/workflow/workflow-matrix";

const SYSTEM_VALUES = new Set(Object.values(SystemRole));

export function userRolesToSystemRoles(userRoles: string[]): Set<SystemRoleName> {
  const out = new Set<SystemRoleName>();
  for (const r of userRoles) {
    const c = normalizeRoleName(r);
    if (c === "Owner") {
      out.add(SystemRole.ADMIN);
    } else if (SYSTEM_VALUES.has(c as SystemRoleName)) {
      out.add(c as SystemRoleName);
    }
  }
  return out;
}

/** Fast checks matching Python `"HR" in user_roles` after DB normalization. */
export function hasAnyNormalizedRole(
  userRoles: string[],
  ...needles: string[]
): boolean {
  const set = new Set(userRoles.map((r) => normalizeRoleName(r)));
  for (const n of needles) {
    if (set.has(normalizeRoleName(n))) {
      return true;
    }
  }
  return false;
}
