import { z } from "zod";

export const cieRecomputeBody = z.object({
  candidateIds: z.array(z.number().int().positive()).min(1).max(500),
  force: z.boolean().optional(),
});

export const cieRematerializeV2Body = z.object({
  candidateIds: z.array(z.number().int().positive()).min(1).max(500),
  /** When true, schedule a CIE recompute right after the v2 snapshot is rebuilt. */
  enqueueRecompute: z.boolean().optional(),
});

export type CieRematerializeV2Body = z.infer<typeof cieRematerializeV2Body>;

export const cieAskBody = z.object({
  question: z.string().min(3).max(2000),
  targetRole: z.string().max(200).optional().nullable(),
});

/** POST /api/candidates/:id/materialize-cie-v2 — optional JSON body (empty body allowed). */
export const materializeCieV2Body = z
  .object({
    enqueue_cie_recompute: z.boolean().optional(),
  })
  .strict();

export type MaterializeCieV2Body = z.infer<typeof materializeCieV2Body>;

export type CieRecomputeBody = z.infer<typeof cieRecomputeBody>;
export type CieAskBody = z.infer<typeof cieAskBody>;
