import type { ParsedCandidate } from "@/lib/services/cie/cie.schema";
import type { StrictResumeV2 } from "@/lib/services/resume-structure/strict-resume-v2.schema";

const EM_DASH_COMPANY = "—";

/**
 * Words that often start a bullet/sentence-fragment instead of a real role title.
 * Used to detect when bullets leaked into the experience.role / project.title slot.
 */
const FRAGMENT_LEAD_WORDS = [
  "improved",
  "leveraged",
  "built",
  "designed",
  "reduced",
  "migrated",
  "implemented",
  "used",
  "enabled",
  "developed",
  "engineered",
  "delivered",
  "led",
  "managed",
  "architected",
  "optimized",
  "deployed",
  "automated",
  "wrote",
  "researched",
  "analysed",
  "analyzed",
  "created",
];

const FRAGMENT_LEAD_REGEX = new RegExp(
  `^(${FRAGMENT_LEAD_WORDS.join("|")})\\b`,
  "i",
);

/**
 * Heuristic: legacy / strict-v1 projections sometimes explode bullets into fake jobs
 * (company "—", fragment roles, many × ~0.3y rows). V2→ParsedCandidate avoids this.
 */
export function parsedCandidateLikelyCorrupted(parsed: ParsedCandidate): boolean {
  const exp = parsed.experience;
  if (exp.length === 0) {
    return false;
  }

  const badCompanyCount = exp.filter(
    (e) => !e.company?.trim() || e.company.trim() === EM_DASH_COMPANY,
  ).length;
  if (badCompanyCount >= 2 && badCompanyCount >= Math.ceil(exp.length * 0.45)) {
    return true;
  }

  const shortTenureRows = exp.filter(
    (e) => e.years != null && e.years > 0 && e.years <= 0.45,
  ).length;
  if (exp.length >= 5 && shortTenureRows >= Math.ceil(exp.length * 0.55)) {
    return true;
  }

  for (const ed of parsed.education) {
    const d = ed.degree?.trim() ?? "";
    if (d.length > 350) {
      return true;
    }
    const pipeSegments = d.split("|").filter((s) => s.trim().length > 0).length;
    if (pipeSegments >= 3) {
      return true;
    }
  }

  const unclosedParenSkill = parsed.skills.some((s) => /\([^)]*$/.test(s.trim()));
  if (unclosedParenSkill) {
    return true;
  }

  const danglingCloseParenSkills = parsed.skills.filter((s) => {
    const x = s.trim();
    return /\)\s*$/.test(x) && !/\([^)]+\)/.test(x) && x.length < 48;
  }).length;
  if (danglingCloseParenSkills >= 2) {
    return true;
  }

  return false;
}

export type V2CorruptionReason =
  | "fragmented_experience"
  | "fragmented_projects"
  | "section_leakage_education"
  | "skill_unbalanced_parens"
  | "skill_blank_entries"
  | "low_prov_confidence_floor";

/**
 * Same heuristics as `parsedCandidateLikelyCorrupted`, but checked directly against
 * the v2 document. Used to reject persistence of obviously broken parses *before*
 * we lock them into the canonical snapshot.
 *
 * - section leakage: bullet/sentence text leaked into a `core.education[].degree`,
 *   `core.experience[].role`, or `core.projects[].title` slot
 * - prov confidence floor: median across all sections below 0.25 → reject
 *   (we still log a warning between 0.25 and 0.4)
 */
export function v2DocumentLikelyCorrupted(
  doc: StrictResumeV2,
  provStats?: { min: number | null; median: number | null },
): { ok: true } | { ok: false; reasons: V2CorruptionReason[] } {
  const reasons: V2CorruptionReason[] = [];

  // experience: company empty/em-dash AND role looks like a bullet fragment.
  const fragExpRows = doc.core.experience.filter((row) => {
    const company = row.company?.trim() ?? "";
    const role = row.role?.trim() ?? "";
    const noCompany = !company || company === EM_DASH_COMPANY;
    const fragmentRole = role.length > 0 && FRAGMENT_LEAD_REGEX.test(role);
    return noCompany && fragmentRole;
  }).length;
  if (
    fragExpRows >= 2 ||
    (doc.core.experience.length > 0 &&
      fragExpRows >= Math.ceil(doc.core.experience.length * 0.45))
  ) {
    reasons.push("fragmented_experience");
  }

  // projects: titles that read like bullets ("leveraged X for ...").
  const fragProjects = doc.core.projects.filter((p) => {
    const title = p.title?.trim() ?? "";
    return title.length > 0 && FRAGMENT_LEAD_REGEX.test(title);
  }).length;
  if (fragProjects >= 2) {
    reasons.push("fragmented_projects");
  }

  // education leakage: monstrously long degree, or pipe-laden, or contains many bullet seps.
  for (const ed of doc.core.education) {
    const d = ed.degree?.trim() ?? "";
    if (
      d.length > 300 ||
      d.split("|").filter((x) => x.trim().length > 0).length >= 3 ||
      (d.match(/[•·]/g)?.length ?? 0) >= 2
    ) {
      reasons.push("section_leakage_education");
      break;
    }
  }

  // skills: unbalanced parens or blanks.
  const blankSkill = doc.core.skills.some(
    (s) => !s.name || s.name.trim().length === 0,
  );
  if (blankSkill) {
    reasons.push("skill_blank_entries");
  }
  const unbalanced = doc.core.skills.some((s) => /\([^)]*$/.test(s.name?.trim() ?? ""));
  if (unbalanced) {
    reasons.push("skill_unbalanced_parens");
  }

  // prov.confidence floor (only enforced when we have stats).
  if (provStats && provStats.median != null && provStats.median < 0.25) {
    reasons.push("low_prov_confidence_floor");
  }

  if (reasons.length === 0) return { ok: true };
  return { ok: false, reasons };
}
