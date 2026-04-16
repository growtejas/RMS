import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { parseJsonBody } from "@/lib/http/parse-body";
import { acknowledgeInboundEvent, resolveExternalId } from "@/lib/services/inbound-events-service";
import { bulkIngestBody } from "@/lib/validators/inbound-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/ingest/bulk — enqueue many inbound events with per-item ack metadata. */
export async function POST(req: Request) {
  try {
    const parsed = await parseJsonBody(req, bulkIngestBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const acks = await Promise.all(
      parsed.data.events.map((event) => {
        const rawPayload = (event.payload ?? event) as Record<string, unknown>;
        const externalId = resolveExternalId({
          source: "bulk",
          candidates: [
            event.external_id,
            typeof rawPayload.external_id === "string" ? rawPayload.external_id : null,
            typeof rawPayload.event_id === "string" ? rawPayload.event_id : null,
          ],
        });
        return acknowledgeInboundEvent({
          source: "bulk",
          externalId,
          payload: rawPayload,
        });
      }),
    );

    const duplicateCount = acks.filter((ack) => ack.duplicate).length;
    return NextResponse.json(
      {
        accepted: true,
        accepted_count: acks.length,
        duplicate_count: duplicateCount,
        events: acks,
      },
      { status: 202 },
    );
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/ingest/bulk]");
  }
}
