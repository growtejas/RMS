import { and, eq, ne } from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  auditLog,
  companyRoles,
  departments,
  locations,
  skills,
} from "@/lib/db/schema";

export async function findSkillByNormalizedName(normalized: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(skills)
    .where(eq(skills.normalizedName, normalized))
    .limit(1);
  return rows[0] ?? null;
}

export async function findSkillById(skillId: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(skills)
    .where(eq(skills.skillId, skillId))
    .limit(1);
  return rows[0] ?? null;
}

export async function createSkillWithAudit(
  userId: number,
  skillName: string,
  normalizedName: string,
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(skills)
      .values({
        skillName,
        normalizedName,
        isVerified: false,
        createdBy: userId,
      })
      .returning({
        skillId: skills.skillId,
        skillName: skills.skillName,
      });
    const row = inserted[0];
    if (!row) {
      throw new Error("Skill insert failed");
    }
    await tx.insert(auditLog).values({
      entityName: "skill",
      entityId: String(row.skillId),
      action: "CREATE",
      performedBy: userId,
    });
    return row;
  });
}

/** `instant-add` path: new row only, no audit row (matches FastAPI). */
export async function createSkillPlain(
  userId: number,
  skillName: string,
  normalizedName: string,
) {
  const db = getDb();
  const inserted = await db
    .insert(skills)
    .values({
      skillName,
      normalizedName,
      isVerified: false,
      createdBy: userId,
    })
    .returning({
      skillId: skills.skillId,
      skillName: skills.skillName,
    });
  const row = inserted[0];
  if (!row) {
    throw new Error("Skill insert failed");
  }
  return row;
}

export async function updateSkillWithAudit(
  userId: number,
  skillId: number,
  skillName: string,
  normalizedName: string,
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx
      .update(skills)
      .set({ skillName, normalizedName })
      .where(eq(skills.skillId, skillId));
    const updated = await tx
      .select({
        skillId: skills.skillId,
        skillName: skills.skillName,
      })
      .from(skills)
      .where(eq(skills.skillId, skillId))
      .limit(1);
    const row = updated[0];
    if (!row) {
      throw new Error("Skill update failed");
    }
    await tx.insert(auditLog).values({
      entityName: "skill",
      entityId: String(skillId),
      action: "UPDATE",
      performedBy: userId,
    });
    return row;
  });
}

export async function deleteSkillWithAudit(userId: number, skillId: number) {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(skills).where(eq(skills.skillId, skillId));
    await tx.insert(auditLog).values({
      entityName: "skill",
      entityId: String(skillId),
      action: "DELETE",
      performedBy: userId,
    });
  });
}

export async function findDepartmentByName(name: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(departments)
    .where(eq(departments.departmentName, name))
    .limit(1);
  return rows[0] ?? null;
}

export async function findDepartmentById(departmentId: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(departments)
    .where(eq(departments.departmentId, departmentId))
    .limit(1);
  return rows[0] ?? null;
}

export async function createDepartmentWithAudit(
  userId: number,
  departmentName: string,
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(departments)
      .values({ departmentName })
      .returning({
        departmentId: departments.departmentId,
        departmentName: departments.departmentName,
      });
    const row = inserted[0];
    if (!row) {
      throw new Error("Department insert failed");
    }
    await tx.insert(auditLog).values({
      entityName: "department",
      entityId: String(row.departmentId),
      action: "CREATE",
      performedBy: userId,
    });
    return row;
  });
}

export async function updateDepartmentWithAudit(
  userId: number,
  departmentId: number,
  departmentName: string,
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx
      .update(departments)
      .set({ departmentName })
      .where(eq(departments.departmentId, departmentId));
    const updated = await tx
      .select({
        departmentId: departments.departmentId,
        departmentName: departments.departmentName,
      })
      .from(departments)
      .where(eq(departments.departmentId, departmentId))
      .limit(1);
    const row = updated[0];
    if (!row) {
      throw new Error("Department update failed");
    }
    await tx.insert(auditLog).values({
      entityName: "department",
      entityId: String(departmentId),
      action: "UPDATE",
      performedBy: userId,
    });
    return row;
  });
}

export async function deleteDepartmentWithAudit(
  userId: number,
  departmentId: number,
) {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(departments).where(eq(departments.departmentId, departmentId));
    await tx.insert(auditLog).values({
      entityName: "department",
      entityId: String(departmentId),
      action: "DELETE",
      performedBy: userId,
    });
  });
}

export async function findLocationById(locationId: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(locations)
    .where(eq(locations.locationId, locationId))
    .limit(1);
  return rows[0] ?? null;
}

export async function createLocationWithAudit(
  userId: number,
  city: string | null,
  country: string | null,
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(locations)
      .values({ city, country })
      .returning({
        locationId: locations.locationId,
        city: locations.city,
        country: locations.country,
      });
    const row = inserted[0];
    if (!row) {
      throw new Error("Location insert failed");
    }
    await tx.insert(auditLog).values({
      entityName: "location",
      entityId: String(row.locationId),
      action: "CREATE",
      performedBy: userId,
    });
    return row;
  });
}

export async function updateLocationWithAudit(
  userId: number,
  locationId: number,
  patch: { city?: string | null; country?: string | null },
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const set: { city?: string | null; country?: string | null } = {};
    if (patch.city !== undefined) {
      set.city = patch.city;
    }
    if (patch.country !== undefined) {
      set.country = patch.country;
    }
    if (Object.keys(set).length > 0) {
      await tx.update(locations).set(set).where(eq(locations.locationId, locationId));
    }
    const updated = await tx
      .select({
        locationId: locations.locationId,
        city: locations.city,
        country: locations.country,
      })
      .from(locations)
      .where(eq(locations.locationId, locationId))
      .limit(1);
    const row = updated[0];
    if (!row) {
      throw new Error("Location update failed");
    }
    await tx.insert(auditLog).values({
      entityName: "location",
      entityId: String(locationId),
      action: "UPDATE",
      performedBy: userId,
    });
    return row;
  });
}

export async function deleteLocationWithAudit(userId: number, locationId: number) {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(locations).where(eq(locations.locationId, locationId));
    await tx.insert(auditLog).values({
      entityName: "location",
      entityId: String(locationId),
      action: "DELETE",
      performedBy: userId,
    });
  });
}

export async function findCompanyRoleByName(roleName: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(companyRoles)
    .where(eq(companyRoles.roleName, roleName))
    .limit(1);
  return rows[0] ?? null;
}

export async function findCompanyRoleById(roleId: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(companyRoles)
    .where(eq(companyRoles.roleId, roleId))
    .limit(1);
  return rows[0] ?? null;
}

export async function createCompanyRole(
  roleName: string,
  roleDescription: string | null,
) {
  const db = getDb();
  const inserted = await db
    .insert(companyRoles)
    .values({
      roleName,
      roleDescription,
      isActive: true,
    })
    .returning();
  const row = inserted[0];
  if (!row) {
    throw new Error("Company role insert failed");
  }
  return row;
}

export async function updateCompanyRole(
  roleId: number,
  patch: {
    roleName?: string;
    roleDescription?: string | null;
    isActive?: boolean;
  },
) {
  const db = getDb();
  const set: {
    roleName?: string;
    roleDescription?: string | null;
    isActive?: boolean;
  } = {};
  if (patch.roleName !== undefined) {
    set.roleName = patch.roleName;
  }
  if (patch.roleDescription !== undefined) {
    set.roleDescription = patch.roleDescription;
  }
  if (patch.isActive !== undefined) {
    set.isActive = patch.isActive;
  }
  if (Object.keys(set).length > 0) {
    await db.update(companyRoles).set(set).where(eq(companyRoles.roleId, roleId));
  }
  const rows = await db
    .select()
    .from(companyRoles)
    .where(eq(companyRoles.roleId, roleId))
    .limit(1);
  return rows[0] ?? null;
}

export async function findOtherCompanyRoleWithName(roleId: number, roleName: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(companyRoles)
    .where(
      and(eq(companyRoles.roleName, roleName), ne(companyRoles.roleId, roleId)),
    )
    .limit(1);
  return rows[0] ?? null;
}
