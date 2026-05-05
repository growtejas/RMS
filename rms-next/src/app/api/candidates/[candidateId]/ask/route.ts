import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseJsonBody } from "@/lib/http/parse-body";
import { HttpError } from "@/lib/http/http-error";
import { runCieAskForCandidate } from "@/lib/services/cie/candidate-intelligence-service";
import { cieAskBody } from "@/lib/validators/cie";

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

/** POST /api/candidates/[candidateId]/ask */
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

    const candidateId = parseId(params.candidateId);
    if (candidateId instanceof NextResponse) {
      return candidateId;
    }

    const parsed = await parseJsonBody(req, cieAskBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const result = await runCieAskForCandidate({
      organizationId: user.organizationId,
      candidateId,
      question: parsed.data.question,
      targetRole: parsed.data.targetRole ?? null,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ detail: e.message }, { status: e.status });
    }
    return referenceWriteCatch(e, "[POST /api/candidates/[candidateId]/ask]");
  }
}
