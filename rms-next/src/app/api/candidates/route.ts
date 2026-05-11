import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import { paginatedJson } from "@/lib/pagination/server";
import { parseListQueryParams } from "@/lib/pagination/zod";
import {
  CIE_CANDIDATE_SORT_KEYS,
  createCandidateJson,
  listCandidatesPaged,
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
 * GET /api/candidates — paginated org candidate roster.
 *
 * Returns the canonical paginated envelope:
 *   `{ success, data: { items, pagination }, error }`
 *
 * Filters: `requisition_id`, `requisition_item_id`, `current_stage`,
 *          `role` (canonical CIE role id), `q` (free-text), `cie_summary=1`.
 * Pagination: `page`, `limit` (25 / 50 / 100, default 25), `sort`.
 *
 * For ATS roster by requisition or line, prefer `GET /api/applications` with
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

    const includeCieSummary =
      url.searchParams.get("cie_summary") === "1" ||
      url.searchParams.get("cie_summary") === "true";

    const roleId = url.searchParams.get("role")?.trim() || null;
    const { page, limit, q, sort } = parseListQueryParams(url, {
      sort: { allowed: CIE_CANDIDATE_SORT_KEYS, fallback: "created_desc" },
    });

    const result = await listCandidatesPaged({
      organizationId: user.organizationId,
      page,
      limit,
      sort: sort ?? "created_desc",
      requisitionId,
      requisitionItemId,
      currentStage: currentStage?.trim() || null,
      includeCieSummary,
      roleId,
      searchQuery: q,
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
    return paginatedJson(
      result.items,
      {
        page: result.pagination.page,
        limit: result.pagination.limit,
        total: result.pagination.total,
      },
      { headers },
    );
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
