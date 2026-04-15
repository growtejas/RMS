import { count, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  departments,
  employees,
  locations,
  roles,
  skills,
  userRoles,
  users,
} from "@/lib/db/schema";

export async function getAdminOverviewRow(): Promise<{
  total_users: number;
  total_employees: number;
  total_skills: number;
  total_locations: number;
  total_departments: number;
  roles_breakdown: Record<string, number>;
}> {
  const db = getDb();

  const [[{ c: totalUsers }], [{ c: totalEmployees }], [{ c: totalSkills }], [{ c: totalLocations }], [{ c: totalDepartments }]] =
    await Promise.all([
      db.select({ c: count() }).from(users),
      db.select({ c: count() }).from(employees),
      db.select({ c: count() }).from(skills),
      db.select({ c: count() }).from(locations),
      db.select({ c: count() }).from(departments),
    ]);

  const roleRows = await db
    .select({
      roleName: roles.roleName,
      c: count(userRoles.userId),
    })
    .from(roles)
    .leftJoin(userRoles, eq(roles.roleId, userRoles.roleId))
    .groupBy(roles.roleName);

  const roles_breakdown: Record<string, number> = {};
  for (const row of roleRows) {
    if (row.roleName) {
      roles_breakdown[row.roleName] = Number(row.c ?? 0);
    }
  }

  return {
    total_users: Number(totalUsers ?? 0),
    total_employees: Number(totalEmployees ?? 0),
    total_skills: Number(totalSkills ?? 0),
    total_locations: Number(totalLocations ?? 0),
    total_departments: Number(totalDepartments ?? 0),
    roles_breakdown,
  };
}
