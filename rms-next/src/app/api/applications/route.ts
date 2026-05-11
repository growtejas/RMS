import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination/contract";
import { paginatedJson } from "@/lib/pagination/server";
import { parsePaginationParams } from "@/lib/pagination/zod";
import { estimateJsonBytes, withRequestPerf } from "@/lib/perf/request-perf";
import {
  ensureApplicationFromCandidateJson,
  listApplicationsGroupedByAtsBucketJson,
  listApplicationsJson,
  listApplicationsPaged,
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

const PAGE_SIZE_NUMS = new Set<number>(PAGE_SIZE_OPTIONS);

/**
 * GET /api/applications — list applications.
 *
 * Three response modes:
 *   1. `?group_by=ats_bucket`  → Kanban buckets object (unchanged contract).
 *   2. `?page=`/`?limit=` (canonical 25/50/100) → paginated envelope:
 *        `{ success, data: { items, pagination }, error }`.
 *   3. Otherwise (no pagination args) → legacy bare array kept for backwards
 *      compatibility with existing callers. New consumers SHOULD pass `page`
 *      and `limit` to opt into the canonical envelope.
 */
export async function GET(req: Request) {
  return withRequestPerf("GET /api/applications", async () => {
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
        return NextResponse.json(
          { detail: "candidate_id must be an integer" },
          { status: 422 },
        );
      }

      // 1. Bucket grouping path: unchanged contract.
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
        return NextResponse.json(data, {
          headers: {
            "x-rms-perf-payload-bytes": String(estimateJsonBytes(data)),
          },
        });
      }

      // 2. Canonical paginated path: opt-in via `page` or canonical `limit`.
      const limitRaw = url.searchParams.get("limit");
      const limitNum = limitRaw != null ? Number.parseInt(limitRaw, 10) : NaN;
      const useCanonical =
        url.searchParams.has("page") ||
        (Number.isFinite(limitNum) && PAGE_SIZE_NUMS.has(limitNum));
      if (useCanonical) {
        const { page, limit } = parsePaginationParams(url);
        const result = await listApplicationsPaged({
          organizationId: user.organizationId,
          page,
          limit,
          requisitionId,
          requisitionItemId,
          currentStage: currentStage?.trim() || null,
          candidateId,
        });
        return paginatedJson(
          result.items,
          {
            page: result.pagination.page,
            limit: result.pagination.limit,
            total: result.pagination.total,
          },
          {
            headers: {
              "x-rms-perf-payload-bytes": String(estimateJsonBytes(result.items)),
            },
          },
        );
      }

      // 3. Legacy bare-array path (for callers that haven't migrated yet).
      const listLimit = optInt(limitRaw);
      if (url.searchParams.has("limit") && listLimit == null) {
        return NextResponse.json(
          { detail: "limit must be a positive integer" },
          { status: 422 },
        );
      }
      const data = await listApplicationsJson({
        organizationId: user.organizationId,
        requisitionId,
        requisitionItemId,
        candidateId,
        currentStage: currentStage?.trim() || null,
        limit: listLimit,
      });
      return NextResponse.json(data, {
        headers: {
          "x-rms-perf-payload-bytes": String(estimateJsonBytes(data)),
          "X-RMS-Applications-Legacy":
            "Pass `page` and `limit` (25/50/100) to receive the canonical paginated envelope.",
        },
      });
    } catch (e) {
      return referenceWriteCatch(e, "[GET /api/applications]");
    }
  });
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
