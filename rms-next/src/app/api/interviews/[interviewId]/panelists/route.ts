import { NextResponse } from "next/server";
import { z } from "zod";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseJsonBody } from "@/lib/http/parse-body";
import {
  insertPanelist,
  listPanelistsForInterview,
} from "@/lib/repositories/interview-feedback-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { interviewId: string } };

const postSchema = z.object({
  display_name: z.string().min(1).max(150),
  role_label: z.string().max(80).optional(),
  user_id: z.number().int().positive().optional(),
});

function parseId(s: string): number | NextResponse {
  const id = Number.parseInt(s, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ detail: "Invalid interview id" }, { status: 422 });
  }
  return id;
}

export async function GET(req: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "TA", "HR", "Admin", "Manager");
    if (denied) {
      return denied;
    }
    const interviewId = parseId(params.interviewId);
    if (interviewId instanceof NextResponse) {
      return interviewId;
    }
    const rows = await listPanelistsForInterview(interviewId, user.organizationId);
    if (!rows) {
      return NextResponse.json({ detail: "Interview not found" }, { status: 404 });
    }
    return NextResponse.json({ panelists: rows });
  } catch (e) {
    return referenceWriteCatch(e, "[GET .../panelists]");
  }
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "TA", "HR", "Admin");
    if (denied) {
      return denied;
    }
    const interviewId = parseId(params.interviewId);
    if (interviewId instanceof NextResponse) {
      return interviewId;
    }
    const parsed = await parseJsonBody(req, postSchema);
    if (!parsed.ok) {
      return parsed.response;
    }
    const row = await insertPanelist({
      interviewId,
      organizationId: user.organizationId,
      displayName: parsed.data.display_name,
      roleLabel: parsed.data.role_label,
      userId: parsed.data.user_id,
    });
    if (!row) {
      return NextResponse.json({ detail: "Interview not found" }, { status: 404 });
    }
    return NextResponse.json({ panelist: row }, { status: 201 });
  } catch (e) {
    return referenceWriteCatch(e, "[POST .../panelists]");
  }
}
