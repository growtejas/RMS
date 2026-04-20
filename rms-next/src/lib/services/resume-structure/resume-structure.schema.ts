import { z } from "zod";

/** JSON `schema_version` for `candidates.resume_structured_profile` (bump when shape changes). */
export const RESUME_STRUCTURE_SCHEMA_VERSION = 1 as const;

export const fieldConfidenceZ = z.enum(["high", "medium", "low"]);
export type FieldConfidence = z.infer<typeof fieldConfidenceZ>;

const employmentRowZ = z
  .object({
    company: z.string().max(200).nullable(),
    title: z.string().max(200).nullable(),
    from: z.string().max(40).nullable(),
    to: z.string().max(40).nullable(),
    bullets: z.array(z.string().max(500)).max(40),
  })
  .strict();

/** Normalized resume fields used by ATS / ranking (aligned with ParsedCandidate intent). */
export const parsedCandidateProfileZ = z
  .object({
    name: z.string().max(200).nullable(),
    email: z.string().max(255).nullable(),
    phone: z.string().max(60).nullable(),
    skills: z.array(z.string().max(120)).max(80),
    projects: z.array(z.string().max(400)).max(40),
    experience_years: z.number().min(0).max(80).nullable(),
    experience_details: z.array(z.string().max(500)).max(60),
    education: z.string().max(2000).nullable(),
    certifications: z.array(z.string().max(300)).max(40),
    job_title: z.string().max(200).nullable(),
    location: z.string().max(200).nullable(),
    /** When detected inline (e.g. "30 days notice"); DB still wins at merge time. */
    notice_period_days: z.number().int().min(0).max(365).nullable().optional(),
    employment: z.array(employmentRowZ).max(25),
  })
  .strict();

export type ParsedCandidateProfile = z.infer<typeof parsedCandidateProfileZ>;

export const resumeStructuredExtractorZ = z.enum(["rules_v2", "rules_v2+llm"]);

export const resumeStructuredDocumentV1Z = z
  .object({
    schema_version: z.literal(RESUME_STRUCTURE_SCHEMA_VERSION),
    extractor: resumeStructuredExtractorZ,
    extracted_at: z.string().max(40),
    source_hash: z.string().max(64).nullable(),
    profile: parsedCandidateProfileZ,
    confidence: z
      .object({
        overall: z.number().min(0).max(1),
      })
      .strict(),
    field_confidence: z
      .object({
        skills: fieldConfidenceZ.optional(),
        experience_years: fieldConfidenceZ.optional(),
        education: fieldConfidenceZ.optional(),
        employment: fieldConfidenceZ.optional(),
        contact: fieldConfidenceZ.optional(),
      })
      .strict()
      .optional(),
    warnings: z.array(z.string().max(120)).max(30),
  })
  .strict();

export type ResumeStructuredDocumentV1 = z.infer<typeof resumeStructuredDocumentV1Z>;

export function parseResumeStructuredDocument(
  raw: unknown,
): { ok: true; data: ResumeStructuredDocumentV1 } | { ok: false; error: z.ZodError } {
  const r = resumeStructuredDocumentV1Z.safeParse(raw);
  if (r.success) {
    return { ok: true, data: r.data };
  }
  return { ok: false, error: r.error };
}
