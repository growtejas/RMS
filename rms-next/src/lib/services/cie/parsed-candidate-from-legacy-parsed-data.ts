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

function asString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function asStringArray(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of v) {
    if (typeof x !== "string") continue;
    const s = x.trim();
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Maps legacy `resume_parse_cache.parsedData` (fallback-local v2) into CIE `ParsedCandidate`.
 * Legacy parser does not emit employment rows; `experience` is empty.
 */
export function parsedCandidateFromLegacyParsedData(
  parsedData: Record<string, unknown>,
): ParsedCandidate {
  const fullName = asString(parsedData.full_name);
  const emails = asStringArray(parsedData.emails, 5);
  const phones = asStringArray(parsedData.phones, 5);
  const projectLines = asStringArray(parsedData.projects, 40);
  const skills = asStringArray(parsedData.skills, 80);
  const educationRaw = asString(parsedData.education_raw);

  const projects = projectLines.map((line) => {
    const title =
      line.length > 200 ? `${line.slice(0, 197).trim()}…` : line.trim() || "Project";
    return {
      title: title || "Project",
      description: line.trim(),
      techStack: [] as string[],
    };
  });

  const education = educationFromRaw(educationRaw);

  return {
    basicInfo: {
      name: fullName,
      email: emails[0] ?? null,
      phone: phones[0] ?? null,
    },
    skills,
    projects,
    experience: [],
    education,
  };
}

export type LegacyParsedDataHints = {
  experience_years: number | null;
  notice_period_days: number | null;
};

export function legacyParsedDataHints(
  parsedData: Record<string, unknown>,
): LegacyParsedDataHints {
  return {
    experience_years: asNumber(parsedData.experience_years),
    notice_period_days: asNumber(parsedData.notice_period_days),
  };
}

export function tryBuildParsedCandidateFromLegacyParsedData(
  parsedData: Record<string, unknown>,
):
  | { ok: true; data: ParsedCandidate; acceptance: ReturnType<typeof assertParseAcceptable> }
  | { ok: false; reason: "zod_reject" | ParseAcceptanceFailureReason } {
  const mapped = parsedCandidateFromLegacyParsedData(parsedData);
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
