import { NextResponse } from "next/server";

import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { getItemAuditLog } from "@/lib/services/workflow-audit-read-service";
import { referenceWriteCatch } from "@/lib/api/reference-write-errors";

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

/** GET /api/workflow/audit/item/{item_id} */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Admin", "HR", "Manager", "TA");
    if (denied) {
      return denied;
    }

    const itemId = parseItemId(params);
    if (itemId instanceof NextResponse) {
      return itemId;
    }

    const url = new URL(req.url);
    const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
    const rawSize = Number.parseInt(url.searchParams.get("page_size") ?? "50", 10) || 50;
    const pageSize = Math.min(200, Math.max(1, rawSize));

    const result = await getItemAuditLog({ itemId, page, pageSize });
    if (result.notFound) {
      return NextResponse.json(
        { detail: "Requisition item not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      total: result.total,
      page: result.page,
      page_size: result.page_size,
      entries: result.entries,
    });
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/workflow/audit/item/itemId]");
  }
}
