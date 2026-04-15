import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { Readable } from "node:stream";

import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { selectRequisitionById } from "@/lib/repositories/requisitions-read";
import {
  deleteRequisitionJd,
  uploadRequisitionJd,
} from "@/lib/services/requisitions-write-service";
import { jdIsRemoteUrl, jdLocalFilePath } from "@/lib/storage/jd-local-storage";
import { webToNodeReadable } from "@/lib/node/streams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { reqId: string } };

function parseReqId(params: { reqId: string }): number | NextResponse {
  const reqId = Number.parseInt(params.reqId, 10);
  if (!Number.isFinite(reqId)) {
    return NextResponse.json({ detail: "Invalid requisition id" }, { status: 422 });
  }
  return reqId;
}

/** GET /api/requisitions/{reqId}/jd */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Manager", "Admin", "HR", "TA");
    if (denied) {
      return denied;
    }

    const reqId = parseReqId(params);
    if (reqId instanceof NextResponse) {
      return reqId;
    }

    const header = await selectRequisitionById(reqId);
    if (!header) {
      return NextResponse.json({ detail: "Requisition not found" }, { status: 404 });
    }
    const key = header.jdFileKey;
    if (!key) {
      return NextResponse.json({ detail: "JD file not available" }, { status: 404 });
    }
    if (jdIsRemoteUrl(key)) {
      return NextResponse.redirect(key);
    }
    try {
      const path = jdLocalFilePath(key);
      await fs.access(path);
      const stream = createReadStream(path);
      const body = Readable.toWeb(stream) as unknown as ReadableStream;
      return new NextResponse(body, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="requisition_${reqId}_jd.pdf"`,
        },
      });
    } catch {
      return NextResponse.json({ detail: "JD file not available" }, { status: 404 });
    }
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/requisitions/[reqId]/jd]");
  }
}

/** POST /api/requisitions/{reqId}/jd */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Manager");
    if (denied) {
      return denied;
    }

    const reqId = parseReqId(params);
    if (reqId instanceof NextResponse) {
      return reqId;
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json(
        { detail: "Expected multipart form data" },
        { status: 400 },
      );
    }
    const file = form.get("jd_file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ detail: "jd_file is required" }, { status: 400 });
    }
    const body = await uploadRequisitionJd(reqId, {
      stream: webToNodeReadable(file.stream()),
      size: file.size,
      filename: file.name || "upload.pdf",
      mime: file.type || null,
    }, user.userId);
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/requisitions/[reqId]/jd]");
  }
}

/** DELETE /api/requisitions/{reqId}/jd */
export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Manager");
    if (denied) {
      return denied;
    }

    const reqId = parseReqId(params);
    if (reqId instanceof NextResponse) {
      return reqId;
    }

    const body = await deleteRequisitionJd(reqId, user.userId);
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[DELETE /api/requisitions/[reqId]/jd]");
  }
}
