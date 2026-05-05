import { normalizeSkill } from "@/lib/services/ats-v1-scoring";
import {
  assertParseAcceptable,
  parsedCandidateZ,
  type ParseAcceptanceFailureReason,
  type ParsedCandidate,
} from "@/lib/services/cie/cie.schema";
import type {
  StrictResumeV2,
  V2ProfileType,
} from "@/lib/services/resume-structure/strict-resume-v2.schema";

function ymToMonthIndex(ym: string): number {
  const [y, m] = ym.split("-").map((x) => Number.parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return NaN;
  return y * 12 + (m - 1);
}

/** Decimal years from one v2 experience row (date math only, no guessing). */
export function v2ExperienceRowToYears(
  row: StrictResumeV2["core"]["experience"][number],
): number | null {
  if (row.durationMonths != null && Number.isFinite(row.durationMonths)) {
    const y = row.durationMonths / 12;
    return Math.round(Math.min(80, Math.max(0, y)) * 10) / 10;
  }
  if (!row.startDate || !row.endDate) return null;
  const a = ymToMonthIndex(row.startDate);
  const b = ymToMonthIndex(row.endDate);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  const months = b - a + 1;
  return Math.round(Math.min(80, Math.max(0, months / 12)) * 10) / 10;
}

/**
 * Drop provenance / rich blocks and project v2 onto the stable CIE `ParsedCandidate` shape.
 * Used so the API can offer parity preview without changing CIE behavior.
 */
export function v2ToParsedCandidate(
  doc: StrictResumeV2,
):
  | { ok: true; data: ParsedCandidate }
  | { ok: false; reason: "zod_reject" | ParseAcceptanceFailureReason } {
  const skills = Array.from(
    new Set(
      doc.core.skills
        .map((s) => normalizeSkill(String(s.name)))
        .filter(Boolean),
    ),
  ).slice(0, 80);

  const experience = doc.core.experience.slice(0, 25).map((row) => ({
    company: row.company.trim() || "—",
    role: row.role.trim() || "—",
    years: v2ExperienceRowToYears(row),
  }));

  const projects = doc.core.projects.slice(0, 40).map((p) => ({
    title: p.title.trim() || "Project",
    description: p.description.trim().slice(0, 4000),
    techStack: p.techStack.map((t) => t.trim()).filter(Boolean).slice(0, 40),
  }));

  const education = doc.core.education.slice(0, 15).map((ed) => ({
    degree: ed.degree.trim().slice(0, 300) || "—",
    specialization: ed.specialization?.trim().slice(0, 200) || null,
    university: ed.university.trim().slice(0, 300) || "—",
    year: ed.year,
    score: ed.score?.trim().slice(0, 120) || null,
  }));

  const out: ParsedCandidate = {
    basicInfo: {
      name: doc.core.basicInfo.name.value?.trim().slice(0, 200) ?? null,
      email: doc.core.basicInfo.email.value?.trim().slice(0, 255) ?? null,
      phone: doc.core.basicInfo.phone.value?.trim().slice(0, 60) ?? null,
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

export interface V2CoreSummary {
  profile_type: V2ProfileType;
  profile_type_confidence: number;
  counts: {
    skills: number;
    experience: number;
    projects: number;
    education: number;
    achievements: number;
    certifications: number;
    publications: number;
    patents: number;
    profiles: number;
    leadership: number;
    languages: number;
    awards: number;
  };
  total_experience_years: number | null;
  warnings: string[];
}

export interface V2ProcessorPayload {
  schema: "candidate_processor_v1";
  candidate_id: number;
  requisition_id: number | null;
  organization_id: number | null;
  generated_at: string;
  profile: {
    type: V2ProfileType;
    type_confidence: number;
    total_experience_years: number | null;
  };
  contact: {
    name: string | null;
    email: string | null;
    phone: string | null;
    location: string | null;
  };
  skills: string[];
  experience: Array<{
    company: string;
    role: string;
    start_date: string | null;
    end_date: string | null;
    duration_months: number | null;
    highlights: string[];
    tech_stack: string[];
    confidence: number;
  }>;
  projects: Array<{
    title: string;
    description: string;
    tech_stack: string[];
    start_date: string | null;
    end_date: string | null;
    confidence: number;
  }>;
  education: Array<{
    degree: string;
    specialization: string | null;
    university: string;
    year: number | null;
    score: string | null;
    confidence: number;
  }>;
  extras: {
    achievements: Array<{ title: string; description: string | null }>;
    profiles: Array<{ kind: string; url: string }>;
  };
  quality: {
    warnings: string[];
    source: "parsed_candidate_v2";
  };
}

/** Lightweight summary for UI/debug headers (counts + classifier). */
export function v2CoreSummary(doc: StrictResumeV2): V2CoreSummary {
  const expYears = (() => {
    const parts: number[] = [];
    for (const row of doc.core.experience) {
      const y = v2ExperienceRowToYears(row);
      if (y != null) parts.push(y);
    }
    if (parts.length === 0) return null;
    const sum = parts.reduce((a, b) => a + b, 0);
    return Math.round(Math.min(80, sum) * 10) / 10;
  })();

  return {
    profile_type: doc.profile_type,
    profile_type_confidence: doc.profile_type_confidence,
    counts: {
      skills: doc.core.skills.length,
      experience: doc.core.experience.length,
      projects: doc.core.projects.length,
      education: doc.core.education.length,
      achievements: doc.rich?.achievements?.length ?? 0,
      certifications: doc.rich?.certifications?.length ?? 0,
      publications: doc.rich?.publications?.length ?? 0,
      patents: doc.rich?.patents?.length ?? 0,
      profiles: doc.rich?.profiles?.length ?? 0,
      leadership: doc.rich?.leadership?.length ?? 0,
      languages: doc.rich?.languages?.length ?? 0,
      awards: doc.rich?.awards?.length ?? 0,
    },
    total_experience_years: expYears,
    warnings: doc.warnings.slice(0, 10),
  };
}

/** Stable, minimized contract for downstream ATS/CIE-style processors. */
export function v2ToProcessorPayload(input: {
  doc: StrictResumeV2;
  candidateId: number;
  requisitionId?: number | null;
  organizationId?: number | null;
  generatedAt?: Date;
}): V2ProcessorPayload {
  const { doc } = input;
  const summary = v2CoreSummary(doc);
  return {
    schema: "candidate_processor_v1",
    candidate_id: input.candidateId,
    requisition_id: input.requisitionId ?? null,
    organization_id: input.organizationId ?? null,
    generated_at: (input.generatedAt ?? new Date()).toISOString(),
    profile: {
      type: doc.profile_type,
      type_confidence: doc.profile_type_confidence,
      total_experience_years: summary.total_experience_years,
    },
    contact: {
      name: doc.core.basicInfo.name.value ?? null,
      email: doc.core.basicInfo.email.value ?? null,
      phone: doc.core.basicInfo.phone.value ?? null,
      location: doc.core.basicInfo.location?.value ?? null,
    },
    skills: doc.core.skills.map((s) => s.name.trim()).filter(Boolean),
    experience: doc.core.experience.map((e) => ({
      company: e.company,
      role: e.role,
      start_date: e.startDate,
      end_date: e.endDate,
      duration_months: e.durationMonths,
      highlights: e.bullets.slice(0, 20),
      tech_stack: e.techStack.slice(0, 30),
      confidence: e.prov.confidence,
    })),
    projects: doc.core.projects.map((p) => ({
      title: p.title,
      description: p.description,
      tech_stack: p.techStack.slice(0, 30),
      start_date: p.startDate,
      end_date: p.endDate,
      confidence: p.prov.confidence,
    })),
    education: doc.core.education.map((e) => ({
      degree: e.degree,
      specialization: e.specialization,
      university: e.university,
      year: e.year,
      score: e.score,
      confidence: e.prov.confidence,
    })),
    extras: {
      achievements: doc.rich?.achievements?.slice(0, 20) ?? [],
      profiles: (doc.rich?.profiles ?? []).map((p) => ({ kind: p.kind, url: p.url })),
    },
    quality: {
      warnings: doc.warnings.slice(0, 20),
      source: "parsed_candidate_v2",
    },
  };
}
