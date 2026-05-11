import { z } from "zod";

import {
  canonicalizeRoleName,
  resolveCieSuitableRoleMinConfidence,
} from "@/lib/services/cie/role-catalog";

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

/** Normalized suitable role stored on reports and returned by APIs. */
export const suitableRoleZ = z
  .object({
    roleId: z.string().min(1).max(80),
    displayName: z.string().min(1).max(200),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export type SuitableRole = z.infer<typeof suitableRoleZ>;

/** LLM / legacy storage: plain string, partial object, or full object. */
export const suitableRoleLlmItemZ = z.union([
  z.string().max(200),
  suitableRoleZ,
  z
    .object({
      displayName: z.string().min(1).max(200),
      confidence: z.number().min(0).max(1),
    })
    .strict(),
]);

export const candidateReportZ = z
  .object({
    summary: z.string().max(8000),
    strengths: z.array(z.string().max(500)).max(40),
    weaknesses: z.array(z.string().max(500)).max(40),
    primarySkills: z.array(z.string().max(120)).max(40),
    secondarySkills: z.array(z.string().max(120)).max(60),
    experienceLevel: z.enum(["Fresher", "Junior", "Mid", "Senior"]),
    suitableRoles: z.array(suitableRoleZ).max(30),
    educationInsights: educationInsightsZ,
    riskFlags: z.array(z.string().max(400)).max(30),
    confidenceScore: z.number().min(0).max(1),
  })
  .strict();

/** Accepts legacy strings and LLM partial rows before normalization. */
export const candidateReportLlmZ = candidateReportZ
  .omit({ suitableRoles: true })
  .extend({
    suitableRoles: z.array(suitableRoleLlmItemZ).max(30),
  })
  .strict();

export type CandidateReport = z.infer<typeof candidateReportZ>;
export type CandidateReportLlm = z.infer<typeof candidateReportLlmZ>;

/** Used when stored `report_json` fails Zod (corrupt / very old shape). */
export const CIE_REPORT_PARSE_FALLBACK: CandidateReport = candidateReportZ.parse({
  summary: "",
  strengths: [],
  weaknesses: [],
  primarySkills: [],
  secondarySkills: [],
  experienceLevel: "Fresher",
  suitableRoles: [],
  educationInsights: {
    relevance: "Low",
    notes: "Stored report could not be parsed.",
  },
  riskFlags: ["cie_report_parse_error"],
  confidenceScore: 0,
});

const roleIdLooksValid = (id: string) => /^[a-z0-9][a-z0-9_]{0,79}$/.test(id);

/**
 * Normalize mixed suitableRoles (strings, partial LLM objects, full objects) to canonical shape.
 */
export function normalizeSuitableRoles(
  input: unknown,
  opts?: { defaultStringConfidence?: number },
): SuitableRole[] {
  const minConf = resolveCieSuitableRoleMinConfidence();
  const defaultStrConf = opts?.defaultStringConfidence ?? 0.5;
  if (!Array.isArray(input)) return [];

  const byId = new Map<string, SuitableRole>();

  for (const raw of input) {
    if (typeof raw === "string") {
      const s = raw.trim();
      if (!s) continue;
      const { roleId, displayName, matched } = canonicalizeRoleName(s);
      void matched;
      const conf = Math.min(1, Math.max(0, defaultStrConf));
      if (conf < minConf) continue;
      mergeRole(byId, { roleId, displayName, confidence: conf });
      continue;
    }
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const o = raw as Record<string, unknown>;
      const confRaw = o.confidence;
      const conf =
        typeof confRaw === "number" && Number.isFinite(confRaw)
          ? Math.min(1, Math.max(0, confRaw))
          : 0.5;
      if (conf < minConf) continue;

      const dn =
        typeof o.displayName === "string" && o.displayName.trim()
          ? o.displayName.trim()
          : null;
      const rid =
        typeof o.roleId === "string" && o.roleId.trim() ? o.roleId.trim() : null;

      if (rid && dn && roleIdLooksValid(rid)) {
        mergeRole(byId, { roleId: rid, displayName: dn, confidence: conf });
        continue;
      }
      if (dn) {
        const c = canonicalizeRoleName(dn);
        mergeRole(byId, {
          roleId: c.roleId,
          displayName: c.displayName,
          confidence: conf,
        });
      }
    }
  }

  return Array.from(byId.values()).sort((a, b) => b.confidence - a.confidence);
}

function mergeRole(map: Map<string, SuitableRole>, next: SuitableRole) {
  const prev = map.get(next.roleId);
  if (!prev || next.confidence > prev.confidence) {
    map.set(next.roleId, next);
  }
}

export function finalizeCandidateReportLlm(data: CandidateReportLlm): CandidateReport {
  return candidateReportZ.parse({
    ...data,
    suitableRoles: normalizeSuitableRoles(data.suitableRoles as unknown[]),
  });
}

export type ParseAcceptanceFailureReason =
  | "empty_profile"
  | "missing_contact_and_identity"
  | "no_substance"
  | "section_leakage"
  | "fragmented_experience"
  | "fragmented_projects"
  | "low_prov_confidence";

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
  const r = candidateReportLlmZ.safeParse(raw);
  if (!r.success) return { ok: false, error: r.error };
  try {
    return { ok: true, data: finalizeCandidateReportLlm(r.data) };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e };
    throw e;
  }
}
