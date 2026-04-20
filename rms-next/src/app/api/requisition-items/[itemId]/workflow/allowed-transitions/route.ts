import { NextResponse } from "next/server";

import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { getDb } from "@/lib/db";
import { requisitionItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  ITEM_TERMINAL_STATES,
  buildAllowedItemTransitions,
} from "@/lib/workflow/workflow-allowed";
import { workflowCatch } from "@/lib/workflow/workflow-http";
import { requireItemInOrganization } from "@/lib/workflow/workflow-route-utils";
import { isItemStatus } from "@/types/workflow";

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

export async function GET(req: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(
      user,
      "Manager",
      "Admin",
      "HR",
      "TA",
    );
    if (denied) {
      return denied;
    }

    const itemId = parseItemId(params);
    if (itemId instanceof NextResponse) {
      return itemId;
    }

    await requireItemInOrganization(itemId, user.organizationId);

    const db = getDb();
    const rows = await db
      .select()
      .from(requisitionItems)
      .where(eq(requisitionItems.itemId, itemId))
      .limit(1);
    const row = rows[0];
    if (!row) {
      return NextResponse.json({ detail: "Item not found" }, { status: 404 });
    }

    if (!isItemStatus(row.itemStatus)) {
      return NextResponse.json(
        { detail: `Invalid status value: ${row.itemStatus}` },
        { status: 400 },
      );
    }

    const current = row.itemStatus;
    const isTerminal = ITEM_TERMINAL_STATES.has(current);

    return NextResponse.json({
      entity_type: "requisition_item",
      entity_id: itemId,
      current_status: current,
      is_terminal: isTerminal,
      allowed_transitions: buildAllowedItemTransitions(current),
    });
  } catch (e) {
    return workflowCatch(e, "[GET requisition-items/.../allowed-transitions]");
  }
}
