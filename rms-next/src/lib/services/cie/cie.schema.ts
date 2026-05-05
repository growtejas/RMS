import { z } from "zod";

export const parsedBasicInfoZ = z
  .object({
    name: z.string().max(200).nullable(),
    email: z.string().max(255).nullable(),
    phone: z.string().max(60).nullable(),
  })
  .strict();

export const parsedProjectZ = z
  .object({
    title: z.string().max(200),
    description: z.string().max(4000),
    techStack: z.array(z.string().max(120)).max(40),
  })
  .strict();

export const parsedExperienceZ = z
  .object({
    company: z.string().max(200),
    role: z.string().max(200),
    years: z.number().min(0).max(80).nullable(),
  })
  .strict();

export const parsedEducationZ = z
  .object({
    degree: z.string().max(300),
    specialization: z.string().max(200).nullable(),
    university: z.string().max(300),
    year: z.number().int().min(1950).max(2100).nullable(),
    score: z.string().max(120).nullable(),
  })
  .strict();

/** Strict structured parse output for CIE (never free-form top-level prose). */
export const parsedCandidateZ = z
  .object({
    basicInfo: parsedBasicInfoZ,
    skills: z.array(z.string().max(120)).max(80),
    projects: z.array(parsedProjectZ).max(40),
    experience: z.array(parsedExperienceZ).max(25),
    education: z.array(parsedEducationZ).max(15),
  })
  .strict();

export type ParsedCandidate = z.infer<typeof parsedCandidateZ>;

export const educationInsightsZ = z
  .object({
    relevance: z.enum(["High", "Medium", "Low"]),
    notes: z.string().max(4000),
  })
  .strict();

export const candidateReportZ = z
  .object({
    summary: z.string().max(8000),
    strengths: z.array(z.string().max(500)).max(40),
    weaknesses: z.array(z.string().max(500)).max(40),
    primarySkills: z.array(z.string().max(120)).max(40),
    secondarySkills: z.array(z.string().max(120)).max(60),
    experienceLevel: z.enum(["Fresher", "Junior", "Mid", "Senior"]),
    suitableRoles: z.array(z.string().max(200)).max(30),
    educationInsights: educationInsightsZ,
    riskFlags: z.array(z.string().max(400)).max(30),
    confidenceScore: z.number().min(0).max(1),
  })
  .strict();

export type CandidateReport = z.infer<typeof candidateReportZ>;

export type ParseAcceptanceFailureReason =
  | "empty_profile"
  | "missing_contact_and_identity"
  | "no_substance";

/** Minimum bar: identity signal + at least one substantive block (skills, jobs, or education). */
export function assertParseAcceptable(
  parsed: ParsedCandidate,
):
  | { ok: true }
  | { ok: false; reason: ParseAcceptanceFailureReason } {
  const hasContact =
    Boolean(parsed.basicInfo.email?.trim()) ||
    Boolean(parsed.basicInfo.phone?.trim()) ||
    Boolean(parsed.basicInfo.name?.trim());
  const hasSubstance =
    parsed.skills.length > 0 ||
    parsed.experience.length > 0 ||
    parsed.education.length > 0;

  if (!hasContact) {
    return { ok: false, reason: "missing_contact_and_identity" };
  }
  if (!hasSubstance) {
    return { ok: false, reason: "no_substance" };
  }
  return { ok: true };
}

export function parseStoredCandidateReport(raw: unknown):
  | { ok: true; data: CandidateReport }
  | { ok: false; error: z.ZodError } {
  const r = candidateReportZ.safeParse(raw);
  if (r.success) return { ok: true, data: r.data };
  return { ok: false, error: r.error };
}
