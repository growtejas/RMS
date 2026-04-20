import { and, asc, desc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  pipelineStageDefinitions,
  requisitionItems,
  requisitions,
} from "@/lib/db/schema";
import { requisitionItemToJson } from "@/lib/services/requisitions-read-service";

/** ATS "job" = `requisition_item` row with org scope (see docs/ATS gap matrix). */
export async function listJobsForOrganization(params: {
  organizationId: string;
  itemStatus?: string | null;
  limit?: number;
  offset?: number;
}) {
  const db = getDb();
  const conds = [eq(requisitions.organizationId, params.organizationId)];
  if (params.itemStatus != null && params.itemStatus !== "") {
    conds.push(eq(requisitionItems.itemStatus, params.itemStatus));
  }
  const rows = await db
    .select({ item: requisitionItems })
    .from(requisitionItems)
    .innerJoin(requisitions, eq(requisitionItems.reqId, requisitions.reqId))
    .where(and(...conds))
    .orderBy(desc(requisitionItems.itemId))
    .limit(params.limit ?? 100)
    .offset(params.offset ?? 0);
  return rows.map((r) => ({
    job_id: r.item.itemId,
    requisition_item: requisitionItemToJson(r.item),
  }));
}

export async function getJobForOrganization(itemId: number, organizationId: string) {
  const db = getDb();
  const rows = await db
    .select({ item: requisitionItems })
    .from(requisitionItems)
    .innerJoin(requisitions, eq(requisitionItems.reqId, requisitions.reqId))
    .where(
      and(
        eq(requisitionItems.itemId, itemId),
        eq(requisitions.organizationId, organizationId),
      ),
    )
    .limit(1);
  const item = rows[0]?.item;
  if (!item) {
    return null;
  }
  return {
    job_id: item.itemId,
    requisition_item: requisitionItemToJson(item),
  };
}

export async function listPipelineStages(organizationId: string) {
  const db = getDb();
  return db
    .select()
    .from(pipelineStageDefinitions)
    .where(eq(pipelineStageDefinitions.organizationId, organizationId))
    .orderBy(asc(pipelineStageDefinitions.sortOrder), asc(pipelineStageDefinitions.id));
}
