import { eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  employees,
  roles,
  userEmployeeMap,
  userRoles,
  users,
} from "@/lib/db/schema";

export type AuditListFilters = {
  entityName?: string | null;
  entityId?: string | null;
  search?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  userId?: string | null;
  action?: string | null;
  page?: string | number | null;
  pageSize?: string | number | null;
};

function buildAuditFilterFragments(filters: AuditListFilters) {
  const conds = [
    sql`a.action NOT IN ('OVERVIEW_VIEW', 'USER_VIEW')`,
    sql`(length(a.action) < 5 OR right(a.action, 5) <> '_VIEW')`,
  ];

  if (filters.entityName?.trim()) {
    conds.push(sql`a.entity_name = ${filters.entityName.trim()}`);
  }
  if (filters.entityId?.trim()) {
    conds.push(sql`a.entity_id = ${filters.entityId.trim()}`);
  }
  if (filters.action?.trim()) {
    conds.push(sql`a.action = ${filters.action.trim()}`);
  }
  if (filters.dateFrom?.trim()) {
    const start = new Date(filters.dateFrom.trim());
    conds.push(sql`a.performed_at >= ${start}`);
  }
  if (filters.dateTo?.trim()) {
    const end = new Date(filters.dateTo.trim());
    end.setHours(23, 59, 59, 999);
    conds.push(sql`a.performed_at <= ${end}`);
  }
  if (filters.userId?.trim()) {
    if (filters.userId.trim().toLowerCase() === "system") {
      conds.push(sql`a.performed_by IS NULL`);
    } else {
      const uid = Number.parseInt(filters.userId.trim(), 10);
      if (Number.isFinite(uid)) {
        conds.push(sql`a.performed_by = ${uid}`);
      }
    }
  }

  const pattern = filters.search?.trim() ? `%${filters.search.trim()}%` : null;
  if (pattern) {
    conds.push(sql`(
      au.username ILIKE ${pattern}
      OR tu.username ILIKE ${pattern}
      OR ae.full_name ILIKE ${pattern}
      OR te.full_name ILIKE ${pattern}
      OR a.action ILIKE ${pattern}
    )`);
  }

  return sql.join(conds, sql` AND `);
}

async function loadRolesByUserIds(
  userIds: number[],
): Promise<Map<number, string[]>> {
  if (userIds.length === 0) {
    return new Map();
  }
  const db = getDb();
  const rows = await db
    .select({ userId: userRoles.userId, roleName: roles.roleName })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.roleId))
    .where(inArray(userRoles.userId, userIds));
  const m = new Map<number, string[]>();
  for (const r of rows) {
    const arr = m.get(r.userId) ?? [];
    arr.push(String(r.roleName));
    m.set(r.userId, arr);
  }
  return m;
}

async function resolveFullNames(
  userIds: number[],
): Promise<Map<number, string | null>> {
  const out = new Map<number, string | null>();
  if (userIds.length === 0) {
    return out;
  }
  const db = getDb();
  const urows = await db
    .select({
      userId: users.userId,
      employeeId: users.employeeId,
    })
    .from(users)
    .where(inArray(users.userId, userIds));

  const maps = await db
    .select()
    .from(userEmployeeMap)
    .where(inArray(userEmployeeMap.userId, userIds));

  const empByUser = new Map<number, string>();
  for (const m of maps) {
    empByUser.set(m.userId, m.empId);
  }

  const empIdSet = new Set<string>();
  for (const u of urows) {
    const eid = u.employeeId ?? empByUser.get(u.userId);
    if (eid) {
      empIdSet.add(eid);
    }
  }
  const empIds = Array.from(empIdSet);
  const emps =
    empIds.length > 0
      ? await db
          .select({
            empId: employees.empId,
            fullName: employees.fullName,
          })
          .from(employees)
          .where(inArray(employees.empId, empIds))
      : [];
  const nameByEmp = new Map(emps.map((e) => [e.empId, e.fullName]));

  for (const u of urows) {
    const eid = u.employeeId ?? empByUser.get(u.userId) ?? null;
    out.set(
      u.userId,
      eid ? nameByEmp.get(eid) ?? null : null,
    );
  }
  return out;
}

export async function listAuditLogsForApi(filters: AuditListFilters) {
  const db = getDb();
  const whereSql = buildAuditFilterFragments(filters);
  const pageRaw = filters.page != null ? Number.parseInt(String(filters.page), 10) : 1;
  const pageSizeRaw =
    filters.pageSize != null ? Number.parseInt(String(filters.pageSize), 10) : 50;
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const pageSize = Math.min(Math.max(Number.isFinite(pageSizeRaw) ? pageSizeRaw : 50, 1), 200);
  const offset = (page - 1) * pageSize;

  const rows = await db.execute(sql`
    SELECT
      a.audit_id,
      a.entity_name,
      a.entity_id,
      a.action,
      a.performed_by,
      a.target_user_id,
      a.old_value,
      a.new_value,
      a.performed_at,
      au.username AS performed_by_username,
      tu.username AS target_user_username
    FROM audit_log a
    LEFT JOIN users au ON au.user_id = a.performed_by
    LEFT JOIN users tu ON tu.user_id = a.target_user_id
    LEFT JOIN user_employee_map aum ON aum.user_id = au.user_id
    LEFT JOIN user_employee_map tum ON tum.user_id = tu.user_id
    LEFT JOIN employees ae ON ae.emp_id = COALESCE(au.employee_id, aum.emp_id)
    LEFT JOIN employees te ON te.emp_id = COALESCE(tu.employee_id, tum.emp_id)
    WHERE ${whereSql}
    ORDER BY a.performed_at DESC NULLS LAST
    LIMIT ${pageSize} OFFSET ${offset}
  `);

  const list = Array.from(rows as Iterable<Record<string, unknown>>);
  const userIds = new Set<number>();
  for (const row of list) {
    if (row.performed_by != null) {
      userIds.add(Number(row.performed_by));
    }
    if (row.target_user_id != null) {
      userIds.add(Number(row.target_user_id));
    }
  }
  const ids = Array.from(userIds);
  const [rolesByUser, namesByUser] = await Promise.all([
    loadRolesByUserIds(ids),
    resolveFullNames(ids),
  ]);

  return list.map((row) => {
    const pb = row.performed_by != null ? Number(row.performed_by) : null;
    const tu = row.target_user_id != null ? Number(row.target_user_id) : null;
    return {
      audit_id: Number(row.audit_id),
      entity_name: String(row.entity_name),
      entity_id: row.entity_id != null ? String(row.entity_id) : null,
      action: String(row.action),
      performed_by: pb,
      performed_by_username:
        row.performed_by_username != null
          ? String(row.performed_by_username)
          : null,
      performed_by_full_name: pb != null ? namesByUser.get(pb) ?? null : null,
      performed_by_roles: pb != null ? rolesByUser.get(pb) ?? [] : [],
      target_user_id: tu,
      target_user_username:
        row.target_user_username != null
          ? String(row.target_user_username)
          : null,
      target_user_full_name: tu != null ? namesByUser.get(tu) ?? null : null,
      old_value: row.old_value != null ? String(row.old_value) : null,
      new_value: row.new_value != null ? String(row.new_value) : null,
      performed_at:
        row.performed_at != null
          ? new Date(String(row.performed_at)).toISOString()
          : "",
    };
  });
}

export async function listAuditLogsForExport(params: {
  dateFrom: string;
  dateTo: string;
  limit: number;
}) {
  const db = getDb();
  const whereSql = buildAuditFilterFragments({
    entityName: null,
    entityId: null,
    search: null,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    userId: null,
    action: null,
  });
  const limit = Math.min(Math.max(params.limit, 1), 5000);

  const rows = await db.execute(sql`
    SELECT
      a.audit_id,
      a.entity_name,
      a.entity_id,
      a.action,
      a.performed_by,
      a.target_user_id,
      a.old_value,
      a.new_value,
      a.performed_at,
      au.username AS performed_by_username,
      tu.username AS target_user_username
    FROM audit_log a
    LEFT JOIN users au ON au.user_id = a.performed_by
    LEFT JOIN users tu ON tu.user_id = a.target_user_id
    LEFT JOIN user_employee_map aum ON aum.user_id = au.user_id
    LEFT JOIN user_employee_map tum ON tum.user_id = tu.user_id
    LEFT JOIN employees ae ON ae.emp_id = COALESCE(au.employee_id, aum.emp_id)
    LEFT JOIN employees te ON te.emp_id = COALESCE(tu.employee_id, tum.emp_id)
    WHERE ${whereSql}
    ORDER BY a.performed_at DESC NULLS LAST
    LIMIT ${limit}
  `);

  const list = Array.from(rows as Iterable<Record<string, unknown>>);
  const userIds = new Set<number>();
  for (const row of list) {
    if (row.performed_by != null) {
      userIds.add(Number(row.performed_by));
    }
    if (row.target_user_id != null) {
      userIds.add(Number(row.target_user_id));
    }
  }
  const ids = Array.from(userIds);
  const [rolesByUser, namesByUser] = await Promise.all([
    loadRolesByUserIds(ids),
    resolveFullNames(ids),
  ]);

  return list.map((row) => {
    const pb = row.performed_by != null ? Number(row.performed_by) : null;
    const tu = row.target_user_id != null ? Number(row.target_user_id) : null;
    return {
      audit_id: Number(row.audit_id),
      entity_name: String(row.entity_name),
      entity_id: row.entity_id != null ? String(row.entity_id) : null,
      action: String(row.action),
      performed_by: pb,
      performed_by_username:
        row.performed_by_username != null
          ? String(row.performed_by_username)
          : null,
      performed_by_full_name: pb != null ? namesByUser.get(pb) ?? null : null,
      performed_by_roles: pb != null ? rolesByUser.get(pb) ?? [] : [],
      target_user_id: tu,
      target_user_username:
        row.target_user_username != null
          ? String(row.target_user_username)
          : null,
      target_user_full_name: tu != null ? namesByUser.get(tu) ?? null : null,
      old_value: row.old_value != null ? String(row.old_value) : null,
      new_value: row.new_value != null ? String(row.new_value) : null,
      performed_at:
        row.performed_at != null
          ? new Date(String(row.performed_at)).toISOString()
          : "",
    };
  });
}

export async function summarizeAuditLogs(filters: AuditListFilters) {
  const db = getDb();
  const whereSql = buildAuditFilterFragments(filters);

  const rows = await db.execute(sql`
    WITH base AS (
      SELECT a.audit_id, a.performed_by, a.action
      FROM audit_log a
      LEFT JOIN users au ON au.user_id = a.performed_by
      LEFT JOIN users tu ON tu.user_id = a.target_user_id
      LEFT JOIN user_employee_map aum ON aum.user_id = au.user_id
      LEFT JOIN user_employee_map tum ON tum.user_id = tu.user_id
      LEFT JOIN employees ae ON ae.emp_id = COALESCE(au.employee_id, aum.emp_id)
      LEFT JOIN employees te ON te.emp_id = COALESCE(tu.employee_id, tum.emp_id)
      WHERE ${whereSql}
    )
    SELECT
      (SELECT count(*)::int FROM base) AS total_logs,
      (SELECT count(DISTINCT performed_by)::int FROM base WHERE performed_by IS NOT NULL) AS active_users,
      (SELECT count(*)::int FROM base WHERE        action ILIKE '%error%' OR action ILIKE '%warning%' OR action ILIKE '%failed%') AS warnings_errors,
      (SELECT count(*)::int FROM base WHERE action = 'LOGIN_FAILED') AS failed_logins
  `);

  const row = Array.from(rows as Iterable<Record<string, unknown>>)[0];
  return {
    total_logs: Number(row?.total_logs ?? 0),
    warnings_errors: Number(row?.warnings_errors ?? 0),
    active_users: Number(row?.active_users ?? 0),
    failed_logins: Number(row?.failed_logins ?? 0),
  };
}
