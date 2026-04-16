import { randomUUID } from "node:crypto";

import { logError } from "@/lib/logging/logger";
import { enqueueProcessInboundEventJob } from "@/lib/queue/inbound-events-queue";
import { insertInboundEvent } from "@/lib/repositories/inbound-events-repo";

type IngestionSource = "public_apply" | "linkedin" | "naukri" | "bulk";

function cleanExternalId(candidate?: string | null): string | null {
  const value = candidate?.trim();
  if (!value) {
    return null;
  }
  return value.slice(0, 255);
}

export function resolveExternalId(params: {
  source: IngestionSource;
  candidates: Array<string | null | undefined>;
}): string {
  for (const candidate of params.candidates) {
    const cleaned = cleanExternalId(candidate);
    if (cleaned) {
      return cleaned;
    }
  }
  return `${params.source}:${randomUUID()}`;
}

export async function acknowledgeInboundEvent(params: {
  source: IngestionSource;
  externalId: string;
  payload: Record<string, unknown>;
}) {
  const saved = await insertInboundEvent({
    source: params.source,
    externalId: params.externalId,
    payload: params.payload,
    status: "received",
  });

  let enqueued = false;
  if (!saved.duplicate) {
    try {
      await enqueueProcessInboundEventJob(saved.row.inboundEventId);
      enqueued = true;
    } catch (e) {
      logError("Failed to enqueue inbound event job", e, {
        inbound_event_id: saved.row.inboundEventId,
        source: saved.row.source,
      });
    }
  }

  return {
    accepted: true,
    inbound_event_id: saved.row.inboundEventId,
    source: saved.row.source,
    external_id: saved.row.externalId,
    status: saved.row.status,
    duplicate: saved.duplicate,
    enqueued,
    received_at: saved.row.receivedAt.toISOString(),
  };
}
