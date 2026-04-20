import { desc, eq } from "drizzle-orm";

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
