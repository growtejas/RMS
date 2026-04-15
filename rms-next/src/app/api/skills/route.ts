import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import { getSkillsCatalog } from "@/lib/services/reference-read-service";
import { createSkill } from "@/lib/services/reference-write-service";
import { skillCreateBody } from "@/lib/validators/reference-master";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/skills — parity with FastAPI `GET /api/skills/`. */
export async function GET(request: Request) {
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
      "TA",
    );
    if (denied) {
      return denied;
    }

    const data = await getSkillsCatalog();
    return NextResponse.json(data);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/skills]");
  }
}

/** POST /api/skills — parity with FastAPI `POST /api/skills/`. */
export async function POST(request: Request) {
  try {
    const user = await requireBearerUser(request);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "HR", "Admin", "Owner");
    if (denied) {
      return denied;
    }

    const parsed = await parseFastapiJsonBody(request, skillCreateBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const body = await createSkill(
      user.userId,
      user.username,
      parsed.data.skill_name,
    );
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/skills]");
  }
}
