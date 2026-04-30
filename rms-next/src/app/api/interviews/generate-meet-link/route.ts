import { NextResponse } from "next/server";

import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { envelopeCatch, envelopeFail, envelopeOk } from "@/lib/http/api-envelope";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import { generateGoogleMeetLink } from "@/lib/integrations/google-calendar-meet";
import { interviewGenerateMeetLinkBody } from "@/lib/validators/interviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/interviews/generate-meet-link */
export async function POST(req: Request) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "TA", "HR", "Admin", "Manager");
    if (denied) {
      return denied;
    }
    const parsed = await parseFastapiJsonBody(req, interviewGenerateMeetLinkBody);
    if (!parsed.ok) {
      const errBody = await parsed.response.json();
      return envelopeFail(
        typeof errBody.detail === "string" ? errBody.detail : "Invalid request body",
        422,
      );
    }
    const start = new Date(parsed.data.scheduled_at);
    const end = new Date(parsed.data.end_time);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return envelopeFail("Invalid interview time window", 422);
    }
    const candidateName = parsed.data.candidate_name?.trim() || "Candidate";
    const roundName = parsed.data.round_name?.trim() || "Interview Round";
    const roundType = parsed.data.round_type?.trim();
    const interviewerList =
      parsed.data.interviewer_names?.filter(Boolean).join(", ") || "";
    const title = `${roundName}${roundType ? ` (${roundType})` : ""} - ${candidateName}`;
    const description = interviewerList
      ? `Interviewers: ${interviewerList}`
      : "Interview scheduled via RMS";

    const out = await generateGoogleMeetLink({
      userId: user.userId,
      organizationId: user.organizationId,
      scheduledAtIso: start.toISOString(),
      endTimeIso: end.toISOString(),
      timezone: parsed.data.timezone.trim(),
      title,
      description,
    });
    return envelopeOk({
      meeting_link: out.meetLink,
      google_calendar_event_id: out.eventId,
      token_source: out.tokenSource,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      msg.includes("token missing") ||
      msg.includes("scope") ||
      msg.includes("disabled")
    ) {
      return envelopeFail(msg, 400);
    }
    if (msg.includes("refresh failed") || msg.includes("create failed")) {
      return envelopeFail(msg, 502);
    }
    return envelopeCatch(e, "[POST /api/interviews/generate-meet-link]");
  }
}

