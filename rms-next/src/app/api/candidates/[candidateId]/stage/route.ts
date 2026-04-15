import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import { patchCandidateStageJson } from "@/lib/services/candidates-service";
import { candidateStageBody } from "@/lib/validators/candidates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { candidateId: string } };

function parseId(s: string): number | NextResponse {
  const id = Number.parseInt(s, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ detail: "Invalid candidate id" }, { status: 422 });
  }
  return id;
}

/** PATCH /api/candidates/{candidate_id}/stage */
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

    const candidateId = parseId(params.candidateId);
    if (candidateId instanceof NextResponse) {
      return candidateId;
    }

    const parsed = await parseFastapiJsonBody(req, candidateStageBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const data = await patchCandidateStageJson(
      candidateId,
      parsed.data.new_stage,
      user,
      user.roles,
    );
    return NextResponse.json(data);
  } catch (e) {
    return referenceWriteCatch(e, "[PATCH /api/candidates/.../stage]");
  }
}
