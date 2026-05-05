import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import * as cieRepo from "@/lib/repositories/cie-repo";

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

/** GET /api/candidates/[candidateId]/conversations */
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

    const url = new URL(req.url);
    const limRaw = url.searchParams.get("limit");
    const limit = limRaw ? Math.min(100, Math.max(1, Number.parseInt(limRaw, 10) || 30)) : 30;

    const rows = await cieRepo.listConversationRows({
      candidateId,
      organizationId: user.organizationId,
      limit,
    });
    return NextResponse.json({
      conversations: rows.map((r) => ({
        id: r.id,
        question: r.question,
        answer: r.answer,
        confidence: r.confidence != null ? Number(r.confidence) : null,
        created_at: r.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/candidates/[candidateId]/conversations]");
  }
}
