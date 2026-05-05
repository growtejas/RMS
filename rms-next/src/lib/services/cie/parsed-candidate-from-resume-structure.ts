import type { ParsedCandidateProfile } from "@/lib/services/resume-structure/resume-structure.schema";
import type { ResumeStructuredDocumentV1 } from "@/lib/services/resume-structure/resume-structure.schema";
import { parseResumeStructuredDocument } from "@/lib/services/resume-structure/resume-structure.schema";
import {
  assertParseAcceptable,
  parsedCandidateZ,
  type ParsedCandidate,
  type ParseAcceptanceFailureReason,
} from "@/lib/services/cie/cie.schema";

function parseYearFromFragment(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null;
  const m = raw.match(/\b(19|20)\d{2}\b/);
  if (!m) return null;
  const y = Number.parseInt(m[0]!, 10);
  return Number.isFinite(y) ? y : null;
}

/** Best-effort years for one employment row from free-text dates. */
function employmentYearsEstimate(
  from: string | null,
  to: string | null,
  fallbackTotal: number | null,
  index: number,
  employmentCount: number,
): number | null {
  const yFrom = parseYearFromFragment(from);
  const yTo =
    to?.toLowerCase().includes("present") || to?.toLowerCase().includes("current")
      ? new Date().getFullYear()
      : parseYearFromFragment(to);
  if (yFrom != null && yTo != null && yTo >= yFrom) {
    const diff = yTo - yFrom;
    return Math.min(80, Math.max(0, diff));
  }
  if (
    fallbackTotal != null &&
    Number.isFinite(fallbackTotal) &&
    employmentCount > 0
  ) {
    const share = fallbackTotal / employmentCount;
    return Math.min(80, Math.round(share * 10) / 10);
  }
  return index === 0 ? fallbackTotal : null;
}

function educationFromRaw(raw: string | null | undefined): ParsedCandidate["education"] {
  const t = raw?.trim();
  if (!t) return [];
  return [
    {
      degree: t.length > 300 ? `${t.slice(0, 297)}…` : t,
      specialization: null,
      university: "—",
      year: parseYearFromFragment(t),
      score: null,
    },
  ];
}

/**
 * Maps ATS `ResumeStructuredDocumentV1` profile into CIE `ParsedCandidate`.
 * Does not persist; caller validates with Zod + assertParseAcceptable.
 */
export function parsedCandidateFromResumeStructuredDoc(
  doc: ResumeStructuredDocumentV1,
): ParsedCandidate {
  const p: ParsedCandidateProfile = doc.profile;
  const employment = p.employment ?? [];
  const expYears = p.experience_years;

  const experience = employment.map((row, idx) => ({
    company: (row.company ?? "—").trim() || "—",
    role: (row.title ?? "—").trim() || "—",
    years: employmentYearsEstimate(
      row.from,
      row.to,
      expYears,
      idx,
      employment.length || 1,
    ),
  }));

  const projects = (p.projects ?? []).map((line) => {
    const title =
      line.length > 200 ? `${line.slice(0, 197).trim()}…` : line.trim();
    return {
      title: title || "Project",
      description: line.trim(),
      techStack: [] as string[],
    };
  });

  const education =
    p.education?.trim().length ? educationFromRaw(p.education) : [];

  const out: ParsedCandidate = {
    basicInfo: {
      name: p.name ?? null,
      email: p.email ?? null,
      phone: p.phone ?? null,
    },
    skills: [...(p.skills ?? [])].map((s) => s.trim()).filter(Boolean),
    projects,
    experience,
    education,
  };

  return out;
}

export function tryBuildParsedCandidateFromStructuredUnknown(
  raw: unknown,
):
  | { ok: true; data: ParsedCandidate; acceptance: ReturnType<typeof assertParseAcceptable> }
  | { ok: false; reason: "invalid_document" | ParseAcceptanceFailureReason | "zod_reject" } {
  const docParsed = parseResumeStructuredDocument(raw);
  if (!docParsed.ok) {
    return { ok: false, reason: "invalid_document" };
  }
  const mapped = parsedCandidateFromResumeStructuredDoc(docParsed.data);
  const z = parsedCandidateZ.safeParse(mapped);
  if (!z.success) {
    return { ok: false, reason: "zod_reject" };
  }
  const acceptance = assertParseAcceptable(z.data);
  if (!acceptance.ok) {
    return { ok: false, reason: acceptance.reason };
  }
  return { ok: true, data: z.data, acceptance };
}