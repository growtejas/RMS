import { and, count, desc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { bulkImportJobs } from "@/lib/db/schema";

export async function insertBulkImportJob(params: {
  organizationId: string;
  kind: string;
  payload: Record<string, unknown> | null;
  createdBy: number | null;
}) {
  const db = getDb();
  const [row] = await db
    .insert(bulkImportJobs)
    .values({
      organizationId: params.organizationId,
      kind: params.kind,
      status: "queued",
      payload: params.payload,
      createdBy: params.createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: bulkImportJobs.id });
  return row?.id ?? null;
}

export async function selectBulkJobForOrg(id: string, organizationId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(bulkImportJobs)
    .where(
      and(eq(bulkImportJobs.id, id), eq(bulkImportJobs.organizationId, organizationId)),
    )
    .limit(1);
  return row ?? null;
}

export async function listRecentBulkJobs(organizationId: string, limit = 20) {
  const db = getDb();
  return db
    .select()
    .from(bulkImportJobs)
    .where(eq(bulkImportJobs.organizationId, organizationId))
    .orderBy(desc(bulkImportJobs.createdAt))
    .limit(limit);
}

export async function listBulkJobsForOrgPaged(
  organizationId: string,
  args: { limit: number; offset: number },
) {
  const db = getDb();
  return db
    .select()
    .from(bulkImportJobs)
    .where(eq(bulkImportJobs.organizationId, organizationId))
    .orderBy(desc(bulkImportJobs.createdAt))
    .limit(args.limit)
    .offset(args.offset);
}

export async function countBulkJobsForOrg(
  organizationId: string,
): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ c: count() })
    .from(bulkImportJobs)
    .where(eq(bulkImportJobs.organizationId, organizationId));
  return Number(row?.c ?? 0);
}

export async function markBulkImportJobRunning(id: string) {
  const db = getDb();
  await db
    .update(bulkImportJobs)
    .set({ status: "running", errorMessage: null, updatedAt: new Date() })
    .where(eq(bulkImportJobs.id, id));
}

export async function updateBulkImportJobSummary(params: {
  id: string;
  resultSummary: Record<string, unknown>;
  status?: string;
  errorMessage?: string | null;
}) {
  const db = getDb();
  await db
    .update(bulkImportJobs)
    .set({
      resultSummary: params.resultSummary,
      ...(params.status ? { status: params.status } : {}),
      ...(params.errorMessage !== undefined ? { errorMessage: params.errorMessage } : {}),
      updatedAt: new Date(),
    })
    .where(eq(bulkImportJobs.id, params.id));
}
