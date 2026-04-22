import {
  isPlausibleResumeEmail,
  pickFirstValidResumeEmail,
  pickFirstValidResumePhone,
} from "@/lib/services/resume-structure/resume-contact-normalize";
import type { ParsedCandidateProfile } from "@/lib/services/resume-structure/resume-structure.schema";
import type { FieldConfidence } from "@/lib/services/resume-structure/resume-structure.schema";

export type RulesExtractResult = {
  profile: ParsedCandidateProfile;
  field_confidence: {
    skills?: FieldConfidence;
    experience_years?: FieldConfidence;
    education?: FieldConfidence;
    employment?: FieldConfidence;
    contact?: FieldConfidence;
  };
  confidence_overall: number;
  warnings: string[];
  /** True when LLM refinement may help (short text, weak sections, etc.). */
  suggest_llm_refinement: boolean;
};

const KNOWN_TECH = [
  "javascript",
  "typescript",
  "react",
  "node.js",
  "node",
  "next.js",
  "python",
  "java",
  "kotlin",
  "go",
  "rust",
  "c#",
  "sql",
  "postgresql",
  "mysql",
  "mongodb",
  "redis",
  "aws",
  "gcp",
  "azure",
  "docker",
  "kubernetes",
  "terraform",
  "graphql",
  "html",
  "css",
  "tailwind",
  "spring",
  "django",
  "fastapi",
  "flask",
  "angular",
  "vue",
  "svelte",
  "express",
  "nestjs",
  "kafka",
  "rabbitmq",
  "elasticsearch",
  "spark",
  "pandas",
  "numpy",
  "tensorflow",
  "pytorch",
  "linux",
  "git",
  "jenkins",
  "ci/cd",
  "agile",
  "scrum",
];

const TITLE_HINTS =
  /\b(engineer|developer|architect|manager|lead|consultant|analyst|scientist|designer|specialist|director|head|vp|intern|associate)\b/i;

/** Substrings that suggest a line is a title/skill line, not a person name. */
const NAME_LINE_BLACKLIST = [
  "developer",
  "engineer",
  "stack",
  "react",
  "node",
  "javascript",
  "typescript",
  "python",
  "java",
  "software",
  "frontend",
  "front-end",
  "backend",
  "back-end",
  "devops",
  "fullstack",
  "full-stack",
  "architect",
  "consultant",
  "analyst",
];

const CERT_PATTERNS = [
  /\baws\s+certified\b[^.\n]{0,80}/gi,
  /\b(?:pmp|capm)\b[^.\n]{0,40}/gi,
  /\b(?:scrum\s+master|psm\s*i{0,3}|csm)\b[^.\n]{0,40}/gi,
  /\bcissp\b[^.\n]{0,40}/gi,
  /\bgoogle\s+(?:cloud|professional)[^.\n]{0,60}/gi,
  /\bazure\s+(?:certified|fundamentals)[^.\n]{0,60}/gi,
];

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function extractEmails(text: string): string[] {
  const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g) ?? [];
  return Array.from(new Set(matches.map((m) => m.toLowerCase()))).slice(0, 5);
}

function extractPhones(text: string): string[] {
  const matches = text.match(/(?:\+?\d[\d\s().-]{8,}\d)/g) ?? [];
  return Array.from(new Set(matches.map((m) => m.replace(/\s+/g, " ").trim()))).slice(0, 5);
}

function extractYearsFromPhrases(text: string): number | null {
  const lower = text.toLowerCase();
  const matches = lower.match(/(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:years|yrs)\b/g) ?? [];
  const nums = matches
    .map((m) => Number.parseFloat(m.replace(/[^0-9.]/g, "")))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 80);
  if (nums.length === 0) return null;
  return clamp(Math.max(...nums), 0, 80);
}

function extractNoticeDays(text: string): number | null {
  const lower = text.toLowerCase();
  const noticeLine =
    lower.match(/notice\s*period[^0-9]{0,20}(\d{1,3})\s*(days|day|weeks|week|months|month)\b/) ??
    lower.match(/(\d{1,3})\s*(days|day|weeks|week|months|month)\s*notice\b/);
  if (!noticeLine) return null;
  const n = Number.parseInt(noticeLine[1] ?? "", 10);
  const unit = (noticeLine[2] ?? "").toLowerCase();
  if (!Number.isFinite(n) || n < 0) return null;
  if (unit.startsWith("day")) return clamp(n, 0, 365);
  if (unit.startsWith("week")) return clamp(n * 7, 0, 365);
  if (unit.startsWith("month")) return clamp(n * 30, 0, 365);
  return null;
}

function extractSkillsFromTechList(text: string): string[] {
  const lower = text.toLowerCase();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const skill of KNOWN_TECH) {
    if (lower.includes(skill) && !seen.has(skill)) {
      seen.add(skill);
      out.push(skill);
    }
  }
  return out.slice(0, 40);
}

function extractEducationSnippet(text: string): string | null {
  const lower = text.toLowerCase();
  const patterns = [
    /\b(b\.?tech|btech|be|b\.?e)\b[^\n]{0,100}/i,
    /\b(m\.?tech|mtech|me|m\.?e)\b[^\n]{0,100}/i,
    /\b(mca|bca)\b[^\n]{0,100}/i,
    /\b(bachelor(?:'s)?|master(?:'s)?)\b[^\n]{0,100}/i,
    /\b(b\.?sc|m\.?sc|bsc|msc)\b[^\n]{0,100}/i,
    /\b(mba|ph\.?d|phd)\b[^\n]{0,100}/i,
  ];
  for (const re of patterns) {
    const m = lower.match(re);
    if (m && m[0]) {
      return m[0].trim().slice(0, 500);
    }
  }
  return null;
}

type Section =
  | "header"
  | "skills"
  | "experience"
  | "education"
  | "projects"
  | "certifications"
  | "other";

function detectSectionLine(line: string): Section | null {
  const t = line.trim();
  if (!t) return null;
  const u = t.toUpperCase();
  if (/^(SKILLS|TECHNICAL SKILLS|CORE COMPETENCIES|KEY SKILLS|TECHNOLOGIES)\b/.test(u)) {
    return "skills";
  }
  if (/^(EXPERIENCE|WORK EXPERIENCE|EMPLOYMENT|PROFESSIONAL EXPERIENCE|WORK HISTORY)\b/.test(u)) {
    return "experience";
  }
  if (/^(EDUCATION|ACADEMIC)\b/.test(u)) {
    return "education";
  }
  if (/^(PROJECTS|PERSONAL PROJECTS|KEY PROJECTS)\b/.test(u)) {
    return "projects";
  }
  if (/^(CERTIFICATIONS|CERTIFICATES|LICENSES)\b/.test(u)) {
    return "certifications";
  }
  return null;
}

function isBulletLine(line: string): boolean {
  const t = line.trim();
  return /^[-•*▪·]/.test(t) || /^\d+[.)]\s/.test(t);
}

function stripBullet(line: string): string {
  return line
    .replace(/^[-•*▪·]\s*/, "")
    .replace(/^\d+[.)]\s*/, "")
    .trim();
}

/** Rough year token for employment blocks. */
function parseYearHints(line: string): { from: string | null; to: string | null } {
  const m =
    line.match(
      /(\b(?:19|20)\d{2}\b)\s*[-–—]\s*(\b(?:19|20)\d{2}\b|present|current|now)\b/i,
    ) ?? line.match(/(\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/i);
  if (!m) {
    return { from: null, to: null };
  }
  if (m[1] && m[2]) {
    const to =
      /present|current|now/i.test(m[2]) ? "Present" : m[2].replace(/\s+/g, " ").trim().slice(0, 40);
    return { from: m[1].slice(0, 40), to };
  }
  return { from: m[0]?.slice(0, 40) ?? null, to: null };
}

function extractCertifications(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const re of CERT_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    const r = new RegExp(re.source, re.flags);
    while ((m = r.exec(text)) !== null) {
      const s = m[0].replace(/\s+/g, " ").trim().slice(0, 280);
      if (s.length > 5 && !seen.has(s.toLowerCase())) {
        seen.add(s.toLowerCase());
        out.push(s);
      }
      if (out.length >= 25) break;
    }
  }
  return out.slice(0, 40);
}

function extractLocationHeader(lines: string[]): string | null {
  for (let i = 0; i < Math.min(18, lines.length); i++) {
    const line = lines[i]?.trim() ?? "";
    if (/^[A-Z][a-zA-Z\s]+,\s*[A-Z]{2}\b/.test(line) && line.length < 80) {
      return line.slice(0, 200);
    }
    if (/^remote\b/i.test(line) && line.length < 60) {
      return line.slice(0, 200);
    }
  }
  return null;
}

function lineLooksLikePersonName(line: string): boolean {
  const clean = line.trim();
  if (clean.length < 2 || clean.length >= 80) return false;
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return false;
  const low = clean.toLowerCase();
  if (NAME_LINE_BLACKLIST.some((k) => low.includes(k))) return false;
  return true;
}

function headerNameAndTitle(lines: string[]): { name: string | null; title: string | null } {
  const nonEmpty = lines.map((l) => l.trim()).filter(Boolean);
  const headerWindow = nonEmpty.slice(0, 5);
  let name: string | null = null;
  let nameIdx = -1;
  for (let i = 0; i < headerWindow.length; i++) {
    const line = headerWindow[i];
    if (/@/.test(line) || /\d{3}[-.\s]\d{3}/.test(line)) {
      continue;
    }
    if (!name && lineLooksLikePersonName(line) && !TITLE_HINTS.test(line)) {
      name = line.slice(0, 200);
      nameIdx = i;
      break;
    }
  }
  let title: string | null = null;
  const start = nameIdx >= 0 ? nameIdx + 1 : 0;
  for (let i = start; i < Math.min(12, nonEmpty.length); i++) {
    const line = nonEmpty[i];
    if (/@/.test(line)) continue;
    if (TITLE_HINTS.test(line) && line.length < 120) {
      title = line.slice(0, 200);
      break;
    }
  }
  return { name, title };
}

export function resolveResumeStructureMaxTextChars(): number {
  const raw = process.env.RESUME_STRUCTURE_MAX_TEXT_CHARS?.trim();
  if (!raw) return 14_000;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1000) return 14_000;
  return Math.min(n, 100_000);
}

/**
 * Deterministic structured extraction from resume plain text (no network).
 */
export function extractRulesStructuredResume(
  rawText: string,
  context?: { fallbackName?: string | null; fallbackEmail?: string | null },
): RulesExtractResult {
  const warnings: string[] = [];
  const maxChars = resolveResumeStructureMaxTextChars();
  const text = rawText.slice(0, maxChars);
  if (rawText.length > maxChars) {
    warnings.push("TEXT_TRUNCATED");
  }
  if (!text.trim()) {
    return {
      profile: {
        name: context?.fallbackName?.trim() || null,
        email: context?.fallbackEmail?.trim() || null,
        phone: null,
        skills: [],
        projects: [],
        experience_years: null,
        experience_details: [],
        education: null,
        certifications: [],
        job_title: null,
        location: null,
        notice_period_days: null,
        employment: [],
      },
      field_confidence: {},
      confidence_overall: 0,
      warnings: [...warnings, "EMPTY_TEXT"],
      suggest_llm_refinement: false,
    };
  }

  const lines = text.split(/\r?\n/).map((l) => l.trimEnd());
  const lowerFull = text.toLowerCase();

  let section: Section = "header";
  const skillLines: string[] = [];
  const expLines: string[] = [];
  const eduLines: string[] = [];
  const projectLines: string[] = [];
  const certSectionLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const next = detectSectionLine(trimmed);
    if (next) {
      section = next;
      continue;
    }
    if (section === "skills" && (isBulletLine(trimmed) || trimmed.length < 120)) {
      const s = stripBullet(trimmed);
      if (s) skillLines.push(s.slice(0, 200));
    } else if (section === "experience") {
      expLines.push(trimmed.slice(0, 500));
    } else if (section === "education") {
      eduLines.push(trimmed.slice(0, 500));
    } else if (section === "projects") {
      const s = isBulletLine(trimmed) ? stripBullet(trimmed) : trimmed;
      if (s) projectLines.push(s.slice(0, 400));
    } else if (section === "certifications") {
      certSectionLines.push(trimmed.slice(0, 300));
    }
  }

  const emails = extractEmails(text);
  const phones = extractPhones(text);
  const { name: hdrName, title: hdrTitle } = headerNameAndTitle(lines);
  const location = extractLocationHeader(lines);

  const fbEmail = context?.fallbackEmail?.trim() ?? "";
  const email = fbEmail && isPlausibleResumeEmail(fbEmail)
    ? fbEmail.slice(0, 255)
    : pickFirstValidResumeEmail(emails, 255);
  const phone = pickFirstValidResumePhone(phones);
  const fbName = context?.fallbackName?.trim() ?? "";
  const name = fbName
    ? fbName.slice(0, 200)
    : hdrName
      ? hdrName.slice(0, 200)
      : null;

  const techSkills = extractSkillsFromTechList(text);
  const sectionSkills = skillLines
    .flatMap((l) =>
      l
        .split(/[,|;]/)
        .map((x) => x.trim())
        .filter(Boolean),
    )
    .slice(0, 60);
  const skills = Array.from(new Set([...sectionSkills, ...techSkills].map((s) => s.toLowerCase()))).slice(
    0,
    80,
  );

  const yearsPhrase = extractYearsFromPhrases(text);
  let experience_years = yearsPhrase;
  const experience_details = expLines.slice(0, 60);

  /** Employment blocks: group consecutive experience lines into rough entries. */
  const employment: ParsedCandidateProfile["employment"] = [];
  let current: ParsedCandidateProfile["employment"][0] | null = null;
  for (const el of expLines) {
    const y = parseYearHints(el);
    if (y.from || (el.length < 120 && !isBulletLine(el))) {
      if (current) {
        employment.push(current);
      }
      current = {
        company: null,
        title: el.replace(/\s*[-–—]\s*\d{4}.*$/i, "").trim().slice(0, 200) || null,
        from: y.from,
        to: y.to,
        bullets: [],
      };
    } else if (current && isBulletLine(el)) {
      current.bullets.push(stripBullet(el).slice(0, 500));
    }
  }
  if (current) {
    employment.push(current);
  }

  if (employment.length > 0 && experience_years == null) {
    const flatYears: number[] = [];
    for (const e of employment) {
      const fy = e.from ? Number.parseInt(e.from.replace(/\D/g, "").slice(0, 4), 10) : NaN;
      if (Number.isFinite(fy) && fy >= 1970 && fy <= 2100) {
        flatYears.push(fy);
      }
    }
    if (flatYears.length >= 1) {
      const minY = Math.min(...flatYears);
      const maxY = Math.max(...flatYears);
      const approx = Math.max(1, maxY - minY + 1);
      experience_years = clamp(approx, 0, 80);
      warnings.push("EXPERIENCE_YEARS_FROM_SPAN");
    }
  }

  if (experience_years == null && /\bintern(ship)?\b/i.test(text)) {
    experience_years = 0.5;
    warnings.push("EXPERIENCE_INFERRED_HEURISTIC");
  }

  const education =
    eduLines.length > 0 ? eduLines.join(" | ").slice(0, 2000) : extractEducationSnippet(text);

  const certs = [
    ...certSectionLines,
    ...extractCertifications(text),
  ];
  const certifications = Array.from(new Set(certs.map((c) => c.replace(/\s+/g, " ").trim()))).slice(
    0,
    40,
  );

  const projects = projectLines.slice(0, 40);

  if (!lowerFull.includes("experience") && expLines.length < 2) {
    warnings.push("WEAK_EXPERIENCE_SECTION");
  }
  if (skills.length < 3 && techSkills.length < 2) {
    warnings.push("SPARSE_SKILLS");
  }

  const noticeDays = extractNoticeDays(text);
  if (noticeDays != null) {
    warnings.push("NOTICE_EXTRACTED_INLINE");
  }
  const notice_period_days = noticeDays ?? undefined;

  const field_confidence: RulesExtractResult["field_confidence"] = {
    contact:
      email || phone
        ? "high"
        : emails.length === 0 && phones.length === 0
          ? "low"
          : "medium",
    skills: skills.length >= 8 ? "high" : skills.length >= 3 ? "medium" : "low",
    experience_years:
      experience_years != null && !warnings.includes("EXPERIENCE_YEARS_FROM_SPAN")
        ? "medium"
        : experience_years != null
          ? "low"
          : "low",
    education: education ? "high" : "low",
    employment: employment.length >= 2 ? "medium" : employment.length === 1 ? "low" : "low",
  };

  if (field_confidence.skills === "low" && skills.length < 5) {
    warnings.push("LOW_CONFIDENCE_SKILLS");
  }

  let overall =
    (field_confidence.skills === "high" ? 0.35 : field_confidence.skills === "medium" ? 0.22 : 0.12) +
    (field_confidence.experience_years === "high"
      ? 0.3
      : field_confidence.experience_years === "medium"
        ? 0.22
        : 0.1) +
    (field_confidence.education === "medium" || field_confidence.education === "high" ? 0.15 : 0.05) +
    (employment.length > 0 ? 0.15 : 0.05) +
    (field_confidence.contact === "high" ? 0.05 : 0.02);
  overall = clamp(overall, 0, 1);

  const suggest_llm_refinement =
    overall < 0.45 ||
    warnings.includes("WEAK_EXPERIENCE_SECTION") ||
    warnings.includes("SPARSE_SKILLS") ||
    text.length < 800;

  const profile: ParsedCandidateProfile = {
    name,
    email: email ? email.slice(0, 255) : null,
    phone,
    skills,
    projects,
    experience_years,
    experience_details,
    education: education ? education.slice(0, 2000) : null,
    certifications,
    job_title: hdrTitle,
    location,
    ...(notice_period_days !== undefined ? { notice_period_days } : {}),
    employment: employment.slice(0, 25),
  };

  return {
    profile,
    field_confidence,
    confidence_overall: overall,
    warnings,
    suggest_llm_refinement,
  };
}
