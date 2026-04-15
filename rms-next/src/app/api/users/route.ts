import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import { listUsersDirectory } from "@/lib/repositories/users-directory";
import { createUserAccount } from "@/lib/services/user-admin-write-service";
import { userCreateBody } from "@/lib/validators/user-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/users — parity with FastAPI `GET /api/users/`. */
export async function GET(request: Request) {
  try {
    const user = await requireBearerUser(request);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Admin", "HR", "TA");
    if (denied) {
      return denied;
    }

    const rows = await listUsersDirectory();
    return NextResponse.json(rows);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/users]");
  }
}

/** POST /api/users — parity with FastAPI create user (Admin / Owner). */
export async function POST(request: Request) {
  try {
    const user = await requireBearerUser(request);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Admin", "Owner");
    if (denied) {
      return denied;
    }

    const parsed = await parseFastapiJsonBody(request, userCreateBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const body = await createUserAccount(
      parsed.data.username,
      parsed.data.password,
    );
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/users]");
  }
}
