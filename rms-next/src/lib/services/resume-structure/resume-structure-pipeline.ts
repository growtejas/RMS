import { log } from "@/lib/logging/logger";
import { normalizeSkill } from "@/lib/services/ats-v1-scoring";
import {
  parseResumeStructuredDocument,
  type ResumeStructuredDocumentV1,
  resumeStructuredDocumentV1Z,
  RESUME_STRUCTURE_SCHEMA_VERSION,
} from "@/lib/services/resume-structure/resume-structure.schema";
import { extractRulesStructuredResume } from "@/lib/services/resume-structure/rules-extractor-v2";
import { tryRefineStructuredProfileWithLlm } from "@/lib/services/resume-structure/llm-refiner";
import { buildResumeStructureIssueTags } from "@/lib/services/resume-structure/resume-structure-audit";

export function resolveResumeStructureEnabled(): boolean {
  const v = process.env.RESUME_STRUCTURE_ENABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function resolveResumeStructureForceRebuild(): boolean {
  const v = process.env.RESUME_STRUCTURE_FORCE_REBUILD?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function resolveResumeStructureLlmSync(): boolean {
  const v = process.env.RESUME_STRUCTURE_LLM_SYNC?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** When true, always run sync LLM refine if LLM is enabled and resume text exists (ignores rules confidence gate). */
export function resolveResumeStructureLlmAlways(): boolean {
  const v = process.env.RESUME_STRUCTURE_LLM_ALWAYS?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function resolveResumeStructureLlmConfidenceThreshold(): number {
  const raw = process.env.RESUME_STRUCTURE_LLM_CONFIDENCE_THRESHOLD?.trim();
  if (!raw) return 0.45;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0.45;
  return n > 1 ? Math.min(1, n / 100) : Math.max(0, Math.min(1, n));
}

export function shouldSkipStructureRebuild(
  existingProfile: Record<string, unknown> | null | undefined,
  sourceHash: string | null,
  force: boolean,
): boolean {
  if (force) return false;
  if (!existingProfile || !sourceHash) return false;
  const parsed = parseResumeStructuredDocument(existingProfile);
  if (!parsed.ok) return false;
  return (
    parsed.data.schema_version === RESUME_STRUCTURE_SCHEMA_VERSION &&
    parsed.data.source_hash === sourceHash
  );
}

export type StructurePipelineOutcome = {
  document: ResumeStructuredDocumentV1 | null;
  resumeStructureStatus: "ready" | "pending" | null;
  enqueueLlmRefine: boolean;
};

/**
 * Build validated `resume_structured_profile` from resume plain text.
 * When LLM is enabled and sync mode is off, may return `pending` + `enqueueLlmRefine`.
 */
export async function runResumeStructurePipeline(input: {
  rawText: string | null | undefined;
  sourceHash: string | null;
  fallbackName?: string | null;
  fallbackEmail?: string | null;
  existingProfile?: Record<string, unknown> | null;
  logContext?: Record<string, unknown>;
}): Promise<StructurePipelineOutcome> {
  const ctx = input.logContext ?? {};

  if (!resolveResumeStructureEnabled()) {
    return { document: null, resumeStructureStatus: null, enqueueLlmRefine: false };
  }

  const text = input.rawText?.trim() ? input.rawText : null;
  if (!text) {
    log("info", "resume_structure_skipped_no_text", { ...ctx, reason: "no_text" });
    return { document: null, resumeStructureStatus: null, enqueueLlmRefine: false };
  }

  if (
    shouldSkipStructureRebuild(
      input.existingProfile,
      input.sourceHash,
      resolveResumeStructureForceRebuild(),
    )
  ) {
    const again = parseResumeStructuredDocument(input.existingProfile);
    if (again.ok) {
      return {
        document: again.data,
        resumeStructureStatus: "ready",
        enqueueLlmRefine: false,
      };
    }
  }

  const started = Date.now();
  const rules = extractRulesStructuredResume(text, {
    fallbackName: input.fallbackName,
    fallbackEmail: input.fallbackEmail,
  });

  const profileSkills = rules.profile.skills.map((s) => normalizeSkill(s)).filter(Boolean);
  const profile: ResumeStructuredDocumentV1["profile"] = {
    ...rules.profile,
    skills: Array.from(new Set(profileSkills)).slice(0, 80),
  };

  let extractor: ResumeStructuredDocumentV1["extractor"] = "rules_v2";
  let finalProfile = profile;
  let warnings = [...rules.warnings];
  let overallConfidence = rules.confidence_overall;
  let fieldConfidence = rules.field_confidence;
  const threshold = resolveResumeStructureLlmConfidenceThreshold();
  const wantLlm =
    resolveResumeStructureLlmAlways() ||
    rules.suggest_llm_refinement ||
    rules.confidence_overall < threshold;

  const llmEnvOn =
    process.env.RESUME_STRUCTURE_LLM_ENABLED?.trim().toLowerCase() === "true" ||
    process.env.RESUME_STRUCTURE_LLM_ENABLED?.trim() === "1";

  if (!wantLlm && llmEnvOn && resolveResumeStructureLlmSync()) {
    log("info", "resume_structure_llm_skipped_want_llm_false", {
      ...ctx,
      confidence_overall: rules.confidence_overall,
      threshold,
      suggest_llm_refinement: rules.suggest_llm_refinement,
      llm_always: resolveResumeStructureLlmAlways(),
      hint: "Set RESUME_STRUCTURE_LLM_ALWAYS=true to run the resume LLM on every parse (when sync is on).",
    });
  }

  if (wantLlm && resolveResumeStructureLlmSync()) {
    const refined = await tryRefineStructuredProfileWithLlm({
      resumeText: text,
      draftProfile: profile,
      draftWarnings: rules.warnings,
      logContext: input.logContext,
    });
    if (refined) {
      const keepRulesProjects =
        refined.profile.projects.length > 0
          ? refined.profile.projects
          : profile.projects;
      const keepRulesExperienceDetails =
        refined.profile.experience_details.length > 0
          ? refined.profile.experience_details
          : profile.experience_details;
      finalProfile = {
        ...refined.profile,
        projects: keepRulesProjects,
        experience_details: keepRulesExperienceDetails,
      };
      warnings = refined.warnings.length > 0 ? refined.warnings : warnings;
      extractor = "rules_v2+llm";
      overallConfidence = Math.min(1, Math.max(overallConfidence, 0.55));
      if (
        refined.fieldConfidenceOverride &&
        Object.keys(refined.fieldConfidenceOverride).length > 0
      ) {
        fieldConfidence = {
          ...rules.field_confidence,
          ...refined.fieldConfidenceOverride,
        };
      }
    }
  }

  const doc: ResumeStructuredDocumentV1 = {
    schema_version: RESUME_STRUCTURE_SCHEMA_VERSION,
    extractor,
    extracted_at: new Date().toISOString(),
    source_hash: input.sourceHash,
    profile: finalProfile,
    confidence: { overall: overallConfidence },
    field_confidence: fieldConfidence,
    warnings,
  };

  const validated = resumeStructuredDocumentV1Z.safeParse(doc);
  if (!validated.success) {
    log("error", "resume_structure_validation_failed", {
      ...ctx,
      issues: validated.error.issues.slice(0, 12),
      duration_ms: Date.now() - started,
    });
    return { document: null, resumeStructureStatus: null, enqueueLlmRefine: false };
  }

  log("info", "resume_structure_rules_ok", {
    ...ctx,
    extractor: validated.data.extractor,
    confidence_overall: validated.data.confidence.overall,
    warnings: validated.data.warnings,
    duration_ms: Date.now() - started,
  });

  log("info", "resume_structure_parse_audit", {
    ...ctx,
    issue_tags: buildResumeStructureIssueTags(validated.data),
    confidence_overall: validated.data.confidence.overall,
    warnings_sample: validated.data.warnings.slice(0, 12),
  });

  const enqueueLlmRefine = wantLlm && !resolveResumeStructureLlmSync() && llmEnvOn;

  return {
    document: validated.data,
    resumeStructureStatus: enqueueLlmRefine ? "pending" : "ready",
    enqueueLlmRefine,
  };
}
