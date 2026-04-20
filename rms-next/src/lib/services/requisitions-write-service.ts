import { and, asc, eq } from "drizzle-orm";

import { HttpError } from "@/lib/http/http-error";
import {
  canCreateItem,
  canEditJd,
  canManagerEditRequisition,
} from "@/lib/requisition-permissions";
import { findEmployeeByEmpId } from "@/lib/repositories/employees-core";
import {
  selectRequisitionById,
  selectItemsForReqId,
} from "@/lib/repositories/requisitions-read";
import {
  findItemById,
  insertBudgetAudit,
  insertItemRow,
  insertRequisitionHeader,
  patchRequisitionFields,
  setHeaderJdKey,
  setItemJdKey,
  updateItemPipelineRankingJd,
} from "@/lib/repositories/requisitions-write";
import { requisitionItemToJson } from "@/lib/services/requisitions-read-service";
import {
  jdDeleteFile,
  jdIsRemoteUrl,
  jdSaveBuffer,
  jdSaveStream,
} from "@/lib/storage/jd-local-storage";
import type { Readable } from "node:stream";
import type {
  RequisitionItemCreateInput,
  RequisitionManagerPutInput,
  RequisitionPatchInput,
} from "@/lib/validators/requisition-write";
import { getDb } from "@/lib/db";
import { requisitionItems, requisitions } from "@/lib/db/schema";

const MAX_JD_BYTES = 10 * 1024 * 1024;

function decNum(v: string | null | undefined): number | null {
  if (v == null || v === "") {
    return null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function optDate(s: string | null | undefined): Date | null {
  if (s == null || s === "") {
    return null;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    throw new HttpError(400, "Invalid required_by_date");
  }
  return d;
}

function optDateTime(s: string | null | undefined): Date | null {
  if (s == null || s === "") {
    return null;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    throw new HttpError(400, "Invalid datetime");
  }
  return d;
}

function budgetToNumericString(
  v: number | string | null | undefined,
): string | null {
  if (v == null || v === "") {
    return null;
  }
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) {
    throw new HttpError(400, "Invalid budget");
  }
  return String(n);
}

function estimatedToString(v: number | string | null | undefined): string {
  if (v == null || v === "") {
    return "0";
  }
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) {
    throw new HttpError(400, "Invalid estimated_budget");
  }
  return String(n);
}

async function validateReplacement(input: RequisitionItemCreateInput) {
  if (input.replacement_hire && input.replaced_emp_id) {
    const emp = await findEmployeeByEmpId(input.replaced_emp_id);
    if (!emp) {
      throw new HttpError(
        400,
        `Employee '${input.replaced_emp_id}' not found for replacement`,
      );
    }
  }
}

function assertPdf(name: string, mime: string | null, size: number) {
  const lower = name.toLowerCase();
  if (mime !== "application/pdf" && !lower.endsWith(".pdf")) {
    throw new HttpError(400, "JD must be a PDF");
  }
  if (size > MAX_JD_BYTES) {
    throw new HttpError(400, "JD exceeds 10MB");
  }
}

export async function createRequisitionFromForm(params: {
  organizationId: string;
  projectName: string | null;
  clientName: string | null;
  officeLocation: string | null;
  workMode: string | null;
  requiredByDate: string | null;
  priority: string | null;
  justification: string | null;
  budgetAmountRaw: string | null;
  duration: string | null;
  isReplacement: boolean;
  managerNotes: string | null;
  items: RequisitionItemCreateInput[];
  jdFile: { buffer: Buffer; filename: string; mime: string | null } | null;
  raisedBy: number;
}) {
  let budgetAmount: string | null = null;
  if (params.budgetAmountRaw) {
    const n = Number(params.budgetAmountRaw);
    if (!Number.isFinite(n)) {
      throw new HttpError(400, "Invalid budget");
    }
    budgetAmount = String(n);
  }

  const requiredByDate = params.requiredByDate
    ? optDate(params.requiredByDate)
    : null;

  for (const item of params.items) {
    await validateReplacement(item);
  }

  const reqId = await insertRequisitionHeader({
    organizationId: params.organizationId,
    projectName: params.projectName,
    clientName: params.clientName?.trim() || null,
    justification: params.justification,
    managerNotes: params.managerNotes,
    priority: params.priority,
    isReplacement: params.isReplacement,
    duration: params.duration?.trim() || null,
    workMode: params.workMode,
    officeLocation: params.officeLocation,
    budgetAmount,
    requiredByDate,
    raisedBy: params.raisedBy,
    overallStatus: "Draft",
    jdFileKey: null,
  });

  if (!reqId) {
    throw new HttpError(500, "Failed to create requisition");
  }

  for (const item of params.items) {
    await insertItemRow({
      reqId,
      rolePosition: item.role_position,
      jobDescription: item.job_description,
      skillLevel: item.skill_level ?? null,
      experienceYears: item.experience_years ?? null,
      educationRequirement: item.education_requirement ?? null,
      requirements: item.requirements ?? null,
      itemStatus: "Pending",
      replacementHire: item.replacement_hire ?? false,
      replacedEmpId: item.replaced_emp_id ?? null,
      estimatedBudget: estimatedToString(item.estimated_budget),
      approvedBudget: null,
      currency: item.currency ?? "INR",
      jdFileKey: null,
    });
  }

  if (params.jdFile) {
    assertPdf(
      params.jdFile.filename,
      params.jdFile.mime,
      params.jdFile.buffer.length,
    );
    const ts = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    const key = await jdSaveBuffer(`${reqId}_${ts}.pdf`, params.jdFile.buffer);
    await setHeaderJdKey(reqId, params.organizationId, key);
  }

  const header = await selectRequisitionById(reqId, params.organizationId);
  if (!header) {
    throw new HttpError(500, "Requisition not found after create");
  }
  return header;
}

export async function patchRequisitionNonWorkflow(
  reqId: number,
  organizationId: string,
  body: RequisitionPatchInput,
) {
  const header = await selectRequisitionById(reqId, organizationId);
  if (!header) {
    throw new HttpError(404, "Requisition not found");
  }

  const patch: Record<string, unknown> = {};
  if (body.project_name !== undefined) {
    patch.projectName = body.project_name;
  }
  if (body.client_name !== undefined) {
    patch.clientName = body.client_name;
  }
  if (body.justification !== undefined) {
    patch.justification = body.justification;
  }
  if (body.manager_notes !== undefined) {
    patch.managerNotes = body.manager_notes;
  }
  if (body.priority !== undefined) {
    patch.priority = body.priority;
  }
  if (body.is_replacement !== undefined) {
    patch.isReplacement = body.is_replacement;
  }
  if (body.duration !== undefined) {
    patch.duration = body.duration;
  }
  if (body.work_mode !== undefined) {
    patch.workMode = body.work_mode;
  }
  if (body.office_location !== undefined) {
    patch.officeLocation = body.office_location;
  }
  if (body.required_by_date !== undefined) {
    patch.requiredByDate =
      body.required_by_date === null || body.required_by_date === ""
        ? null
        : optDate(body.required_by_date);
  }
  if (body.approval_history !== undefined) {
    patch.approvalHistory =
      body.approval_history === null || body.approval_history === ""
        ? null
        : optDateTime(body.approval_history);
  }
  if (body.assigned_at !== undefined) {
    patch.assignedAt =
      body.assigned_at === null || body.assigned_at === ""
        ? null
        : optDateTime(body.assigned_at);
  }

  await patchRequisitionFields(reqId, organizationId, patch);
  return { message: "Requisition updated" };
}

export async function putRequisitionManager(
  reqId: number,
  organizationId: string,
  body: RequisitionManagerPutInput,
  userId: number,
) {
  const header = await selectRequisitionById(reqId, organizationId);
  if (!header) {
    throw new HttpError(404, "Requisition not found");
  }
  if (!canManagerEditRequisition(header.overallStatus, header.raisedBy, userId)) {
    if (header.raisedBy !== userId) {
      throw new HttpError(403, "Not allowed to edit");
    }
    throw new HttpError(403, "Requisition is locked");
  }

  const oldBudget = decNum(header.budgetAmount as string | null);

  const headerPatch: Record<string, unknown> = {};
  if (body.project_name !== undefined) {
    headerPatch.projectName = body.project_name;
  }
  if (body.client_name !== undefined) {
    headerPatch.clientName = body.client_name?.trim() || null;
  }
  if (body.office_location !== undefined) {
    headerPatch.officeLocation = body.office_location;
  }
  if (body.work_mode !== undefined) {
    headerPatch.workMode = body.work_mode;
  }
  if (body.required_by_date !== undefined) {
    headerPatch.requiredByDate =
      body.required_by_date === null || body.required_by_date === ""
        ? null
        : optDate(body.required_by_date);
  }
  if (body.priority !== undefined) {
    headerPatch.priority = body.priority;
  }
  if (body.justification !== undefined) {
    headerPatch.justification = body.justification;
  }
  if (body.budget_amount !== undefined) {
    headerPatch.budgetAmount = budgetToNumericString(body.budget_amount);
  }
  if (body.duration !== undefined) {
    headerPatch.duration = body.duration?.trim() || null;
  }
  if (body.is_replacement !== undefined) {
    headerPatch.isReplacement = body.is_replacement;
  }
  if (body.manager_notes !== undefined) {
    headerPatch.managerNotes = body.manager_notes;
  }

  if (body.items !== undefined) {
    for (const item of body.items) {
      await validateReplacement(item);
    }
  }

  const db = getDb();
  await db.transaction(async (tx) => {
    if (Object.keys(headerPatch).length > 0) {
      await tx
        .update(requisitions)
        .set(headerPatch)
        .where(
          and(
            eq(requisitions.reqId, reqId),
            eq(requisitions.organizationId, organizationId),
          ),
        );
    }

    if (body.items !== undefined) {
      const existing = await tx
        .select()
        .from(requisitionItems)
        .where(eq(requisitionItems.reqId, reqId))
        .orderBy(asc(requisitionItems.itemId));

      const byId = new Map<number, (typeof existing)[number]>();
      for (const it of existing) {
        byId.set(it.itemId, it);
      }

      const keepExistingIds = new Set<number>();

      for (const item of body.items) {
        const itemId = (item as { item_id?: unknown }).item_id;
        if (itemId != null) {
          const idNum = Number(itemId);
          const prev = byId.get(idNum);
          if (!prev) {
            throw new HttpError(400, `Unknown requisition item_id: ${idNum}`);
          }
          keepExistingIds.add(idNum);

          await tx
            .update(requisitionItems)
            .set({
              rolePosition: item.role_position,
              jobDescription: item.job_description,
              skillLevel: item.skill_level ?? null,
              experienceYears: item.experience_years ?? null,
              educationRequirement: item.education_requirement ?? null,
              requirements: item.requirements ?? null,
              replacementHire:
                item.replacement_hire !== undefined
                  ? item.replacement_hire
                  : (prev.replacementHire as boolean),
              replacedEmpId:
                item.replaced_emp_id !== undefined
                  ? item.replaced_emp_id ?? null
                  : (prev.replacedEmpId as string | null),
              estimatedBudget:
                item.estimated_budget !== undefined
                  ? estimatedToString(item.estimated_budget)
                  : (prev.estimatedBudget as string),
              currency:
                item.currency !== undefined
                  ? item.currency ?? "INR"
                  : (prev.currency as string),
              version: (prev.version as number) + 1,
            })
            .where(eq(requisitionItems.itemId, idNum));
        } else {
          await tx.insert(requisitionItems).values({
            reqId,
            rolePosition: item.role_position,
            jobDescription: item.job_description,
            skillLevel: item.skill_level ?? null,
            experienceYears: item.experience_years ?? null,
            educationRequirement: item.education_requirement ?? null,
            requirements: item.requirements ?? null,
            itemStatus: "Pending",
            replacementHire: item.replacement_hire ?? false,
            replacedEmpId: item.replaced_emp_id ?? null,
            estimatedBudget: estimatedToString(item.estimated_budget),
            approvedBudget: null,
            currency: item.currency ?? "INR",
            jdFileKey: null,
            version: 1,
          });
        }
      }

      const incomingIds = new Set<number>();
      for (const item of body.items) {
        const itemId = (item as { item_id?: unknown }).item_id;
        if (itemId != null) incomingIds.add(Number(itemId));
      }
      const toDelete = existing
        .map((it) => it.itemId)
        .filter((id) => !incomingIds.has(id));
      if (toDelete.length) {
        for (const id of toDelete) {
          await tx.delete(requisitionItems).where(eq(requisitionItems.itemId, id));
        }
      }
    }

    if (body.budget_amount !== undefined) {
      const newStr = budgetToNumericString(body.budget_amount);
      const newNum = newStr != null ? Number(newStr) : null;
      if (newNum !== oldBudget) {
        await insertBudgetAudit({
          reqId,
          performedBy: userId,
          oldBudget: oldBudget ?? null,
          newBudget: newNum,
          db: tx,
        });
      }
    }
  });

  return { message: "Requisition updated" };
}

export async function createRequisitionItemNonWorkflow(
  reqId: number,
  organizationId: string,
  item: RequisitionItemCreateInput,
) {
  const header = await selectRequisitionById(reqId, organizationId);
  if (!header) {
    throw new HttpError(404, "Requisition not found");
  }
  const gate = canCreateItem(header.overallStatus);
  if (!gate.ok) {
    throw new HttpError(400, gate.reason ?? "Cannot add items");
  }
  await validateReplacement(item);

  const row = await insertItemRow({
    reqId,
    rolePosition: item.role_position,
    jobDescription: item.job_description,
    skillLevel: item.skill_level ?? null,
    experienceYears: item.experience_years ?? null,
    educationRequirement: item.education_requirement ?? null,
    requirements: item.requirements ?? null,
    itemStatus: "Pending",
    replacementHire: item.replacement_hire ?? false,
    replacedEmpId: item.replaced_emp_id ?? null,
    estimatedBudget: "0",
    approvedBudget: null,
    currency: "INR",
    jdFileKey: null,
  });
  if (!row) {
    throw new HttpError(500, "Item create failed");
  }
  return requisitionItemToJson(row);
}

export async function listRequisitionItemsJson(
  reqId: number,
  organizationId: string,
) {
  const rows = await selectItemsForReqId(reqId, organizationId);
  return rows.map(requisitionItemToJson);
}

type UploadBody =
  | { buffer: Buffer; filename: string; mime: string | null }
  | { stream: Readable; size: number; filename: string; mime: string | null };

export async function uploadRequisitionJd(
  reqId: number,
  organizationId: string,
  file: UploadBody,
  userId: number,
) {
  const size = "buffer" in file ? file.buffer.length : file.size;
  assertPdf(file.filename, file.mime, size);
  const header = await selectRequisitionById(reqId, organizationId);
  if (!header) {
    throw new HttpError(404, "Requisition not found");
  }
  if (!canEditJd(header.overallStatus, header.raisedBy, userId)) {
    if (header.raisedBy !== userId) {
      throw new HttpError(403, "Not allowed to edit");
    }
    throw new HttpError(403, "Requisition is locked");
  }
  if (header.jdFileKey) {
    if (!jdIsRemoteUrl(header.jdFileKey)) {
      await jdDeleteFile(header.jdFileKey);
    }
  }
  const ts = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const key =
    "buffer" in file
      ? await jdSaveBuffer(`${reqId}_${ts}.pdf`, file.buffer)
      : await jdSaveStream(`${reqId}_${ts}.pdf`, file.stream);
  await setHeaderJdKey(reqId, organizationId, key);
  return { message: "JD uploaded", jd_file_key: key };
}

export async function deleteRequisitionJd(
  reqId: number,
  organizationId: string,
  userId: number,
) {
  const header = await selectRequisitionById(reqId, organizationId);
  if (!header) {
    throw new HttpError(404, "Requisition not found");
  }
  if (!canEditJd(header.overallStatus, header.raisedBy, userId)) {
    if (header.raisedBy !== userId) {
      throw new HttpError(403, "Not allowed to edit");
    }
    throw new HttpError(403, "Requisition is locked");
  }
  if (!header.jdFileKey) {
    throw new HttpError(404, "JD file not available");
  }
  if (!jdIsRemoteUrl(header.jdFileKey)) {
    await jdDeleteFile(header.jdFileKey);
  }
  await setHeaderJdKey(reqId, organizationId, null);
  return { message: "JD removed" };
}

export async function uploadItemJd(
  itemId: number,
  organizationId: string,
  file: UploadBody,
  userId: number,
) {
  const size = "buffer" in file ? file.buffer.length : file.size;
  assertPdf(file.filename, file.mime, size);
  const item = await findItemById(itemId, organizationId);
  if (!item) {
    throw new HttpError(404, "Requisition item not found");
  }
  const header = await selectRequisitionById(item.reqId, organizationId);
  if (!header) {
    throw new HttpError(404, "Requisition not found");
  }
  if (!canEditJd(header.overallStatus, header.raisedBy, userId)) {
    if (header.raisedBy !== userId) {
      throw new HttpError(403, "Not allowed to edit");
    }
    throw new HttpError(403, "Requisition is locked");
  }
  if (item.jdFileKey && !jdIsRemoteUrl(item.jdFileKey)) {
    await jdDeleteFile(item.jdFileKey);
  }
  const ts = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const key =
    "buffer" in file
      ? await jdSaveBuffer(`item_${itemId}_${ts}.pdf`, file.buffer)
      : await jdSaveStream(`item_${itemId}_${ts}.pdf`, file.stream);
  await setItemJdKey(itemId, organizationId, key);
  return { message: "JD uploaded", jd_file_key: key };
}

export async function deleteItemJd(
  itemId: number,
  organizationId: string,
  userId: number,
) {
  const item = await findItemById(itemId, organizationId);
  if (!item) {
    throw new HttpError(404, "Requisition item not found");
  }
  const header = await selectRequisitionById(item.reqId, organizationId);
  if (!header) {
    throw new HttpError(404, "Requisition not found");
  }
  if (!canEditJd(header.overallStatus, header.raisedBy, userId)) {
    if (header.raisedBy !== userId) {
      throw new HttpError(403, "Not allowed to edit");
    }
    throw new HttpError(403, "Requisition is locked");
  }
  if (!item.jdFileKey) {
    throw new HttpError(404, "JD file not available for this item");
  }
  if (!jdIsRemoteUrl(item.jdFileKey)) {
    await jdDeleteFile(item.jdFileKey);
  }
  await setItemJdKey(itemId, organizationId, null);
  return { message: "JD removed" };
}

function assertRequisitionActiveForPipelineJd(header: { overallStatus: string }) {
  if (header.overallStatus === "Cancelled" || header.overallStatus === "Rejected") {
    throw new HttpError(400, "Cannot update pipeline ranking JD for this requisition");
  }
}

/** TA/HR: optional JD text + PDF used only for candidate ranking (not the manager item JD). */
export async function patchPipelineRankingJdSettings(
  itemId: number,
  organizationId: string,
  body: {
    use_requisition_jd: boolean;
    pipeline_jd_text?: string | null;
    ranking_required_skills?: string[] | null;
  },
) {
  const item = await findItemById(itemId, organizationId);
  if (!item) {
    throw new HttpError(404, "Requisition item not found");
  }
  const header = await selectRequisitionById(item.reqId, organizationId);
  if (!header) {
    throw new HttpError(404, "Requisition not found");
  }
  assertRequisitionActiveForPipelineJd(header);

  const textPatch =
    body.pipeline_jd_text === undefined
      ? {}
      : {
          pipelineJdText:
            body.pipeline_jd_text === null || body.pipeline_jd_text === ""
              ? null
              : body.pipeline_jd_text,
        };

  const skillsPatch =
    body.ranking_required_skills === undefined
      ? {}
      : {
          rankingRequiredSkills:
            body.ranking_required_skills == null ||
            body.ranking_required_skills.length === 0
              ? null
              : body.ranking_required_skills,
        };

  await updateItemPipelineRankingJd(itemId, organizationId, {
    pipelineRankingUseRequisitionJd: body.use_requisition_jd,
    ...textPatch,
    ...skillsPatch,
  });
  const updated = await findItemById(itemId, organizationId);
  if (!updated) {
    throw new HttpError(500, "Requisition item not found after update");
  }
  return requisitionItemToJson(updated);
}

export async function uploadPipelineRankingJdPdf(
  itemId: number,
  organizationId: string,
  file: UploadBody,
) {
  const size = "buffer" in file ? file.buffer.length : file.size;
  assertPdf(file.filename, file.mime, size);
  const item = await findItemById(itemId, organizationId);
  if (!item) {
    throw new HttpError(404, "Requisition item not found");
  }
  const header = await selectRequisitionById(item.reqId, organizationId);
  if (!header) {
    throw new HttpError(404, "Requisition not found");
  }
  assertRequisitionActiveForPipelineJd(header);
  if (item.pipelineJdFileKey && !jdIsRemoteUrl(item.pipelineJdFileKey)) {
    await jdDeleteFile(item.pipelineJdFileKey);
  }
  const ts = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const key =
    "buffer" in file
      ? await jdSaveBuffer(`pipeline_item_${itemId}_${ts}.pdf`, file.buffer)
      : await jdSaveStream(`pipeline_item_${itemId}_${ts}.pdf`, file.stream);
  await updateItemPipelineRankingJd(itemId, organizationId, {
    pipelineJdFileKey: key,
    pipelineRankingUseRequisitionJd: false,
  });
  return { pipeline_jd_file_key: key };
}

export async function deletePipelineRankingJdPdf(
  itemId: number,
  organizationId: string,
) {
  const item = await findItemById(itemId, organizationId);
  if (!item) {
    throw new HttpError(404, "Requisition item not found");
  }
  const header = await selectRequisitionById(item.reqId, organizationId);
  if (!header) {
    throw new HttpError(404, "Requisition not found");
  }
  assertRequisitionActiveForPipelineJd(header);
  if (!item.pipelineJdFileKey) {
    throw new HttpError(404, "No pipeline ranking JD file for this item");
  }
  if (!jdIsRemoteUrl(item.pipelineJdFileKey)) {
    await jdDeleteFile(item.pipelineJdFileKey);
  }
  await updateItemPipelineRankingJd(itemId, organizationId, {
    pipelineJdFileKey: null,
  });
  return { message: "Pipeline ranking JD file removed" as const };
}
