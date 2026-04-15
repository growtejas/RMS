import { HttpError } from "@/lib/http/http-error";
import {
  listRequisitionsFiltered,
  listRequisitionsForRaisedBy,
  selectItemsForReqId,
  selectItemsForReqIds,
  selectRequisitionById,
  type RequisitionHeaderRow,
  type RequisitionItemRow,
} from "@/lib/repositories/requisitions-read";
import { rolesMatchAny } from "@/lib/auth/normalize-roles";

/** JSON field names match FastAPI `RequisitionItemResponse` / `RequisitionResponse`. */
export type RequisitionItemJson = {
  item_id: number;
  req_id: number;
  role_position: string;
  skill_level: string | null;
  experience_years: number | null;
  education_requirement: string | null;
  job_description: string;
  jd_file_key: string | null;
  requirements: string | null;
  item_status: string;
  replacement_hire: boolean;
  replaced_emp_id: string | null;
  estimated_budget: number | null;
  approved_budget: number | null;
  currency: string | null;
  assigned_ta: number | null;
  assigned_emp_id: string | null;
};

export type RequisitionListJson = {
  req_id: number;
  project_name: string | null;
  client_name: string | null;
  office_location: string | null;
  work_mode: string | null;
  required_by_date: string | null;
  priority: string | null;
  justification: string | null;
  budget_amount: number | null;
  duration: string | null;
  is_replacement: boolean;
  manager_notes: string | null;
  rejection_reason: string | null;
  jd_file_key: string | null;
  overall_status: string;
  raised_by: number;
  assigned_ta: number | null;
  budget_approved_by: number | null;
  approved_by: number | null;
  approval_history: string | null;
  assigned_at: string | null;
  created_at: string | null;
  items: RequisitionItemJson[];
};

export type RequisitionDetailJson = RequisitionListJson & {
  total_items: number;
  fulfilled_items: number;
  cancelled_items: number;
  active_items: number;
  progress_ratio: number;
  progress_text: string;
  total_estimated_budget: number;
  total_approved_budget: number;
  budget_approval_status: string;
};

function ymd(d: Date | null | undefined): string | null {
  if (!d) {
    return null;
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dtIso(d: Date | null | undefined): string | null {
  if (!d) {
    return null;
  }
  return d.toISOString();
}

function decNum(v: string | null | undefined): number | null {
  if (v == null || v === "") {
    return null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function requisitionItemToJson(row: RequisitionItemRow): RequisitionItemJson {
  return {
    item_id: row.itemId,
    req_id: row.reqId,
    role_position: row.rolePosition,
    skill_level: row.skillLevel ?? null,
    experience_years: row.experienceYears ?? null,
    education_requirement: row.educationRequirement ?? null,
    job_description: row.jobDescription,
    jd_file_key: row.jdFileKey ?? null,
    requirements: row.requirements ?? null,
    item_status: row.itemStatus,
    replacement_hire: row.replacementHire,
    replaced_emp_id: row.replacedEmpId ?? null,
    estimated_budget: decNum(row.estimatedBudget as string | null),
    approved_budget: decNum(row.approvedBudget as string | null),
    currency: row.currency ?? "INR",
    assigned_ta: row.assignedTa ?? null,
    assigned_emp_id: row.assignedEmpId ?? null,
  };
}

function headerToListBase(
  row: RequisitionHeaderRow,
  items: RequisitionItemJson[],
): RequisitionListJson {
  return {
    req_id: row.reqId,
    project_name: row.projectName ?? null,
    client_name: row.clientName ?? null,
    office_location: row.officeLocation ?? null,
    work_mode: row.workMode ?? null,
    required_by_date: ymd(row.requiredByDate ?? null),
    priority: row.priority ?? null,
    justification: row.justification ?? null,
    budget_amount: decNum(row.budgetAmount as string | null),
    duration: row.duration ?? null,
    is_replacement: row.isReplacement,
    manager_notes: row.managerNotes ?? null,
    rejection_reason: row.rejectionReason ?? null,
    jd_file_key: row.jdFileKey ?? null,
    overall_status: row.overallStatus,
    raised_by: row.raisedBy,
    assigned_ta: row.assignedTa ?? null,
    budget_approved_by: row.budgetApprovedBy ?? null,
    approved_by: row.approvedBy ?? null,
    approval_history: dtIso(row.approvalHistory ?? null),
    assigned_at: dtIso(row.assignedAt ?? null),
    created_at: dtIso(row.createdAt ?? null),
    items,
  };
}

function computeDetailFields(items: RequisitionItemRow[]): Omit<
  RequisitionDetailJson,
  keyof RequisitionListJson
> {
  const totalItems = items.length;
  const fulfilledItems = items.filter((i) => i.itemStatus === "Fulfilled").length;
  const cancelledItems = items.filter((i) => i.itemStatus === "Cancelled").length;
  const activeItems = totalItems - cancelledItems;

  let progressRatio: number;
  let progressText: string;
  if (activeItems > 0) {
    progressRatio = fulfilledItems / activeItems;
    progressText = `${fulfilledItems}/${activeItems}`;
  } else {
    progressRatio = 1;
    progressText = "0/0";
  }

  let totalEstimated = 0;
  let totalApproved = 0;
  for (const it of items) {
    const est = decNum(it.estimatedBudget as string | null) ?? 0;
    totalEstimated += est;
    totalApproved += decNum(it.approvedBudget as string | null) ?? 0;
  }

  let approvedCount = 0;
  for (const it of items) {
    const ap = decNum(it.approvedBudget as string | null);
    if (ap != null && ap > 0) {
      approvedCount += 1;
    }
  }

  let budgetApprovalStatus: string;
  if (totalItems === 0) {
    budgetApprovalStatus = "none";
  } else if (approvedCount === 0) {
    budgetApprovalStatus = "pending";
  } else if (approvedCount < totalItems) {
    budgetApprovalStatus = "partial";
  } else {
    budgetApprovalStatus = "approved";
  }

  return {
    total_items: totalItems,
    fulfilled_items: fulfilledItems,
    cancelled_items: cancelledItems,
    active_items: activeItems,
    progress_ratio: progressRatio,
    progress_text: progressText,
    total_estimated_budget: totalEstimated,
    total_approved_budget: totalApproved,
    budget_approval_status: budgetApprovalStatus,
  };
}

export function isTaRole(roles: readonly string[]): boolean {
  return rolesMatchAny(roles, ["TA"]);
}

export async function listRequisitionsRead(input: {
  roles: readonly string[];
  currentUserId: number;
  status: string | null;
  raisedBy: number | null;
  myAssignments: boolean;
  assignedTo: string | null;
  assignedTa: number | null;
  page?: number;
  pageSize?: number;
}): Promise<RequisitionListJson[]> {
  const page = Number.isFinite(input.page) && (input.page ?? 1) > 0 ? (input.page as number) : 1;
  const pageSizeRaw =
    Number.isFinite(input.pageSize) && (input.pageSize ?? 0) > 0
      ? (input.pageSize as number)
      : 50;
  const pageSize = Math.min(Math.max(pageSizeRaw, 1), 200);
  const offset = (page - 1) * pageSize;

  const assignedToMeAlias = input.assignedTo === "me";
  const headers = await listRequisitionsFiltered({
    isTaUser: isTaRole(input.roles),
    currentUserId: input.currentUserId,
    myAssignments: input.myAssignments,
    assignedToMeAlias,
    assignedTaFilter: input.assignedTa,
    status: input.status,
    raisedBy: input.raisedBy,
    limit: pageSize,
    offset,
  });

  const reqIds = headers.map((h) => h.reqId);
  const allItems = await selectItemsForReqIds(reqIds);
  const byReq = new Map<number, RequisitionItemRow[]>();
  for (const it of allItems) {
    const list = byReq.get(it.reqId) ?? [];
    list.push(it);
    byReq.set(it.reqId, list);
  }

  return headers.map((h) =>
    headerToListBase(
      h,
      (byReq.get(h.reqId) ?? []).map(requisitionItemToJson),
    ),
  );
}

export async function listMyRequisitionsRead(
  userId: number,
  params?: { page?: number; pageSize?: number },
): Promise<RequisitionListJson[]> {
  const page = Number.isFinite(params?.page) && (params?.page ?? 1) > 0 ? (params?.page as number) : 1;
  const pageSizeRaw =
    Number.isFinite(params?.pageSize) && (params?.pageSize ?? 0) > 0
      ? (params?.pageSize as number)
      : 50;
  const pageSize = Math.min(Math.max(pageSizeRaw, 1), 200);
  const offset = (page - 1) * pageSize;

  const headers = await listRequisitionsForRaisedBy(userId, { limit: pageSize, offset });
  const reqIds = headers.map((h) => h.reqId);
  const allItems = await selectItemsForReqIds(reqIds);
  const byReq = new Map<number, RequisitionItemRow[]>();
  for (const it of allItems) {
    const list = byReq.get(it.reqId) ?? [];
    list.push(it);
    byReq.set(it.reqId, list);
  }
  return headers.map((h) =>
    headerToListBase(
      h,
      (byReq.get(h.reqId) ?? []).map(requisitionItemToJson),
    ),
  );
}

export async function getRequisitionDetailRead(
  reqId: number,
): Promise<RequisitionDetailJson> {
  const header = await selectRequisitionById(reqId);
  if (!header) {
    throw new HttpError(404, "Requisition not found");
  }
  const itemRows = await selectItemsForReqId(reqId);
  const items = itemRows.map(requisitionItemToJson);
  const base = headerToListBase(header, items);
  const computed = computeDetailFields(itemRows);
  return { ...base, ...computed };
}
