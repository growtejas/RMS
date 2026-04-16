import { desc, eq, inArray } from "drizzle-orm";
import path from "node:path";

import { getDb } from "@/lib/db";
import {
  candidates,
  interviews,
  rankingSnapshots,
  requisitionItems,
} from "@/lib/db/schema";
import { HttpError } from "@/lib/http/http-error";
import {
  cosineSimilarity,
  ensureCandidateEmbedding,
  ensureRequisitionItemEmbedding,
} from "@/lib/services/embeddings-service";
import { parseResumeArtifact } from "@/lib/services/resume-parser-service";

type RankedCandidateScore = {
  keyword_score: number;
  semantic_score: number;
  business_score: number;
  final_score: number;
};

type RankedCandidateExplain = {
  reasons: string[];
  matched_terms: string[];
  missing_terms: string[];
};

export type RankedCandidateRow = {
  candidate_id: number;
  requisition_item_id: number;
  full_name: string;
  email: string;
  current_stage: string;
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
};

const RANKING_VERSION = "phase5-v3-embeddings";
const DEFAULT_KEYWORD_WEIGHT = 0.4;
const DEFAULT_SEMANTIC_WEIGHT = 0.25;
const DEFAULT_BUSINESS_WEIGHT = 0.35;
const WEIGHT_EPSILON = 0.0001;
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
  "years",
  "year",
  "skills",
  "skill",
]);

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

function resolveResumeReference(resumePathValue: string | null): string | null {
  if (!resumePathValue || !resumePathValue.trim()) {
    return null;
  }
  const v = resumePathValue.trim();
  if (/^https?:\/\//i.test(v)) {
    return v;
  }
  if (path.isAbsolute(v)) {
    return v;
  }
  if (v.includes("/") || v.includes("\\")) {
    return path.join(process.cwd(), v);
  }
  return path.join(process.cwd(), "uploads", "resumes", v);
}

async function buildRankingForRequisitionItem(
  itemId: number,
  weights: RankingWeights,
): Promise<RequisitionItemRankingJson> {
  const db = getDb();
  const [item] = await db
    .select()
    .from(requisitionItems)
    .where(eq(requisitionItems.itemId, itemId))
    .limit(1);
  if (!item) {
    throw new HttpError(404, `Requisition item ${itemId} not found`);
  }

  const candidateRows = await db
    .select()
    .from(candidates)
    .where(eq(candidates.requisitionItemId, itemId));

  const candidateIds = candidateRows.map((c) => c.candidateId);
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

  const requiredText = [
    item.rolePosition,
    item.skillLevel,
    item.educationRequirement,
    item.requirements,
    item.jobDescription,
  ]
    .filter(Boolean)
    .join(" ");
  const requiredTerms = toTerms([requiredText]).slice(0, 40);
  const itemEmbedding = await ensureRequisitionItemEmbedding({
    requisitionItemId: item.itemId,
    requisitionId: item.reqId,
    sourceText: requiredText,
  });

  const ranked: RankedCandidateRow[] = [];
  for (const candidate of candidateRows) {
    const ivs = interviewsByCandidate.get(candidate.candidateId) ?? [];
    const ivTexts = ivs.flatMap((i) => [
      i.interviewerName,
      i.feedback ?? "",
      i.result ?? "",
      i.status,
    ]);

    const resumeRef = resolveResumeReference(candidate.resumePath);
    let resumeStatus: "processed" | "failed" | "skipped" = "skipped";
    let resumeTerms: string[] = [];
    let resumeRawText = "";
    if (resumeRef) {
      const parsed = await parseResumeArtifact({
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
      resumeStatus = parsed.status;
      const parsedSkills = Array.isArray(parsed.parsedData.skills)
        ? parsed.parsedData.skills.filter((s): s is string => typeof s === "string")
        : [];
      resumeRawText = parsed.rawText ?? "";
      resumeTerms = toTerms([parsed.rawText ?? "", parsedSkills.join(" ")]);
    }

    const emailLocal = candidate.email.split("@")[0] ?? candidate.email;
    const candidateTerms = toTerms([
      candidate.fullName,
      emailLocal,
      candidate.currentCompany,
      candidate.resumePath,
      resumeTerms.join(" "),
      ...ivTexts,
    ]);
    const candidateSemanticText = [
      candidate.fullName,
      candidate.currentCompany,
      candidate.resumePath,
      resumeRawText,
      resumeTerms.join(" "),
      ...ivTexts,
    ]
      .filter(Boolean)
      .join(" ");

    const matchedTerms = requiredTerms.filter((t) => candidateTerms.includes(t));
    const missingTerms = requiredTerms.filter((t) => !candidateTerms.includes(t));

    const keywordScore =
      requiredTerms.length === 0
        ? 50
        : clamp((matchedTerms.length / requiredTerms.length) * 100);
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

    const finalScore = clamp(
      keywordScore * weights.keyword +
        semanticScore * weights.semantic +
        businessScore * weights.business,
    );

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
    reasons.push(`Stage signal: ${candidate.currentStage}`);
    reasons.push(`Resume parse status: ${resumeStatus}`);
    if (passCount > 0 || failCount > 0 || holdCount > 0) {
      reasons.push(
        `Interview outcomes: pass=${passCount}, hold=${holdCount}, fail=${failCount}`,
      );
    } else {
      reasons.push("Interview outcomes: no completed interview results yet");
    }

    ranked.push({
      candidate_id: candidate.candidateId,
      requisition_item_id: candidate.requisitionItemId,
      full_name: candidate.fullName,
      email: candidate.email,
      current_stage: candidate.currentStage,
      score: {
        keyword_score: Number(keywordScore.toFixed(2)),
        semantic_score: Number(semanticScore.toFixed(2)),
        business_score: Number(businessScore.toFixed(2)),
        final_score: Number(finalScore.toFixed(2)),
      },
      explain: {
        reasons,
        matched_terms: matchedTerms.slice(0, 15),
        missing_terms: missingTerms.slice(0, 15),
      },
    } satisfies RankedCandidateRow);
  }

  ranked.sort((a, b) => {
    if (b.score.final_score !== a.score.final_score) {
      return b.score.final_score - a.score.final_score;
    }
    return a.full_name.localeCompare(b.full_name);
  });

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

export async function recomputeRankingForRequisitionItem(
  itemId: number,
): Promise<RequisitionItemRankingJson> {
  const weights = resolveRankingWeights();
  const ranking = await buildRankingForRequisitionItem(itemId, weights);
  await persistRankingSnapshot(ranking);
  return ranking;
}

export async function rankCandidatesForRequisitionItem(
  itemId: number,
): Promise<RequisitionItemRankingJson> {
  const weights = resolveRankingWeights();
  const snapshot = await selectLatestRankingSnapshot(itemId);
  if (snapshot && snapshotMatchesCurrentConfig(snapshot, weights)) {
    return snapshot.payload as unknown as RequisitionItemRankingJson;
  }
  return recomputeRankingForRequisitionItem(itemId);
}
