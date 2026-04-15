import { z } from "zod";

const currencySchema = z
  .string()
  .regex(/^[A-Z]{2,10}$/, "Currency must be 2-10 uppercase letters (ISO 4217)");

export const requisitionItemCreateBody = z
  .object({
    role_position: z.string().min(2).max(50),
    job_description: z.string().min(5),
    skill_level: z.string().max(30).nullable().optional(),
    experience_years: z.number().int().min(0).nullable().optional(),
    education_requirement: z.string().max(100).nullable().optional(),
    requirements: z.string().nullable().optional(),
    replacement_hire: z.boolean().optional().default(false),
    replaced_emp_id: z.string().nullable().optional(),
    estimated_budget: z.union([z.number(), z.string()]).nullable().optional(),
    currency: currencySchema.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.replacement_hire && !data.replaced_emp_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "replaced_emp_id is required when replacement_hire is true",
      });
    }
    if (!data.replacement_hire && data.replaced_emp_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "replaced_emp_id must be null when replacement_hire is false",
      });
    }
  });

/** PUT /requisitions/{id} — manager upsert items by stable `item_id` (optional for creates). */
export const requisitionItemManagerUpsertBody = requisitionItemCreateBody
  .extend({
    item_id: z.number().int().positive().optional(),
  })
  .strict();

export const requisitionManagerPutBody = z
  .object({
    project_name: z.string().max(100).nullable().optional(),
    client_name: z.string().max(100).nullable().optional(),
    office_location: z.string().max(100).nullable().optional(),
    work_mode: z.string().max(10).nullable().optional(),
    required_by_date: z.string().nullable().optional(),
    priority: z.string().max(10).nullable().optional(),
    justification: z.string().nullable().optional(),
    budget_amount: z.union([z.number(), z.string()]).nullable().optional(),
    duration: z.string().max(50).nullable().optional(),
    is_replacement: z.boolean().optional(),
    manager_notes: z.string().nullable().optional(),
    items: z.array(requisitionItemManagerUpsertBody).optional(),
  })
  .strict();

/** PATCH /requisitions/{id} — only fields FastAPI allows (workflow fields excluded). */
export const requisitionPatchBody = z
  .object({
    project_name: z.string().max(100).nullable().optional(),
    client_name: z.string().max(100).nullable().optional(),
    justification: z.string().nullable().optional(),
    manager_notes: z.string().nullable().optional(),
    priority: z.string().max(10).nullable().optional(),
    is_replacement: z.boolean().optional(),
    duration: z.string().max(50).nullable().optional(),
    work_mode: z.string().max(10).nullable().optional(),
    office_location: z.string().max(100).nullable().optional(),
    required_by_date: z.string().nullable().optional(),
    approval_history: z.string().nullable().optional(),
    assigned_at: z.string().nullable().optional(),
  })
  .strict();

export type RequisitionItemCreateInput = z.infer<typeof requisitionItemCreateBody>;
export type RequisitionManagerPutInput = z.infer<typeof requisitionManagerPutBody>;
export type RequisitionPatchInput = z.infer<typeof requisitionPatchBody>;
