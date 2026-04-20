import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import {
  ensureApplicationFromCandidateJson,
  listApplicationsGroupedByAtsBucketJson,
  listApplicationsJson,
} from "@/lib/services/applications-service";
import { applicationCreateBody } from "@/lib/validators/applications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function optInt(raw: string | null): number | null {
  if (raw == null || raw === "") {
    return null;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

/** GET /api/applications — list applications with optional filters. Use `group_by=ats_bucket` for ATS bucket board. */
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
    const requisitionId =
      optInt(url.searchParams.get("requisition_id")) ??
      optInt(url.searchParams.get("requisitionId"));
    const requisitionItemId =
      optInt(url.searchParams.get("requisition_item_id")) ??
      optInt(url.searchParams.get("requisitionItemId"));
    const candidateId = optInt(url.searchParams.get("candidate_id"));
    const currentStage = url.searchParams.get("current_stage");
    const groupBy = url.searchParams.get("group_by")?.trim().toLowerCase();
    const limitPerBucket = optInt(url.searchParams.get("limit_per_bucket"));
    const listLimit = optInt(url.searchParams.get("limit"));

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
    if (
      (url.searchParams.has("requisition_item_id") ||
        url.searchParams.has("requisitionItemId")) &&
      requisitionItemId == null
    ) {
      return NextResponse.json(
        { detail: "requisition_item_id must be an integer" },
        { status: 422 },
      );
    }
    if (url.searchParams.has("candidate_id") && candidateId == null) {
      return NextResponse.json({ detail: "candidate_id must be an integer" }, { status: 422 });
    }
    if (url.searchParams.has("limit") && listLimit == null) {
      return NextResponse.json(
        { detail: "limit must be a positive integer" },
        { status: 422 },
      );
    }

    if (groupBy === "ats_bucket") {
      if (requisitionItemId == null) {
        return NextResponse.json(
          { detail: "requisition_item_id is required when group_by=ats_bucket" },
          { status: 422 },
        );
      }
      const data = await listApplicationsGroupedByAtsBucketJson({
        organizationId: user.organizationId,
        requisitionItemId,
        limitPerBucket: limitPerBucket ?? undefined,
      });
      return NextResponse.json(data);
    }

    const data = await listApplicationsJson({
      organizationId: user.organizationId,
      requisitionId,
      requisitionItemId,
      candidateId,
      currentStage: currentStage?.trim() || null,
      limit: listLimit,
    });
    return NextResponse.json(data);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/applications]");
  }
}

/** POST /api/applications — ensure application row for candidate + job line (idempotent). */
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

    const parsed = await parseFastapiJsonBody(req, applicationCreateBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const result = await ensureApplicationFromCandidateJson({
      candidateId: parsed.data.candidate_id,
      requisitionItemId: parsed.data.requisition_item_id,
      organizationId: user.organizationId,
      userId: user.userId,
    });
    return NextResponse.json(result.application, {
      status: result.created ? 201 : 200,
    });
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/applications]");
  }
}
