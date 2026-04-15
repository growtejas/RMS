import { z } from "zod";

export const userCreateBody = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const userAdminUpdateBody = z.object({
  roles: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
  employee_id: z.string().nullable().optional(),
});

export const assignRoleBody = z.object({
  role_name: z.string().min(1),
});

export const linkUserEmployeeBody = z.object({
  user_id: z.coerce.number().int().positive(),
  emp_id: z.string().min(1),
});

export const auditLogCreateBody = z.object({
  entity_name: z.string().min(1),
  entity_id: z.string().nullable().optional(),
  action: z.string().min(1),
  performed_by: z.number().int().nullable().optional(),
  target_user_id: z.number().int().nullable().optional(),
  old_value: z.string().nullable().optional(),
  new_value: z.string().nullable().optional(),
});
