import { HttpError } from "@/lib/http/http-error";
import { findUsernamesByIds } from "@/lib/repositories/auth-user";
import * as repo from "@/lib/repositories/reference-mutations";

function companyRoleCreatedAt(d: Date | null | undefined): string {
  if (d instanceof Date && !Number.isNaN(d.getTime())) {
    return d.toISOString();
  }
  return new Date().toISOString();
}

export async function createSkill(
  userId: number,
  username: string,
  rawName: string,
) {
  const name = rawName.trim();
  if (!name) {
    throw new HttpError(400, "Skill name is required");
  }
  const normalized = name.toLowerCase();
  const dup = await repo.findSkillByNormalizedName(normalized);
  if (dup) {
    throw new HttpError(400, "Skill already exists");
  }
  const row = await repo.createSkillWithAudit(userId, name, normalized);
  return {
    skill_id: row.skillId,
    skill_name: row.skillName,
    created_by: username,
    created_at: null as string | null,
  };
}

export async function instantAddSkill(
  userId: number,
  username: string,
  rawName: string,
) {
  const name = rawName.trim();
  if (name.length < 2) {
    throw new HttpError(400, "Skill name must be at least 2 characters");
  }
  const normalized = name.toLowerCase();
  const existing = await repo.findSkillByNormalizedName(normalized);
  if (existing) {
    let createdByName: string | null = null;
    if (existing.createdBy != null) {
      const m = await findUsernamesByIds([existing.createdBy]);
      createdByName = m.get(existing.createdBy) ?? null;
    }
    return {
      skill_id: existing.skillId,
      skill_name: existing.skillName,
      created_by: createdByName,
      created_at: null as string | null,
    };
  }
  const row = await repo.createSkillPlain(userId, name, normalized);
  return {
    skill_id: row.skillId,
    skill_name: row.skillName,
    created_by: username,
    created_at: null as string | null,
  };
}

export async function updateSkill(userId: number, skillId: number, rawName: string) {
  const skill = await repo.findSkillById(skillId);
  if (!skill) {
    throw new HttpError(404, "Skill not found");
  }
  const name = rawName.trim();
  if (!name) {
    throw new HttpError(400, "Skill name is required");
  }
  const normalized = name.toLowerCase();
  const dup = await repo.findSkillByNormalizedName(normalized);
  if (dup && dup.skillId !== skillId) {
    throw new HttpError(400, "Skill already exists");
  }
  const row = await repo.updateSkillWithAudit(userId, skillId, name, normalized);
  return {
    skill_id: row.skillId,
    skill_name: row.skillName,
    created_by: null as string | null,
    created_at: null as string | null,
  };
}

export async function removeSkill(userId: number, skillId: number) {
  const skill = await repo.findSkillById(skillId);
  if (!skill) {
    throw new HttpError(404, "Skill not found");
  }
  await repo.deleteSkillWithAudit(userId, skillId);
  return { message: "Skill deleted" as const };
}

export async function createDepartment(userId: number, rawName: string) {
  const departmentName = rawName.trim();
  if (!departmentName) {
    throw new HttpError(400, "Department name is required");
  }
  const existing = await repo.findDepartmentByName(departmentName);
  if (existing) {
    throw new HttpError(400, "Department already exists");
  }
  const row = await repo.createDepartmentWithAudit(userId, departmentName);
  return {
    department_id: row.departmentId,
    department_name: row.departmentName,
  };
}

export async function updateDepartment(
  userId: number,
  departmentId: number,
  rawName: string,
) {
  const dept = await repo.findDepartmentById(departmentId);
  if (!dept) {
    throw new HttpError(404, "Department not found");
  }
  const departmentName = rawName.trim();
  if (!departmentName) {
    throw new HttpError(400, "Department name is required");
  }
  const row = await repo.updateDepartmentWithAudit(
    userId,
    departmentId,
    departmentName,
  );
  return {
    department_id: row.departmentId,
    department_name: row.departmentName,
  };
}

export async function removeDepartment(userId: number, departmentId: number) {
  const dept = await repo.findDepartmentById(departmentId);
  if (!dept) {
    throw new HttpError(404, "Department not found");
  }
  await repo.deleteDepartmentWithAudit(userId, departmentId);
  return { message: "Department deleted" as const };
}

export async function createLocation(
  userId: number,
  city: string | null | undefined,
  country: string | null | undefined,
) {
  const row = await repo.createLocationWithAudit(
    userId,
    city ?? null,
    country ?? null,
  );
  return {
    location_id: row.locationId,
    city: row.city,
    country: row.country,
  };
}

export async function updateLocation(
  userId: number,
  locationId: number,
  patch: { city?: string | null; country?: string | null },
) {
  const loc = await repo.findLocationById(locationId);
  if (!loc) {
    throw new HttpError(404, "Location not found");
  }
  const row = await repo.updateLocationWithAudit(userId, locationId, patch);
  return {
    location_id: row.locationId,
    city: row.city,
    country: row.country,
  };
}

export async function removeLocation(userId: number, locationId: number) {
  const loc = await repo.findLocationById(locationId);
  if (!loc) {
    throw new HttpError(404, "Location not found");
  }
  await repo.deleteLocationWithAudit(userId, locationId);
  return { message: "Location deleted" as const };
}

export async function createCompanyRole(
  rawName: string,
  roleDescription: string | null | undefined,
) {
  const roleName = rawName.trim();
  if (!roleName) {
    throw new HttpError(400, "Role name cannot be empty");
  }
  const existing = await repo.findCompanyRoleByName(roleName);
  if (existing) {
    throw new HttpError(400, "Role name already exists");
  }
  const row = await repo.createCompanyRole(roleName, roleDescription ?? null);
  return {
    role_id: row.roleId,
    role_name: row.roleName,
    role_description: row.roleDescription,
    is_active: row.isActive,
    created_at: companyRoleCreatedAt(row.createdAt),
  };
}

export async function getCompanyRole(roleId: number) {
  const row = await repo.findCompanyRoleById(roleId);
  if (!row) {
    throw new HttpError(404, "Role not found");
  }
  return {
    role_id: row.roleId,
    role_name: row.roleName,
    role_description: row.roleDescription,
    is_active: row.isActive,
    created_at: companyRoleCreatedAt(row.createdAt),
  };
}

export async function replaceCompanyRole(
  roleId: number,
  patch: {
    role_name?: string;
    role_description?: string | null;
    is_active?: boolean;
  },
) {
  const role = await repo.findCompanyRoleById(roleId);
  if (!role) {
    throw new HttpError(404, "Role not found");
  }

  let nextName = role.roleName;
  if (patch.role_name !== undefined) {
    const roleName = patch.role_name.trim();
    if (!roleName) {
      throw new HttpError(400, "Role name cannot be empty");
    }
    const taken = await repo.findOtherCompanyRoleWithName(roleId, roleName);
    if (taken) {
      throw new HttpError(400, "Role name already exists");
    }
    nextName = roleName;
  }

  const row = await repo.updateCompanyRole(roleId, {
    roleName: patch.role_name !== undefined ? nextName : undefined,
    roleDescription: patch.role_description,
    isActive: patch.is_active,
  });
  if (!row) {
    throw new HttpError(404, "Role not found");
  }
  return {
    role_id: row.roleId,
    role_name: row.roleName,
    role_description: row.roleDescription,
    is_active: row.isActive,
    created_at: companyRoleCreatedAt(row.createdAt),
  };
}

export async function deactivateCompanyRole(roleId: number) {
  const role = await repo.findCompanyRoleById(roleId);
  if (!role) {
    throw new HttpError(404, "Role not found");
  }
  const row = await repo.updateCompanyRole(roleId, { isActive: false });
  if (!row) {
    throw new HttpError(404, "Role not found");
  }
  return {
    role_id: row.roleId,
    role_name: row.roleName,
    role_description: row.roleDescription,
    is_active: row.isActive,
    created_at: companyRoleCreatedAt(row.createdAt),
  };
}
