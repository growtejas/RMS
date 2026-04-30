import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { notificationEvents } from "@/lib/db/schema";

export async function insertNotificationEvent(params: {
  organizationId: string | null;
  eventType: string;
  payload: Record<string, unknown>;
  channel?: string;
}) {
  const db = getDb();
  const [row] = await db
    .insert(notificationEvents)
    .values({
      organizationId: params.organizationId,
      eventType: params.eventType,
      payload: params.payload,
      channel: params.channel ?? "email",
      status: "pending",
    })
    .returning({ id: notificationEvents.id });
  return row?.id ?? null;
}

export async function selectNotificationEventById(id: number) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(notificationEvents)
    .where(eq(notificationEvents.id, id))
    .limit(1);
  return row ?? null;
}

export async function listNotificationEventsForOrg(
  organizationId: string,
  limit = 50,
) {
  const db = getDb();
  return db
    .select()
    .from(notificationEvents)
    .where(eq(notificationEvents.organizationId, organizationId))
    .orderBy(desc(notificationEvents.createdAt))
    .limit(limit);
}

const ACTIVE = ["pending", "sent"] as const;

export async function findExistingLifecycleEventByIdempotencyKey(params: {
  organizationId: string;
  idempotencyKey: string;
}) {
  const db = getDb();
  const [row] = await db
    .select({ id: notificationEvents.id, status: notificationEvents.status })
    .from(notificationEvents)
    .where(
      and(
        eq(notificationEvents.organizationId, params.organizationId),
        sql`${notificationEvents.payload}->>'idempotency_key' = ${params.idempotencyKey}`,
        inArray(notificationEvents.status, [...ACTIVE]),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Pending outbound email events (oldest first). */
export async function listPendingNotificationEvents(limit = 25) {
  const db = getDb();
  return db
    .select()
    .from(notificationEvents)
    .where(
      and(
        eq(notificationEvents.status, "pending"),
        eq(notificationEvents.channel, "email"),
      ),
    )
    .orderBy(asc(notificationEvents.createdAt))
    .limit(limit);
}

export async function markNotificationEventSent(id: number) {
  const db = getDb();
  await db
    .update(notificationEvents)
    .set({
      status: "sent",
      sentAt: new Date(),
      errorMessage: null,
    })
    .where(eq(notificationEvents.id, id));
}

export async function markNotificationEventFailed(id: number, errorMessage: string) {
  const db = getDb();
  const trimmed = errorMessage.slice(0, 4000);
  await db
    .update(notificationEvents)
    .set({
      status: "failed",
      errorMessage: trimmed,
    })
    .where(eq(notificationEvents.id, id));
}
