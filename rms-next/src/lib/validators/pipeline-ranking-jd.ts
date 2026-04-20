import { z } from "zod";

export const pipelineRankingJdPatchBody = z.object({
  use_requisition_jd: z.boolean(),
  pipeline_jd_text: z.string().nullable().optional(),
  ranking_required_skills: z.array(z.string().min(1).max(100)).max(80).nullable().optional(),
});
