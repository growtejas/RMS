import type { ResumeStructuredDocumentV1 } from "@/lib/services/resume-structure/resume-structure.schema";

const LOW_OVERALL = 0.45;

/** Compact tags for logs and API summaries (parse quality / HR visibility). */
export function buildResumeStructureIssueTags(
  doc: ResumeStructuredDocumentV1,
): string[] {
  const tags: string[] = [];
  const p = doc.profile;
  if (!(p.email?.trim() || p.phone?.trim())) {
    tags.push("missing_contact");
  }
  if (doc.warnings.includes("SPARSE_SKILLS")) {
    tags.push("sparse_skills");
  }
  if (doc.confidence.overall < LOW_OVERALL) {
    tags.push("low_overall_confidence");
  }
  if ((p.skills?.length ?? 0) < 3) {
    tags.push("low_skill_count");
  }
  if (doc.warnings.includes("LOW_CONFIDENCE_SKILLS")) {
    tags.push("low_confidence_skills");
  }
  return tags;
}
