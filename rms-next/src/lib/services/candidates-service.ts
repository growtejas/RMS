import { and, asc, eq, isNotNull, ne, notInArray } from "drizzle-orm";

import type { ApiUser } from "@/lib/auth/api-guard";
import {
  assertTaOwnershipForCandidate,
  assertTaOwnershipForRequisitionItem,
} from "@/lib/auth/ta-ownership";
import { getDb } from "@/lib/db";
import { auditLog, candidates, interviews, requisitions, requisitionItems } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/http-error";
import * as repo from "@/lib/repositories/candidates-repo";
import { findOrCreatePersonTx } from "@/lib/repositories/candidate-persons-repo";
import { RequisitionItemWorkflowEngine } from "@/lib/workflow/item-workflow-engine";
import { isWorkflowException } from "@/lib/workflow/workflow-exceptions";
import type { AppDb } from "@/lib/workflow/workflow-db";

import { createEmployeeFromCandidateDb } from "@/lib/services/onboarding-candidate-service";
import { ensureApplicationForCandidateTx } from "@/lib/services/application-sync-service";
import { ensureCandidateEmbedding } from "@/lib/services/embeddings-service";
import type { ResumeParseCacheRecord } from "@/lib/services/resume-parse-cache";
import {
  contentHashFromArtifact,
  parsedArtifactToCacheRecord,
  resolveResumeRefForFilesystem,
  resumeParseCacheToApiRecord,
  tryStatLocalResumeFile,
} from "@/lib/services/resume-parse-cache";
import { parseResumeArtifact } from "@/lib/services/resume-parser-service";
import { enqueueResumeStructureRefineJob } from "@/lib/queue/resume-structure-queue";
import { mergeStructuredProfileForPersist } from "@/lib/services/resume-structure/merge-candidate-profile";
import { buildResumeStructureIssueTags } from "@/lib/services/resume-structure/resume-structure-audit";
import { parseResumeStructuredDocument } from "@/lib/services/resume-structure/resume-structure.schema";
import {
  resolveResumeStructureEnabled,
  runResumeStructurePipeline,
} from "@/lib/services/resume-structure/resume-structure-pipeline";

function candidateResumeHashRejectDuplicates(): boolean {
  const v = process.env.CANDIDATE_RESUME_HASH_REJECT_DUPLICATES?.trim().toLowerCase();
  return v === "true" || v === "1";
}

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
    person_id: row.personId,
    requisition_item_id: row.requisitionItemId,
    requisition_id: row.requisitionId,
    full_name: row.fullName,
    email: row.email,
    phone: row.phone ?? null,
    resume_path: row.resumePath ?? null,
    total_experience_years:
      row.totalExperienceYears != null
        ? Number(row.totalExperienceYears)
        : null,
    notice_period_days: row.noticePeriodDays ?? null,
    is_referral: row.isReferral === true,
    candidate_skills: Array.isArray(row.candidateSkills)
      ? row.candidateSkills.filter((s): s is string => typeof s === "string")
      : null,
    education_raw: row.educationRaw ?? null,
    current_stage: row.currentStage,
    added_by: row.addedBy ?? null,
    created_at: row.createdAt?.toISOString() ?? null,
    updated_at: row.updatedAt?.toISOString() ?? null,
    interviews: ivs.map(interviewToJson),
  };
}

function buildCandidateEmbeddingSourceText(input: {
  fullName: string;
  email: string;
  phone?: string | null;
  resumePath?: string | null;
  candidateSkills?: string[] | null;
}): string {
  const emailLocal = input.email.split("@")[0] ?? input.email;
  const skills =
    input.candidateSkills?.length && input.candidateSkills.join(" ");
  return [input.fullName, emailLocal, input.phone, input.resumePath, skills]
    .filter(Boolean)
    .join(" ");
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
  organizationId: string;
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

export async function getCandidateJson(
  candidateId: number,
  organizationId: string,
) {
  const row = await repo.selectCandidateById(candidateId, organizationId);
  if (!row) {
    throw new HttpError(404, "Candidate not found");
  }
  const ivs = await repo.selectInterviewsForCandidate(candidateId);
  let resume_structured: {
    schema_version: number;
    extractor: string;
    confidence_overall: number;
    warnings: string[];
    issue_tags: string[];
  } | null = null;
  const structuredParsed = parseResumeStructuredDocument(row.resumeStructuredProfile);
  if (structuredParsed.ok) {
    const doc = structuredParsed.data;
    resume_structured = {
      schema_version: doc.schema_version,
      extractor: doc.extractor,
      confidence_overall: doc.confidence.overall,
      warnings: doc.warnings.slice(0, 20),
      issue_tags: buildResumeStructureIssueTags(doc),
    };
  }
  return {
    ...candidateToJson(row, ivs),
    resume_parse: resumeParseCacheToApiRecord(row.resumeParseCache),
    resume_structured,
  };
}

export async function createCandidateJson(
  payload: {
    requisition_item_id: number;
    requisition_id: number;
    full_name: string;
    email: string;
    phone?: string | null;
    resume_path?: string | null;
    total_experience_years?: number | null;
    notice_period_days?: number | null;
    is_referral?: boolean;
    candidate_skills?: string[] | null;
    education_raw?: string | null;
  },
  user: ApiUser,
) {
  const db = getDb();
  const rows = await db
    .select({ item: requisitionItems })
    .from(requisitionItems)
    .innerJoin(requisitions, eq(requisitionItems.reqId, requisitions.reqId))
    .where(
      and(
        eq(requisitionItems.itemId, payload.requisition_item_id),
        eq(requisitions.organizationId, user.organizationId),
      ),
    )
    .limit(1);
  const item = rows[0]?.item;
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

  const emailLower = payload.email.trim().toLowerCase();

  let preResume: {
    hash: string | null;
    cache: ResumeParseCacheRecord;
    dupId: number | null;
  } | null = null;
  const resumePathTrim = payload.resume_path?.trim() ?? "";
  if (resumePathTrim) {
    const ref = resolveResumeRefForFilesystem(resumePathTrim);
    if (ref) {
      const parsed = await parseResumeArtifact({
        normalizedCandidate: {
          fullName: payload.full_name,
          email: payload.email,
          phone: payload.phone ?? null,
          currentCompany: null,
          resumeUrl: ref,
          source: "manual",
          externalId: `manual-create`,
          jobSlug: String(payload.requisition_item_id),
        },
      });
      const stat = await tryStatLocalResumeFile(ref);
      const cacheRec = parsedArtifactToCacheRecord(parsed, stat, resumePathTrim);
      const hash = contentHashFromArtifact(parsed);
      if (hash && candidateResumeHashRejectDuplicates()) {
        const [collision] = await db
          .select({ candidateId: candidates.candidateId })
          .from(candidates)
          .where(
            and(
              eq(candidates.organizationId, user.organizationId),
              eq(candidates.requisitionItemId, payload.requisition_item_id),
              eq(candidates.resumeContentHash, hash),
              isNotNull(candidates.resumeContentHash),
            ),
          )
          .limit(1);
        if (collision) {
          throw new HttpError(
            409,
            `Duplicate resume content already exists for this job (candidate_id=${collision.candidateId})`,
          );
        }
      }
      let dupId: number | null = null;
      if (hash && !candidateResumeHashRejectDuplicates()) {
        const [dup] = await db
          .select({ candidateId: candidates.candidateId })
          .from(candidates)
          .where(
            and(
              eq(candidates.organizationId, user.organizationId),
              eq(candidates.requisitionItemId, payload.requisition_item_id),
              eq(candidates.resumeContentHash, hash),
              isNotNull(candidates.resumeContentHash),
              ne(candidates.email, payload.email),
            ),
          )
          .limit(1);
        if (dup) {
          dupId = dup.candidateId;
        }
      }
      preResume = { hash, cache: cacheRec, dupId };
    }
  }

  const rawTextForStructure =
    preResume?.cache?.rawText && preResume.cache.status === "processed"
      ? preResume.cache.rawText
      : null;
  const structureOutcome = await runResumeStructurePipeline({
    rawText: rawTextForStructure,
    sourceHash: preResume?.hash ?? null,
    fallbackName: payload.full_name,
    fallbackEmail: payload.email,
    existingProfile: null,
    logContext: {
      path: "candidates_create",
      requisition_item_id: payload.requisition_item_id,
    },
  });
  const parsedSkillsForMerge =
    preResume?.cache?.parsedData &&
    typeof preResume.cache.parsedData === "object" &&
    preResume.cache.parsedData !== null &&
    Array.isArray((preResume.cache.parsedData as { skills?: unknown }).skills)
      ? ((preResume.cache.parsedData as { skills: unknown[] }).skills as unknown[])
          .filter((s): s is string => typeof s === "string")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  const pd = (preResume?.cache?.parsedData ?? {}) as {
    experience_years?: unknown;
    notice_period_days?: unknown;
    education_raw?: unknown;
  };
  const pExp =
    typeof pd.experience_years === "number" && Number.isFinite(pd.experience_years)
      ? pd.experience_years
      : null;
  const pNotice =
    typeof pd.notice_period_days === "number" && Number.isFinite(pd.notice_period_days)
      ? Math.trunc(pd.notice_period_days)
      : null;
  const pEdu =
    typeof pd.education_raw === "string" && pd.education_raw.trim()
      ? pd.education_raw.trim()
      : null;

  const mergedCreate = mergeStructuredProfileForPersist({
    existing: {
      candidateSkills: payload.candidate_skills ?? null,
      totalExperienceYears: payload.total_experience_years ?? null,
      noticePeriodDays: payload.notice_period_days ?? null,
      educationRaw: payload.education_raw ?? null,
    },
    parsed: {
      skills: parsedSkillsForMerge,
      experienceYears: pExp,
      noticeDays: pNotice,
      educationRaw: pEdu,
    },
    structured: structureOutcome.document?.profile ?? null,
  });

  const structuredProfileInsert = structureOutcome.document
    ? (structureOutcome.document as unknown as Record<string, unknown>)
    : null;
  const structuredStatusInsert = structureOutcome.document
    ? structureOutcome.resumeStructureStatus ?? "ready"
    : null;

  return db.transaction(async (tx) => {
    const personId = await findOrCreatePersonTx(tx, {
      organizationId: user.organizationId,
      emailNormalized: emailLower,
      fullName: payload.full_name,
      phone: payload.phone ?? null,
    });
    const existingLine = await repo.selectCandidateIdByOrgItemPersonTx(tx, {
      organizationId: user.organizationId,
      requisitionItemId: payload.requisition_item_id,
      personId,
    });
    if (existingLine != null) {
      throw new HttpError(
        409,
        `A candidate with this email already exists for this job (candidate_id=${existingLine})`,
      );
    }
    const [row] = await tx
      .insert(candidates)
      .values({
        organizationId: user.organizationId,
        personId,
        requisitionItemId: payload.requisition_item_id,
        requisitionId: payload.requisition_id,
        fullName: payload.full_name,
        email: payload.email,
        phone: payload.phone ?? null,
        resumePath: payload.resume_path ?? null,
        totalExperienceYears: mergedCreate.totalExperienceYears,
        noticePeriodDays: mergedCreate.noticePeriodDays,
        isReferral: payload.is_referral === true,
        candidateSkills: mergedCreate.candidateSkills,
        educationRaw: mergedCreate.educationRaw,
        resumeContentHash: preResume?.hash ?? null,
        resumeParseCache: preResume
          ? ({ ...preResume.cache } as Record<string, unknown>)
          : null,
        ...(resolveResumeStructureEnabled()
          ? {
              resumeStructuredProfile: structuredProfileInsert,
              resumeStructureStatus: structuredStatusInsert,
            }
          : {}),
        duplicateResumeOfCandidateId: preResume?.dupId ?? null,
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

    await ensureApplicationForCandidateTx({
      tx,
      organizationId: user.organizationId,
      candidateId: row.candidateId,
      requisitionItemId: row.requisitionItemId,
      requisitionId: row.requisitionId,
      candidateStage: row.currentStage,
      source: "manual",
      performedBy: user.userId,
      reason: "Application created from candidate create API",
      metadata: {
        source: "api/candidates",
      },
    });
    await ensureCandidateEmbedding({
      candidateId: row.candidateId,
      requisitionItemId: row.requisitionItemId,
      requisitionId: row.requisitionId,
      sourceText: buildCandidateEmbeddingSourceText({
        fullName: row.fullName,
        email: row.email,
        phone: row.phone,
        resumePath: row.resumePath,
        candidateSkills: row.candidateSkills ?? null,
      }),
    });
    if (resolveResumeStructureEnabled() && structureOutcome.enqueueLlmRefine) {
      try {
        await enqueueResumeStructureRefineJob(row.candidateId);
      } catch {
        /* optional redis */
      }
    }
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
    total_experience_years?: number | null;
    notice_period_days?: number | null;
    is_referral?: boolean;
    candidate_skills?: string[] | null;
    education_raw?: string | null;
  },
  user: ApiUser,
) {
  await assertTaOwnershipForCandidate(candidateId, user);
  const row = await repo.updateCandidateRow(candidateId, user.organizationId, {
    fullName: patch.full_name,
    email: patch.email,
    phone: patch.phone,
    resumePath: patch.resume_path,
    totalExperienceYears:
      patch.total_experience_years === undefined
        ? undefined
        : patch.total_experience_years == null
          ? null
          : String(patch.total_experience_years),
    noticePeriodDays:
      patch.notice_period_days === undefined
        ? undefined
        : patch.notice_period_days,
    isReferral: patch.is_referral,
    candidateSkills:
      patch.candidate_skills === undefined ? undefined : patch.candidate_skills,
    educationRaw:
      patch.education_raw === undefined ? undefined : patch.education_raw,
  });
  if (!row) {
    throw new HttpError(404, "Candidate not found");
  }
  await ensureCandidateEmbedding({
    candidateId: row.candidateId,
    requisitionItemId: row.requisitionItemId,
    requisitionId: row.requisitionId,
    sourceText: buildCandidateEmbeddingSourceText({
      fullName: row.fullName,
      email: row.email,
      phone: row.phone,
      resumePath: row.resumePath,
      candidateSkills: row.candidateSkills ?? null,
    }),
  });
  const ivs = await repo.selectInterviewsForCandidate(candidateId);
  return candidateToJson(row, ivs);
}

export async function deleteCandidateJson(
  candidateId: number,
  user: ApiUser,
): Promise<void> {
  await assertTaOwnershipForCandidate(candidateId, user);
  const row = await repo.selectCandidateById(candidateId, user.organizationId);
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
    await tx
      .delete(candidates)
      .where(
        and(
          eq(candidates.candidateId, candidateId),
          eq(candidates.organizationId, user.organizationId),
        ),
      );
  });
}

export async function patchCandidateStageJson(
  candidateId: number,
  newStage: string,
  user: ApiUser,
  roles: string[],
  reason?: string,
) {
  await assertTaOwnershipForCandidate(candidateId, user);

  const db = getDb();
  return db.transaction(async (tx) => {
    const [cand] = await tx
      .select()
      .from(candidates)
      .where(
        and(
          eq(candidates.candidateId, candidateId),
          eq(candidates.organizationId, user.organizationId),
        ),
      )
      .limit(1);
    if (!cand) {
      throw new HttpError(404, "Candidate not found");
    }

    const oldStage = cand.currentStage;
    const allowed = VALID_STAGE_TRANSITIONS[oldStage] ?? [];
    if (!allowed.includes(newStage)) {
      throw new HttpError(
        400,
        `Cannot move from '${oldStage}' to '${newStage}'. Allowed: ${allowed}`,
      );
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
            eq(candidates.organizationId, user.organizationId),
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
      .where(
        and(
          eq(candidates.candidateId, candidateId),
          eq(candidates.organizationId, user.organizationId),
        ),
      );

    await tx.insert(auditLog).values({
      entityName: "candidate",
      entityId: String(candidateId),
      action: "STAGE_CHANGE",
      performedBy: user.userId,
      oldValue: oldStage,
      newValue: newStage,
      performedAt: new Date(),
    });

    await ensureApplicationForCandidateTx({
      tx,
      organizationId: user.organizationId,
      candidateId: cand.candidateId,
      requisitionItemId: cand.requisitionItemId,
      requisitionId: cand.requisitionId,
      candidateStage: newStage,
      source: "candidate_stage_api",
      performedBy: user.userId,
      reason: reason?.trim() || "Candidate stage updated via API",
      metadata: {
        source: "api/candidates/[candidateId]/stage",
      },
    });

    const [updated] = await tx
      .select()
      .from(candidates)
      .where(
        and(
          eq(candidates.candidateId, candidateId),
          eq(candidates.organizationId, user.organizationId),
        ),
      )
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
