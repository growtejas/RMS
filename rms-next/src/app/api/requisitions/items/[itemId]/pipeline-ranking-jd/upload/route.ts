import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { deletePipelineRankingJdPdf, uploadPipelineRankingJdPdf } from "@/lib/services/requisitions-write-service";
import { webToNodeReadable } from "@/lib/node/streams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { itemId: string } };

function parseItemId(params: { itemId: string }): number | NextResponse {
  const itemId = Number.parseInt(params.itemId, 10);
  if (!Number.isFinite(itemId)) {
    return NextResponse.json({ detail: "Invalid item id" }, { status: 422 });
  }
  return itemId;
}

/** POST — upload PDF used only for candidate ranking (not manager item JD). */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "TA", "HR", "Admin", "Owner", "Manager");
    if (denied) {
      return denied;
    }

    const itemId = parseItemId(params);
    if (itemId instanceof NextResponse) {
      return itemId;
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ detail: "Expected multipart form data" }, { status: 400 });
    }
    const file = form.get("jd_file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ detail: "jd_file is required" }, { status: 400 });
    }

    const body = await uploadPipelineRankingJdPdf(
      itemId,
      user.organizationId,
      {
        stream: webToNodeReadable(file.stream()),
        size: file.size,
        filename: file.name || "upload.pdf",
        mime: file.type || null,
      },
    );
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[POST .../pipeline-ranking-jd/upload]");
  }
}

/** DELETE — remove pipeline ranking PDF only. */
export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "TA", "HR", "Admin", "Owner", "Manager");
    if (denied) {
      return denied;
    }

    const itemId = parseItemId(params);
    if (itemId instanceof NextResponse) {
      return itemId;
    }

    const body = await deletePipelineRankingJdPdf(
      itemId,
      user.organizationId,
    );
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[DELETE .../pipeline-ranking-jd/upload]");
  }
}
