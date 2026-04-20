import { z } from "zod";

/** Doc-style create link: existing candidate + job line. */
export const applicationCreateBody = z.object({
  candidate_id: z.number().int().positive(),
  requisition_item_id: z.number().int().positive(),
});

export const rankingRequisitionItemBody = z
  .object({
    requisitionItemId: z.number().int().positive().optional(),
    requisition_item_id: z.number().int().positive().optional(),
  })
  .refine(
    (d) => d.requisitionItemId != null || d.requisition_item_id != null,
    { message: "Provide requisitionItemId or requisition_item_id" },
  )
  .transform((d) => ({
    requisition_item_id: d.requisitionItemId ?? d.requisition_item_id!,
  }));
