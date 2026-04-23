import { NextResponse } from "next/server";

import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { envelopeCatch, envelopeFail, envelopeOk } from "@/lib/http/api-envelope";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import { interviewPatchBody } from "@/lib/validators/interviews";
import {
  deleteInterviewJson,
  getInterviewJson,
  patchInterviewJson,
} from "@/lib/services/interviews-service";

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

/** GET /api/interviews/{interview_id} */
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

    const interview = await getInterviewJson(interviewId, user.organizationId);
    return envelopeOk({ interview });
  } catch (e) {
    return envelopeCatch(e, "[GET /api/interviews/[interviewId]]");
  }
}

/** PATCH /api/interviews/{interview_id} */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "TA", "HR", "Admin");
    if (denied) {
      return denied;
    }

    const interviewId = parseId(params.interviewId);
    if (interviewId instanceof NextResponse) {
      return interviewId;
    }

    const parsed = await parseFastapiJsonBody(req, interviewPatchBody);
    if (!parsed.ok) {
      const errBody = await parsed.response.json();
      return envelopeFail(
        typeof errBody.detail === "string" ? errBody.detail : "Invalid request body",
        422,
      );
    }

    const data = await patchInterviewJson(interviewId, parsed.data, user);
    return envelopeOk(data);
  } catch (e) {
    return envelopeCatch(e, "[PATCH /api/interviews/[interviewId]]");
  }
}

/** DELETE /api/interviews/{interview_id} */
export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "TA", "HR", "Admin");
    if (denied) {
      return denied;
    }

    const interviewId = parseId(params.interviewId);
    if (interviewId instanceof NextResponse) {
      return interviewId;
    }

    await deleteInterviewJson(interviewId, user);
    return envelopeOk({ deleted: true });
  } catch (e) {
    return envelopeCatch(e, "[DELETE /api/interviews/[interviewId]]");
  }
}
