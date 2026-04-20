import { NextResponse } from "next/server";
import { z } from "zod";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseJsonBody } from "@/lib/http/parse-body";
import {
  insertNotificationEvent,
  listNotificationEventsForOrg,
} from "@/lib/repositories/notification-events-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  event_type: z.string().min(1).max(80),
  payload: z.record(z.string(), z.unknown()),
  channel: z.enum(["email", "in_app"]).optional(),
});

export async function GET(req: Request) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "HR", "Admin", "TA");
    if (denied) {
      return denied;
    }
    const rows = await listNotificationEventsForOrg(user.organizationId);
    return NextResponse.json({ events: rows });
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/notifications/events]");
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "HR", "Admin", "TA");
    if (denied) {
      return denied;
    }
    const parsed = await parseJsonBody(req, postSchema);
    if (!parsed.ok) {
      return parsed.response;
    }
    const id = await insertNotificationEvent({
      organizationId: user.organizationId,
      eventType: parsed.data.event_type,
      payload: parsed.data.payload,
      channel: parsed.data.channel ?? "email",
    });
    return NextResponse.json({ notification_id: id, status: "pending" }, { status: 202 });
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/notifications/events]");
  }
}
