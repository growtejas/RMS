import { z } from "zod";

export const candidateCreateBody = z.object({
  requisition_item_id: z.number().int(),
  requisition_id: z.number().int(),
  full_name: z.string().min(1).max(150),
  email: z.string().email(),
  phone: z.string().max(30).optional().nullable(),
  resume_path: z.string().optional().nullable(),
});

export const candidatePatchBody = z.object({
  full_name: z.string().min(1).max(150).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional().nullable(),
  resume_path: z.string().optional().nullable(),
});

export const candidateStageBody = z.object({
  new_stage: z.enum([
    "Sourced",
    "Shortlisted",
    "Interviewing",
    "Offered",
    "Hired",
    "Rejected",
  ]),
  reason: z.string().max(500).optional(),
});

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
