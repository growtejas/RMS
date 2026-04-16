import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { parseJsonBody } from "@/lib/http/parse-body";
import { acknowledgeInboundEvent, resolveExternalId } from "@/lib/services/inbound-events-service";
import { partnerIngestBody } from "@/lib/validators/inbound-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/ingest/naukri — webhook-first ingestion with immediate ack. */
export async function POST(req: Request) {
  try {
    const parsed = await parseJsonBody(req, partnerIngestBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const body = parsed.data as Record<string, unknown>;
    const externalId = resolveExternalId({
      source: "naukri",
      candidates: [
        parsed.data.external_id,
        typeof body.event_id === "string" ? body.event_id : null,
        typeof body.application_id === "string" ? body.application_id : null,
      ],
    });

    const ack = await acknowledgeInboundEvent({
      source: "naukri",
      externalId,
      payload: body,
    });

    return NextResponse.json(ack, { status: 202 });
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/ingest/naukri]");
  }
}
