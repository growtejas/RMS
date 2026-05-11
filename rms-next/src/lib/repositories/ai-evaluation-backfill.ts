import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db";

export type AiEvalBackfillRow = {
  organizationId: string;
  requisitionItemId: number;
  candidateId: number;
};

/**
 * Phase 4 / 7 - find applications whose ranking still has no cached AI
 * evaluation row. Caps each scan so a single tick cannot saturate the
 * queue or the DB. Ordered by oldest application first to avoid head-of-line
 * blocking on freshly-created candidates.
 *
 * The query stays inside the worker pool because it is intended to be run
 * by `process-ai-eval-backfill-worker.ts`; web pods must not import this
 * file (Phase 7 invariant).
 */
export async function selectApplicationsNeedingAiEval(
  limit: number,
): Promise<AiEvalBackfillRow[]> {
  const db = getDb();
  const safeLimit = Math.min(Math.max(limit, 1), 1000);
  const rows = await db.execute(sql<{
    organization_id: string;
    requisition_item_id: number;
    candidate_id: number;
  }>`
    SELECT a.organization_id, a.requisition_item_id, a.candidate_id
    FROM applications a
    LEFT JOIN candidate_ai_evaluations e
      ON e.requisition_item_id = a.requisition_item_id
     AND e.candidate_id = a.candidate_id
    WHERE e.evaluation_id IS NULL
    ORDER BY a.created_at ASC NULLS LAST
    LIMIT ${safeLimit}
  `);
  return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
    organizationId: String(r.organization_id),
    requisitionItemId: Number(r.requisition_item_id),
    candidateId: Number(r.candidate_id),
  }));
}
