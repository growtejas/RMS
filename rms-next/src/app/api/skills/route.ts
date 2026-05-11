import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import {
  isCanonicalListRequest,
  paginateInMemory,
} from "@/lib/pagination/in-memory";
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
    const url = new URL(request.url);
    if (isCanonicalListRequest(url)) {
      return paginateInMemory(url, data);
    }
    const res = NextResponse.json(data);
    res.headers.set("Deprecation", "list-skills-bare-shape");
    return res;
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
