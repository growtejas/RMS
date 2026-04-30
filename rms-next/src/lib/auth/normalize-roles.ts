/**
 * Align with `backend/utils/rbac_roles.py` — canonical names for JWT + RBAC.
 */

const CANONICAL: Record<string, string> = {
  admin: "Admin",
  owner: "Owner",
  hr: "HR",
  ta: "TA",
  manager: "Manager",
  employee: "Employee",
  interviewer: "Interviewer",
  system: "SYSTEM",
};

export function normalizeRoleName(name: string | null | undefined): string {
  if (!name || !String(name).trim()) {
    return "";
  }
  const s = String(name).trim();
  return CANONICAL[s.toLowerCase()] ?? s;
}

export function normalizeRoleList(names: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const n of names) {
    const c = normalizeRoleName(n);
    if (c && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

/** Same semantics as `backend/utils/rbac_roles.roles_match_any`. */
export function rolesMatchAny(
  userRoles: readonly string[],
  requiredRoles: readonly string[],
): boolean {
  const u = new Set(
    userRoles.map((r) => normalizeRoleName(r)).filter(Boolean),
  );
  const r = new Set(
    requiredRoles.map((x) => normalizeRoleName(x)).filter(Boolean),
  );
  if (u.has("Owner")) {
    u.add("Admin");
  }
  return Array.from(u).some((x) => r.has(x));
}
