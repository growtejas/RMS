import { desc, eq, inArray } from "drizzle-orm";
import fs from "node:fs/promises";

import { getDb } from "@/lib/db";
import {
  applications,
  candidates,
  interviews,
  rankingSnapshots,
  requisitionItems,
  requisitions,
} from "@/lib/db/schema";
import { HttpError } from "@/lib/http/http-error";
import {
  buildCandidateRankingSignals,
  rankingSignalsToExplain,
} from "@/lib/services/candidate-ranking-signals";
import { enqueueResumeStructureRefineJob } from "@/lib/queue/resume-structure-queue";
import { parseResumeStructuredDocument } from "@/lib/services/resume-structure/resume-structure.schema";
import {
  resolveResumeStructureEnabled,
  runResumeStructurePipeline,
} from "@/lib/services/resume-structure/resume-structure-pipeline";
import {
  computeAtsV1ScoreFromSignals,
  normalizeSkill,
  resolveAtsRankingEngineMode,
  resolveAtsV1HybridWeight,
  resolveRankingAllowEmptyRequiredSkills,
  resolveRequiredSkillsForRanking,
  type AtsV1Breakdown,
} from "@/lib/services/ats-v1-scoring";
import {
  cosineSimilarity,
  ensureCandidateEmbedding,
  ensureRequisitionItemEmbedding,
} from "@/lib/services/embeddings-service";
import {
  contentHashFromArtifact,
  parsedArtifactToCacheRecord,
  resolveResumeRefForFilesystem,
  tryResumeParseCacheHit,
  tryStatLocalResumeFile,
} from "@/lib/services/resume-parse-cache";
import {
  extractOfficeDocumentText,
  parseResumeArtifact,
} from "@/lib/services/resume-parser-service";
import { batchUpdateResumeParseCache } from "@/lib/repositories/candidates-repo";
import { replaceApplicationAtsBucketsForRequisitionItem } from "@/lib/repositories/applications-repo";
import {
  deactivateRankingVersionsForItem,
  insertCandidateJobScoresBatch,
  insertRankingVersionRow,
  selectMaxRankingVersionNumber,
} from "@/lib/repositories/ranking-metadata-repo";
import {
  getAtsBucketFromFinalScore,
  type AtsBucket,
} from "@/lib/services/ats-buckets";
import type { ParsedResumeArtifact } from "@/lib/queue/inbound-events-queue";
import { jdIsRemoteUrl, jdLocalFilePath } from "@/lib/storage/jd-local-storage";

type RankedCandidateScore = {
  keyword_score: number;
  semantic_score: number;
  business_score: number;
  /** Rule-based ATS score (0–100) when engine is hybrid or ats_v1. */
  ats_v1_score?: number;
  final_score: number;
  /** Deterministic score after skill gate (before optional AI blend). Set when AI enrich is applied. */
  deterministic_final_score?: number;
};

export type RankedCandidateExplain = {
  reasons: string[];
  matched_terms: string[];
  missing_terms: string[];
  /** Skill-centric view derived from structured required skills list. */
  matched_skills?: string[];
  missing_skills?: string[];
  /** Present when GET used `?ai_eval=1` and a cached row matched `input_hash`. */
  deterministic_final_score?: number;
  ai_score?: number;
  ai_breakdown?: {
    project_complexity: number;
    growth_trajectory: number;
    company_reputation: number;
    jd_alignment: number;
  };
  ai_confidence?: number;
  ai_summary?: string;
  ai_risks?: string[];
  /** Blend weight applied to `ai_score` (0 if no cached eval). */
  ai_blend_weight?: number;
  ats_v1?: {
    skills?: number;
    experience: number;
    notice: number;
    education: number;
    seniority: number;
    bonus?: number;
    matched_skills?: number;
    required_skills?: number;
    partial_data: boolean;
    flags: string[];
  };
  /**
   * Same `parseResumeArtifact` output used for keyword/semantic signals in this ranking run
   * (truncated raw text for JSON size).
   */
  resume_parser: {
    status: ParsedResumeArtifact["status"];
    parser_provider: string;
    parser_version: string;
    source_resume_ref: string | null;
    parsed_data: Record<string, unknown>;
    raw_text_excerpt: string | null;
    error_message: string | null;
  };
  /** DB + parser merged fields actually used for scoring this run. */
  ranking_signals: ReturnType<typeof rankingSignalsToExplain>;
  /** Applied to final_score when structured skill match is weak (1 = no penalty). */
  skill_gate_multiplier?: number;
};

export type RankedCandidateRow = {
  candidate_id: number;
  requisition_item_id: number;
  full_name: string;
  email: string;
  current_stage: string;
  meta?: {
    skill_match_ratio?: number;
    notice_period_days?: number | null;
    application_created_at_ms?: number;
  };
  score: RankedCandidateScore;
  explain: RankedCandidateExplain;
};

export type RequisitionItemRankingJson = {
  requisition_item_id: number;
  req_id: number;
  ranking_version: string;
  weights: {
    keyword: number;
    semantic: number;
    business: number;
  };
  generated_at: string;
  total_candidates: number;
  ranked_candidates: RankedCandidateRow[];
  meta?: {
    ranking_engine: string;
    ats_v1_weight: number;
    ranking_version_id: number;
    required_skills_count?: number;
    /** True when GET included `?ai_eval=1` and cached rows were merged. */
    ai_eval_enriched?: boolean;
  };
};

/** Bump when ranking JSON shape changes (invalidates stored snapshots). */
const RANKING_VERSION = "phase6-v5-ai-eval";
/** Cap resume text embedded in ranking API JSON (full text is still used for scoring). */
const RESUME_PARSER_RAW_EXCERPT_MAX = 4000;
/** Cap extracted JD text so ranking stays bounded; full PDF still parsed up to this length. */
const MAX_JD_TEXT_IN_RANKING = 35_000;
const DEFAULT_KEYWORD_WEIGHT = 0.4;
const DEFAULT_SEMANTIC_WEIGHT = 0.25;
const DEFAULT_BUSINESS_WEIGHT = 0.35;
const WEIGHT_EPSILON = 0.0001;
const TIE_EPSILON = 0.01;
const STOP_WORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "from",
  "that",
  "this",
  "have",
  "has",
  "will",
  "can",
  "you",
  "your",
  "our",
  "are",
  "not",
  "all",
  "any",
  "job",
  "role",
  "position",
  "requiring",
  "require",
  "required",
  "requirements",
  "primary",
  "secondary",
  "responsibilities",
  "responsibility",
  "description",
  "summary",
  "candidate",
  "candidates",
  "years",
  "year",
  "skills",
  "skill",
]);

function normalizeToken(t: string): string {
  return t.trim().toLowerCase();
}

function resumeParserForRankingResponse(
  parsed: ParsedResumeArtifact | null,
  noRefReason: string,
): RankedCandidateExplain["resume_parser"] {
  if (!parsed) {
    return {
      status: "skipped",
      parser_provider: "fallback-local",
      parser_version: "v1",
      source_resume_ref: null,
      parsed_data: { reason: noRefReason },
      raw_text_excerpt: null,
      error_message: null,
    };
  }
  const raw = parsed.rawText;
  let excerpt: string | null = null;
  if (raw) {
    excerpt =
      raw.length > RESUME_PARSER_RAW_EXCERPT_MAX
        ? `${raw.slice(0, RESUME_PARSER_RAW_EXCERPT_MAX)}…`
        : raw;
  }
  return {
    status: parsed.status,
    parser_provider: parsed.parserProvider,
    parser_version: parsed.parserVersion,
    source_resume_ref: parsed.sourceResumeRef,
    parsed_data: parsed.parsedData,
    raw_text_excerpt: excerpt,
    error_message: parsed.errorMessage,
  };
}

function filterExplainTerms(terms: string[]): string[] {
  // Keep stable ordering but remove obvious noise and extremely short tokens.
  const out: string[] = [];
  for (const raw of terms) {
    const t = normalizeToken(raw);
    if (!t) continue;
    if (STOP_WORDS.has(t)) continue;
    if (t.length < 3) continue;
    // Avoid leaking pure numbers (e.g. "2024", "15").
    if (/^\d+(\.\d+)?$/.test(t)) continue;
    out.push(t);
  }
  return out;
}

type RankingWeights = {
  keyword: number;
  semantic: number;
  business: number;
};

type RankingSnapshotRow = typeof rankingSnapshots.$inferSelect;

function normalizeWeightValue(value: number): number {
  if (value > 1) {
    return value / 100;
  }
  return value;
}

function readWeight(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return normalizeWeightValue(parsed);
}

export function resolveRankingWeights(): RankingWeights {
  let keyword = clamp(
    readWeight("RANKING_KEYWORD_WEIGHT", DEFAULT_KEYWORD_WEIGHT),
    0,
    1,
  );
  let semantic = clamp(
    readWeight("RANKING_SEMANTIC_WEIGHT", DEFAULT_SEMANTIC_WEIGHT),
    0,
    1,
  );
  let business = clamp(
    readWeight("RANKING_BUSINESS_WEIGHT", DEFAULT_BUSINESS_WEIGHT),
    0,
    1,
  );
  if (keyword + semantic + business <= WEIGHT_EPSILON) {
    keyword = DEFAULT_KEYWORD_WEIGHT;
    semantic = DEFAULT_SEMANTIC_WEIGHT;
    business = DEFAULT_BUSINESS_WEIGHT;
  }
  const total = keyword + semantic + business;
  return {
    keyword: Number((keyword / total).toFixed(4)),
    semantic: Number((semantic / total).toFixed(4)),
    business: Number((business / total).toFixed(4)),
  };
}

function toTerms(parts: Array<string | null | undefined>): string[] {
  const joined = parts.filter(Boolean).join(" ").toLowerCase();
  const raw = joined.match(/[a-z0-9+#.]{2,}/g) ?? [];
  return Array.from(
    new Set(raw.filter((t) => !STOP_WORDS.has(t))),
  );
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

function normalizeTextForSemantic(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stemToken(token: string): string {
  if (token.length <= 4) {
    return token;
  }
  if (token.endsWith("ing") && token.length > 6) {
    return token.slice(0, -3);
  }
  if (token.endsWith("ed") && token.length > 5) {
    return token.slice(0, -2);
  }
  if (token.endsWith("es") && token.length > 5) {
    return token.slice(0, -2);
  }
  if (token.endsWith("s") && token.length > 4) {
    return token.slice(0, -1);
  }
  return token;
}

function toStemSet(terms: string[]): Set<string> {
  return new Set(terms.map(stemToken));
}

function toTrigramSet(text: string): Set<string> {
  const n = normalizeTextForSemantic(text).replace(/\s/g, "");
  if (!n) {
    return new Set();
  }
  if (n.length < 3) {
    return new Set([n]);
  }
  const grams = new Set<string>();
  for (let i = 0; i <= n.length - 3; i += 1) {
    grams.add(n.slice(i, i + 3));
  }
  return grams;
}

function setSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const val of Array.from(a)) {
    if (b.has(val)) {
      intersection += 1;
    }
  }
  const union = a.size + b.size - intersection;
  if (union <= 0) {
    return 0;
  }
  return intersection / union;
}

function semanticScoreForCandidate(
  requiredText: string,
  candidateText: string,
  requiredTerms: string[],
  candidateTerms: string[],
): number {
  const requiredTrigrams = toTrigramSet(requiredText);
  const candidateTrigrams = toTrigramSet(candidateText);
  const trigramSimilarity = setSimilarity(requiredTrigrams, candidateTrigrams);

  const requiredStems = toStemSet(requiredTerms);
  const candidateStems = toStemSet(candidateTerms);
  const stemCoverage =
    requiredStems.size === 0
      ? 0.5
      : Array.from(requiredStems).filter((s) => candidateStems.has(s)).length /
        requiredStems.size;

  return clamp((trigramSimilarity * 0.65 + stemCoverage * 0.35) * 100);
}

function stageBaseScore(stage: string): number {
  switch (stage) {
    case "Hired":
      return 95;
    case "Offered":
      return 85;
    case "Interviewing":
      return 75;
    case "Shortlisted":
      return 65;
    case "Sourced":
      return 50;
    case "Rejected":
      return 10;
    default:
      return 45;
  }
}

/**
 * Plain text from manager-uploaded JD (per-item key, else requisition header key).
 * Failures are swallowed so ranking still runs from structured fields only.
 */
async function loadJdTextForRanking(
  itemJdKey: string | null | undefined,
  headerJdKey: string | null | undefined,
): Promise<string> {
  const key = (itemJdKey?.trim() || headerJdKey?.trim()) ?? "";
  if (!key) {
    return "";
  }
  try {
    let buffer: Buffer;
    if (jdIsRemoteUrl(key)) {
      const res = await fetch(key);
      if (!res.ok) {
        return "";
      }
      buffer = Buffer.from(await res.arrayBuffer());
    } else {
      buffer = await fs.readFile(jdLocalFilePath(key));
    }
    const raw = await extractOfficeDocumentText(buffer, key);
    return raw.slice(0, MAX_JD_TEXT_IN_RANKING);
  } catch {
    return "";
  }
}

/** Manager/header JD vs TA pipeline override (text + optional PDF). */
async function resolveJdNarrativeForRanking(
  item: (typeof requisitionItems)["$inferSelect"],
  headerJdKey: string | null | undefined,
): Promise<string> {
  if (item.pipelineRankingUseRequisitionJd === false) {
    const parts: string[] = [];
    if (item.pipelineJdFileKey?.trim()) {
      const fromFile = await loadJdTextForRanking(item.pipelineJdFileKey.trim(), null);
      if (fromFile) {
        parts.push(fromFile);
      }
    }
    if (item.pipelineJdText?.trim()) {
      parts.push(item.pipelineJdText.trim());
    }
    return parts.join("\n\n").slice(0, MAX_JD_TEXT_IN_RANKING);
  }
  return loadJdTextForRanking(item.jdFileKey, headerJdKey ?? null);
}

/** JD + required skills bundle shared by ranking compute and AI evaluation payload/hash. */
export async function loadRankingRequiredContextForItem(itemId: number): Promise<{
  item: typeof requisitionItems.$inferSelect;
  requiredText: string;
  requiredSkillsList: string[];
}> {
  const db = getDb();
  const [item] = await db
    .select()
    .from(requisitionItems)
    .where(eq(requisitionItems.itemId, itemId))
    .limit(1);
  if (!item) {
    throw new HttpError(404, `Requisition item ${itemId} not found`);
  }
  const [header] = await db
    .select({ jdFileKey: requisitions.jdFileKey })
    .from(requisitions)
    .where(eq(requisitions.reqId, item.reqId))
    .limit(1);
  const jdExtractedText = await resolveJdNarrativeForRanking(item, header?.jdFileKey ?? null);
  const requiredText = [
    item.rolePosition,
    item.skillLevel,
    item.educationRequirement,
    item.requirements,
    item.jobDescription,
    jdExtractedText,
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, MAX_JD_TEXT_IN_RANKING);
  const requiredSkillsList = resolveRequiredSkillsForRanking({
    rankingRequiredSkills: item.rankingRequiredSkills,
    requirements: item.requirements,
    jdNarrative: requiredText,
    maxNarrativeTokens: 20,
  });
  if (requiredSkillsList.length === 0 && !resolveRankingAllowEmptyRequiredSkills()) {
    throw new HttpError(
      422,
      "Ranking requires at least one required skill: set ranking_required_skills or structured " +
        "requirements / JD narrative on this requisition item, or set RANKING_ALLOW_EMPTY_REQUIRED_SKILLS=true for legacy data.",
    );
  }
  return { item, requiredText, requiredSkillsList };
}

function mergeResumeDerivedBatches(
  parseRows: Array<{
    candidateId: number;
    resumeContentHash: string | null;
    resumeParseCache: Record<string, unknown> | null;
  }>,
  structureRows: Array<{
    candidateId: number;
    resumeStructuredProfile: Record<string, unknown>;
    resumeStructureStatus: string | null;
  }>,
): Array<{
  candidateId: number;
  resumeContentHash?: string | null;
  resumeParseCache?: Record<string, unknown> | null;
  resumeStructuredProfile?: Record<string, unknown> | null;
  resumeStructureStatus?: string | null;
}> {
  type Row = {
    candidateId: number;
    resumeContentHash?: string | null;
    resumeParseCache?: Record<string, unknown> | null;
    resumeStructuredProfile?: Record<string, unknown> | null;
    resumeStructureStatus?: string | null;
  };
  const map = new Map<number, Row>();
  for (const r of parseRows) {
    map.set(r.candidateId, {
      candidateId: r.candidateId,
      resumeContentHash: r.resumeContentHash,
      resumeParseCache: r.resumeParseCache,
    });
  }
  for (const s of structureRows) {
    const prev = map.get(s.candidateId) ?? { candidateId: s.candidateId };
    map.set(s.candidateId, {
      ...prev,
      resumeStructuredProfile: s.resumeStructuredProfile,
      resumeStructureStatus: s.resumeStructureStatus,
    });
  }
  return Array.from(map.values());
}

function atsBreakdownToExplain(b: AtsV1Breakdown) {
  const req = b.required_skills_count ?? 0;
  const mat = b.matched_skills_count ?? 0;
  return {
    skills: req > 0 ? (b.skills_alignment ?? Math.min(1, Math.max(0, mat / req))) : 0,
    experience: b.experience,
    notice: b.notice,
    education: b.education,
    seniority: b.seniority,
    bonus: 0,
    matched_skills: mat,
    required_skills: req,
    partial_data: b.partial_data,
    flags: b.flags,
  };
}

async function buildRankingForRequisitionItem(
  itemId: number,
  weights: RankingWeights,
  rankingVersionId: number,
): Promise<RequisitionItemRankingJson> {
  const db = getDb();
  const { item, requiredText, requiredSkillsList } = await loadRankingRequiredContextForItem(itemId);

  const engineMode = resolveAtsRankingEngineMode();
  const hybridV1Weight = resolveAtsV1HybridWeight();

  const candidateRows = await db
    .select()
    .from(candidates)
    .where(eq(candidates.requisitionItemId, itemId));

  const candidateIds = candidateRows.map((c) => c.candidateId);
  const applicationCreatedByCandidate = new Map<number, number>();
  if (candidateIds.length > 0) {
    const appRows = await db
      .select({
        candidateId: applications.candidateId,
        createdAt: applications.createdAt,
      })
      .from(applications)
      .where(inArray(applications.candidateId, candidateIds));
    for (const a of appRows) {
      applicationCreatedByCandidate.set(
        a.candidateId,
        a.createdAt?.getTime() ?? 0,
      );
    }
  }

  const interviewRows = candidateIds.length
    ? await db
        .select()
        .from(interviews)
        .where(inArray(interviews.candidateId, candidateIds))
    : [];
  const interviewsByCandidate = new Map<number, typeof interviewRows>();
  for (const row of interviewRows) {
    const arr = interviewsByCandidate.get(row.candidateId) ?? [];
    arr.push(row);
    interviewsByCandidate.set(row.candidateId, arr);
  }

  const requiredTerms = toTerms([requiredText]).slice(0, 40);
  const itemEmbedding = await ensureRequisitionItemEmbedding({
    requisitionItemId: item.itemId,
    requisitionId: item.reqId,
    sourceText: requiredText,
  });

  const ranked: RankedCandidateRow[] = [];
  const jobScoreRows: {
    candidateId: number;
    requisitionItemId: number;
    rankingVersionId: number;
    score: string;
    breakdown: Record<string, unknown>;
  }[] = [];

  const parseCacheUpdates: Array<{
    candidateId: number;
    resumeContentHash: string | null;
    resumeParseCache: Record<string, unknown> | null;
  }> = [];
  const structurePersistRows: Array<{
    candidateId: number;
    resumeStructuredProfile: Record<string, unknown>;
    resumeStructureStatus: string | null;
  }> = [];
  const rankingStructureLlmEnqueue = new Set<number>();

  for (const candidate of candidateRows) {
    const ivs = interviewsByCandidate.get(candidate.candidateId) ?? [];
    const ivTexts = ivs.flatMap((i) => [
      i.interviewerName,
      i.feedback ?? "",
      i.result ?? "",
      i.status,
    ]);

    const resumeRef = resolveResumeRefForFilesystem(candidate.resumePath);
    let parsedArtifact: ParsedResumeArtifact | null = null;
    if (resumeRef) {
      const cached = await tryResumeParseCacheHit({
        candidateResumePath: candidate.resumePath,
        resumeRef,
        dbCache: candidate.resumeParseCache,
      });
      if (cached) {
        parsedArtifact = cached;
      } else {
        parsedArtifact = await parseResumeArtifact({
          normalizedCandidate: {
            fullName: candidate.fullName,
            email: candidate.email,
            phone: candidate.phone,
            currentCompany: candidate.currentCompany,
            resumeUrl: resumeRef,
            source: "ranking",
            externalId: `candidate-${candidate.candidateId}`,
            jobSlug: String(candidate.requisitionItemId),
          },
        });
        const stat = await tryStatLocalResumeFile(resumeRef);
        const cacheRec = parsedArtifactToCacheRecord(
          parsedArtifact,
          stat,
          candidate.resumePath ?? null,
        );
        parseCacheUpdates.push({
          candidateId: candidate.candidateId,
          resumeContentHash: contentHashFromArtifact(parsedArtifact),
          resumeParseCache: { ...cacheRec } as Record<string, unknown>,
        });
      }
    }

    const structuredFromDb = parseResumeStructuredDocument(
      candidate.resumeStructuredProfile,
    );
    let structuredDocument = structuredFromDb.ok ? structuredFromDb.data : null;
    if (
      resolveResumeStructureEnabled() &&
      parsedArtifact?.status === "processed" &&
      (parsedArtifact.rawText ?? "").trim().length > 0
    ) {
      const out = await runResumeStructurePipeline({
        rawText: parsedArtifact.rawText,
        sourceHash: contentHashFromArtifact(parsedArtifact),
        fallbackName: candidate.fullName,
        fallbackEmail: candidate.email,
        existingProfile: candidate.resumeStructuredProfile as Record<
          string,
          unknown
        > | null,
        logContext: {
          candidate_id: candidate.candidateId,
          requisition_item_id: itemId,
          path: "ranking",
        },
      });
      if (out.document) {
        structuredDocument = out.document;
        structurePersistRows.push({
          candidateId: candidate.candidateId,
          resumeStructuredProfile: out.document as unknown as Record<
            string,
            unknown
          >,
          resumeStructureStatus: out.resumeStructureStatus ?? "ready",
        });
      }
      if (out.enqueueLlmRefine) {
        rankingStructureLlmEnqueue.add(candidate.candidateId);
      }
    }

    const signals = buildCandidateRankingSignals({
      candidate: {
        candidateSkills: candidate.candidateSkills,
        totalExperienceYears: candidate.totalExperienceYears,
        noticePeriodDays: candidate.noticePeriodDays,
        educationRaw: candidate.educationRaw,
      },
      parsedArtifact,
      structuredDocument,
    });
    const resumeStatus = signals.parse_status;
    const resumeTerms = toTerms([
      signals.resume_plain_text ?? "",
      signals.skills_normalized.join(" "),
    ]);

    const emailLocal = candidate.email.split("@")[0] ?? candidate.email;
    const candidateTerms = toTerms([
      candidate.fullName,
      emailLocal,
      candidate.currentCompany,
      candidate.resumePath,
      resumeTerms.join(" "),
      ...ivTexts,
    ]);
    const struct = structuredDocument?.profile;
    const structuredExtra = struct
      ? [...(struct.projects ?? []), ...(struct.experience_details ?? [])].join(" ")
      : "";

    const candidateSemanticText = [
      candidate.fullName,
      candidate.currentCompany,
      candidate.resumePath,
      signals.resume_plain_text ?? "",
      resumeTerms.join(" "),
      structuredExtra,
      ...ivTexts,
    ]
      .filter(Boolean)
      .join(" ");

    const matchedTermsRaw = requiredTerms.filter((t) => candidateTerms.includes(t));
    const missingTermsRaw = requiredTerms.filter((t) => !candidateTerms.includes(t));

    const matchedTerms = filterExplainTerms(matchedTermsRaw);
    const missingTerms = filterExplainTerms(missingTermsRaw);

    // Skill-centric explainability: compare structured required skills against structured candidate skills.
    const reqSkillsNorm = requiredSkillsList.map((s) => normalizeSkill(s));
    const candSkillsNorm = new Set(signals.skills_normalized);
    const matchedSkills = Array.from(new Set(reqSkillsNorm.filter((s) => candSkillsNorm.has(s))));
    const missingSkills = Array.from(new Set(reqSkillsNorm.filter((s) => !candSkillsNorm.has(s))));

    const keywordScore =
      requiredTerms.length === 0
        ? 50
        : clamp((matchedTermsRaw.length / requiredTerms.length) * 100);
    const lexicalSemanticScore = semanticScoreForCandidate(
      requiredText,
      candidateSemanticText,
      requiredTerms,
      candidateTerms,
    );
    const candidateEmbedding = await ensureCandidateEmbedding({
      candidateId: candidate.candidateId,
      requisitionItemId: candidate.requisitionItemId,
      requisitionId: candidate.requisitionId,
      sourceText: candidateSemanticText,
    });
    const vectorSemanticScore = clamp(
      cosineSimilarity(itemEmbedding, candidateEmbedding) * 100,
    );
    const semanticScore = clamp(vectorSemanticScore * 0.8 + lexicalSemanticScore * 0.2);

    const passCount = ivs.filter((i) => i.result === "Pass").length;
    const failCount = ivs.filter((i) => i.result === "Fail").length;
    const holdCount = ivs.filter((i) => i.result === "Hold").length;

    let businessScore = stageBaseScore(candidate.currentStage);
    businessScore += Math.min(passCount * 8, 16);
    businessScore -= failCount * 12;
    businessScore += holdCount * 2;
    if (candidate.phone) {
      businessScore += 2;
    }
    if (candidate.resumePath) {
      businessScore += 4;
    }
    if (candidate.currentCompany) {
      businessScore += 3;
    }
    businessScore = clamp(businessScore);

    const phase5Final = clamp(
      keywordScore * weights.keyword +
        semanticScore * weights.semantic +
        businessScore * weights.business,
    );

    const atsBreakdown = computeAtsV1ScoreFromSignals(
      {
        experience_years: signals.ats.experience_years,
        notice_period_days: signals.ats.notice_period_days,
        education_raw: signals.ats.education_raw,
      },
      {
        requiredExperienceYears: item.experienceYears ?? null,
        jobSkillLevel: item.skillLevel ?? null,
        jobEducationRequirement: item.educationRequirement ?? null,
      },
      reqSkillsNorm.length > 0
        ? {
            requiredCount: reqSkillsNorm.length,
            matchedCount: matchedSkills.length,
          }
        : null,
    );
    const atsV1ScoreNum = Number(atsBreakdown.score_0_100.toFixed(2));

    let finalScore = phase5Final;
    if (engineMode === "ats_v1") {
      finalScore = atsV1ScoreNum;
    } else if (engineMode === "hybrid") {
      finalScore = clamp(
        (1 - hybridV1Weight) * phase5Final + hybridV1Weight * atsV1ScoreNum,
      );
    }

    finalScore = Number(finalScore.toFixed(2));

    let skillGateMultiplier = 1;
    const skillMatchRatio =
      reqSkillsNorm.length > 0 ? matchedSkills.length / reqSkillsNorm.length : 1;
    if (reqSkillsNorm.length > 0) {
      if (matchedSkills.length === 0) {
        skillGateMultiplier = 0.7;
      } else if (skillMatchRatio < 0.3) {
        skillGateMultiplier = 0.8;
      }
    }
    finalScore = Number(clamp(finalScore * skillGateMultiplier).toFixed(2));

    const reasons: string[] = [];
    if (requiredTerms.length > 0) {
      reasons.push(
        `Keyword match: ${matchedTerms.length}/${requiredTerms.length} required terms`,
      );
    } else {
      reasons.push("Keyword match: no structured required terms found on item");
    }
    reasons.push(`Semantic fit score: ${semanticScore.toFixed(2)} / 100`);
    reasons.push(
      `Vector similarity: ${vectorSemanticScore.toFixed(2)} / 100 (provider: local-hash)`,
    );
    reasons.push(
      `ATS V1: exp=${(atsBreakdown.experience * 100).toFixed(0)}%, notice=${(atsBreakdown.notice * 100).toFixed(0)}%, edu=${(atsBreakdown.education * 100).toFixed(0)}%, seniority=${(atsBreakdown.seniority * 100).toFixed(0)}% => ${atsV1ScoreNum.toFixed(2)}`,
    );
    if (atsBreakdown.flags.includes("partial_data")) {
      reasons.push("ATS V1: multi-field partial data penalty applied");
    } else if (atsBreakdown.flags.includes("partial_candidate_data")) {
      reasons.push("ATS V1: single-field gap penalty applied");
    } else if (atsBreakdown.partial_data) {
      reasons.push("ATS V1: partial candidate data (some fields missing)");
    }
    if (atsBreakdown.flags.includes("extreme_mismatch")) {
      reasons.push("ATS V1: extreme mismatch penalty applied");
    }
    reasons.push(`Stage signal: ${candidate.currentStage}`);
    reasons.push(`Resume parse status: ${resumeStatus}`);
    if (passCount > 0 || failCount > 0 || holdCount > 0) {
      reasons.push(
        `Interview outcomes: pass=${passCount}, hold=${holdCount}, fail=${failCount}`,
      );
    } else {
      reasons.push("Interview outcomes: no completed interview results yet");
    }
    if (engineMode === "hybrid") {
      reasons.push(
        `Hybrid: Phase5 ${phase5Final.toFixed(2)} × ${(1 - hybridV1Weight).toFixed(2)} + ATS V1 ${atsV1ScoreNum.toFixed(2)} × ${hybridV1Weight.toFixed(2)}`,
      );
    }
    if (skillGateMultiplier < 1) {
      reasons.push(
        `Skill gate: final score × ${skillGateMultiplier} (structured match ${(skillMatchRatio * 100).toFixed(0)}%)`,
      );
    }
    if (candidate.duplicateResumeOfCandidateId != null) {
      reasons.push(
        `Resume duplicate flag: same content as candidate_id ${candidate.duplicateResumeOfCandidateId}`,
      );
    }

    const explainAts = atsBreakdownToExplain(atsBreakdown);
    const resumeParserExplain = resumeParserForRankingResponse(
      parsedArtifact,
      "no_resume_reference",
    );
    const rankingSignalsExplain = rankingSignalsToExplain(signals);

    ranked.push({
      candidate_id: candidate.candidateId,
      requisition_item_id: candidate.requisitionItemId,
      full_name: candidate.fullName,
      email: candidate.email,
      current_stage: candidate.currentStage,
      meta: {
        skill_match_ratio:
          reqSkillsNorm.length > 0
            ? matchedSkills.length / reqSkillsNorm.length
            : undefined,
        notice_period_days: signals.ats.notice_period_days,
        application_created_at_ms:
          applicationCreatedByCandidate.get(candidate.candidateId) ?? 0,
      },
      score: {
        keyword_score: Number(keywordScore.toFixed(2)),
        semantic_score: Number(semanticScore.toFixed(2)),
        business_score: Number(businessScore.toFixed(2)),
        ats_v1_score: atsV1ScoreNum,
        final_score: finalScore,
      },
      explain: {
        reasons,
        matched_terms: matchedTerms.slice(0, 15),
        missing_terms: missingTerms.slice(0, 15),
        matched_skills: matchedSkills.slice(0, 15),
        missing_skills: missingSkills.slice(0, 15),
        ats_v1: explainAts,
        resume_parser: resumeParserExplain,
        ranking_signals: rankingSignalsExplain,
        skill_gate_multiplier: skillGateMultiplier,
      },
    });

    jobScoreRows.push({
      candidateId: candidate.candidateId,
      requisitionItemId: itemId,
      rankingVersionId,
      score: finalScore.toFixed(2),
      breakdown: {
        phase5: {
          keyword: keywordScore,
          semantic: semanticScore,
          business: businessScore,
          composite: phase5Final,
        },
        ats_v1: explainAts,
        ats_v1_score: atsV1ScoreNum,
        engine: engineMode,
        hybrid_weight: hybridV1Weight,
        final: finalScore,
        resume_parser: resumeParserExplain,
        ranking_signals: rankingSignalsExplain,
        skill_gate_multiplier: skillGateMultiplier,
      },
    });
  }

  const mergedResumeDerived = mergeResumeDerivedBatches(
    parseCacheUpdates,
    structurePersistRows,
  );
  await batchUpdateResumeParseCache(mergedResumeDerived);

  for (const cid of Array.from(rankingStructureLlmEnqueue)) {
    try {
      await enqueueResumeStructureRefineJob(cid);
    } catch {
      /* Redis optional in dev */
    }
  }

  ranked.sort((a, b) => {
    const d = b.score.final_score - a.score.final_score;
    if (Math.abs(d) > TIE_EPSILON) {
      return d;
    }
    // Tie-breaker 1: higher structured skill match ratio
    const ar = a.meta?.skill_match_ratio ?? -1;
    const br = b.meta?.skill_match_ratio ?? -1;
    if (br !== ar) {
      return br - ar;
    }
    // Tie-breaker 2: lower notice period (nulls last)
    const an = a.meta?.notice_period_days;
    const bn = b.meta?.notice_period_days;
    const anVal = an == null ? Number.POSITIVE_INFINITY : an;
    const bnVal = bn == null ? Number.POSITIVE_INFINITY : bn;
    if (anVal !== bnVal) {
      return anVal - bnVal;
    }
    // Tie-breaker 3: more recent application (higher timestamp first)
    const at = a.meta?.application_created_at_ms ?? 0;
    const bt = b.meta?.application_created_at_ms ?? 0;
    if (bt !== at) {
      return bt - at;
    }
    return a.full_name.localeCompare(b.full_name);
  });

  await insertCandidateJobScoresBatch(jobScoreRows);

  return {
    requisition_item_id: item.itemId,
    req_id: item.reqId,
    ranking_version: RANKING_VERSION,
    weights: {
      keyword: weights.keyword,
      semantic: weights.semantic,
      business: weights.business,
    },
    generated_at: new Date().toISOString(),
    total_candidates: ranked.length,
    ranked_candidates: ranked,
    meta: {
      ranking_engine: engineMode,
      ats_v1_weight: hybridV1Weight,
      ranking_version_id: rankingVersionId,
      required_skills_count: requiredSkillsList.length,
    },
  };
}

function parseNumericDbWeight(v: string | number | null): number {
  if (v === null || v === undefined) {
    return 0;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function snapshotMatchesCurrentConfig(
  snapshot: RankingSnapshotRow,
  weights: RankingWeights,
): boolean {
  const kw = parseNumericDbWeight(snapshot.keywordWeight as string | null);
  const sw = parseNumericDbWeight(snapshot.semanticWeight as string | null);
  const bw = parseNumericDbWeight(snapshot.businessWeight as string | null);
  const payload = snapshot.payload as unknown as RequisitionItemRankingJson;
  const meta = payload.meta;
  if (!meta || payload.ranking_version !== RANKING_VERSION) {
    return false;
  }
  if (meta.ranking_engine !== resolveAtsRankingEngineMode()) {
    return false;
  }
  if (Math.abs(meta.ats_v1_weight - resolveAtsV1HybridWeight()) > 0.0001) {
    return false;
  }
  return (
    snapshot.rankingVersion === RANKING_VERSION &&
    Math.abs(kw - weights.keyword) <= WEIGHT_EPSILON &&
    Math.abs(sw - weights.semantic) <= WEIGHT_EPSILON &&
    Math.abs(bw - weights.business) <= WEIGHT_EPSILON
  );
}

async function selectLatestRankingSnapshot(
  itemId: number,
): Promise<RankingSnapshotRow | null> {
  const db = getDb();
  const [snapshot] = await db
    .select()
    .from(rankingSnapshots)
    .where(eq(rankingSnapshots.requisitionItemId, itemId))
    .orderBy(desc(rankingSnapshots.generatedAt), desc(rankingSnapshots.snapshotId))
    .limit(1);
  return snapshot ?? null;
}

async function persistRankingSnapshot(
  ranking: RequisitionItemRankingJson,
): Promise<void> {
  const db = getDb();
  await db.insert(rankingSnapshots).values({
    requisitionItemId: ranking.requisition_item_id,
    requisitionId: ranking.req_id,
    rankingVersion: ranking.ranking_version,
    keywordWeight: ranking.weights.keyword.toFixed(4),
    semanticWeight: ranking.weights.semantic.toFixed(4),
    businessWeight: ranking.weights.business.toFixed(4),
    payload: ranking,
    generatedAt: new Date(ranking.generated_at),
    createdAt: new Date(),
  });
}

async function resolveOrganizationIdForRequisitionItem(itemId: number): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select({ organizationId: requisitions.organizationId })
    .from(requisitionItems)
    .innerJoin(requisitions, eq(requisitionItems.reqId, requisitions.reqId))
    .where(eq(requisitionItems.itemId, itemId))
    .limit(1);
  if (!row) {
    throw new HttpError(404, `Requisition item ${itemId} not found`);
  }
  return row.organizationId;
}

export function isRankingStrictSnapshotRead(): boolean {
  const v = process.env.RANKING_STRICT_SNAPSHOT_READ?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export async function recomputeRankingForRequisitionItem(
  itemId: number,
): Promise<RequisitionItemRankingJson> {
  const weights = resolveRankingWeights();
  await deactivateRankingVersionsForItem(itemId);
  const nextVer = (await selectMaxRankingVersionNumber(itemId)) + 1;
  const engine = resolveAtsRankingEngineMode();
  const v1w = resolveAtsV1HybridWeight();
  const rankingVersionId = await insertRankingVersionRow({
    requisitionItemId: itemId,
    versionNumber: nextVer,
    config: {
      ranking_version_label: RANKING_VERSION,
      phase5_weights: weights,
      ats_v1_weight: v1w,
      ranking_engine: engine,
    },
  });
  if (rankingVersionId == null) {
    throw new HttpError(500, "Failed to create ranking version");
  }
  const ranking = await buildRankingForRequisitionItem(
    itemId,
    weights,
    rankingVersionId,
  );
  await persistRankingSnapshot(ranking);
  const organizationId = await resolveOrganizationIdForRequisitionItem(itemId);
  const candidateBuckets = new Map<number, AtsBucket>();
  for (const r of ranking.ranked_candidates) {
    candidateBuckets.set(r.candidate_id, getAtsBucketFromFinalScore(r.score.final_score));
  }
  await replaceApplicationAtsBucketsForRequisitionItem({
    requisitionItemId: itemId,
    organizationId,
    candidateBuckets,
  });
  return ranking;
}

export async function rankCandidatesForRequisitionItem(
  itemId: number,
  options?: { strictSnapshot?: boolean },
): Promise<RequisitionItemRankingJson> {
  const weights = resolveRankingWeights();
  const snapshot = await selectLatestRankingSnapshot(itemId);
  const strict = options?.strictSnapshot ?? isRankingStrictSnapshotRead();
  if (strict) {
    if (!snapshot || !snapshotMatchesCurrentConfig(snapshot, weights)) {
      throw new HttpError(
        424,
        "No valid ranking snapshot for this job; run POST /api/ranking/requisition-items/{itemId} or POST /api/ranking/recalculate first.",
      );
    }
    return snapshot.payload as unknown as RequisitionItemRankingJson;
  }
  if (snapshot && snapshotMatchesCurrentConfig(snapshot, weights)) {
    return snapshot.payload as unknown as RequisitionItemRankingJson;
  }
  return recomputeRankingForRequisitionItem(itemId);
}
