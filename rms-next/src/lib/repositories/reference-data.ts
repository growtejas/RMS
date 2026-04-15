import { and, asc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  auditLog,
  companyRoles,
  departments,
  locations,
  skills,
} from "@/lib/db/schema";
import { findUsernamesByIds } from "@/lib/repositories/auth-user";

export type SkillApiRow = {
  skill_id: number;
  skill_name: string;
  created_by: string | null;
  created_at: string | null;
};

export type DepartmentApiRow = {
  department_id: number;
  department_name: string;
  created_by: string | null;
  created_at: string | null;
};

export type LocationApiRow = {
  location_id: number;
  city: string | null;
  country: string | null;
  created_by: string | null;
  created_at: string | null;
};

export type CompanyRoleApiRow = {
  role_id: number;
  role_name: string;
  role_description: string | null;
  is_active: boolean;
  created_at: string | null;
};

function iso(d: Date | null | undefined): string | null {
  if (!d || Number.isNaN(d.getTime())) {
    return null;
  }
  return d.toISOString();
}

async function mapAuditCreators(
  entityName: string,
): Promise<Map<string, { performedBy: number | null; performedAt: Date | null }>> {
  const db = getDb();
  const rows = await db
    .select({
      entityId: auditLog.entityId,
      performedBy: auditLog.performedBy,
      performedAt: auditLog.performedAt,
    })
    .from(auditLog)
    .where(
      and(eq(auditLog.entityName, entityName), eq(auditLog.action, "CREATE")),
    );

  const map = new Map<
    string,
    { performedBy: number | null; performedAt: Date | null }
  >();
  for (const row of rows) {
    if (row.entityId != null) {
      map.set(row.entityId, {
        performedBy: row.performedBy,
        performedAt: row.performedAt ?? null,
      });
    }
  }
  return map;
}

export async function listSkillsWithMeta(): Promise<SkillApiRow[]> {
  const db = getDb();
  const skillRows = await db
    .select()
    .from(skills)
    .orderBy(asc(skills.skillName));

  const auditByEntity = await mapAuditCreators("skill");
  const userIds = Array.from(
    new Set(
      Array.from(auditByEntity.values())
        .map((a) => a.performedBy)
        .filter((id): id is number => id != null && Number.isFinite(id)),
    ),
  );
  const usersById = await findUsernamesByIds(userIds);

  return skillRows.map((skill) => {
    const audit = auditByEntity.get(String(skill.skillId));
    const createdBy =
      audit?.performedBy != null
        ? usersById.get(audit.performedBy) ?? null
        : null;
    return {
      skill_id: skill.skillId,
      skill_name: skill.skillName,
      created_by: createdBy,
      created_at: iso(audit?.performedAt ?? null),
    };
  });
}

export async function listDepartmentsWithMeta(): Promise<DepartmentApiRow[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(departments)
    .orderBy(asc(departments.departmentName));

  const auditByEntity = await mapAuditCreators("department");
  const userIds = Array.from(
    new Set(
      Array.from(auditByEntity.values())
        .map((a) => a.performedBy)
        .filter((id): id is number => id != null && Number.isFinite(id)),
    ),
  );
  const usersById = await findUsernamesByIds(userIds);

  return rows.map((dept) => {
    const audit = auditByEntity.get(String(dept.departmentId));
    const createdBy =
      audit?.performedBy != null
        ? usersById.get(audit.performedBy) ?? null
        : null;
    return {
      department_id: dept.departmentId,
      department_name: dept.departmentName,
      created_by: createdBy,
      created_at: iso(audit?.performedAt ?? null),
    };
  });
}

export async function listLocationsWithMeta(): Promise<LocationApiRow[]> {
  const db = getDb();
  const rows = await db.select().from(locations);

  const auditByEntity = await mapAuditCreators("location");
  const userIds = Array.from(
    new Set(
      Array.from(auditByEntity.values())
        .map((a) => a.performedBy)
        .filter((id): id is number => id != null && Number.isFinite(id)),
    ),
  );
  const usersById = await findUsernamesByIds(userIds);

  return rows.map((loc) => {
    const audit = auditByEntity.get(String(loc.locationId));
    const createdBy =
      audit?.performedBy != null
        ? usersById.get(audit.performedBy) ?? null
        : null;
    return {
      location_id: loc.locationId,
      city: loc.city,
      country: loc.country,
      created_by: createdBy,
      created_at: iso(audit?.performedAt ?? null),
    };
  });
}

export async function listCompanyRolesFiltered(
  includeInactive: boolean,
): Promise<CompanyRoleApiRow[]> {
  const db = getDb();
  const rows = includeInactive
    ? await db.select().from(companyRoles).orderBy(asc(companyRoles.roleName))
    : await db
        .select()
        .from(companyRoles)
        .where(eq(companyRoles.isActive, true))
        .orderBy(asc(companyRoles.roleName));

  return rows.map((r) => ({
    role_id: r.roleId,
    role_name: r.roleName,
    role_description: r.roleDescription,
    is_active: r.isActive,
    created_at: iso(r.createdAt ?? null),
  }));
}
