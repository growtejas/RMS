import { z } from "zod";

import {
  interviewModeSchema,
  interviewRoundTypeSchema,
} from "@/lib/validators/interviews";

export const lifecycleResultSchema = z.enum(["passed", "failed", "hold"]);

export const submitInterviewResultBody = z.object({
  result: lifecycleResultSchema,
});

export const scheduleNextRoundBody = z.object({
  application_id: z.number().int().positive(),
  round_name: z.string().min(1).max(100),
  round_type: interviewRoundTypeSchema,
  interview_mode: interviewModeSchema,
  scheduled_at: z.string().min(1),
  end_time: z.string().min(1),
  timezone: z.string().min(1).max(50),
  interviewer_ids: z.array(z.number().int().positive()).min(1),
  meeting_link: z.string().max(2000).optional().nullable(),
  location: z.string().max(500).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

export type SubmitInterviewResultInput = z.infer<typeof submitInterviewResultBody>;
export type ScheduleNextRoundInput = z.infer<typeof scheduleNextRoundBody>;
