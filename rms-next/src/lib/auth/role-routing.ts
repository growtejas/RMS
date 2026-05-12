export type AppRole = "owner" | "admin" | "hr" | "ta" | "manager" | "interviewer";

const ROLE_PRIORITY: AppRole[] = ["owner", "admin", "hr", "ta", "manager", "interviewer"];

export function normalizeRoles(roles: string[] | null | undefined): string[] {
  return Array.isArray(roles) ? roles.map((r) => r.toLowerCase()) : [];
}

export function getDefaultRole(roles: string[] | null | undefined): AppRole | null {
  const normalized = normalizeRoles(roles);
  for (const role of ROLE_PRIORITY) {
    if (normalized.includes(role)) return role;
  }
  return null;
}

export function getRoleHomePath(role: string | null | undefined): string {
  const normalized = (role ?? "").toLowerCase();
  if (normalized === "owner") return "/owner";
  if (normalized === "admin") return "/admin";
  if (normalized === "hr") return "/hr";
  if (normalized === "ta") return "/ta";
  if (normalized === "manager") return "/manager";
  if (normalized === "interviewer") return "/interviewer/dashboard";
  return "/dashboard";
}

export function resolveActiveRole(
  roles: string[] | null | undefined,
  preferredRole: string | null | undefined,
): AppRole | null {
  const normalizedRoles = normalizeRoles(roles);
  const preferred = (preferredRole ?? "").toLowerCase();
  if (preferred && normalizedRoles.includes(preferred)) {
    return preferred as AppRole;
  }
  return getDefaultRole(normalizedRoles);
}
