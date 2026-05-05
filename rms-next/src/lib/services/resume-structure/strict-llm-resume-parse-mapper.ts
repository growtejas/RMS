import { normalizeSkill } from "@/lib/services/ats-v1-scoring";
import {
  assertParseAcceptable,
  parsedCandidateZ,
  type ParseAcceptanceFailureReason,
  type ParsedCandidate,
} from "@/lib/services/cie/cie.schema";
import type { ParsedCandidateProfile } from "@/lib/services/resume-structure/resume-structure.schema";
import type { StrictLlmResumeParse } from "@/lib/services/resume-structure/strict-llm-resume-parse.schema";

function ymToMonthIndex(ym: string): number {
  const [y, m] = ym.split("-").map((x) => Number.parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return NaN;
  return y * 12 + (m - 1);
}

/** Derive decimal years for one role; no guessing beyond date math. */
export function strictExperienceRowToYears(row: StrictLlmResumeParse["experience"][0]): number | null {
  if (row.durationMonths != null && Number.isFinite(row.durationMonths)) {
    const y = row.durationMonths / 12;
    return Math.round(Math.min(80, Math.max(0, y)) * 10) / 10;
  }
  const s = row.startDate;
  const e = row.endDate;
  if (!s || !e) return null;
  const a = ymToMonthIndex(s);
  const b = ymToMonthIndex(e);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  const months = b - a + 1;
  const y = months / 12;
  return Math.round(Math.min(80, Math.max(0, y)) * 10) / 10;
}

/** Total professional years estimate: sum per-role years when computable, else null. */
function strictTotalExperienceYears(exp: StrictLlmResumeParse["experience"]): number | null {
  const parts: number[] = [];
  for (const row of exp) {
    const y = strictExperienceRowToYears(row);
    if (y != null) parts.push(y);
  }
  if (parts.length === 0) return null;
  const sum = parts.reduce((a, b) => a + b, 0);
  return Math.round(Math.min(80, sum) * 10) / 10;
}

export function strictLlmParseToParsedCandidate(
  parsed: StrictLlmResumeParse,
):
  | { ok: true; data: ParsedCandidate }
  | { ok: false; reason: "zod_reject" | ParseAcceptanceFailureReason } {
  const skills = Array.from(
    new Set(
      parsed.skills
        .map((s) => normalizeSkill(String(s)))
        .filter(Boolean),
    ),
  ).slice(0, 80);

  const experience = parsed.experience.map((row) => ({
    company: row.company.trim() || "—",
    role: row.role.trim() || "—",
    years: strictExperienceRowToYears(row),
  }));

  const projects = parsed.projects.map((p) => ({
    title: p.title.trim() || "Project",
    description: p.description.trim().slice(0, 4000),
    techStack: p.techStack.map((t) => t.trim()).filter(Boolean).slice(0, 40),
  }));

  const education = parsed.education.map((ed) => ({
    degree: ed.degree.trim().slice(0, 300) || "—",
    specialization: ed.specialization?.trim().slice(0, 200) ?? null,
    university: ed.university.trim().slice(0, 300) || "—",
    year: ed.year,
    score: null as string | null,
  }));

  const out: ParsedCandidate = {
    basicInfo: {
      name: parsed.basicInfo.name?.trim().slice(0, 200) ?? null,
      email: parsed.basicInfo.email?.trim().slice(0, 255) ?? null,
      phone: parsed.basicInfo.phone?.trim().slice(0, 60) ?? null,
    },
    skills,
    projects,
    experience,
    education,
  };

  const z = parsedCandidateZ.safeParse(out);
  if (!z.success) {
    return { ok: false, reason: "zod_reject" };
  }
  const acc = assertParseAcceptable(z.data);
  if (!acc.ok) {
    return { ok: false, reason: acc.reason };
  }
  return { ok: true, data: z.data };
}

function projectToProfileLine(p: StrictLlmResumeParse["projects"][0]): string {
  const title = p.title.trim() || "Project";
  const desc = p.description.trim();
  const tech = p.techStack.filter(Boolean);
  const techPart = tech.length ? ` (tech: ${tech.slice(0, 15).join(", ")})` : "";
  const line = desc ? `${title} — ${desc}${techPart}` : `${title}${techPart}`;
  return line.length > 400 ? `${line.slice(0, 397)}…` : line;
}

function educationToProfileString(edu: StrictLlmResumeParse["education"]): string | null {
  if (edu.length === 0) return null;
  const lines = edu.map((e) => {
    const y = e.year != null ? ` (${e.year})` : "";
    const spec = e.specialization?.trim() ? `, ${e.specialization.trim()}` : "";
    return `${e.degree.trim()}${spec} — ${e.university.trim()}${y}`;
  });
  const joined = lines.join("\n");
  return joined.length > 2000 ? `${joined.slice(0, 1997)}…` : joined;
}

/**
 * Maps strict LLM JSON into stored `ParsedCandidateProfile` (v1) for resume_structured_profile.
 */
export function strictLlmParseToParsedCandidateProfile(
  parsed: StrictLlmResumeParse,
  draft: ParsedCandidateProfile,
): ParsedCandidateProfile {
  const employment = parsed.experience.map((row) => ({
    company: row.company.trim() || null,
    title: row.role.trim() || null,
    from: row.startDate,
    to: row.endDate,
    bullets: [] as string[],
  }));

  const projectLines = parsed.projects.map((p) => projectToProfileLine(p)).slice(0, 40);

  const normalizedSkills = Array.from(
    new Set(parsed.skills.map((s) => normalizeSkill(String(s))).filter(Boolean)),
  ).slice(0, 80);

  return {
    name: parsed.basicInfo.name?.trim() || draft.name,
    email: parsed.basicInfo.email?.trim() || draft.email,
    phone: parsed.basicInfo.phone?.trim() || draft.phone,
    skills: normalizedSkills.length > 0 ? normalizedSkills : draft.skills,
    projects: projectLines.length > 0 ? projectLines : draft.projects,
    experience_years: strictTotalExperienceYears(parsed.experience) ?? draft.experience_years,
    experience_details:
      parsed.experience.length > 0
        ? parsed.experience
            .map((r) => {
              const role = r.role.trim();
              const co = r.company.trim();
              return role && co ? `${role} — ${co}` : role || co || "";
            })
            .filter(Boolean)
            .slice(0, 60)
        : draft.experience_details,
    education: educationToProfileString(parsed.education) ?? draft.education,
    certifications: draft.certifications,
    job_title:
      parsed.experience[0]?.role?.trim() ||
      draft.job_title,
    location: draft.location,
    notice_period_days: draft.notice_period_days ?? null,
    employment: employment.length > 0 ? employment : draft.employment,
  };
}
