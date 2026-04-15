import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import { getCompanyRolesCatalog } from "@/lib/services/reference-read-service";
import { createCompanyRole } from "@/lib/services/reference-write-service";
import { companyRoleCreateBody } from "@/lib/validators/reference-master";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/company-roles — parity with FastAPI `GET /api/company-roles/`. */
export async function GET(req: Request) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Admin", "Owner", "HR");
    if (denied) {
      return denied;
    }

    const url = new URL(req.url);
    const includeInactive = url.searchParams.get("include_inactive") === "true";

    const data = await getCompanyRolesCatalog(includeInactive);
    return NextResponse.json(data);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/company-roles]");
  }
}

/** POST /api/company-roles — parity with FastAPI `POST /api/company-roles/`. */
export async function POST(req: Request) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Admin", "Owner", "HR");
    if (denied) {
      return denied;
    }

    const parsed = await parseFastapiJsonBody(req, companyRoleCreateBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const body = await createCompanyRole(
      parsed.data.role_name,
      parsed.data.role_description,
    );
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/company-roles]");
  }
}
