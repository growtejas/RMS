import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import {
  isCanonicalListRequest,
  paginateInMemory,
} from "@/lib/pagination/in-memory";
import { getLocationsCatalog } from "@/lib/services/reference-read-service";
import { createLocation } from "@/lib/services/reference-write-service";
import { locationCreateBody } from "@/lib/validators/reference-master";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/locations — parity with FastAPI `GET /api/locations/`. */
export async function GET(request: Request) {
  try {
    const user = await requireBearerUser(request);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Admin", "Owner", "HR", "Manager");
    if (denied) {
      return denied;
    }

    const data = await getLocationsCatalog();
    const url = new URL(request.url);
    if (isCanonicalListRequest(url)) {
      return paginateInMemory(url, data);
    }
    const res = NextResponse.json(data);
    res.headers.set("Deprecation", "list-locations-bare-shape");
    return res;
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/locations]");
  }
}

/** POST /api/locations — parity with FastAPI `POST /api/locations/`. */
export async function POST(request: Request) {
  try {
    const user = await requireBearerUser(request);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Admin", "Owner", "HR");
    if (denied) {
      return denied;
    }

    const parsed = await parseFastapiJsonBody(request, locationCreateBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const body = await createLocation(
      user.userId,
      parsed.data.city,
      parsed.data.country,
    );
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/locations]");
  }
}
