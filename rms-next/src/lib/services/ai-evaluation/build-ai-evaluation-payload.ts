import { createHash } from "node:crypto";

import type { ParsedResumeArtifact } from "@/lib/queue/inbound-events-queue";
import { normalizeSkill } from "@/lib/services/ats-v1-scoring";
import type { CandidateRankingSignals } from "@/lib/services/candidate-ranking-signals";
import type { RankedCandidateExplain } from "@/lib/services/ranking-service";
import { requisitionItems } from "@/lib/db/schema";
import {
  candidateEvaluationInputSchema,
  jobEvaluationInputSchema,
  type CandidateEvaluationInput,
  type JobEvaluationInput,
} from "@/lib/services/ai-evaluation/ai-evaluation.schema";

export function canonicalAiEvaluationInputHash(parts: {
  job: JobEvaluationInput;
  candidate: CandidateEvaluationInput;
  model: string;
  promptVersion: string;
}): string {
  const payload = {
    v: 1,
    model: parts.model,
    prompt_version: parts.promptVersion,
    job: parts.job,
    candidate: parts.candidate,
  };
  return createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
}

export function buildJobEvaluationInput(params: {
  item: typeof requisitionItems.$inferSelect;
  requiredSkillsList: string[];
  requiredTextForSummary: string;
}): JobEvaluationInput {
  const skills = params.requiredSkillsList
    .map((s) => normalizeSkill(String(s)))
    .filter(Boolean)
    .slice(0, 80)
    .map((s) => s.slice(0, 120));
  const rawExp = params.item.experienceYears;
  const reqExp =
    rawExp != null && Number.isFinite(Number(rawExp))
      ? Math.max(0, Math.min(80, Number(rawExp)))
      : 0;
  return jobEvaluationInputSchema.parse({
    title: String(params.item.rolePosition ?? "Role").slice(0, 300),
    required_skills: skills,
    required_experience: reqExp,
    description_summary: params.requiredTextForSummary.slice(0, 12_000),
  });
}

export function buildCandidateEvaluationInputFromSignals(
  signals: CandidateRankingSignals,
): CandidateEvaluationInput {
  const struct = signals.structured_document?.profile;
  const skills = signals.skills_normalized.slice(0, 80).map((s) => s.slice(0, 120));
  let experience_years = signals.ats.experience_years;
  const projects = (struct?.projects ?? [])
    .filter((p): p is string => typeof p === "string")
    .map((p) => p.slice(0, 600))
    .slice(0, 40);
  const experience_details = (struct?.experience_details ?? [])
    .filter((p): p is string => typeof p === "string")
    .map((p) => p.slice(0, 500))
    .slice(0, 60);
  const job_title =
    struct?.job_title && struct.job_title.trim()
      ? struct.job_title.trim().slice(0, 200)
      : null;
  const companies = (struct?.employment ?? [])
    .map((e) => e.company)
    .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
    .map((c) => c.trim().slice(0, 200))
    .slice(0, 40);
  if (experience_years == null && struct?.experience_years != null) {
    experience_years = struct.experience_years;
  }
  const expCapped =
    experience_years != null
      ? Math.min(80, Math.max(0, experience_years))
      : null;
  return candidateEvaluationInputSchema.parse({
    skills,
    experience_years: expCapped,
    projects,
    experience_details,
    job_title,
    companies,
  });
}

/** Reconstruct parser state from a persisted ranking row (no filesystem / re-parse). */
export function parsedArtifactFromRankingExplain(
  explain: RankedCandidateExplain,
): ParsedResumeArtifact | null {
  const rp = explain.resume_parser;
  if (rp.status !== "processed") {
    return null;
  }
  return {
    parserProvider: rp.parser_provider,
    parserVersion: rp.parser_version,
    status: rp.status,
    sourceResumeRef: rp.source_resume_ref,
    rawText: null,
    parsedData:
      rp.parsed_data && typeof rp.parsed_data === "object"
        ? (rp.parsed_data as Record<string, unknown>)
        : {},
    errorMessage: rp.error_message,
  };
}
