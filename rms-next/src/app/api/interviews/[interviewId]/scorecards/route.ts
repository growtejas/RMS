import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseJsonBody } from "@/lib/http/parse-body";
import {
  insertScorecard,
  listScorecardsForInterview,
} from "@/lib/repositories/interview-feedback-repo";
import {
  aggregateScorecardRatings,
  interviewScorecardPostBody,
} from "@/lib/validators/interview-scorecard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { interviewId: string } };

function parseId(s: string): number | NextResponse {
  const id = Number.parseInt(s, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ detail: "Invalid interview id" }, { status: 422 });
  }
  return id;
}

export async function GET(req: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "TA", "HR", "Admin", "Manager");
    if (denied) {
      return denied;
    }
    const interviewId = parseId(params.interviewId);
    if (interviewId instanceof NextResponse) {
      return interviewId;
    }
    const rows = await listScorecardsForInterview(interviewId, user.organizationId);
    if (!rows) {
      return NextResponse.json({ detail: "Interview not found" }, { status: 404 });
    }
    const aggregate = aggregateScorecardRatings(rows);
    return NextResponse.json({ scorecards: rows, aggregate });
  } catch (e) {
    return referenceWriteCatch(e, "[GET .../scorecards]");
  }
}

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
    const interviewId = parseId(params.interviewId);
    if (interviewId instanceof NextResponse) {
      return interviewId;
    }
    const parsed = await parseJsonBody(req, interviewScorecardPostBody);
    if (!parsed.ok) {
      return parsed.response;
    }
    const row = await insertScorecard({
      interviewId,
      organizationId: user.organizationId,
      panelistId: parsed.data.panelist_id ?? undefined,
      scores: parsed.data.scores as Record<string, unknown>,
      notes: parsed.data.notes ?? undefined,
      submittedBy: user.userId,
    });
    if (!row) {
      return NextResponse.json({ detail: "Interview not found" }, { status: 404 });
    }
    return NextResponse.json({ scorecard: row }, { status: 201 });
  } catch (e) {
    return referenceWriteCatch(e, "[POST .../scorecards]");
  }
}
