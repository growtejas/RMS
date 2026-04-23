import { NextResponse } from "next/server";

import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { envelopeCatch, envelopeFail, envelopeOk } from "@/lib/http/api-envelope";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import { interviewCreateBody } from "@/lib/validators/interviews";
import {
  createInterviewJson,
  listInterviewsJson,
} from "@/lib/services/interviews-service";

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
    if (url.searchParams.has("candidate_id") && candidateId == null) {
      return envelopeFail("candidate_id must be an integer", 422);
    }
    if (
      (url.searchParams.has("requisition_id") ||
        url.searchParams.has("requisitionId")) &&
      requisitionId == null
    ) {
      return envelopeFail("requisition_id / requisitionId must be an integer", 422);
    }

    const rows = await listInterviewsJson(user.organizationId, {
      candidateId: candidateId ?? undefined,
      requisitionId: requisitionId ?? undefined,
    });
    return envelopeOk({ interviews: rows });
  } catch (e) {
    return envelopeCatch(e, "[GET /api/interviews]");
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
      const errBody = await parsed.response.json();
      return envelopeFail(
        typeof errBody.detail === "string" ? errBody.detail : "Invalid request body",
        422,
      );
    }

    const data = await createInterviewJson(parsed.data, user);
    return envelopeOk(data, { status: 201 });
  } catch (e) {
    return envelopeCatch(e, "[POST /api/interviews]");
  }
}
