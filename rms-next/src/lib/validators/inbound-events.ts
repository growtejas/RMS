import { z } from "zod";

const unknownRecord = z.record(z.string(), z.unknown());

const applicantSchema = z.object({
  full_name: z.string().min(1).max(150),
  email: z.string().email(),
  phone: z.string().max(30).optional().nullable(),
  resume_url: z.string().url().optional().nullable(),
});

export const publicApplyIngestBody = z
  .object({
    external_id: z.string().min(1).max(255).optional(),
    applicant: applicantSchema,
    metadata: unknownRecord.optional(),
  })
  .passthrough();

export const partnerIngestBody = z
  .object({
    external_id: z.string().min(1).max(255).optional(),
  })
  .passthrough();

export const bulkIngestBody = z.object({
  events: z
    .array(
      z
        .object({
          external_id: z.string().min(1).max(255).optional(),
          payload: unknownRecord.optional(),
        })
        .passthrough(),
    )
    .min(1)
    .max(200),
});
