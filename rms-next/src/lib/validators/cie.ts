import { z } from "zod";

export const cieRecomputeBody = z.object({
  candidateIds: z.array(z.number().int().positive()).min(1).max(500),
  force: z.boolean().optional(),
});

export const cieAskBody = z.object({
  question: z.string().min(3).max(2000),
  targetRole: z.string().max(200).optional().nullable(),
});

export type CieRecomputeBody = z.infer<typeof cieRecomputeBody>;
export type CieAskBody = z.infer<typeof cieAskBody>;
