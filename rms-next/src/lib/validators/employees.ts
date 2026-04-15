import { z } from "zod";

export const employeeCreateBody = z.object({
  emp_id: z.string().min(1),
  full_name: z.string().min(1),
  rbm_email: z.string().email(),
  dob: z.string().nullable().optional(),
  gender: z.string().nullable().optional(),
  doj: z.string().nullable().optional(),
});

export const employeeUpdateBody = z
  .object({
    full_name: z.string().optional(),
    dob: z.string().nullable().optional(),
    gender: z.string().nullable().optional(),
    doj: z.string().nullable().optional(),
  })
  .strict();

export const employeeStatusBody = z.object({
  emp_status: z.enum(["Onboarding", "Active", "On Leave", "Exited"]),
});

const onboardContact = z.object({
  type: z.enum(["work", "personal", "emergency"]),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
});

const onboardSkill = z.object({
  skill_id: z.number().int(),
  proficiency_level: z.string().nullable().optional(),
  years_experience: z.number().nullable().optional(),
});

const onboardEducation = z.object({
  qualification: z.string().nullable().optional(),
  specialization: z.string().nullable().optional(),
  institution: z.string().nullable().optional(),
  year_completed: z.number().int().nullable().optional(),
});

const onboardAvailability = z.object({
  availability_pct: z.number().int(),
  effective_from: z.string().min(1),
});

const onboardFinance = z.object({
  bank_details: z.string().nullable().optional(),
  tax_id: z.string().nullable().optional(),
});

export const employeeOnboardBody = z.object({
  emp_id: z.string().min(1),
  full_name: z.string().min(1),
  rbm_email: z.string().email(),
  company_role_id: z.number().int().nullable().optional(),
  dob: z.string().nullable().optional(),
  gender: z.string().nullable().optional(),
  doj: z.string().nullable().optional(),
  contacts: z.array(onboardContact).default([]),
  skills: z.array(onboardSkill).default([]),
  education: z.array(onboardEducation).default([]),
  availability: onboardAvailability.nullable().optional(),
  finance: onboardFinance.nullable().optional(),
});

export type EmployeeOnboardInput = z.infer<typeof employeeOnboardBody>;
