import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import {
  deleteInterviewJson,
  getInterviewJson,
  patchInterviewJson,
} from "@/lib/services/interviews-service";
import { interviewPatchBody } from "@/lib/validators/candidates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { interviewId: string } };

function parseId(s: string): number | NextResponse {
  const id = Number.parseInt(s, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json(
      { detail: "Invalid interview id" },
      { status: 422 },
    );
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

    const data = await getInterviewJson(interviewId, user.organizationId);
    return NextResponse.json(data);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/interviews/[interviewId]]");
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
      return parsed.response;
    }

    const data = await patchInterviewJson(interviewId, parsed.data, user);
    return NextResponse.json(data);
  } catch (e) {
    return referenceWriteCatch(e, "[PATCH /api/interviews/[interviewId]]");
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
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return referenceWriteCatch(e, "[DELETE /api/interviews/[interviewId]]");
  }
}
