import { normalizeSkill } from "@/lib/services/ats-v1-scoring";
import {
  hasEnoughPhoneDigits,
  isPlausibleResumeEmail,
  looksLikeYearOrDateRangeNotPhone,
  phoneToDigitsOnly,
  pickFirstValidResumeEmail,
  pickFirstValidResumePhone,
} from "@/lib/services/resume-structure/resume-contact-normalize";
import type { FieldConfidence } from "@/lib/services/resume-structure/resume-structure.schema";
import type { ResumeStructuredDocumentV1 } from "@/lib/services/resume-structure/resume-structure.schema";

/** Optional overrides merged onto rules `field_confidence` after LLM refine. */
export type FieldConfidenceOverride = NonNullable<
  ResumeStructuredDocumentV1["field_confidence"]
>;

const PROFILE_KEYS: readonly string[] = [
  "name",
  "email",
  "phone",
  "skills",
  "projects",
  "experience_years",
  "experience_details",
  "education",
  "certifications",
  "job_title",
  "location",
  "notice_period_days",
  "employment",
];

const HIGH_MIN = 0.8;
const MEDIUM_MIN = 0.5;

function numericToBand(n: number): FieldConfidence | undefined {
  if (!Number.isFinite(n)) return undefined;
  const x = Math.max(0, Math.min(1, n));
  if (x >= HIGH_MIN) return "high";
  if (x >= MEDIUM_MIN) return "medium";
  return "low";
}

function readFiniteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    const n = Number.parseFloat(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function readTrimmedString(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t || null;
}

function firstValidEmailFromList(v: unknown, max: number): string | null {
  if (!Array.isArray(v)) return null;
  const list: string[] = [];
  for (const item of v) {
    if (typeof item === "string" && item.trim()) list.push(item);
  }
  return pickFirstValidResumeEmail(list, max);
}

function firstValidPhoneFromList(v: unknown, max: number): string | null {
  if (!Array.isArray(v)) return null;
  const list: string[] = [];
  for (const item of v) {
    if (typeof item === "string" && item.trim()) list.push(item.trim().slice(0, max));
  }
  return pickFirstValidResumePhone(list);
}

const SKILL_SECTION_PREFIX_RES: RegExp[] = [
  /^languages\s*[–-]\s*/i,
  /^ml\/ai\s*tools\s*[–-]\s*/i,
  /^data\s*handling\s*[–-]\s*/i,
  /^web\s*&\s*apis\s*[–-]\s*/i,
  /^databases\s*[–-]\s*/i,
  /^frameworks\s*[–-]\s*/i,
  /^libraries\s*[–-]\s*/i,
  /^tools\s*[–-]\s*/i,
];

function stripSkillSectionPrefixes(s: string): string {
  let t = s.trim();
  let guard = 0;
  while (guard++ < 8) {
    let changed = false;
    for (const re of SKILL_SECTION_PREFIX_RES) {
      const next = t.replace(re, "").trim();
      if (next !== t) {
        t = next;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return t;
}

const MAX_SKILL_TOKEN_LEN = 120;
const MAX_SKILL_WORDS = 12;

function isNoisySkillCandidate(s: string): boolean {
  if (s.length > MAX_SKILL_TOKEN_LEN) return true;
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length > MAX_SKILL_WORDS) return true;
  return false;
}

/** Split on `,;|` only outside `(...)` so inner lists stay intact for parenthetical expansion. */
function splitSkillItemTopLevel(raw: string): string[] {
  const t = raw.trim();
  if (!t) return [];
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0 && /[,;|]/.test(c)) {
      const slice = t.slice(start, i).trim();
      if (slice) parts.push(slice);
      start = i + 1;
    }
  }
  const last = t.slice(start).trim();
  if (last) parts.push(last);
  return parts.length > 0 ? parts : [t];
}

/** "Python (Pandas, NumPy)" → ["Python", "Pandas", "NumPy"]. Single-level parentheses only. */
function expandParentheticalSkills(fragment: string): string[] {
  const t = fragment.trim();
  const m = /^(.+?)\s*\(([^)]+)\)\s*$/.exec(t);
  if (!m?.[1] || !m[2]) {
    return t ? [t] : [];
  }
  const head = m[1].trim();
  const inner = m[2]
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out = [head, ...inner].map((s) => s.trim()).filter(Boolean);
  return out.length > 0 ? out : [t];
}

/**
 * Keep only keys that belong on `ParsedCandidateProfile` so Zod `.strict()` accepts the payload
 * when the LLM adds extras like `confidence` or alias keys at top level.
 */
export function stripNonProfileKeysForZod(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of PROFILE_KEYS) {
    if (k in raw && raw[k] !== undefined) {
      out[k] = raw[k];
    }
  }
  return out;
}

function normalizeEducationToString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const t = readTrimmedString(v, 2000);
    if (!t || t.length < 3) return null;
    return t;
  }
  if (Array.isArray(v)) {
    const parts = v
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter((p) => p.length >= 3);
    if (parts.length === 0) return null;
    const joined = parts.join("; ").slice(0, 2000);
    return joined || null;
  }
  return null;
}

function normalizeSkillsList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of v) {
    if (typeof item !== "string") continue;
    for (const frag of splitSkillItemTopLevel(item)) {
      for (const piece of expandParentheticalSkills(frag)) {
        const stripped = stripSkillSectionPrefixes(piece);
        if (!stripped || isNoisySkillCandidate(stripped)) continue;
        const n = normalizeSkill(stripped);
        if (!n || seen.has(n)) continue;
        seen.add(n);
        out.push(n.slice(0, 120));
        if (out.length >= 80) return out;
      }
    }
  }
  return out;
}

function normalizeEmploymentRows(v: unknown): Array<{
  company: string | null;
  title: string | null;
  from: string | null;
  to: string | null;
  bullets: string[];
}> {
  if (!Array.isArray(v)) return [];
  const rows: Array<{
    company: string | null;
    title: string | null;
    from: string | null;
    to: string | null;
    bullets: string[];
  }> = [];
  for (const row of v) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const bulletsRaw = r.bullets;
    const bullets = Array.isArray(bulletsRaw)
      ? bulletsRaw
          .filter((b): b is string => typeof b === "string")
          .map((b) => b.trim().slice(0, 500))
          .filter(Boolean)
          .slice(0, 40)
      : [];
    rows.push({
      company: readTrimmedString(r.company, 200),
      title: readTrimmedString(r.title, 200),
      from: readTrimmedString(r.from, 40),
      to: readTrimmedString(r.to, 40),
      bullets,
    });
    if (rows.length >= 25) break;
  }
  return rows;
}

function stringArray(v: unknown, maxLen: number, maxItems: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== "string") continue;
    const t = item.trim();
    if (!t) continue;
    out.push(t.slice(0, maxLen));
    if (out.length >= maxItems) break;
  }
  return out;
}

/**
 * Map common external LLM shapes (aliases, education as array, etc.) into a plain object
 * suitable for `parsedCandidateProfileZ.safeParse`.
 */
export function coerceExternalLlmResumeProfile(
  raw: unknown,
): Record<string, unknown> {
  if (!raw || typeof raw !== "object") {
    return {
      name: null,
      email: null,
      phone: null,
      skills: [],
      projects: [],
      experience_years: null,
      experience_details: [],
      education: null,
      certifications: [],
      job_title: null,
      location: null,
      employment: [],
    };
  }
  const o = raw as Record<string, unknown>;

  const name =
    readTrimmedString(o.name, 200) ??
    readTrimmedString(o.full_name, 200) ??
    readTrimmedString(o.fullName, 200);

  const rawEmail = readTrimmedString(o.email, 255);
  const email =
    rawEmail && isPlausibleResumeEmail(rawEmail)
      ? rawEmail
      : firstValidEmailFromList(o.emails, 255);

  const rawPhone = readTrimmedString(o.phone, 60);
  let phone: string | null = null;
  if (
    rawPhone &&
    !looksLikeYearOrDateRangeNotPhone(rawPhone) &&
    hasEnoughPhoneDigits(rawPhone)
  ) {
    const d = phoneToDigitsOnly(rawPhone);
    phone = d.length >= 7 ? d.slice(0, 60) : null;
  }
  if (!phone) {
    phone = firstValidPhoneFromList(o.phones, 60);
  }

  const experience_years =
    readFiniteNumber(o.experience_years) ??
    readFiniteNumber(o.total_experience_years) ??
    readFiniteNumber(o.totalExperienceYears);

  const expCapped =
    experience_years != null
      ? Math.max(0, Math.min(80, experience_years))
      : null;

  const education =
    normalizeEducationToString(o.education) ??
    normalizeEducationToString(o.degrees);

  const skills = normalizeSkillsList(o.skills);
  const projects = stringArray(o.projects, 400, 40);
  const experience_details = stringArray(o.experience_details, 500, 60);
  const certifications = stringArray(o.certifications, 300, 40);
  const job_title =
    readTrimmedString(o.job_title, 200) ?? readTrimmedString(o.jobTitle, 200);
  const location = readTrimmedString(o.location, 200);

  let notice: number | null | undefined = undefined;
  const nNotice = readFiniteNumber(o.notice_period_days);
  if (nNotice != null) {
    notice = Math.trunc(Math.max(0, Math.min(365, nNotice)));
  }

  const employmentRows = normalizeEmploymentRows(o.employment);
  const employment = employmentRows.length > 0 ? employmentRows : [];

  const base: Record<string, unknown> = {
    name,
    email,
    phone,
    skills,
    projects,
    experience_years: expCapped,
    experience_details,
    education,
    certifications,
    job_title,
    location,
    employment,
  };
  if (notice !== undefined) {
    base.notice_period_days = notice;
  }
  return base;
}

function avgNumbers(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const s = values.reduce((a, b) => a + b, 0) / values.length;
  return s;
}

/**
 * Read `confidence` from LLM JSON (0–1 per field) and map to ATS `field_confidence` bands.
 * Supports keys like `full_name`, `emails`, `phones`, `experience`, `skills`, `education`, `employment`.
 */
export function extractNumericFieldConfidenceFromLlmJson(
  raw: unknown,
): FieldConfidenceOverride | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const c = o.confidence;
  if (!c || typeof c !== "object") return undefined;
  const conf = c as Record<string, unknown>;

  const contactScores: number[] = [];
  for (const k of ["full_name", "name", "emails", "email", "phones", "phone"]) {
    const n = readFiniteNumber(conf[k]);
    if (n != null) contactScores.push(n);
  }
  const contactAvg = avgNumbers(contactScores);
  const contactBand = contactAvg != null ? numericToBand(contactAvg) : undefined;

  const skillsN =
    readFiniteNumber(conf.skills) ??
    readFiniteNumber(conf.skill);
  const expN =
    readFiniteNumber(conf.experience) ??
    readFiniteNumber(conf.experience_years) ??
    readFiniteNumber(conf.total_experience_years);
  const eduN = readFiniteNumber(conf.education);
  const empN = readFiniteNumber(conf.employment);

  const out: FieldConfidenceOverride = {};
  if (contactBand) out.contact = contactBand;
  const sb = numericToBand(skillsN ?? NaN);
  if (sb) out.skills = sb;
  const eb = numericToBand(expN ?? NaN);
  if (eb) out.experience_years = eb;
  const db = numericToBand(eduN ?? NaN);
  if (db) out.education = db;
  const mb = numericToBand(empN ?? NaN);
  if (mb) out.employment = mb;

  return Object.keys(out).length > 0 ? out : undefined;
}
