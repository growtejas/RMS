import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { auditLog, requisitionItems, requisitions } from "@/lib/db/schema";

export async function insertRequisitionHeader(values: {
  organizationId: string;
  projectName: string | null;
  clientName: string | null;
  justification: string | null;
  managerNotes: string | null;
  priority: string | null;
  isReplacement: boolean;
  duration: string | null;
  workMode: string | null;
  officeLocation: string | null;
  budgetAmount: string | null;
  requiredByDate: Date | null;
  raisedBy: number;
  overallStatus: string;
  jdFileKey: string | null;
}) {
  const db = getDb();
  const [row] = await db
    .insert(requisitions)
    .values({
      organizationId: values.organizationId,
      projectName: values.projectName,
      clientName: values.clientName,
      justification: values.justification,
      managerNotes: values.managerNotes,
      priority: values.priority,
      isReplacement: values.isReplacement,
      duration: values.duration,
      workMode: values.workMode,
      officeLocation: values.officeLocation,
      budgetAmount: values.budgetAmount,
      requiredByDate: values.requiredByDate,
      raisedBy: values.raisedBy,
      overallStatus: values.overallStatus,
      jdFileKey: values.jdFileKey,
      version: 1,
    })
    .returning({ reqId: requisitions.reqId });
  return row?.reqId ?? null;
}

export async function insertItemRow(values: {
  reqId: number;
  rolePosition: string;
  jobDescription: string;
  skillLevel: string | null;
  experienceYears: number | null;
  educationRequirement: string | null;
  requirements: string | null;
  itemStatus: string;
  replacementHire: boolean;
  replacedEmpId: string | null;
  estimatedBudget: string;
  approvedBudget: string | null;
  currency: string;
  jdFileKey: string | null;
}) {
  const db = getDb();
  const [row] = await db
    .insert(requisitionItems)
    .values({
      reqId: values.reqId,
      rolePosition: values.rolePosition,
      jobDescription: values.jobDescription,
      skillLevel: values.skillLevel,
      experienceYears: values.experienceYears,
      educationRequirement: values.educationRequirement,
      requirements: values.requirements,
      itemStatus: values.itemStatus,
      replacementHire: values.replacementHire,
      replacedEmpId: values.replacedEmpId,
      estimatedBudget: values.estimatedBudget,
      approvedBudget: values.approvedBudget,
      currency: values.currency,
      jdFileKey: values.jdFileKey,
      version: 1,
    })
    .returning();
  return row ?? null;
}

export async function patchRequisitionFields(
  reqId: number,
  organizationId: string,
  patch: Record<string, unknown>,
) {
  if (Object.keys(patch).length === 0) {
    return;
  }
  const db = getDb();
  await db
    .update(requisitions)
    .set(patch)
    .where(
      and(eq(requisitions.reqId, reqId), eq(requisitions.organizationId, organizationId)),
    );
}

export async function setHeaderJdKey(
  reqId: number,
  organizationId: string,
  jdFileKey: string | null,
) {
  const db = getDb();
  await db
    .update(requisitions)
    .set({ jdFileKey })
    .where(
      and(eq(requisitions.reqId, reqId), eq(requisitions.organizationId, organizationId)),
    );
}

export async function findItemById(itemId: number, organizationId: string) {
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
  return rows[0]?.item ?? null;
}

export async function setItemJdKey(
  itemId: number,
  organizationId: string,
  jdFileKey: string | null,
) {
  const db = getDb();
  const item = await findItemById(itemId, organizationId);
  if (!item) {
    return;
  }
  await db
    .update(requisitionItems)
    .set({ jdFileKey })
    .where(eq(requisitionItems.itemId, itemId));
}

export async function updateItemPipelineRankingJd(
  itemId: number,
  organizationId: string,
  patch: {
    pipelineRankingUseRequisitionJd?: boolean;
    pipelineJdText?: string | null;
    pipelineJdFileKey?: string | null;
    rankingRequiredSkills?: string[] | null;
  },
) {
  const db = getDb();
  const item = await findItemById(itemId, organizationId);
  if (!item) {
    return;
  }
  await db
    .update(requisitionItems)
    .set(patch)
    .where(eq(requisitionItems.itemId, itemId));
}

export async function insertBudgetAudit(params: {
  reqId: number;
  performedBy: number;
  oldBudget: number | null;
  newBudget: number | null;
  // Allows callers to pass a Drizzle transaction for atomic writes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db?: any;
}) {
  const db = params.db ?? getDb();
  await db.insert(auditLog).values({
    entityName: "requisition",
    entityId: String(params.reqId),
    action: "BUDGET_UPDATE",
    performedBy: params.performedBy,
    oldValue: JSON.stringify({
      budget_amount:
        params.oldBudget != null ? String(params.oldBudget) : null,
    }),
    newValue: JSON.stringify({
      budget_amount:
        params.newBudget != null ? String(params.newBudget) : null,
    }),
    performedAt: new Date(),
  });
}
