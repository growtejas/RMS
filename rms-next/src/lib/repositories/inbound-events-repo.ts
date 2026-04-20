import { and, count, desc, eq, isNotNull } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { inboundEvents } from "@/lib/db/schema";

export type InboundEventStatus = "received" | "processing" | "processed" | "failed";
export type InboundEventRow = typeof inboundEvents.$inferSelect;

export async function insertInboundEvent(params: {
  organizationId: string;
  source: string;
  externalId: string;
  payload: Record<string, unknown>;
  status?: InboundEventStatus;
}): Promise<{ row: InboundEventRow; duplicate: boolean }> {
  const db = getDb();
  const [inserted] = await db
    .insert(inboundEvents)
    .values({
      organizationId: params.organizationId,
      source: params.source,
      externalId: params.externalId,
      payload: params.payload,
      status: params.status ?? "received",
      retryCount: 0,
      maxRetries: 5,
      receivedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing({
      target: [inboundEvents.source, inboundEvents.externalId],
    })
    .returning();

  if (inserted) {
    return { row: inserted, duplicate: false };
  }

  const [existing] = await db
    .select()
    .from(inboundEvents)
    .where(
      and(
        eq(inboundEvents.source, params.source),
        eq(inboundEvents.externalId, params.externalId),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new Error("Failed to persist inbound event");
  }

  return { row: existing, duplicate: true };
}

export async function selectInboundEventById(
  inboundEventId: number,
): Promise<InboundEventRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(inboundEvents)
    .where(eq(inboundEvents.inboundEventId, inboundEventId))
    .limit(1);
  return row ?? null;
}

export async function markInboundEventProcessing(inboundEventId: number): Promise<void> {
  const db = getDb();
  await db
    .update(inboundEvents)
    .set({
      status: "processing",
      updatedAt: new Date(),
      lastError: null,
    })
    .where(eq(inboundEvents.inboundEventId, inboundEventId));
}

export async function markInboundEventProcessed(
  inboundEventId: number,
  options?: { dedupeReview?: unknown | null },
): Promise<void> {
  const db = getDb();
  await db
    .update(inboundEvents)
    .set({
      status: "processed",
      processedAt: new Date(),
      lastError: null,
      updatedAt: new Date(),
      ...(options !== undefined && options.dedupeReview !== undefined
        ? { dedupeReview: options.dedupeReview }
        : {}),
    })
    .where(eq(inboundEvents.inboundEventId, inboundEventId));
}

/** Inbound rows flagged during Phase 3 soft dedupe (same line, different email). */
export async function selectInboundEventsWithDedupeReview(
  limit = 50,
): Promise<
  {
    inboundEventId: number;
    source: string;
    externalId: string;
    status: string;
    receivedAt: Date;
    processedAt: Date | null;
    dedupeReview: unknown;
  }[]
> {
  const db = getDb();
  return db
    .select({
      inboundEventId: inboundEvents.inboundEventId,
      source: inboundEvents.source,
      externalId: inboundEvents.externalId,
      status: inboundEvents.status,
      receivedAt: inboundEvents.receivedAt,
      processedAt: inboundEvents.processedAt,
      dedupeReview: inboundEvents.dedupeReview,
    })
    .from(inboundEvents)
    .where(isNotNull(inboundEvents.dedupeReview))
    .orderBy(desc(inboundEvents.inboundEventId))
    .limit(limit);
}

export async function markInboundEventRetry(params: {
  inboundEventId: number;
  attemptsMade: number;
  errorMessage: string;
}): Promise<void> {
  const db = getDb();
  await db
    .update(inboundEvents)
    .set({
      status: "received",
      retryCount: params.attemptsMade,
      lastError: params.errorMessage.slice(0, 4000),
      updatedAt: new Date(),
    })
    .where(eq(inboundEvents.inboundEventId, params.inboundEventId));
}

export async function markInboundEventFailed(params: {
  inboundEventId: number;
  attemptsMade: number;
  errorMessage: string;
}): Promise<void> {
  const db = getDb();
  await db
    .update(inboundEvents)
    .set({
      status: "failed",
      retryCount: params.attemptsMade,
      lastError: params.errorMessage.slice(0, 4000),
      updatedAt: new Date(),
    })
    .where(eq(inboundEvents.inboundEventId, params.inboundEventId));
}

async function countByStatus(status: InboundEventStatus): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ c: count() })
    .from(inboundEvents)
    .where(eq(inboundEvents.status, status));
  return Number(row?.c ?? 0);
}

export async function getInboundEventStatusCounts(): Promise<{
  received: number;
  processing: number;
  processed: number;
  failed: number;
  total: number;
}> {
  const [received, processing, processed, failed] = await Promise.all([
    countByStatus("received"),
    countByStatus("processing"),
    countByStatus("processed"),
    countByStatus("failed"),
  ]);
  return {
    received,
    processing,
    processed,
    failed,
    total: received + processing + processed + failed,
  };
}
