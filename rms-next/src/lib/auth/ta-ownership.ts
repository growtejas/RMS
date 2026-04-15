import { eq } from "drizzle-orm";

import type { ApiUser } from "@/lib/auth/api-guard";
import { rolesMatchAny } from "@/lib/auth/normalize-roles";
import { getDb } from "@/lib/db";
import { candidates, requisitionItems, requisitions } from "@/lib/db/schema";
import { TA_OWNERSHIP_DENIED_MESSAGE } from "@/lib/auth/ownership-messages";
import { HttpError } from "@/lib/http/http-error";

export { TA_OWNERSHIP_DENIED_MESSAGE };

function isHrOrAdmin(roles: readonly string[]): boolean {
  return rolesMatchAny(roles, ["HR", "Admin", "Owner"]);
}

function resolveAssignedTaId(
  item: { assignedTa: number | null },
  requisition: { assignedTa: number | null } | null,
): number | null {
  if (item.assignedTa != null) {
    return item.assignedTa;
  }
  if (requisition?.assignedTa != null) {
    return requisition.assignedTa;
  }
  return null;
}

async function loadItemAndReq(itemId: number) {
  const db = getDb();
  const [item] = await db
    .select()
    .from(requisitionItems)
    .where(eq(requisitionItems.itemId, itemId))
    .limit(1);
  if (!item) {
    throw new HttpError(404, "Requisition item not found");
  }
  const [reqRow] = await db
    .select()
    .from(requisitions)
    .where(eq(requisitions.reqId, item.reqId))
    .limit(1);
  return { item, requisition: reqRow ?? null };
}

export async function assertTaOwnershipForRequisitionItem(
  requisitionItemId: number,
  user: ApiUser,
): Promise<void> {
  if (isHrOrAdmin(user.roles)) {
    return;
  }
  const { item, requisition } = await loadItemAndReq(requisitionItemId);
  const taId = resolveAssignedTaId(item, requisition);
  if (taId == null) {
    throw new HttpError(403, TA_OWNERSHIP_DENIED_MESSAGE);
  }
  if (taId !== user.userId) {
    throw new HttpError(403, TA_OWNERSHIP_DENIED_MESSAGE);
  }
}

export async function assertTaOwnershipForCandidate(
  candidateId: number,
  user: ApiUser,
): Promise<void> {
  if (isHrOrAdmin(user.roles)) {
    return;
  }
  const db = getDb();
  const [c] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.candidateId, candidateId))
    .limit(1);
  if (!c) {
    throw new HttpError(404, "Candidate not found");
  }
  const { item, requisition } = await loadItemAndReq(c.requisitionItemId);
  const taId = resolveAssignedTaId(item, requisition);
  if (taId == null) {
    throw new HttpError(403, TA_OWNERSHIP_DENIED_MESSAGE);
  }
  if (taId !== user.userId) {
    throw new HttpError(403, TA_OWNERSHIP_DENIED_MESSAGE);
  }
}
