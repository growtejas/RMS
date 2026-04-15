import { z } from "zod";

export const workflowTransitionBody = z
  .object({
    reason: z.string().optional(),
    expected_version: z.number().int().min(0).optional().nullable(),
  })
  .strict();

export const rejectBody = z
  .object({
    reason: z.string().min(10).max(2000),
    expected_version: z.number().int().min(0).optional().nullable(),
  })
  .strict();

export const cancelBody = z
  .object({
    reason: z.string().min(10).max(2000),
    expected_version: z.number().int().min(0).optional().nullable(),
  })
  .strict();

export const assignTaBody = z
  .object({
    ta_user_id: z.number().int().positive(),
  })
  .strict();

export const shortlistBody = z
  .object({
    candidate_count: z.number().int().min(1).optional().nullable(),
  })
  .strict();

export const makeOfferBody = z
  .object({
    candidate_id: z.string().nullable().optional(),
    offer_details: z.record(z.string(), z.any()).nullable().optional(),
  })
  .strict();

export const fulfillBody = z
  .object({
    employee_id: z.string().min(1),
  })
  .strict();

export const backwardReasonBody = z
  .object({
    reason: z.string().min(10).max(2000),
  })
  .strict();

export const swapTaBody = z
  .object({
    new_ta_id: z.number().int().positive(),
    reason: z.string().min(5).max(2000),
  })
  .strict();

export const bulkReassignBody = z
  .object({
    old_ta_id: z.number().int().positive(),
    new_ta_id: z.number().int().positive(),
    reason: z.string().min(5).max(2000),
    item_ids: z.array(z.number().int().positive()).optional().nullable(),
  })
  .strict();

export const reassignItemBody = z
  .object({
    new_ta_id: z.number().int().positive(),
    reason: z.string().min(5).max(2000),
  })
  .strict();

const currencySchema = z
  .string()
  .regex(/^[A-Z]{2,10}$/, "Currency must be 2-10 uppercase letters (ISO 4217)");

export const itemBudgetEditBody = z
  .object({
    estimated_budget: z.number().positive(),
    currency: currencySchema.optional().default("INR"),
  })
  .strict();

export const itemBudgetApproveBody = z
  .object({
    approved_budget: z.number().positive().optional().nullable(),
  })
  .strict();

export const itemBudgetRejectBody = z
  .object({
    reason: z.string().min(10).max(2000),
  })
  .strict();
