import { eq, inArray } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { roles, userRoles, users, type UserRow } from "@/lib/db/schema";

export async function findUserByUsername(
  username: string,
): Promise<UserRow | null> {
  const db = getDb();
  const rows = await db
    .select({
      userId: users.userId,
      username: users.username,
      passwordHash: users.passwordHash,
      isActive: users.isActive,
      createdAt: users.createdAt,
      lastLogin: users.lastLogin,
      employeeId: users.employeeId,
    })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  return rows[0] ?? null;
}

export async function findUserById(userId: number): Promise<UserRow | null> {
  const db = getDb();
  const rows = await db
    .select({
      userId: users.userId,
      username: users.username,
      passwordHash: users.passwordHash,
      isActive: users.isActive,
      createdAt: users.createdAt,
      lastLogin: users.lastLogin,
      employeeId: users.employeeId,
    })
    .from(users)
    .where(eq(users.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function listRoleNamesForUser(userId: number): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ roleName: roles.roleName })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.roleId))
    .where(eq(userRoles.userId, userId));
  return rows.map((r) => r.roleName);
}

export async function findUserWithRolesById(
  userId: number,
): Promise<{ user: Pick<UserRow, "userId" | "username" | "isActive">; roles: string[] } | null> {
  const db = getDb();
  const rows = await db
    .select({
      userId: users.userId,
      username: users.username,
      isActive: users.isActive,
      roleName: roles.roleName,
    })
    .from(users)
    .leftJoin(userRoles, eq(users.userId, userRoles.userId))
    .leftJoin(roles, eq(userRoles.roleId, roles.roleId))
    .where(eq(users.userId, userId));

  const first = rows[0];
  if (!first) {
    return null;
  }
  const roleList: string[] = [];
  for (const r of rows) {
    if (r.roleName) {
      roleList.push(r.roleName);
    }
  }
  return {
    user: { userId: first.userId, username: first.username, isActive: first.isActive },
    roles: roleList,
  };
}

export async function touchUserLastLogin(userId: number): Promise<void> {
  const db = getDb();
  await db
    .update(users)
    .set({ lastLogin: new Date() })
    .where(eq(users.userId, userId));
}

export async function findUsernamesByIds(
  userIds: number[],
): Promise<Map<number, string>> {
  const unique = Array.from(new Set(userIds)).filter((id) =>
    Number.isFinite(id),
  );
  if (unique.length === 0) {
    return new Map();
  }
  const db = getDb();
  const rows = await db
    .select({ userId: users.userId, username: users.username })
    .from(users)
    .where(inArray(users.userId, unique));
  return new Map(rows.map((r) => [r.userId, r.username]));
}
