import { NextResponse } from "next/server";

import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { envelopeCatch, envelopeOk } from "@/lib/http/api-envelope";
import {
  listManagerInterviewsJson,
  listManagerInterviewsPaged,
} from "@/lib/services/interviews-service";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination/contract";
import { parsePaginationParams } from "@/lib/pagination/zod";
import { paginatedJson } from "@/lib/pagination/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

/** GET /api/manager/interviews */
export async function GET(req: Request) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Manager", "Admin");
    if (denied) {
      return denied;
    }

    const url = new URL(req.url);
    if (isCanonicalListRequest(url)) {
      const { page, limit } = parsePaginationParams(url);
      const data = await listManagerInterviewsPaged(user, { page, limit });
      return paginatedJson(data.items, {
        page: data.pagination.page,
        limit: data.pagination.limit,
        total: data.pagination.total,
      });
    }

    const interviews = await listManagerInterviewsJson(user);
    const res = envelopeOk({ interviews });
    res.headers.set("Deprecation", "list-interviews-bare-shape");
    return res;
  } catch (e) {
    return envelopeCatch(e, "[GET /api/manager/interviews]");
  }
}

