import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import {
  createInterviewJson,
  listInterviewsJson,
} from "@/lib/services/interviews-service";
import { interviewCreateBody } from "@/lib/validators/candidates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function optInt(raw: string | null): number | null {
  if (raw == null || raw === "") {
    return null;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

/** GET /api/interviews */
export async function GET(req: Request) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "TA", "HR", "Admin", "Manager");
    if (denied) {
      return denied;
    }

    const url = new URL(req.url);
    const candidateId = optInt(url.searchParams.get("candidate_id"));
    const requisitionId =
      optInt(url.searchParams.get("requisition_id")) ??
      optInt(url.searchParams.get("requisitionId"));
    if (
      url.searchParams.has("candidate_id") &&
      candidateId == null
    ) {
      return NextResponse.json(
        { detail: "candidate_id must be an integer" },
        { status: 422 },
      );
    }
    if (
      (url.searchParams.has("requisition_id") ||
        url.searchParams.has("requisitionId")) &&
      requisitionId == null
    ) {
      return NextResponse.json(
        { detail: "requisition_id / requisitionId must be an integer" },
        { status: 422 },
      );
    }

    const data = await listInterviewsJson(user.organizationId, {
      candidateId: candidateId ?? undefined,
      requisitionId: requisitionId ?? undefined,
    });
    return NextResponse.json(data);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/interviews]");
  }
}

/** POST /api/interviews */
export async function POST(req: Request) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "TA", "HR", "Admin");
    if (denied) {
      return denied;
    }

    const parsed = await parseFastapiJsonBody(req, interviewCreateBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const data = await createInterviewJson(parsed.data, user);
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/interviews]");
  }
}
