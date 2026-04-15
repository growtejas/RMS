import { and, eq, ne, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  auditLog,
  employees,
  roles,
  userEmployeeMap,
  userRoles,
  users,
} from "@/lib/db/schema";

export async function findRoleByNameCaseInsensitive(roleName: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(roles)
    .where(sql`lower(${roles.roleName}) = ${roleName.toLowerCase()}`)
    .limit(1);
  return rows[0] ?? null;
}

export async function findEmployeeByEmpId(empId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(employees)
    .where(eq(employees.empId, empId))
    .limit(1);
  return rows[0] ?? null;
}

export async function findOtherUserWithEmployeeId(
  employeeId: string,
  excludeUserId: number,
) {
  const db = getDb();
  const rows = await db
    .select()
    .from(users)
    .where(
      and(eq(users.employeeId, employeeId), ne(users.userId, excludeUserId)),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function insertUserAudit(params: {
  action: string;
  actorUserId: number;
  targetUserId: number | null;
  oldValue: unknown | null;
  newValue: unknown | null;
}) {
  const db = getDb();
  await db.insert(auditLog).values({
    entityName: "user",
    entityId:
      params.targetUserId != null ? String(params.targetUserId) : null,
    action: params.action,
    performedBy: params.actorUserId,
    targetUserId: params.targetUserId,
    oldValue:
      params.oldValue != null ? JSON.stringify(params.oldValue) : null,
    newValue:
      params.newValue != null ? JSON.stringify(params.newValue) : null,
  });
}

export async function createUserRow(username: string, passwordHash: string) {
  const db = getDb();
  const inserted = await db
    .insert(users)
    .values({
      username,
      passwordHash,
      isActive: true,
    })
    .returning({ userId: users.userId });
  const row = inserted[0];
  if (!row) {
    throw new Error("User insert failed");
  }
  return row.userId;
}

export async function addUserRole(userId: number, roleId: number) {
  const db = getDb();
  await db.insert(userRoles).values({ userId, roleId });
}

export async function hasUserRole(userId: number, roleId: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(userRoles)
    .where(
      and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)),
    )
    .limit(1);
  return rows.length > 0;
}

export async function replaceUserRoles(userId: number, roleIds: number[]) {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(userRoles).where(eq(userRoles.userId, userId));
    for (const roleId of roleIds) {
      await tx.insert(userRoles).values({ userId, roleId });
    }
  });
}

export async function findUserEmployeeMapByUserId(userId: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(userEmployeeMap)
    .where(eq(userEmployeeMap.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function findUserEmployeeMapByEmpId(empId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(userEmployeeMap)
    .where(eq(userEmployeeMap.empId, empId))
    .limit(1);
  return rows[0] ?? null;
}

export async function insertUserEmployeeMap(userId: number, empId: string) {
  const db = getDb();
  await db.insert(userEmployeeMap).values({ userId, empId });
}

export async function insertAuditLogRow(params: {
  entityName: string;
  entityId: string | null;
  action: string;
  performedBy: number | null;
  targetUserId: number | null;
  oldValue: string | null;
  newValue: string | null;
}) {
  const db = getDb();
  const inserted = await db
    .insert(auditLog)
    .values({
      entityName: params.entityName,
      entityId: params.entityId,
      action: params.action,
      performedBy: params.performedBy,
      targetUserId: params.targetUserId,
      oldValue: params.oldValue,
      newValue: params.newValue,
    })
    .returning({ auditId: auditLog.auditId });
  return inserted[0]?.auditId;
}
