import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import {
  createCandidateJson,
  listCandidatesJson,
} from "@/lib/services/candidates-service";
import { candidateCreateBody } from "@/lib/validators/candidates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function optInt(raw: string | null): number | null {
  if (raw == null || raw === "") {
    return null;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * GET /api/candidates — parity with FastAPI list.
 *
 * For **ATS roster by requisition or line**, prefer `GET /api/applications` with
 * `requisitionId` / `requisitionItemId` so every row is an application (see
 * Candidate Pipeline §4, §17). When this route is called with `requisition_id`
 * or `requisition_item_id`, the response includes `X-ATS-Roster-Deprecated`.
 */
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
    const requisitionId = optInt(url.searchParams.get("requisition_id"));
    const requisitionItemId = optInt(
      url.searchParams.get("requisition_item_id"),
    );
    const currentStage = url.searchParams.get("current_stage");

    if (
      url.searchParams.has("requisition_id") &&
      requisitionId == null
    ) {
      return NextResponse.json(
        { detail: "requisition_id must be an integer" },
        { status: 422 },
      );
    }
    if (
      url.searchParams.has("requisition_item_id") &&
      requisitionItemId == null
    ) {
      return NextResponse.json(
        { detail: "requisition_item_id must be an integer" },
        { status: 422 },
      );
    }

    const data = await listCandidatesJson({
      organizationId: user.organizationId,
      requisitionId,
      requisitionItemId,
      currentStage: currentStage?.trim() || null,
    });
    const headers = new Headers();
    if (requisitionId != null) {
      headers.set(
        "X-ATS-Roster-Deprecated",
        "Prefer GET /api/applications?requisitionId=… for application-scoped ATS list (Candidate Pipeline §17).",
      );
    } else if (requisitionItemId != null) {
      headers.set(
        "X-ATS-Roster-Deprecated",
        "Prefer GET /api/applications?requisitionItemId=… for application-scoped ATS list (Candidate Pipeline §17).",
      );
    }
    return NextResponse.json(data, { headers });
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/candidates]");
  }
}

/** POST /api/candidates — parity with FastAPI create. */
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

    const parsed = await parseFastapiJsonBody(req, candidateCreateBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const data = await createCandidateJson(parsed.data, user);
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/candidates]");
  }
}
