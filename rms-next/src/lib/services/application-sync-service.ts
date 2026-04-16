import { eq } from "drizzle-orm";

import { applicationStageHistory, applications } from "@/lib/db/schema";
import type { AppDb } from "@/lib/workflow/workflow-db";

export async function ensureApplicationForCandidateTx(params: {
  tx: AppDb;
  candidateId: number;
  requisitionItemId: number;
  requisitionId: number;
  candidateStage: string;
  source: string;
  performedBy: number;
  reason: string;
  metadata?: Record<string, unknown>;
}): Promise<{ applicationId: number }> {
  const [existing] = await params.tx
    .select({
      applicationId: applications.applicationId,
      currentStage: applications.currentStage,
      requisitionItemId: applications.requisitionItemId,
      requisitionId: applications.requisitionId,
    })
    .from(applications)
    .where(eq(applications.candidateId, params.candidateId))
    .limit(1);

  if (existing) {
    const stageChanged = existing.currentStage !== params.candidateStage;
    const relationChanged =
      existing.requisitionItemId !== params.requisitionItemId ||
      existing.requisitionId !== params.requisitionId;

    if (stageChanged || relationChanged) {
      await params.tx
        .update(applications)
        .set({
          requisitionItemId: params.requisitionItemId,
          requisitionId: params.requisitionId,
          currentStage: params.candidateStage,
          source: params.source,
          createdBy: params.performedBy,
          updatedAt: new Date(),
        })
        .where(eq(applications.applicationId, existing.applicationId));
    }

    if (stageChanged) {
      await params.tx.insert(applicationStageHistory).values({
        applicationId: existing.applicationId,
        candidateId: params.candidateId,
        fromStage: existing.currentStage,
        toStage: params.candidateStage,
        changedBy: params.performedBy,
        reason: params.reason,
        metadata: params.metadata ?? null,
        changedAt: new Date(),
      });
    }
    return { applicationId: existing.applicationId };
  }

  const [created] = await params.tx
    .insert(applications)
    .values({
      candidateId: params.candidateId,
      requisitionItemId: params.requisitionItemId,
      requisitionId: params.requisitionId,
      currentStage: params.candidateStage,
      source: params.source,
      createdBy: params.performedBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ applicationId: applications.applicationId });

  if (!created) {
    throw new Error("Application sync failed for candidate");
  }

  await params.tx.insert(applicationStageHistory).values({
    applicationId: created.applicationId,
    candidateId: params.candidateId,
    fromStage: null,
    toStage: params.candidateStage,
    changedBy: params.performedBy,
    reason: params.reason,
    metadata: params.metadata ?? null,
    changedAt: new Date(),
  });
  return { applicationId: created.applicationId };
}
