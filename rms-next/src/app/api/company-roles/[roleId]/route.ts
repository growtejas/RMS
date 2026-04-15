import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import {
  deactivateCompanyRole,
  getCompanyRole,
  replaceCompanyRole,
} from "@/lib/services/reference-write-service";
import { companyRoleUpdateBody } from "@/lib/validators/reference-master";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { roleId: string } };

export async function GET(request: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(request);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Admin", "Owner", "HR");
    if (denied) {
      return denied;
    }

    const roleId = Number.parseInt(params.roleId, 10);
    if (!Number.isFinite(roleId)) {
      return NextResponse.json({ detail: "Invalid role id" }, { status: 422 });
    }

    const body = await getCompanyRole(roleId);
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/company-roles/[roleId]]");
  }
}

export async function PUT(request: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(request);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Admin", "Owner", "HR");
    if (denied) {
      return denied;
    }

    const roleId = Number.parseInt(params.roleId, 10);
    if (!Number.isFinite(roleId)) {
      return NextResponse.json({ detail: "Invalid role id" }, { status: 422 });
    }

    const parsed = await parseFastapiJsonBody(request, companyRoleUpdateBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const body = await replaceCompanyRole(roleId, parsed.data);
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[PUT /api/company-roles/[roleId]]");
  }
}

export async function DELETE(request: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(request);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Admin", "Owner", "HR");
    if (denied) {
      return denied;
    }

    const roleId = Number.parseInt(params.roleId, 10);
    if (!Number.isFinite(roleId)) {
      return NextResponse.json({ detail: "Invalid role id" }, { status: 422 });
    }

    const body = await deactivateCompanyRole(roleId);
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[DELETE /api/company-roles/[roleId]]");
  }
}
