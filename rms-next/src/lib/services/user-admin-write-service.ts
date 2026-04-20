import { Buffer } from "buffer";

import { eq } from "drizzle-orm";

import { normalizeRoleList } from "@/lib/auth/normalize-roles";
import { hashPassword } from "@/lib/auth/password";
import { getDb } from "@/lib/db";
import { userEmployeeMap, users as usersTable } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/http-error";
import {
  findUserById,
  findUserByUsername,
  listRoleNamesForUser,
} from "@/lib/repositories/auth-user";
import * as repo from "@/lib/repositories/user-admin-mutations";
import { ensureAssignableRoles } from "@/lib/repositories/users-directory";
import { resolveDefaultOrganizationId } from "@/lib/tenant/resolve-org";

function sameRoleList(a: string[], b: string[]): boolean {
  const na = normalizeRoleList(a)
    .slice()
    .sort((x, y) => x.localeCompare(y))
    .join("\0");
  const nb = normalizeRoleList(b)
    .slice()
    .sort((x, y) => x.localeCompare(y))
    .join("\0");
  return na === nb;
}

export async function createUserAccount(username: string, password: string) {
  if (Buffer.byteLength(password, "utf8") > 72) {
    throw new HttpError(400, "Password too long (maximum 72 bytes)");
  }
  const uname = username.trim();
  if (!uname) {
    throw new HttpError(400, "Username is required");
  }
  const existing = await findUserByUsername(uname);
  if (existing) {
    throw new HttpError(400, "Username already exists");
  }
  const passwordHash = hashPassword(password);
  const userId = await repo.createUserRow(uname, passwordHash);
  const organizationId = await resolveDefaultOrganizationId();
  await repo.addUserToOrganization({
    userId,
    organizationId,
    isPrimary: true,
  });
  return {
    message: "User created successfully" as const,
    user_id: userId,
  };
}

export async function assignRoleToUser(userId: number, roleName: string) {
  const user = await findUserById(userId);
  if (!user) {
    throw new HttpError(404, "User not found");
  }
  await ensureAssignableRoles();
  const role = await repo.findRoleByNameCaseInsensitive(roleName.trim());
  if (!role) {
    throw new HttpError(404, "Role not found");
  }
  const exists = await repo.hasUserRole(userId, role.roleId);
  if (exists) {
    throw new HttpError(400, "Role already assigned to user");
  }
  await repo.addUserRole(userId, role.roleId);
  return { message: "Role assigned successfully" as const };
}

export async function linkUserToEmployee(userId: number, empId: string) {
  const user = await findUserById(userId);
  if (!user) {
    throw new HttpError(404, "User not found");
  }
  const emp = await repo.findEmployeeByEmpId(empId);
  if (!emp) {
    throw new HttpError(404, "Employee not found");
  }
  const mapU = await repo.findUserEmployeeMapByUserId(userId);
  if (mapU) {
    throw new HttpError(400, "User already linked to employee");
  }
  const mapE = await repo.findUserEmployeeMapByEmpId(empId);
  if (mapE) {
    throw new HttpError(400, "Employee already linked to a user");
  }
  await repo.insertUserEmployeeMap(userId, empId);
  return { message: "User successfully linked to employee" as const };
}

export async function adminUpdateUser(
  actorUserId: number,
  userId: number,
  patch: {
    roles?: string[];
    is_active?: boolean;
    employee_id?: string | null;
  },
) {
  const user = await findUserById(userId);
  if (!user) {
    throw new HttpError(404, "User not found");
  }

  const oldRoles = normalizeRoleList(await listRoleNamesForUser(userId));
  const oldIsActive = user.isActive;
  const oldEmployeeId = user.employeeId ?? null;

  if (patch.roles !== undefined) {
    await ensureAssignableRoles();
    const roleIds: number[] = [];
    for (const roleName of patch.roles) {
      const role = await repo.findRoleByNameCaseInsensitive(roleName);
      if (!role) {
        throw new HttpError(404, `Role not found: ${roleName}`);
      }
      roleIds.push(role.roleId);
    }
    await repo.replaceUserRoles(userId, roleIds);
  }

  if (patch.is_active !== undefined) {
    await getDb()
      .update(usersTable)
      .set({ isActive: patch.is_active })
      .where(eq(usersTable.userId, userId));
  }

  if (patch.employee_id !== undefined) {
    let nextEmp: string | null;
    if (patch.employee_id === "" || patch.employee_id === null) {
      nextEmp = null;
    } else {
      nextEmp = patch.employee_id;
      const emp = await repo.findEmployeeByEmpId(nextEmp);
      if (!emp) {
        throw new HttpError(404, "Employee not found");
      }
      const other = await repo.findOtherUserWithEmployeeId(nextEmp, userId);
      if (other) {
        throw new HttpError(
          400,
          "Employee already linked to another user",
        );
      }
    }
    await getDb()
      .update(usersTable)
      .set({ employeeId: nextEmp })
      .where(eq(usersTable.userId, userId));
  }

  const updated = await findUserById(userId);
  if (!updated) {
    throw new HttpError(404, "User not found");
  }

  if (patch.employee_id !== undefined) {
    await getDb().transaction(async (tx) => {
      await tx.delete(userEmployeeMap).where(eq(userEmployeeMap.userId, userId));
      const empId = updated.employeeId;
      if (empId) {
        await tx.insert(userEmployeeMap).values({ userId, empId });
      }
    });
  }

  if (patch.roles !== undefined && !sameRoleList(patch.roles, oldRoles)) {
    await repo.insertUserAudit({
      action: "USER_ROLE_UPDATE",
      actorUserId,
      targetUserId: userId,
      oldValue: { roles: oldRoles },
      newValue: { roles: normalizeRoleList(patch.roles) },
    });
  }

  if (patch.employee_id !== undefined) {
    const newEmp = updated.employeeId ?? null;
    const oldEq =
      oldEmployeeId === "" || oldEmployeeId === null ? null : oldEmployeeId;
    const newEq = newEmp === "" || newEmp === null ? null : newEmp;
    if (oldEq !== newEq) {
      await repo.insertUserAudit({
        action: "USER_EDIT",
        actorUserId,
        targetUserId: userId,
        oldValue: { employee_id: oldEmployeeId },
        newValue: { employee_id: newEmp },
      });
    }
  }

  if (patch.is_active !== undefined && patch.is_active !== oldIsActive) {
    await repo.insertUserAudit({
      action: patch.is_active === false ? "USER_DELETE" : "USER_EDIT",
      actorUserId,
      targetUserId: userId,
      oldValue: { is_active: oldIsActive },
      newValue: { is_active: updated.isActive },
    });
  }

  return { message: "User updated" as const };
}

export async function adminDeactivateUser(actorUserId: number, userId: number) {
  const user = await findUserById(userId);
  if (!user) {
    throw new HttpError(404, "User not found");
  }
  const oldState = {
    roles: normalizeRoleList(await listRoleNamesForUser(userId)),
    is_active: user.isActive,
  };

  await getDb()
    .update(usersTable)
    .set({ isActive: false })
    .where(eq(usersTable.userId, userId));

  await repo.insertUserAudit({
    action: "USER_DELETE",
    actorUserId,
    targetUserId: userId,
    oldValue: oldState,
    newValue: { is_active: false },
  });

  return { message: "User deactivated" as const };
}

export async function createGenericAuditLog(payload: {
  entityName: string;
  entityId: string | null;
  action: string;
  performedBy: number | null;
  targetUserId: number | null;
  oldValue: string | null;
  newValue: string | null;
}) {
  const auditId = await repo.insertAuditLogRow({
    entityName: payload.entityName,
    entityId: payload.entityId,
    action: payload.action,
    performedBy: payload.performedBy,
    targetUserId: payload.targetUserId,
    oldValue: payload.oldValue,
    newValue: payload.newValue,
  });
  return {
    message: "Audit log created" as const,
    audit_id: auditId ?? 0,
  };
}
