import { z } from "zod";

export const skillCreateBody = z.object({
  skill_name: z.string().min(1, "Skill name is required"),
});

export const skillUpdateBody = z.object({
  skill_name: z.string(),
});

export const skillInstantBody = z.object({
  name: z.string(),
});

export const departmentCreateBody = z.object({
  department_name: z.string().min(1),
});

export const departmentUpdateBody = z.object({
  department_name: z.string().min(1),
});

export const locationCreateBody = z.object({
  city: z.string().min(1, "City is required"),
  country: z.string().nullable().optional(),
});

export const locationUpdateBody = z.object({
  city: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
});

export const companyRoleCreateBody = z.object({
  role_name: z.string().min(1),
  role_description: z.string().nullable().optional(),
});

export const companyRoleUpdateBody = z.object({
  role_name: z.string().min(1).optional(),
  role_description: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});
