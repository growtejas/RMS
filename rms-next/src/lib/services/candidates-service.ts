import { and, asc, eq, ne, notInArray } from "drizzle-orm";

import type { ApiUser } from "@/lib/auth/api-guard";
import {
  assertTaOwnershipForCandidate,
  assertTaOwnershipForRequisitionItem,
} from "@/lib/auth/ta-ownership";
import { getDb } from "@/lib/db";
import { auditLog, candidates, interviews, requisitionItems } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/http-error";
import * as repo from "@/lib/repositories/candidates-repo";
import { RequisitionItemWorkflowEngine } from "@/lib/workflow/item-workflow-engine";
import { isWorkflowException } from "@/lib/workflow/workflow-exceptions";
import type { AppDb } from "@/lib/workflow/workflow-db";

import { createEmployeeFromCandidateDb } from "@/lib/services/onboarding-candidate-service";

const VALID_STAGE_TRANSITIONS: Record<string, string[]> = {
  Sourced: ["Shortlisted", "Rejected"],
  Shortlisted: ["Interviewing", "Sourced", "Rejected"],
  Interviewing: ["Offered", "Shortlisted", "Rejected"],
  Offered: ["Hired", "Interviewing", "Rejected"],
  Rejected: ["Sourced"],
};

function interviewToJson(row: repo.InterviewRow) {
  return {
    id: row.id,
    candidate_id: row.candidateId,
    round_number: row.roundNumber,
    interviewer_name: row.interviewerName,
    scheduled_at: row.scheduledAt.toISOString(),
    status: row.status,
    result: row.result ?? null,
    feedback: row.feedback ?? null,
    conducted_by: row.conductedBy ?? null,
    created_at: row.createdAt?.toISOString() ?? null,
    updated_at: row.updatedAt?.toISOString() ?? null,
  };
}

function candidateToJson(row: repo.CandidateRow, ivs: repo.InterviewRow[]) {
  return {
    candidate_id: row.candidateId,
    requisition_item_id: row.requisitionItemId,
    requisition_id: row.requisitionId,
    full_name: row.fullName,
    email: row.email,
    phone: row.phone ?? null,
    resume_path: row.resumePath ?? null,
    current_stage: row.currentStage,
    added_by: row.addedBy ?? null,
    created_at: row.createdAt?.toISOString() ?? null,
    updated_at: row.updatedAt?.toISOString() ?? null,
    interviews: ivs.map(interviewToJson),
  };
}

function wfToHttp(e: unknown): HttpError {
  if (isWorkflowException(e)) {
    return new HttpError(e.httpStatus, e.message);
  }
  throw e;
}

async function loadItemTx(tx: AppDb, itemId: number) {
  const [row] = await tx
    .select()
    .from(requisitionItems)
    .where(eq(requisitionItems.itemId, itemId))
    .limit(1);
  return row ?? null;
}

async function syncItemToOfferedTx(
  tx: AppDb,
  itemId: number,
  candidateId: number,
  currentUserId: number,
  roles: string[],
) {
  let item = await loadItemTx(tx, itemId);
  if (!item) {
    throw new HttpError(404, "Requisition item not found");
  }
  if (item.itemStatus === "Fulfilled" || item.itemStatus === "Cancelled") {
    throw new HttpError(
      400,
      `Cannot update candidate stage; requisition item is in terminal status '${item.itemStatus}'.`,
    );
  }

  if (item.itemStatus === "Offered") {
    return;
  }

  const run = async () => {
    item = await loadItemTx(tx, itemId);
    if (!item) {
      throw new HttpError(404, "Requisition item not found");
    }
    if (item.itemStatus === "Pending" && item.assignedTa == null) {
      const roleSet = new Set(roles.map((r) => r.toLowerCase()));
      if (roleSet.has("ta")) {
        await RequisitionItemWorkflowEngine.assignTa(tx, {
          itemId: item.itemId,
          taUserId: currentUserId,
          performedBy: currentUserId,
          userRoles: roles,
        });
      } else {
        throw new HttpError(
          400,
          "Cannot auto-progress item from Pending because no TA is assigned. Assign TA first, then continue stage transition.",
        );
      }
    }

    item = await loadItemTx(tx, itemId);
    if (item?.itemStatus === "Sourcing") {
      await RequisitionItemWorkflowEngine.shortlist(tx, {
        itemId,
        userId: currentUserId,
        userRoles: roles,
        candidateCount: 1,
      });
    }

    item = await loadItemTx(tx, itemId);
    if (item?.itemStatus === "Shortlisted") {
      await RequisitionItemWorkflowEngine.startInterview(tx, {
        itemId,
        userId: currentUserId,
        userRoles: roles,
      });
    }

    item = await loadItemTx(tx, itemId);
    if (item?.itemStatus === "Interviewing") {
      await RequisitionItemWorkflowEngine.makeOffer(tx, {
        itemId,
        userId: currentUserId,
        userRoles: roles,
        candidateId: String(candidateId),
      });
    }
  };

  try {
    await run();
  } catch (e) {
    throw wfToHttp(e);
  }
}

export async function listCandidatesJson(params: {
  requisitionId?: number | null;
  requisitionItemId?: number | null;
  currentStage?: string | null;
}) {
  const rows = await repo.selectCandidatesFiltered(params);
  const ids = rows.map((r) => r.candidateId);
  const ivs = await repo.selectInterviewsForCandidates(ids);
  const by = new Map<number, repo.InterviewRow[]>();
  for (const i of ivs) {
    const arr = by.get(i.candidateId) ?? [];
    arr.push(i);
    by.set(i.candidateId, arr);
  }
  return rows.map((r) => candidateToJson(r, by.get(r.candidateId) ?? []));
}

export async function getCandidateJson(candidateId: number) {
  const row = await repo.selectCandidateById(candidateId);
  if (!row) {
    throw new HttpError(404, "Candidate not found");
  }
  const ivs = await repo.selectInterviewsForCandidate(candidateId);
  return candidateToJson(row, ivs);
}

export async function createCandidateJson(
  payload: {
    requisition_item_id: number;
    requisition_id: number;
    full_name: string;
    email: string;
    phone?: string | null;
    resume_path?: string | null;
  },
  user: ApiUser,
) {
  const db = getDb();
  const [item] = await db
    .select()
    .from(requisitionItems)
    .where(eq(requisitionItems.itemId, payload.requisition_item_id))
    .limit(1);
  if (!item) {
    throw new HttpError(404, "Requisition item not found");
  }
  if (item.reqId !== payload.requisition_id) {
    throw new HttpError(
      400,
      "Requisition item does not belong to the given requisition",
    );
  }
  await assertTaOwnershipForRequisitionItem(payload.requisition_item_id, user);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(candidates)
      .values({
        requisitionItemId: payload.requisition_item_id,
        requisitionId: payload.requisition_id,
        fullName: payload.full_name,
        email: payload.email,
        phone: payload.phone ?? null,
        resumePath: payload.resume_path ?? null,
        currentStage: "Sourced",
        addedBy: user.userId,
      })
      .returning();
    if (!row) {
      throw new HttpError(500, "Candidate create failed");
    }
    await tx.insert(auditLog).values({
      entityName: "candidate",
      entityId: String(row.candidateId),
      action: "CREATE",
      performedBy: user.userId,
      newValue: `Candidate ${payload.full_name} added for item ${payload.requisition_item_id}`,
      performedAt: new Date(),
    });
    return candidateToJson(row, []);
  });
}

export async function patchCandidateJson(
  candidateId: number,
  patch: {
    full_name?: string;
    email?: string;
    phone?: string | null;
    resume_path?: string | null;
  },
  user: ApiUser,
) {
  await assertTaOwnershipForCandidate(candidateId, user);
  const row = await repo.updateCandidateRow(candidateId, {
    fullName: patch.full_name,
    email: patch.email,
    phone: patch.phone,
    resumePath: patch.resume_path,
  });
  if (!row) {
    throw new HttpError(404, "Candidate not found");
  }
  const ivs = await repo.selectInterviewsForCandidate(candidateId);
  return candidateToJson(row, ivs);
}

export async function deleteCandidateJson(
  candidateId: number,
  user: ApiUser,
): Promise<void> {
  await assertTaOwnershipForCandidate(candidateId, user);
  const row = await repo.selectCandidateById(candidateId);
  if (!row) {
    throw new HttpError(404, "Candidate not found");
  }
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.insert(auditLog).values({
      entityName: "candidate",
      entityId: String(candidateId),
      action: "DELETE",
      performedBy: user.userId,
      oldValue: `Deleted candidate ${row.fullName}`,
      performedAt: new Date(),
    });
    await tx.delete(candidates).where(eq(candidates.candidateId, candidateId));
  });
}

export async function patchCandidateStageJson(
  candidateId: number,
  newStage: string,
  user: ApiUser,
  roles: string[],
) {
  await assertTaOwnershipForCandidate(candidateId, user);

  const db = getDb();
  return db.transaction(async (tx) => {
    const [cand] = await tx
      .select()
      .from(candidates)
      .where(eq(candidates.candidateId, candidateId))
      .limit(1);
    if (!cand) {
      throw new HttpError(404, "Candidate not found");
    }
    const ivRows = await tx
      .select()
      .from(interviews)
      .where(eq(interviews.candidateId, candidateId))
      .orderBy(asc(interviews.roundNumber));

    const oldStage = cand.currentStage;
    const allowed = VALID_STAGE_TRANSITIONS[oldStage] ?? [];
    if (!allowed.includes(newStage)) {
      throw new HttpError(
        400,
        `Cannot move from '${oldStage}' to '${newStage}'. Allowed: ${allowed}`,
      );
    }

    if (newStage === "Interviewing") {
      const hasSched = ivRows.some((i) => i.status === "Scheduled");
      if (!hasSched) {
        throw new HttpError(
          400,
          "At least one interview must be scheduled before moving to Interviewing",
        );
      }
    }

    if (newStage === "Offered" || newStage === "Hired") {
      const item = await loadItemTx(tx, cand.requisitionItemId);
      if (!item) {
        throw new HttpError(404, "Requisition item not found");
      }
      if (item.itemStatus === "Fulfilled" || item.itemStatus === "Cancelled") {
        throw new HttpError(
          400,
          `Cannot update candidate stage; requisition item is in terminal status '${item.itemStatus}'.`,
        );
      }
      if (item.itemStatus !== "Offered") {
        try {
          await syncItemToOfferedTx(
            tx,
            cand.requisitionItemId,
            candidateId,
            user.userId,
            roles,
          );
        } catch (e) {
          if (e instanceof HttpError) {
            throw e;
          }
          throw wfToHttp(e);
        }
      }
    }

    if (newStage === "Hired") {
      const itemAfter = await loadItemTx(tx, cand.requisitionItemId);
      if (!itemAfter) {
        throw new HttpError(404, "Requisition item not found");
      }
      if (itemAfter.itemStatus === "Fulfilled") {
        throw new HttpError(400, "Cannot hire; Requisition already fulfilled.");
      }
      if (itemAfter.itemStatus !== "Offered") {
        throw new HttpError(
          400,
          `Cannot hire; Requisition item must be in Offered status before marking candidate as Hired. Current item status: ${itemAfter.itemStatus}.`,
        );
      }

      const empId = await createEmployeeFromCandidateDb(tx, {
        candidateId: cand.candidateId,
        fullName: cand.fullName,
        email: cand.email,
      });

      try {
        await RequisitionItemWorkflowEngine.fulfill(tx, {
          itemId: itemAfter.itemId,
          userId: user.userId,
          userRoles: roles,
          employeeId: empId,
        });
      } catch (e) {
        throw wfToHttp(e);
      }

      const others = await tx
        .select()
        .from(candidates)
        .where(
          and(
            eq(candidates.requisitionItemId, cand.requisitionItemId),
            ne(candidates.candidateId, candidateId),
            notInArray(candidates.currentStage, ["Hired", "Rejected"]),
          ),
        );

      for (const other of others) {
        const prev = other.currentStage;
        await tx
          .update(candidates)
          .set({ currentStage: "Rejected", updatedAt: new Date() })
          .where(eq(candidates.candidateId, other.candidateId));
        await tx.insert(auditLog).values({
          entityName: "candidate",
          entityId: String(other.candidateId),
          action: "STAGE_CHANGE",
          performedBy: user.userId,
          oldValue: prev,
          newValue: "Rejected (Position Filled)",
          performedAt: new Date(),
        });
      }
    }

    await tx
      .update(candidates)
      .set({ currentStage: newStage, updatedAt: new Date() })
      .where(eq(candidates.candidateId, candidateId));

    await tx.insert(auditLog).values({
      entityName: "candidate",
      entityId: String(candidateId),
      action: "STAGE_CHANGE",
      performedBy: user.userId,
      oldValue: oldStage,
      newValue: newStage,
      performedAt: new Date(),
    });

    const [updated] = await tx
      .select()
      .from(candidates)
      .where(eq(candidates.candidateId, candidateId))
      .limit(1);
    const ivAfter = await tx
      .select()
      .from(interviews)
      .where(eq(interviews.candidateId, candidateId))
      .orderBy(asc(interviews.roundNumber));
    if (!updated) {
      throw new HttpError(500, "Candidate not found after update");
    }
    return candidateToJson(updated, ivAfter);
  });
}
