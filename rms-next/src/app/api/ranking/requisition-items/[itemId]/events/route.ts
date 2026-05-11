import { NextResponse } from "next/server";

import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import {
  subscribeAiEvalForItem,
  type AiEvalCompletedEvent,
} from "@/lib/queue/ai-evaluation-events";
import { assertRequisitionItemInOrganization } from "@/lib/tenant/org-assert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { itemId: string } };

function parseItemId(raw: string): number | NextResponse {
  const itemId = Number.parseInt(raw, 10);
  if (!Number.isFinite(itemId)) {
    return NextResponse.json(
      { detail: "Invalid requisition item id" },
      { status: 422 },
    );
  }
  return itemId;
}

/**
 * GET /api/ranking/requisition-items/{itemId}/events
 *
 * Phase 4 SSE channel. Streams `ai_eval_completed` events for the given
 * requisition item until the client disconnects. Replaces the 4 s polling
 * loop in `useAtsAiScorePolling`.
 *
 * Event format:
 *
 *   event: ai_eval_completed
 *   data: {"itemId":1,"candidateId":42,"status":"OK","finalScore":0.83}
 *
 * Heartbeat: a comment frame is emitted every 25 s so proxies and the
 * browser EventSource don't time out the idle connection.
 */
export async function GET(req: Request, { params }: Ctx) {
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

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      // Initial comment to flush headers.
      safeEnqueue(": connected\n\n");

      const sub = subscribeAiEvalForItem(
        itemId,
        (event: AiEvalCompletedEvent) => {
          safeEnqueue(
            `event: ai_eval_completed\ndata: ${JSON.stringify({
              itemId: event.itemId,
              candidateId: event.candidateId,
              status: event.status,
              finalScore: event.finalScore,
              emittedAt: event.emittedAt,
            })}\n\n`,
          );
        },
      );

      const heartbeat = setInterval(() => {
        safeEnqueue(`: heartbeat ${Date.now()}\n\n`);
      }, 25_000);

      const onAbort = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        void sub.close();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", onAbort, { once: true });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
