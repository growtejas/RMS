import { NextResponse } from "next/server";

import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { envelopeCatch, envelopeFail, envelopeOk } from "@/lib/http/api-envelope";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import { submitInterviewResult } from "@/lib/services/interview-lifecycle-service";
import { submitInterviewResultBody } from "@/lib/validators/interview-lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { interviewId: string } };

/** POST /api/interviews/{interviewId}/result */
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

    const interviewId = Number.parseInt(params.interviewId, 10);
    if (!Number.isFinite(interviewId)) {
      return envelopeFail("Invalid interview id", 422);
    }

    const parsed = await parseFastapiJsonBody(req, submitInterviewResultBody);
    if (!parsed.ok) {
      const errBody = await parsed.response.json();
      return envelopeFail(
        typeof errBody.detail === "string" ? errBody.detail : "Invalid request body",
        422,
      );
    }

    const data = await submitInterviewResult({
      interviewId,
      result: parsed.data.result,
      user,
      roles: user.roles,
    });
    return envelopeOk(data);
  } catch (e) {
    return envelopeCatch(e, "[POST /api/interviews/[interviewId]/result]");
  }
}
