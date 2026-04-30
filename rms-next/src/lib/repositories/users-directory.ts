import { sql } from "drizzle-orm";

import { normalizeRoleList } from "@/lib/auth/normalize-roles";
import { getDb } from "@/lib/db";
import { roles } from "@/lib/db/schema";

const DEFAULT_ASSIGNABLE_ROLES = [
  "Admin",
  "Owner",
  "HR",
  "Manager",
  "TA",
  "Employee",
  "Interviewer",
] as const;

export type UserListRow = {
  user_id: number;
  username: string;
  emp_id: string | null;
  is_active: boolean | null;
  roles: string[];
};

export type AdminUserListRow = {
  user_id: number;
  username: string;
  emp_id: string | null;
  employee: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
  is_active: boolean | null;
  roles: string[];
};

function toBool(v: unknown): boolean | null {
  if (v === null || v === undefined) {
    return null;
  }
  if (typeof v === "boolean") {
    return v;
  }
  if (v === "t" || v === "true" || v === 1) {
    return true;
  }
  if (v === "f" || v === "false" || v === 0) {
    return false;
  }
  return Boolean(v);
}

export async function listUsersDirectory(): Promise<UserListRow[]> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT
      u.user_id,
      u.username,
      u.is_active,
      COALESCE(u.employee_id, uem.emp_id) AS emp_id,
      COALESCE(
        array_agg(r.role_name) FILTER (WHERE r.role_name IS NOT NULL),
        ARRAY[]::varchar[]
      ) AS roles
    FROM users u
    LEFT JOIN user_employee_map uem ON u.user_id = uem.user_id
    LEFT JOIN user_roles ur ON ur.user_id = u.user_id
    LEFT JOIN roles r ON r.role_id = ur.role_id
    GROUP BY u.user_id, uem.emp_id, u.employee_id
    ORDER BY u.username
  `);

  return Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
    user_id: Number(row.user_id),
    username: String(row.username),
    emp_id: row.emp_id != null ? String(row.emp_id) : null,
    is_active: toBool(row.is_active),
    roles: normalizeRoleList((row.roles as string[]) ?? []),
  }));
}

export async function adminListUsers(
  search: string | null,
): Promise<AdminUserListRow[]> {
  const db = getDb();
  const q = search?.trim() ?? "";
  const pattern = q ? `%${q}%` : null;

  const rows = pattern
    ? await db.execute(sql`
        SELECT
          u.user_id,
          u.username,
          u.is_active,
          COALESCE(u.employee_id, uem.emp_id) AS employee_id,
          e.full_name AS employee_name,
          e.rbm_email AS employee_email,
          COALESCE(
            array_agg(r.role_name) FILTER (WHERE r.role_name IS NOT NULL),
            ARRAY[]::varchar[]
          ) AS roles
        FROM users u
        LEFT JOIN user_employee_map uem ON u.user_id = uem.user_id
        LEFT JOIN employees e ON e.emp_id = u.employee_id
        LEFT JOIN user_roles ur ON ur.user_id = u.user_id
        LEFT JOIN roles r ON r.role_id = ur.role_id
        WHERE (
          u.username ILIKE ${pattern}
          OR e.emp_id ILIKE ${pattern}
          OR e.rbm_email ILIKE ${pattern}
          OR r.role_name ILIKE ${pattern}
        )
        GROUP BY u.user_id, uem.emp_id, u.employee_id, e.full_name, e.rbm_email, e.emp_id
        ORDER BY u.username
      `)
    : await db.execute(sql`
        SELECT
          u.user_id,
          u.username,
          u.is_active,
          COALESCE(u.employee_id, uem.emp_id) AS employee_id,
          e.full_name AS employee_name,
          e.rbm_email AS employee_email,
          COALESCE(
            array_agg(r.role_name) FILTER (WHERE r.role_name IS NOT NULL),
            ARRAY[]::varchar[]
          ) AS roles
        FROM users u
        LEFT JOIN user_employee_map uem ON u.user_id = uem.user_id
        LEFT JOIN employees e ON e.emp_id = u.employee_id
        LEFT JOIN user_roles ur ON ur.user_id = u.user_id
        LEFT JOIN roles r ON r.role_id = ur.role_id
        GROUP BY u.user_id, uem.emp_id, u.employee_id, e.full_name, e.rbm_email, e.emp_id
        ORDER BY u.username
      `);

  return Array.from(rows as Iterable<Record<string, unknown>>).map((row) => {
    const empId = row.employee_id != null ? String(row.employee_id) : null;
    return {
      user_id: Number(row.user_id),
      username: String(row.username),
      emp_id: empId,
      employee: empId
        ? {
            id: empId,
            name: row.employee_name != null ? String(row.employee_name) : null,
            email: row.employee_email != null ? String(row.employee_email) : null,
          }
        : null,
      is_active: toBool(row.is_active),
      roles: normalizeRoleList((row.roles as string[]) ?? []),
    };
  });
}

export async function ensureAssignableRoles(): Promise<string[]> {
  const db = getDb();
  await db.transaction(async (tx) => {
    for (const name of DEFAULT_ASSIGNABLE_ROLES) {
      const existing = await tx
        .select({ roleId: roles.roleId })
        .from(roles)
        .where(sql`lower(${roles.roleName}) = ${name.toLowerCase()}`)
        .limit(1);
      if (existing.length === 0) {
        await tx.insert(roles).values({ roleName: name });
      }
    }
  });

  const all = await db.select({ roleName: roles.roleName }).from(roles);
  const names = normalizeRoleList(
    all.map((r) => String(r.roleName)).filter(Boolean),
  );
  return [...names].sort((a, b) => a.localeCompare(b));
}
