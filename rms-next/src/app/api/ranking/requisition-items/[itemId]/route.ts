import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { enrichRankingWithCachedAiEvaluations } from "@/lib/services/ai-evaluation/ai-evaluation-service";
import { enqueueAiEvaluationJobsBulk } from "@/lib/queue/ai-evaluation-queue";
import { withRequestPerf } from "@/lib/perf/request-perf";
import { resolveRankingEngine } from "@/lib/services/scoring/ranking-engine";
import {
  rankCandidatesForRequisitionItem,
  recomputeRankingForRequisitionItem,
  type RequisitionItemRankingJson,
} from "@/lib/services/ranking-service";
import { assertRequisitionItemInOrganization } from "@/lib/tenant/org-assert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { itemId: string } };

function toStrictAiOnlyRankingResponse(r: RequisitionItemRankingJson) {
  return {
    ranking_engine: "ai_only" as const,
    requisition_item_id: r.requisition_item_id,
    req_id: r.req_id,
    ranking_version: r.ranking_version,
    generated_at: r.generated_at,
    total_candidates: r.total_candidates,
    ranked_candidates: r.ranked_candidates.map((c) => ({
      candidate_id: c.candidate_id,
      full_name: c.full_name,
      email: c.email,
      current_stage: c.current_stage,
      meta: c.meta,
      score: c.score,
      ...(c.flags ? { flags: c.flags } : {}),
      explain: {
        ai_breakdown: c.explain.ai_breakdown,
        ai_summary: c.explain.ai_summary,
        ai_risks: c.explain.ai_risks,
        ai_confidence: c.explain.ai_confidence,
        ranking_signals: {
          ats: {
            experience_years:
              c.explain.ranking_signals?.ats?.experience_years ?? null,
          },
        },
      },
    })),
    meta: {
      ranking_engine: "ai_only" as const,
      ai_eval_enriched: Boolean(r.meta?.ai_eval_enriched),
    },
  };
}

function parseItemId(raw: string): number | NextResponse {
  const itemId = Number.parseInt(raw, 10);
  if (!Number.isFinite(itemId)) {
    return NextResponse.json({ detail: "Invalid requisition item id" }, { status: 422 });
  }
  return itemId;
}

/** GET /api/ranking/requisition-items/{itemId} — phase 5 deterministic ranking. */
export async function GET(req: Request, { params }: Ctx) {
  return withRequestPerf(
    "GET /api/ranking/requisition-items/[itemId]",
    async () => {
      try {
        const user = await requireBearerUser(req);
        if (user instanceof NextResponse) {
          return user;
        }
        const denied = requireAnyRole(user, "TA", "HR", "Admin", "Manager");
        if (denied) {
          return denied;
        }

        const itemId = parseItemId(params.itemId);
        if (itemId instanceof NextResponse) {
          return itemId;
        }

        const engine = resolveRankingEngine();
        if (engine.engine !== "ai_only") {
          return NextResponse.json(
            {
              detail: `Ranking engine misconfigured: expected ai_only, got ${engine.engine} (env RANKING_ENGINE=${process.env.RANKING_ENGINE ?? ""})`,
            },
            { status: 500 },
          );
        }

        const url = new URL(req.url);
        const strictSnapshot =
          url.searchParams.get("strict_snapshot") === "1" ||
          url.searchParams.get("strict_snapshot") === "true";

        const data = await rankCandidatesForRequisitionItem(itemId, {
          strictSnapshot,
        });
        await assertRequisitionItemInOrganization(itemId, user.organizationId);
        const enriched = await enrichRankingWithCachedAiEvaluations({
          organizationId: user.organizationId,
          itemId,
          ranking: data,
        });

        // Phase 4 default: GET is read-only. AI backfill is owned by the
        // recompute POST (single bulk enqueue after snapshot write) and the
        // periodic backfill scheduler. Set `RMS_RANKING_NO_ENQUEUE=false` to
        // restore the legacy in-line behaviour during rollback.
        if (process.env.RMS_RANKING_NO_ENQUEUE === "false") {
          const pending = enriched.ranked_candidates
            .filter(
              (r) =>
                r.score.ai_status === "PENDING" || r.score.final_score == null,
            )
            .map((r) => ({
              organizationId: user.organizationId,
              itemId,
              candidateId: r.candidate_id,
            }));
          if (pending.length > 0) {
            try {
              await enqueueAiEvaluationJobsBulk(pending);
            } catch {
              /* optional redis */
            }
          }
        }

        return NextResponse.json(toStrictAiOnlyRankingResponse(enriched));
      } catch (e) {
        return referenceWriteCatch(
          e,
          "[GET /api/ranking/requisition-items/[itemId]]",
        );
      }
    },
  );
}

/** POST /api/ranking/requisition-items/{itemId} — force ranking recompute + snapshot write. */
export async function POST(req: Request, { params }: Ctx) {
  return withRequestPerf(
    "POST /api/ranking/requisition-items/[itemId]",
    async () => {
      try {
        const user = await requireBearerUser(req);
        if (user instanceof NextResponse) {
          return user;
        }
        const denied = requireAnyRole(user, "TA", "HR", "Admin", "Manager");
        if (denied) {
          return denied;
        }

        const itemId = parseItemId(params.itemId);
        if (itemId instanceof NextResponse) {
          return itemId;
        }

        const engine = resolveRankingEngine();
        if (engine.engine !== "ai_only") {
          return NextResponse.json(
            {
              detail: `Ranking engine misconfigured: expected ai_only, got ${engine.engine} (env RANKING_ENGINE=${process.env.RANKING_ENGINE ?? ""})`,
            },
            { status: 500 },
          );
        }

        const data = await recomputeRankingForRequisitionItem(itemId);

        // Phase 4 - bulk enqueue AI backfill once per snapshot write instead
        // of N sequential `Queue.add()` calls in the GET hot path. Best-effort:
        // missing Redis must not regress write latency.
        if (process.env.RMS_RANKING_NO_ENQUEUE !== "false") {
          const pending = data.ranked_candidates
            .filter(
              (r) =>
                r.score.ai_status === "PENDING" || r.score.final_score == null,
            )
            .map((r) => ({
              organizationId: user.organizationId,
              itemId,
              candidateId: r.candidate_id,
            }));
          if (pending.length > 0) {
            try {
              await enqueueAiEvaluationJobsBulk(pending);
            } catch {
              /* optional redis */
            }
          }
        }

        return NextResponse.json(toStrictAiOnlyRankingResponse(data));
      } catch (e) {
        return referenceWriteCatch(
          e,
          "[POST /api/ranking/requisition-items/[itemId]]",
        );
      }
    },
  );
}
