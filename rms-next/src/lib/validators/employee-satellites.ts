import { z } from "zod";

export const employeeContactUpsertBody = z.object({
  contact_type: z.enum(["Work", "Personal", "Emergency"]),
  email: z.union([z.string().email(), z.null()]).optional(),
  phone: z.union([z.string(), z.null()]).optional(),
  address: z.union([z.string(), z.null()]).optional(),
});

export const employeeSkillUpsertBody = z.object({
  skill_id: z.number().int(),
  proficiency_level: z.enum(["Junior", "Mid", "Senior"]).nullable().optional(),
  years_experience: z.number().nullable().optional(),
});

export const employeeEducationCreateBody = z.object({
  qualification: z.string().min(1),
  specialization: z.string().nullable().optional(),
  institution: z.string().nullable().optional(),
  year_completed: z.number().int().nullable().optional(),
});

export const employeeEducationUpdateBody = z
  .object({
    qualification: z.string().optional(),
    specialization: z.string().nullable().optional(),
    institution: z.string().nullable().optional(),
    year_completed: z.number().int().nullable().optional(),
  })
  .strict();

export const employeeFinanceUpsertBody = z.object({
  bank_details: z.string().nullable().optional(),
  tax_id: z.string().nullable().optional(),
});

export const employeeAvailabilityCreateBody = z.object({
  availability_pct: z.number().int().min(0).max(100),
  effective_from: z.string().min(1),
});

export type EmployeeContactUpsertInput = z.infer<
  typeof employeeContactUpsertBody
>;
export type EmployeeSkillUpsertInput = z.infer<typeof employeeSkillUpsertBody>;
export type EmployeeEducationCreateInput = z.infer<
  typeof employeeEducationCreateBody
>;
export type EmployeeEducationUpdateInput = z.infer<
  typeof employeeEducationUpdateBody
>;
export type EmployeeFinanceUpsertInput = z.infer<
  typeof employeeFinanceUpsertBody
>;
export type EmployeeAvailabilityCreateInput = z.infer<
  typeof employeeAvailabilityCreateBody
>;
