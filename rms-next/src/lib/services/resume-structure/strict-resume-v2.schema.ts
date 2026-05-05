import { z } from "zod";

/**
 * Adaptive resume v2: stable core + optional rich + per-field provenance + profile_type.
 * Read-only / UI-debug surface. Not persisted, not used by ranking.
 */

export const v2SourceZ = z.enum([
  "rules",
  "llm",
  "hybrid",
  "header",
  "skills_section",
  "experience_section",
  "projects_section",
  "education_section",
  "achievements_section",
  "certifications_section",
  "publications_section",
  "patents_section",
  "profiles_section",
  "leadership_section",
  "languages_section",
  "awards_section",
  "unknown",
]);
export type V2Source = z.infer<typeof v2SourceZ>;

export const v2ProvZ = z
  .object({
    source: v2SourceZ,
    confidence: z.number().min(0).max(1),
  })
  .strict();
export type V2Prov = z.infer<typeof v2ProvZ>;

const v2YmZ = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "expected YYYY-MM")
  .nullable();

const v2YearZ = z.number().int().min(1900).max(2100).nullable();

const v2ValStringZ = z
  .object({
    value: z.string().max(500).nullable(),
    prov: v2ProvZ,
  })
  .strict();

const v2BasicInfoZ = z
  .object({
    name: v2ValStringZ,
    email: v2ValStringZ,
    phone: v2ValStringZ,
    location: v2ValStringZ.optional(),
    headline: v2ValStringZ.optional(),
  })
  .strict();

const v2SkillZ = z
  .object({
    name: z.string().max(120),
    prov: v2ProvZ,
  })
  .strict();

const v2ExperienceRowZ = z
  .object({
    company: z.string().max(200),
    role: z.string().max(200),
    location: z.string().max(200).nullable(),
    startDate: v2YmZ,
    endDate: v2YmZ,
    durationMonths: z.number().int().min(0).max(1200).nullable(),
    bullets: z.array(z.string().max(800)).max(40),
    techStack: z.array(z.string().max(120)).max(40),
    prov: v2ProvZ,
  })
  .strict();

const v2ProjectZ = z
  .object({
    title: z.string().max(200),
    description: z.string().max(4000),
    techStack: z.array(z.string().max(120)).max(40),
    startDate: v2YmZ,
    endDate: v2YmZ,
    link: z.string().max(500).nullable().optional(),
    prov: v2ProvZ,
  })
  .strict();

const v2EducationZ = z
  .object({
    degree: z.string().max(300),
    specialization: z.string().max(200).nullable(),
    university: z.string().max(300),
    startDate: v2YmZ,
    endDate: v2YmZ,
    year: v2YearZ,
    score: z.string().max(120).nullable(),
    location: z.string().max(200).nullable(),
    prov: v2ProvZ,
  })
  .strict();

const v2CoreZ = z
  .object({
    basicInfo: v2BasicInfoZ,
    skills: z.array(v2SkillZ).max(120),
    experience: z.array(v2ExperienceRowZ).max(40),
    projects: z.array(v2ProjectZ).max(60),
    education: z.array(v2EducationZ).max(20),
  })
  .strict();

const v2RichAchievementZ = z
  .object({
    title: z.string().max(200),
    description: z.string().max(4000).nullable(),
  })
  .strict();

const v2RichCertificationZ = z
  .object({
    name: z.string().max(300),
    issuer: z.string().max(200).nullable(),
    year: v2YearZ,
  })
  .strict();

const v2RichPublicationZ = z
  .object({
    title: z.string().max(400),
    venue: z.string().max(200).nullable(),
    year: v2YearZ,
    link: z.string().max(500).nullable(),
  })
  .strict();

const v2RichPatentZ = z
  .object({
    title: z.string().max(400),
    number: z.string().max(80).nullable(),
    year: v2YearZ,
  })
  .strict();

const v2RichProfileLinkZ = z
  .object({
    kind: z.enum(["github", "linkedin", "portfolio", "leetcode", "twitter", "other"]),
    url: z.string().max(500),
  })
  .strict();

const v2RichLeadershipZ = z
  .object({
    role: z.string().max(200),
    org: z.string().max(200).nullable(),
    description: z.string().max(2000).nullable(),
    startDate: v2YmZ,
    endDate: v2YmZ,
  })
  .strict();

const v2RichZ = z
  .object({
    achievements: z.array(v2RichAchievementZ).max(40).optional(),
    certifications: z.array(v2RichCertificationZ).max(40).optional(),
    publications: z.array(v2RichPublicationZ).max(20).optional(),
    patents: z.array(v2RichPatentZ).max(10).optional(),
    profiles: z.array(v2RichProfileLinkZ).max(20).optional(),
    leadership: z.array(v2RichLeadershipZ).max(20).optional(),
    languages: z.array(z.string().max(80)).max(20).optional(),
    awards: z.array(z.string().max(300)).max(20).optional(),
    summary: z.string().max(4000).optional(),
  })
  .strict();

export const v2ProfileTypeZ = z.enum([
  "fresher",
  "mid",
  "senior",
  "academic",
  "managerial",
  "unknown",
]);
export type V2ProfileType = z.infer<typeof v2ProfileTypeZ>;

export const strictResumeV2Z = z
  .object({
    schema: z.literal("strict_resume_v2"),
    profile_type: v2ProfileTypeZ,
    profile_type_confidence: z.number().min(0).max(1),
    core: v2CoreZ,
    rich: v2RichZ.optional(),
    warnings: z.array(z.string().max(200)).max(40),
  })
  .strict();

export type StrictResumeV2 = z.infer<typeof strictResumeV2Z>;

export function parseStrictResumeV2Json(
  raw: unknown,
):
  | { ok: true; data: StrictResumeV2 }
  | { ok: false; error: z.ZodError } {
  const r = strictResumeV2Z.safeParse(raw);
  if (r.success) return { ok: true, data: r.data };
  return { ok: false, error: r.error };
}

export const STRICT_RESUME_V2_SYSTEM_PROMPT = `You are a strict, section-aware resume parser.
Convert raw resume text into ONE adaptive JSON object that fits diverse resumes (fresher, mid, senior, academic, managerial).

OUTPUT CONTRACT (return ONLY this JSON, no extras, no markdown, no comments):
{
  "schema": "strict_resume_v2",
  "profile_type": "fresher" | "mid" | "senior" | "academic" | "managerial" | "unknown",
  "profile_type_confidence": number 0..1,
  "core": {
    "basicInfo": {
      "name":   { "value": string|null, "prov": { "source": SRC, "confidence": number 0..1 } },
      "email":  { "value": string|null, "prov": ... },
      "phone":  { "value": string|null, "prov": ... },
      "location"?: { "value": string|null, "prov": ... },
      "headline"?: { "value": string|null, "prov": ... }
    },
    "skills":     [{ "name": string, "prov": ... }],
    "experience": [{
      "company": string, "role": string, "location": string|null,
      "startDate": "YYYY-MM"|null, "endDate": "YYYY-MM"|null,
      "durationMonths": number|null, "bullets": string[], "techStack": string[],
      "prov": ...
    }],
    "projects": [{
      "title": string, "description": string, "techStack": string[],
      "startDate": "YYYY-MM"|null, "endDate": "YYYY-MM"|null,
      "link": string|null, "prov": ...
    }],
    "education": [{
      "degree": string, "specialization": string|null, "university": string,
      "startDate": "YYYY-MM"|null, "endDate": "YYYY-MM"|null,
      "year": number|null, "score": string|null, "location": string|null,
      "prov": ...
    }]
  },
  "rich"?: {
    "achievements"?:  [{ "title": string, "description": string|null }],
    "certifications"?:[{ "name": string, "issuer": string|null, "year": number|null }],
    "publications"?:  [{ "title": string, "venue": string|null, "year": number|null, "link": string|null }],
    "patents"?:       [{ "title": string, "number": string|null, "year": number|null }],
    "profiles"?:      [{ "kind": "github"|"linkedin"|"portfolio"|"leetcode"|"twitter"|"other", "url": string }],
    "leadership"?:    [{ "role": string, "org": string|null, "description": string|null, "startDate": "YYYY-MM"|null, "endDate": "YYYY-MM"|null }],
    "languages"?:     string[],
    "awards"?:        string[],
    "summary"?:       string
  },
  "warnings": string[]
}

SRC must be one of:
"rules" | "llm" | "hybrid" | "header" | "skills_section" | "experience_section" |
"projects_section" | "education_section" | "achievements_section" |
"certifications_section" | "publications_section" | "patents_section" |
"profiles_section" | "leadership_section" | "languages_section" | "awards_section" | "unknown"

RULES:
1. Detect sections first: HEADER (top contact), SKILLS, EXPERIENCE/INTERNSHIPS, PROJECTS, EDUCATION, ACHIEVEMENTS, CERTIFICATIONS, PUBLICATIONS, PATENTS, PROFILES/LINKS, LEADERSHIP, LANGUAGES, AWARDS, SUMMARY.
2. NEVER mix sections. ACHIEVEMENTS / CERTIFICATIONS / LEADERSHIP rows go in rich.*, NOT in core.projects or core.experience.
3. Section headers themselves are not content.
4. core.skills come ONLY from the SKILLS section. Lowercase tokens preferred. Keep canonical tech names where natural (e.g. node.js, react, mongodb, express). Deduplicate.
5. core.experience: company + role + dates. Internships count. If no work/intern evidence, return [].
6. core.projects: each project = first non-bullet line as title, then merge following lines into one description until next project title or section change. Bullet stars are not titles. Extract techStack tokens mentioned in that block. Pull dates if present (Jan 2025 - May 2025 -> startDate "2025-01", endDate "2025-05").
7. core.education: clean degree (e.g. "B.Tech"), specialization ("Computer Science"), university, year, startDate/endDate when shown, score (e.g. "7.47/10").
8. Phone: 10-15 digits after stripping +/spaces/dashes/parentheses; never use date ranges.
9. profile_type: fresher (no full-time work, only internships/student projects/recent grad), mid (1-5y), senior (5-12y), academic (publications/teaching dominant), managerial (leadership/PM/VP/Director). When unclear use "unknown".
10. Set per-field prov.source and prov.confidence (0..1). If a field is unknown, set value/null and source "unknown" with low confidence.
11. Do NOT hallucinate. Unknown -> null or [] or omit optional rich.* keys.
12. Output ONLY valid JSON. No markdown.`;
