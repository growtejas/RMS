import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { isRealEmailConfigured } from "@/lib/email/email-transport";
import { sendShortlistEmailForApplicationJson } from "@/lib/services/applications-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { applicationId: string } };

function parseId(s: string): number | NextResponse {
  const id = Number.parseInt(s, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ detail: "Invalid application id" }, { status: 422 });
  }
  return id;
}

/** POST /api/applications/{application_id}/send-shortlist-email */
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

    const applicationId = parseId(params.applicationId);
    if (applicationId instanceof NextResponse) {
      return applicationId;
    }

    const result = await sendShortlistEmailForApplicationJson(
      applicationId,
      user.organizationId,
    );
    if (!result.ok) {
      if (result.error === "not_found") {
        return NextResponse.json({ detail: "Application not found" }, { status: 404 });
      }
      if (result.error === "delivery_failed") {
        return NextResponse.json(
          {
            error: "delivery_failed",
            detail: result.message,
          },
          { status: 502 },
        );
      }
      return NextResponse.json(
        {
          detail: "Only applications in the Shortlisted stage can receive the shortlist email.",
        },
        { status: 400 },
      );
    }
    if (result.skipped) {
      return NextResponse.json({
        enqueued: false,
        skipped: true,
        notification_event_id: result.notification_event_id,
        message:
          process.env.LIFECYCLE_NOTIFICATIONS === "0"
            ? "Lifecycle email notifications are disabled (LIFECYCLE_NOTIFICATIONS=0)."
            : "No new notification was queued (duplicate or disabled).",
      });
    }
    return NextResponse.json({
      enqueued: true,
      skipped: false,
      notification_event_id: result.notification_event_id,
      real_email: isRealEmailConfigured(),
      hint: isRealEmailConfigured()
        ? null
        : "Mail is not sent to a real inbox until you configure SMTP (SMTP_HOST, etc.) in .env or set EMAIL_WEBHOOK_URL. Check the Next.js server log for the console preview.",
    });
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/applications/.../send-shortlist-email]");
  }
}
