import { z } from "zod";

export const candidateCreateBody = z.object({
  requisition_item_id: z.number().int(),
  requisition_id: z.number().int(),
  full_name: z.string().min(1).max(150),
  email: z.string().email(),
  phone: z.string().max(30).optional().nullable(),
  resume_path: z.string().optional().nullable(),
  total_experience_years: z.number().min(0).max(80).nullable().optional(),
  notice_period_days: z.number().int().min(0).max(365).nullable().optional(),
  is_referral: z.boolean().optional(),
  candidate_skills: z.array(z.string().min(1).max(100)).max(80).nullable().optional(),
  education_raw: z.string().max(120).nullable().optional(),
});

export const candidatePatchBody = z.object({
  full_name: z.string().min(1).max(150).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional().nullable(),
  resume_path: z.string().optional().nullable(),
  total_experience_years: z.number().min(0).max(80).nullable().optional(),
  notice_period_days: z.number().int().min(0).max(365).nullable().optional(),
  is_referral: z.boolean().optional(),
  candidate_skills: z.array(z.string().min(1).max(100)).max(80).nullable().optional(),
  education_raw: z.string().max(120).nullable().optional(),
});

const PIPELINE_STAGES = [
  "Sourced",
  "Shortlisted",
  "Interviewing",
  "Offered",
  "Hired",
  "Rejected",
] as const;

/** Doc aliases (e.g. INTERVIEW) and case variants map to canonical Title Case stages. */
const STAGE_ALIASES: Record<string, (typeof PIPELINE_STAGES)[number]> = {
  SOURCED: "Sourced",
  SHORTLISTED: "Shortlisted",
  INTERVIEW: "Interviewing",
  INTERVIEWING: "Interviewing",
  OFFER: "Offered",
  OFFERED: "Offered",
  HIRED: "Hired",
  REJECTED: "Rejected",
};

const STAGE_LOWER: Record<string, (typeof PIPELINE_STAGES)[number]> = {
  sourced: "Sourced",
  shortlisted: "Shortlisted",
  interviewing: "Interviewing",
  offered: "Offered",
  hired: "Hired",
  rejected: "Rejected",
};

function normalizePipelineStage(raw: string): string {
  const t = raw.trim();
  if ((PIPELINE_STAGES as readonly string[]).includes(t)) {
    return t;
  }
  const upper = t.toUpperCase();
  if (upper in STAGE_ALIASES) {
    return STAGE_ALIASES[upper];
  }
  const low = t.toLowerCase();
  if (low in STAGE_LOWER) {
    return STAGE_LOWER[low];
  }
  return t;
}

export const candidateStageBody = z.object({
  new_stage: z
    .string()
    .min(1)
    .transform((s) => normalizePipelineStage(s))
    .pipe(z.enum(PIPELINE_STAGES)),
  reason: z.string().max(500).optional(),
});

export const applicationStageBody = candidateStageBody;

export const interviewCreateBody = z.object({
  candidate_id: z.number().int(),
  round_number: z.number().int().min(1),
  interviewer_name: z.string().min(1).max(150),
  scheduled_at: z.string(),
});

export const interviewPatchBody = z.object({
  interviewer_name: z.string().min(1).max(150).optional(),
  scheduled_at: z.string().optional(),
  status: z.enum(["Scheduled", "Completed", "Cancelled"]).optional(),
  result: z.enum(["Pass", "Fail", "Hold"]).nullable().optional(),
  feedback: z.string().nullable().optional(),
});
