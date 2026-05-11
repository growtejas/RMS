import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import {
  isCanonicalListRequest,
  paginateInMemory,
} from "@/lib/pagination/in-memory";
import { adminListUsers } from "@/lib/repositories/users-directory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/users — parity with FastAPI `GET /api/admin/users/`. */
export async function GET(request: Request) {
  try {
    const user = await requireBearerUser(request);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Admin", "Owner");
    if (denied) {
      return denied;
    }

    const url = new URL(request.url);
    const search = url.searchParams.get("search");

    const data = await adminListUsers(search);
    if (isCanonicalListRequest(url)) {
      return paginateInMemory(url, data);
    }
    const res = NextResponse.json(data);
    res.headers.set("Deprecation", "list-admin-users-bare-shape");
    return res;
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/admin/users]");
  }
}
