import { NextResponse } from "next/server";
import { z } from "zod";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { executeAiEvaluationsForItem } from "@/lib/services/ai-evaluation/ai-evaluation-service";
import { rankCandidatesForRequisitionItem } from "@/lib/services/ranking-service";
import { assertRequisitionItemInOrganization } from "@/lib/tenant/org-assert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Allow long 429 backoffs + many candidates (Vercel / hosted limits; ignored locally). */
export const maxDuration = 600;

const bodySchema = z
  .object({
    candidate_ids: z.array(z.number().int().positive()).max(500).optional(),
    top_n: z.number().int().min(1).max(100).optional(),
    force: z.boolean().optional(),
    /** When true, each result includes `eval_input` (normalized job + candidate sent to the LLM, before length clipping). */
    include_eval_input: z.boolean().optional(),
  })
  .strict();

type Ctx = { params: { itemId: string } };

function parseItemId(raw: string): number | NextResponse {
  const itemId = Number.parseInt(raw, 10);
  if (!Number.isFinite(itemId)) {
    return NextResponse.json({ detail: "Invalid requisition item id" }, { status: 422 });
  }
  return itemId;
}

/**
 * POST /api/ranking/requisition-items/{itemId}/ai-evaluation
 * Body: { candidate_ids?: number[], top_n?: number, force?: boolean, include_eval_input?: boolean }
 * When both `candidate_ids` and `top_n` are set, `candidate_ids` wins.
 */
export async function POST(req: Request, { params }: Ctx) {
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

    await assertRequisitionItemInOrganization(itemId, user.organizationId);

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      json = {};
    }
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { detail: "Invalid body", issues: parsed.error.flatten() },
        { status: 422 },
      );
    }
    const { candidate_ids, top_n, force, include_eval_input } = parsed.data;

    let targetIds: number[] = [];
    if (candidate_ids && candidate_ids.length > 0) {
      targetIds = Array.from(new Set(candidate_ids));
    } else if (top_n != null) {
      const ranking = await rankCandidatesForRequisitionItem(itemId, {
        strictSnapshot: false,
      });
      targetIds = ranking.ranked_candidates.slice(0, top_n).map((r) => r.candidate_id);
    } else {
      return NextResponse.json(
        {
          detail:
            "Provide candidate_ids (non-empty array) or top_n (1–100) in the JSON body.",
          example: { top_n: 5 },
          example_ids: { candidate_ids: [1, 2, 3], force: false },
          example_debug: { top_n: 3, include_eval_input: true },
        },
        { status: 422 },
      );
    }

    const out = await executeAiEvaluationsForItem({
      organizationId: user.organizationId,
      itemId,
      candidateIds: targetIds,
      force: force === true,
      includeEvalInput: include_eval_input === true,
    });

    return NextResponse.json({
      requisition_item_id: itemId,
      ...out,
    });
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/ranking/requisition-items/[itemId]/ai-evaluation]");
  }
}
