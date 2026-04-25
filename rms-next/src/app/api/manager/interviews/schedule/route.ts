import { NextResponse } from "next/server";

import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { envelopeCatch, envelopeFail, envelopeOk } from "@/lib/http/api-envelope";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import { interviewCreateBodyV2 } from "@/lib/validators/interviews";
import { createInterviewAsManagerJson } from "@/lib/services/interviews-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/manager/interviews/schedule */
export async function POST(req: Request) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Manager", "Admin");
    if (denied) {
      return denied;
    }

    const parsed = await parseFastapiJsonBody(req, interviewCreateBodyV2);
    if (!parsed.ok) {
      const errBody = await parsed.response.json();
      return envelopeFail(
        typeof errBody.detail === "string" ? errBody.detail : "Invalid request body",
        422,
      );
    }

    const data = await createInterviewAsManagerJson(parsed.data, user);
    return envelopeOk(data, { status: 201 });
  } catch (e) {
    return envelopeCatch(e, "[POST /api/manager/interviews/schedule]");
  }
}

