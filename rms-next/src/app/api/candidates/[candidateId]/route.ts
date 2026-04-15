import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import {
  deleteCandidateJson,
  getCandidateJson,
  patchCandidateJson,
} from "@/lib/services/candidates-service";
import { candidatePatchBody } from "@/lib/validators/candidates";

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

/** GET /api/candidates/{candidate_id} */
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

    const candidateId = parseId(params.candidateId);
    if (candidateId instanceof NextResponse) {
      return candidateId;
    }

    const data = await getCandidateJson(candidateId);
    return NextResponse.json(data);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/candidates/[candidateId]]");
  }
}

/** PATCH /api/candidates/{candidate_id} */
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

    const parsed = await parseFastapiJsonBody(req, candidatePatchBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const data = await patchCandidateJson(candidateId, parsed.data, user);
    return NextResponse.json(data);
  } catch (e) {
    return referenceWriteCatch(e, "[PATCH /api/candidates/[candidateId]]");
  }
}

/** DELETE /api/candidates/{candidate_id} */
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

    const candidateId = parseId(params.candidateId);
    if (candidateId instanceof NextResponse) {
      return candidateId;
    }

    await deleteCandidateJson(candidateId, user);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return referenceWriteCatch(e, "[DELETE /api/candidates/[candidateId]]");
  }
}
