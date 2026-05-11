import { NextResponse } from "next/server";

import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { envelopeCatch, envelopeFail, envelopeOk } from "@/lib/http/api-envelope";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import { interviewCreateBody } from "@/lib/validators/interviews";
import {
  createInterviewJson,
  listInterviewsJson,
  listInterviewsPaged,
} from "@/lib/services/interviews-service";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination/contract";
import { parsePaginationParams } from "@/lib/pagination/zod";
import { paginatedJson } from "@/lib/pagination/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function optInt(raw: string | null): number | null {
  if (raw == null || raw === "") {
    return null;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

function isCanonicalListRequest(url: URL): boolean {
  if (url.searchParams.has("page")) return true;
  const rawLimit = url.searchParams.get("limit");
  if (rawLimit == null) return false;
  const parsed = Number.parseInt(rawLimit, 10);
  return (
    Number.isFinite(parsed) &&
    (PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed)
  );
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

    if (isCanonicalListRequest(url)) {
      const { page, limit } = parsePaginationParams(url);
      const data = await listInterviewsPaged(user.organizationId, {
        page,
        limit,
        filters: {
          candidateId: candidateId ?? undefined,
          requisitionId: requisitionId ?? undefined,
        },
      });
      return paginatedJson(data.items, {
        page: data.pagination.page,
        limit: data.pagination.limit,
        total: data.pagination.total,
      });
    }

    const rows = await listInterviewsJson(user.organizationId, {
      candidateId: candidateId ?? undefined,
      requisitionId: requisitionId ?? undefined,
    });
    const res = envelopeOk({ interviews: rows });
    res.headers.set("Deprecation", "list-interviews-bare-shape");
    return res;
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
