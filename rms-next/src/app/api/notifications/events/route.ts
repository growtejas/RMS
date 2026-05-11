import { NextResponse } from "next/server";
import { z } from "zod";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseJsonBody } from "@/lib/http/parse-body";
import {
  countNotificationEventsForOrg,
  insertNotificationEvent,
  listNotificationEventsForOrg,
  listNotificationEventsForOrgPaged,
} from "@/lib/repositories/notification-events-repo";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination/contract";
import { parsePaginationParams } from "@/lib/pagination/zod";
import { paginatedJson } from "@/lib/pagination/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  event_type: z.string().min(1).max(80),
  payload: z.record(z.string(), z.unknown()),
  channel: z.enum(["email", "in_app"]).optional(),
});

function isCanonicalListRequest(url: URL): boolean {
  if (url.searchParams.has("page")) return true;
  const rawLimit = url.searchParams.get("limit");
  if (rawLimit == null) return false;
  const parsed = Number.parseInt(rawLimit, 10);
  return (
    Number.isFinite(parsed) &&
    (PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed)
  );
}

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
    const url = new URL(req.url);
    if (isCanonicalListRequest(url)) {
      const { page, limit } = parsePaginationParams(url);
      const offset = (page - 1) * limit;
      const [items, total] = await Promise.all([
        listNotificationEventsForOrgPaged(user.organizationId, {
          limit,
          offset,
        }),
        countNotificationEventsForOrg(user.organizationId),
      ]);
      return paginatedJson(items, { page, limit, total });
    }
    const rows = await listNotificationEventsForOrg(user.organizationId);
    const res = NextResponse.json({ events: rows });
    res.headers.set("Deprecation", "list-notifications-bare-shape");
    return res;
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
