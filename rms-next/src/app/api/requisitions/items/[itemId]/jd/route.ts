import fs from "node:fs/promises";

import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { findItemById } from "@/lib/repositories/requisitions-write";
import {
  deleteItemJd,
  uploadItemJd,
} from "@/lib/services/requisitions-write-service";
import { jdIsRemoteUrl, jdLocalFilePath } from "@/lib/storage/jd-local-storage";
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

/** GET /api/requisitions/items/{itemId}/jd */
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

    const itemId = parseItemId(params);
    if (itemId instanceof NextResponse) {
      return itemId;
    }

    const item = await findItemById(itemId, user.organizationId);
    if (!item) {
      return NextResponse.json(
        { detail: "Requisition item not found" },
        { status: 404 },
      );
    }
    const key = item.jdFileKey;
    if (!key) {
      return NextResponse.json(
        { detail: "JD file not available for this item" },
        { status: 404 },
      );
    }
    if (jdIsRemoteUrl(key)) {
      return NextResponse.redirect(key);
    }
    try {
      const buf = await fs.readFile(jdLocalFilePath(key));
      return new NextResponse(buf, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="requisition_item_${itemId}_jd.pdf"`,
        },
      });
    } catch {
      return NextResponse.json(
        { detail: "JD file not available for this item" },
        { status: 404 },
      );
    }
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/requisitions/items/[itemId]/jd]");
  }
}

/** POST /api/requisitions/items/{itemId}/jd */
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

    const itemId = parseItemId(params);
    if (itemId instanceof NextResponse) {
      return itemId;
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
    const body = await uploadItemJd(
      itemId,
      user.organizationId,
      {
        stream: webToNodeReadable(file.stream()),
        size: file.size,
        filename: file.name || "upload.pdf",
        mime: file.type || null,
      },
      user.userId,
    );
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/requisitions/items/[itemId]/jd]");
  }
}

/** DELETE /api/requisitions/items/{itemId}/jd */
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

    const itemId = parseItemId(params);
    if (itemId instanceof NextResponse) {
      return itemId;
    }

    const body = await deleteItemJd(
      itemId,
      user.organizationId,
      user.userId,
    );
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[DELETE /api/requisitions/items/[itemId]/jd]");
  }
}
