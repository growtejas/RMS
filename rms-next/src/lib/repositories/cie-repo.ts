import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  candidateAiConversations,
  candidateParsedData,
  candidateReports,
} from "@/lib/db/schema";
import type { CandidateReport, ParsedCandidate } from "@/lib/services/cie/cie.schema";

export async function selectMaxParsedVersion(candidateId: number): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ m: sql<number>`coalesce(max(${candidateParsedData.version}), 0)` })
    .from(candidateParsedData)
    .where(eq(candidateParsedData.candidateId, candidateId));
  return row?.m ?? 0;
}

export async function insertParsedDataRow(params: {
  organizationId: string;
  candidateId: number;
  parsed: ParsedCandidate;
  sourceResumeContentHash: string | null;
}): Promise<number> {
  const db = getDb();
  const nextVersion = (await selectMaxParsedVersion(params.candidateId)) + 1;
  const [row] = await db
    .insert(candidateParsedData)
    .values({
      organizationId: params.organizationId,
      candidateId: params.candidateId,
      parsedJson: params.parsed,
      version: nextVersion,
      sourceResumeContentHash: params.sourceResumeContentHash,
      createdAt: new Date(),
    })
    .returning({ id: candidateParsedData.id });
  return row?.id ?? 0;
}

export async function selectLatestParsedRow(
  candidateId: number,
  organizationId: string,
): Promise<{
  id: number;
  version: number;
  parsed: ParsedCandidate;
  sourceResumeContentHash: string | null;
} | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(candidateParsedData)
    .where(
      and(
        eq(candidateParsedData.candidateId, candidateId),
        eq(candidateParsedData.organizationId, organizationId),
      ),
    )
    .orderBy(desc(candidateParsedData.version))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    version: row.version,
    parsed: row.parsedJson as ParsedCandidate,
    sourceResumeContentHash: row.sourceResumeContentHash,
  };
}

export async function selectLatestReportRow(
  candidateId: number,
  organizationId: string,
): Promise<{
  id: number;
  report: CandidateReport;
  confidenceScore: number;
  modelVersion: string;
  aiEvaluatedAt: Date;
  errorMessage: string | null;
} | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(candidateReports)
    .where(
      and(
        eq(candidateReports.candidateId, candidateId),
        eq(candidateReports.organizationId, organizationId),
      ),
    )
    .orderBy(desc(candidateReports.aiEvaluatedAt))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    report: row.reportJson as CandidateReport,
    confidenceScore: row.confidenceScore,
    modelVersion: row.modelVersion,
    aiEvaluatedAt: row.aiEvaluatedAt,
    errorMessage: row.errorMessage,
  };
}

export async function insertReportRow(params: {
  organizationId: string;
  candidateId: number;
  report: CandidateReport;
  confidenceScore: number;
  modelVersion: string;
  processingTimeMs: number;
  triggeredBy: number | null;
  errorMessage?: string | null;
}): Promise<number> {
  const db = getDb();
  const [row] = await db
    .insert(candidateReports)
    .values({
      organizationId: params.organizationId,
      candidateId: params.candidateId,
      reportJson: params.report,
      confidenceScore: params.confidenceScore,
      modelVersion: params.modelVersion,
      aiEvaluatedAt: new Date(),
      processingTimeMs: params.processingTimeMs,
      triggeredBy: params.triggeredBy,
      errorMessage: params.errorMessage ?? null,
      createdAt: new Date(),
    })
    .returning({ id: candidateReports.id });
  return row?.id ?? 0;
}

export async function insertConversationRow(params: {
  organizationId: string;
  candidateId: number;
  question: string;
  answer: string;
  confidence: number | null;
  modelVersion: string;
}): Promise<number> {
  const db = getDb();
  const [row] = await db
    .insert(candidateAiConversations)
    .values({
      organizationId: params.organizationId,
      candidateId: params.candidateId,
      question: params.question,
      answer: params.answer,
      confidence: params.confidence != null ? String(params.confidence) : null,
      modelVersion: params.modelVersion,
      createdAt: new Date(),
    })
    .returning({ id: candidateAiConversations.id });
  return row?.id ?? 0;
}

export async function listConversationRows(params: {
  candidateId: number;
  organizationId: string;
  limit: number;
}): Promise<
  Array<{
    id: number;
    question: string;
    answer: string;
    confidence: string | null;
    createdAt: Date;
  }>
> {
  const db = getDb();
  const lim = Math.min(Math.max(params.limit, 1), 100);
  return db
    .select({
      id: candidateAiConversations.id,
      question: candidateAiConversations.question,
      answer: candidateAiConversations.answer,
      confidence: candidateAiConversations.confidence,
      createdAt: candidateAiConversations.createdAt,
    })
    .from(candidateAiConversations)
    .where(
      and(
        eq(candidateAiConversations.candidateId, params.candidateId),
        eq(candidateAiConversations.organizationId, params.organizationId),
      ),
    )
    .orderBy(desc(candidateAiConversations.createdAt))
    .limit(lim);
}

/** Latest CIE report per candidate (for ATS board enrichment). */
export async function selectLatestReportFieldsByCandidateIds(
  organizationId: string,
  candidateIds: number[],
): Promise<
  Map<
    number,
    {
      suitable_roles: string[];
      experience_level: string | null;
    }
  >
> {
  const out = new Map<
    number,
    { suitable_roles: string[]; experience_level: string | null }
  >();
  if (candidateIds.length === 0) return out;

  const unique = Array.from(new Set(candidateIds));
  const db = getDb();
  const rows = await db
    .select({
      candidateId: candidateReports.candidateId,
      reportJson: candidateReports.reportJson,
      aiEvaluatedAt: candidateReports.aiEvaluatedAt,
    })
    .from(candidateReports)
    .where(
      and(
        eq(candidateReports.organizationId, organizationId),
        inArray(candidateReports.candidateId, unique),
        isNull(candidateReports.errorMessage),
      ),
    )
    .orderBy(asc(candidateReports.candidateId), desc(candidateReports.aiEvaluatedAt));

  for (const r of rows) {
    if (out.has(r.candidateId)) continue;
    const rep = r.reportJson as CandidateReport;
    out.set(r.candidateId, {
      suitable_roles: rep.suitableRoles ?? [],
      experience_level: rep.experienceLevel ?? null,
    });
  }
  return out;
}

/** Latest CIE run metadata per candidate (for org-wide CIE roster). */
export async function selectLatestCieSummaryForCandidateIds(
  organizationId: string,
  candidateIds: number[],
): Promise<
  Map<
    number,
    {
      lastEvaluatedAt: Date;
      confidenceScore: number;
      modelVersion: string;
      errorMessage: string | null;
    }
  >
> {
  const out = new Map<
    number,
    {
      lastEvaluatedAt: Date;
      confidenceScore: number;
      modelVersion: string;
      errorMessage: string | null;
    }
  >();
  if (candidateIds.length === 0) return out;

  const unique = Array.from(new Set(candidateIds));
  const db = getDb();
  const rows = await db
    .select({
      candidateId: candidateReports.candidateId,
      aiEvaluatedAt: candidateReports.aiEvaluatedAt,
      confidenceScore: candidateReports.confidenceScore,
      modelVersion: candidateReports.modelVersion,
      errorMessage: candidateReports.errorMessage,
    })
    .from(candidateReports)
    .where(
      and(
        eq(candidateReports.organizationId, organizationId),
        inArray(candidateReports.candidateId, unique),
      ),
    )
    .orderBy(asc(candidateReports.candidateId), desc(candidateReports.aiEvaluatedAt));

  for (const r of rows) {
    if (out.has(r.candidateId)) continue;
    out.set(r.candidateId, {
      lastEvaluatedAt: r.aiEvaluatedAt,
      confidenceScore: r.confidenceScore,
      modelVersion: r.modelVersion,
      errorMessage: r.errorMessage,
    });
  }
  return out;
}
