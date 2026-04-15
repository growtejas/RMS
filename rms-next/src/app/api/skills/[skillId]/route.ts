import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import { removeSkill, updateSkill } from "@/lib/services/reference-write-service";
import { skillUpdateBody } from "@/lib/validators/reference-master";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { skillId: string } };

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(request);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "HR", "Admin", "Owner");
    if (denied) {
      return denied;
    }

    const skillId = Number.parseInt(params.skillId, 10);
    if (!Number.isFinite(skillId)) {
      return NextResponse.json({ detail: "Invalid skill id" }, { status: 422 });
    }

    const parsed = await parseFastapiJsonBody(request, skillUpdateBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const body = await updateSkill(user.userId, skillId, parsed.data.skill_name);
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[PATCH /api/skills/[skillId]]");
  }
}

export async function DELETE(request: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(request);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "HR", "Admin", "Owner");
    if (denied) {
      return denied;
    }

    const skillId = Number.parseInt(params.skillId, 10);
    if (!Number.isFinite(skillId)) {
      return NextResponse.json({ detail: "Invalid skill id" }, { status: 422 });
    }

    const body = await removeSkill(user.userId, skillId);
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[DELETE /api/skills/[skillId]]");
  }
}
