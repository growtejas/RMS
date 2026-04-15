import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import { instantAddSkill } from "@/lib/services/reference-write-service";
import { skillInstantBody } from "@/lib/validators/reference-master";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/skills/instant-add — parity with FastAPI. */
export async function POST(request: Request) {
  try {
    const user = await requireBearerUser(request);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(
      user,
      "HR",
      "Admin",
      "Owner",
      "Manager",
      "Employee",
    );
    if (denied) {
      return denied;
    }

    const parsed = await parseFastapiJsonBody(request, skillInstantBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const body = await instantAddSkill(
      user.userId,
      user.username,
      parsed.data.name,
    );
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/skills/instant-add]");
  }
}
