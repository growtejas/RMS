import type {
  ApplicationsAtsBucketsResponse,
  RequisitionItemRankingResponse,
} from "@/lib/api/candidateApi";

export const ATS_QUALITY_BUCKET_KEYS = [
  "BEST",
  "VERY_GOOD",
  "GOOD",
  "AVERAGE",
  "NOT_SUITABLE",
  "UNRANKED",
] as const;

export type AtsQualityBucketKey = (typeof ATS_QUALITY_BUCKET_KEYS)[number];

/**
 * All candidate_ids shown on the quality bucket board (all buckets + UNRANKED).
 */
export function collectBoardCandidateIds(
  buckets: ApplicationsAtsBucketsResponse,
): Set<number> {
  const out = new Set<number>();
  for (const b of ATS_QUALITY_BUCKET_KEYS) {
    for (const app of buckets[b] ?? []) {
      out.add(app.candidate_id);
    }
  }
  return out;
}

/**
 * True if any board candidate is missing a finalized AI+numeric score in the
 * given ranking snapshot (used to decide whether to keep polling).
 */
export function isAiStillPending(
  boardCandidateIds: Set<number>,
  ranking: RequisitionItemRankingResponse | null,
): boolean {
  if (boardCandidateIds.size === 0) return false;
  const m = new Map<
    number,
    { final_score: number | null; ai_status: "OK" | "PENDING" | "UNAVAILABLE" }
  >();
  for (const rc of ranking?.ranked_candidates ?? []) {
    m.set(rc.candidate_id, {
      final_score: rc.score.final_score,
      ai_status: rc.score.ai_status,
    });
  }
  for (const cid of Array.from(boardCandidateIds)) {
    const s = m.get(cid);
    if (!s || s.ai_status !== "OK" || s.final_score == null) {
      return true;
    }
  }
  return false;
}
