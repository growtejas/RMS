import { NextResponse } from "next/server";

import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { envelopeCatch, envelopeFail, envelopeOk } from "@/lib/http/api-envelope";
import { parseJsonBody } from "@/lib/http/parse-body";
import * as feedbackRepo from "@/lib/repositories/interview-feedback-repo";
import * as ivRepo from "@/lib/repositories/interviews-repo";
import { selectInterviewById } from "@/lib/repositories/candidates-repo";
import { interviewerFeedbackPostBody } from "@/lib/validators/interview-scorecard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { interviewId: string } };

function parseId(s: string): number | NextResponse {
  const id = Number.parseInt(s, 10);
  if (!Number.isFinite(id)) {
    return envelopeFail("Invalid interview id", 422);
  }
  return id;
}

function pgCode(err: unknown): string | undefined {
  let c: unknown = err;
  while (c && typeof c === "object" && "cause" in c) {
    c = (c as { cause: unknown }).cause;
  }
  if (c && typeof c === "object" && "code" in c) {
    return String((c as { code: unknown }).code);
  }
  return undefined;
}

function isCancelledStatus(status: string): boolean {
  return status.trim().toUpperCase() === "CANCELLED";
}

/** POST /api/interviews/:id/feedback — interviewer panelist feedback (one per panelist per interview). */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Interviewer");
    if (denied) {
      return denied;
    }

    const interviewId = parseId(params.interviewId);
    if (interviewId instanceof NextResponse) {
      return interviewId;
    }

    const parsed = await parseJsonBody(req, interviewerFeedbackPostBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const allowed = await ivRepo.userIsPanelistForInterview({
      organizationId: user.organizationId,
      userId: user.userId,
      interviewId,
    });
    if (!allowed) {
      return envelopeFail("Interview not found", 404);
    }

    const panelRow = await ivRepo.findPanelistRowForUserOnInterview({
      interviewId,
      userId: user.userId,
    });
    if (!panelRow?.userId) {
      return envelopeFail(
        "Your interviewer slot is not linked to your user account; ask TA/HR to assign you on the panel.",
        422,
      );
    }

    const ivRow = await selectInterviewById(interviewId, user.organizationId);
    if (!ivRow) {
      return envelopeFail("Interview not found", 404);
    }
    if (isCancelledStatus(ivRow.status)) {
      return envelopeFail("Cannot submit feedback for a cancelled interview", 409);
    }

    const existing = await feedbackRepo.findScorecardForInterviewPanelist(
      interviewId,
      panelRow.id,
    );
    if (existing) {
      return envelopeFail("Feedback already submitted for this interview", 409);
    }

    const scores: Record<string, unknown> = {
      recommendation: parsed.data.recommendation,
    };
    if (parsed.data.strengths != null && parsed.data.strengths !== "") {
      scores.strengths = parsed.data.strengths;
    }
    if (parsed.data.weaknesses != null && parsed.data.weaknesses !== "") {
      scores.weaknesses = parsed.data.weaknesses;
    }

    try {
      const row = await feedbackRepo.insertScorecard({
        interviewId,
        organizationId: user.organizationId,
        panelistId: panelRow.id,
        scores,
        notes: parsed.data.notes ?? null,
        submittedBy: user.userId,
      });
      if (!row) {
        return envelopeFail("Interview not found", 404);
      }
      return envelopeOk({
        scorecard: {
          id: row.id,
          scores: row.scores,
          notes: row.notes ?? null,
          submitted_at: row.submittedAt.toISOString(),
        },
      });
    } catch (e) {
      if (pgCode(e) === "23505") {
        return envelopeFail("Feedback already submitted for this interview", 409);
      }
      throw e;
    }
  } catch (e) {
    return envelopeCatch(e, "[POST /api/interviews/[interviewId]/feedback]");
  }
}
