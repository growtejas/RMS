import { z } from "zod";

const isoDateTime = z.string().min(1);

export const interviewRoundTypeSchema = z.enum(["TECHNICAL", "HR", "MANAGERIAL"]);
export const interviewModeSchema = z.enum(["ONLINE", "OFFLINE"]);

export const interviewCreateBodyV2 = z.object({
  candidate_id: z.number().int(),
  requisition_item_id: z.number().int(),
  round_name: z.string().min(1).max(100),
  round_type: interviewRoundTypeSchema,
  interview_mode: interviewModeSchema,
  scheduled_at: isoDateTime,
  end_time: isoDateTime,
  timezone: z.string().min(1).max(50),
  interviewer_ids: z.array(z.number().int().positive()).min(1),
  meeting_link: z.string().max(2000).optional().nullable(),
  location: z.string().max(500).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

export const interviewCreateBodyLegacy = z.object({
  candidate_id: z.number().int(),
  round_number: z.number().int().min(1),
  interviewer_name: z.string().min(1).max(150),
  scheduled_at: isoDateTime,
});

export const interviewCreateBody = z.union([
  interviewCreateBodyV2,
  interviewCreateBodyLegacy,
]);

export const interviewPatchBody = z.object({
  interviewer_name: z.string().min(1).max(150).optional(),
  scheduled_at: isoDateTime.optional(),
  end_time: isoDateTime.optional(),
  timezone: z.string().min(1).max(50).optional(),
  meeting_link: z.string().max(2000).nullable().optional(),
  location: z.string().max(500).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  round_name: z.string().min(1).max(100).nullable().optional(),
  round_type: interviewRoundTypeSchema.optional(),
  interview_mode: interviewModeSchema.optional(),
  interviewer_ids: z.array(z.number().int().positive()).min(1).optional(),
  status: z.preprocess(
    (v) => {
      if (v === undefined) {
        return undefined;
      }
      return String(v).toUpperCase().replace(/\s+/g, "_");
    },
    z.enum(["SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"]).optional(),
  ),
  result: z.preprocess(
    (v) => {
      if (v === undefined) {
        return undefined;
      }
      if (v === null) {
        return null;
      }
      return String(v).toUpperCase();
    },
    z.enum(["PASS", "FAIL", "HOLD"]).nullable().optional(),
  ),
  feedback: z.string().nullable().optional(),
  reschedule_reason: z.string().max(2000).optional(),
});

export type InterviewCreateV2 = z.infer<typeof interviewCreateBodyV2>;
export type InterviewCreateLegacy = z.infer<typeof interviewCreateBodyLegacy>;
export type InterviewCreateInput = z.infer<typeof interviewCreateBody>;
export type InterviewPatchInput = z.infer<typeof interviewPatchBody>;
