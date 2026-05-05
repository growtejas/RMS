import { z } from "zod";

/** YYYY-MM (month precision; endDate null means present). */
export const strictYmZ = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "expected YYYY-MM")
  .nullable();

const strictBasicInfoZ = z
  .object({
    name: z.string().max(200).nullable(),
    email: z.string().max(255).nullable(),
    phone: z.string().max(60).nullable(),
  })
  .strict();

const strictExperienceRowZ = z
  .object({
    company: z.string().max(200),
    role: z.string().max(200),
    startDate: strictYmZ,
    endDate: strictYmZ,
    durationMonths: z.number().int().min(0).max(1200).nullable(),
  })
  .strict();

const strictProjectZ = z
  .object({
    title: z.string().max(200),
    description: z.string().max(4000),
    techStack: z.array(z.string().max(120)).max(40),
  })
  .strict();

const strictEducationZ = z
  .object({
    degree: z.string().max(300),
    specialization: z.string().max(200).nullable(),
    university: z.string().max(300),
    year: z.number().int().min(1950).max(2100).nullable(),
  })
  .strict();

/**
 * LLM JSON contract (strict mode). Matches CIE `ParsedCandidate` intent + dated experience.
 * Use property name `experience` (not "experience/internship").
 */
export const strictLlmResumeParseZ = z
  .object({
    basicInfo: strictBasicInfoZ,
    skills: z.array(z.string().max(120)).max(80),
    experience: z.array(strictExperienceRowZ).max(25),
    projects: z.array(strictProjectZ).max(40),
    education: z.array(strictEducationZ).max(15),
  })
  .strict()
  .superRefine((val, ctx) => {
    const p = val.basicInfo.phone;
    if (p == null || !p.trim()) return;
    const err = validateStrictResumePhone(p);
    if (err) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: err, path: ["basicInfo", "phone"] });
    }
  });

export type StrictLlmResumeParse = z.infer<typeof strictLlmResumeParseZ>;

/** Digits-only length must be 10–15; reject concatenated date-like digit runs. */
export function validateStrictResumePhone(raw: string): string | null {
  const t = raw.trim();
  if (!t) return "phone must not be empty when provided";
  const digits = t.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) {
    return "phone must yield 10–15 digits after removing separators";
  }
  if (isSuspiciousDigitRunAsPhone(digits)) {
    return "phone looks like a date range or invalid digit run";
  }
  return null;
}

function isSuspiciousDigitRunAsPhone(digits: string): boolean {
  if (digits.length < 11) return false;
  return /(?:19|20)\d{2}.{0,8}(?:19|20)\d{2}/.test(digits);
}

export function parseStrictLlmResumeJson(raw: unknown):
  | { ok: true; data: StrictLlmResumeParse }
  | { ok: false; error: z.ZodError } {
  const r = strictLlmResumeParseZ.safeParse(raw);
  if (r.success) return { ok: true, data: r.data };
  return { ok: false, error: r.error };
}

export const STRICT_LLM_RESUME_PARSE_SYSTEM_PROMPT = `You are a deterministic resume parser.
Convert raw resume text into strict structured JSON only.

Rules:
- DO NOT hallucinate. If data is not clearly present, use null or omit only where the schema allows null.
- DO NOT mix sections: experience belongs in experience, not projects.
- DO NOT split sentences into separate projects; group each project with one title, one merged description, techStack from that block only.
- Section classification: EXPERIENCE, PROJECTS, EDUCATION, SKILLS — keep separate.
- experience: company, role, startDate/endDate as YYYY-MM or null; endDate null if current/present; durationMonths only when you can compute from clear dates without guessing, else null.
- Phone: real numbers only, 10–15 digits after removing separators — never use employment date ranges as phone.
- skills: deduplicate; you may lowercase — downstream normalizes for ATS.
- Return ONLY a JSON object with exactly these keys (no extras, no markdown, no comments):
  basicInfo: { name, email, phone } (each string or null)
  skills: string[]
  experience: { company, role, startDate, endDate, durationMonths }[]  
  projects: { title, description, techStack }[]
  education: { degree, specialization, university, year }[]`;
