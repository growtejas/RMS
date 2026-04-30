/**
 * Google Calendar + Meet: optional, feature-flagged. When disabled (default), no-ops.
 * Wire real API calls here later; keep `meeting_link` as the user-visible fallback.
 */
import { getDb } from "@/lib/db";
import { interviews } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

function syncEnabled() {
  return process.env.GOOGLE_CALENDAR_SYNC_ENABLED === "true";
}

/**
 * If enabled, persist a placeholder id so UIs can show “linked” state; real API TBD.
 */
export async function maybeSyncInterviewGoogleCalendarEvent(params: {
  interviewId: number;
  organizationId: string;
}): Promise<string | null> {
  if (!syncEnabled()) {
    return null;
  }
  const placeholder = `gcal:stub:${params.interviewId}`;
  const db = getDb();
  await db
    .update(interviews)
    .set({ googleCalendarEventId: placeholder })
    .where(eq(interviews.id, params.interviewId));
  // eslint-disable-next-line no-console
  console.log(
    "[google-calendar] stub sync; set placeholder for interview",
    params.interviewId,
  );
  return placeholder;
}
