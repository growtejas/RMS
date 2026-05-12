import { NextResponse } from "next/server";
import { z } from "zod";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { getInterviewerScope } from "@/lib/auth/interviewer-scope";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination/contract";
import { paginatedJson } from "@/lib/pagination/server";
import { parsePaginationParams } from "@/lib/pagination/zod";
import {
  listRequisitionsRead,
  listRequisitionsReadPaged,
} from "@/lib/services/requisitions-read-service";
import { createRequisitionFromForm } from "@/lib/services/requisitions-write-service";
import { requisitionItemCreateBody } from "@/lib/validators/requisition-write";

const PAGE_SIZE_NUMS = new Set<number>(PAGE_SIZE_OPTIONS);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/requisitions — multipart create (non-workflow), parity with FastAPI `POST /api/requisitions/`.
 */
export async function POST(req: Request) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Manager", "Admin", "HR");
    if (denied) {
      return denied;
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json(
        { detail: "Expected multipart form data" },
        { status: 400 },
      );
    }

    const itemsRaw = form.get("items_json");
    const itemsStr =
      typeof itemsRaw === "string" ? itemsRaw : String(itemsRaw ?? "[]");
    let itemsParsed: unknown;
    try {
      itemsParsed = JSON.parse(itemsStr || "[]");
    } catch {
      return NextResponse.json({ detail: "Invalid items payload" }, { status: 400 });
    }
    if (!Array.isArray(itemsParsed)) {
      return NextResponse.json({ detail: "items_json must be a list" }, { status: 400 });
    }
    const itemsCheck = z.array(requisitionItemCreateBody).safeParse(itemsParsed);
    if (!itemsCheck.success) {
      return NextResponse.json(
        { detail: itemsCheck.error.issues.map((i) => i.message).join("; ") },
        { status: 422 },
      );
    }

    const jdEntry = form.get("jd_file");
    let jdFile: { buffer: Buffer; filename: string; mime: string | null } | null =
      null;
    if (jdEntry instanceof File && jdEntry.size > 0) {
      const buffer = Buffer.from(await jdEntry.arrayBuffer());
      jdFile = {
        buffer,
        filename: jdEntry.name || "upload.pdf",
        mime: jdEntry.type || null,
      };
    }

    const str = (k: string) => {
      const v = form.get(k);
      return v == null || v === "" ? null : String(v);
    };

    const created = await createRequisitionFromForm({
      organizationId: user.organizationId,
      projectName: str("project_name"),
      clientName: str("client_name"),
      officeLocation: str("office_location"),
      workMode: str("work_mode"),
      requiredByDate: str("required_by_date"),
      priority: str("priority"),
      justification: str("justification"),
      budgetAmountRaw: str("budget_amount"),
      duration: str("duration"),
      isReplacement: form.get("is_replacement") === "true",
      managerNotes: str("manager_notes"),
      items: itemsCheck.data,
      jdFile,
      raisedBy: user.userId,
    });

    const data = await getRequisitionDetailRead(
      created.reqId,
      user.organizationId,
    );
    return NextResponse.json(data);
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/requisitions]");
  }
}

/**
 * GET /api/requisitions — list requisitions.
 *
 * When called with the canonical `?limit=25|50|100` (or any `?page=`),
 * returns the canonical envelope `{ success, data: { items, pagination }, error }`.
 *
 * Otherwise (legacy `?page_size=` or no pagination) returns the legacy bare
 * array for backwards compatibility while consumers migrate.
 */
export async function GET(req: Request) {
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
      "Employee",
      "TA",
      "Interviewer",
    );
    if (denied) {
      return denied;
    }

    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const raisedByRaw = url.searchParams.get("raised_by");
    const raisedBy =
      raisedByRaw != null && raisedByRaw !== ""
        ? Number.parseInt(raisedByRaw, 10)
        : null;
    const myAssignments =
      url.searchParams.get("my_assignments") === "true";
    const assignedTo = url.searchParams.get("assigned_to");
    const assignedTaRaw = url.searchParams.get("assigned_ta");
    const assignedTa =
      assignedTaRaw != null && assignedTaRaw !== ""
        ? Number.parseInt(assignedTaRaw, 10)
        : null;

    if (raisedByRaw != null && raisedByRaw !== "" && !Number.isFinite(raisedBy)) {
      return NextResponse.json({ detail: "Invalid raised_by" }, { status: 422 });
    }
    if (
      assignedTaRaw != null &&
      assignedTaRaw !== "" &&
      !Number.isFinite(assignedTa)
    ) {
      return NextResponse.json({ detail: "Invalid assigned_ta" }, { status: 422 });
    }

    const limitRaw = url.searchParams.get("limit");
    const limitNum = limitRaw != null ? Number.parseInt(limitRaw, 10) : NaN;
    const useCanonical =
      url.searchParams.has("page") ||
      (Number.isFinite(limitNum) && PAGE_SIZE_NUMS.has(limitNum));

    const interviewerScope = await getInterviewerScope(user);
    if (useCanonical) {
      if (interviewerScope.interviewerOnly) {
        const { page, limit } = parsePaginationParams(url);
        const all = await listRequisitionsRead({
          organizationId: user.organizationId,
          roles: user.roles,
          currentUserId: user.userId,
          status,
          raisedBy: Number.isFinite(raisedBy) ? raisedBy : null,
          myAssignments,
          assignedTo,
          assignedTa: Number.isFinite(assignedTa) ? assignedTa : null,
          page: 1,
          pageSize: 500,
        });
        const scoped = all.filter((r) =>
          interviewerScope.requisitionIds.has(r.req_id),
        );
        const total = scoped.length;
        const start = (page - 1) * limit;
        const items = scoped.slice(start, start + limit);
        return paginatedJson(items, { page, limit, total });
      }
      const { page, limit } = parsePaginationParams(url);
      const result = await listRequisitionsReadPaged({
        organizationId: user.organizationId,
        roles: user.roles,
        currentUserId: user.userId,
        status,
        raisedBy: Number.isFinite(raisedBy) ? raisedBy : null,
        myAssignments,
        assignedTo,
        assignedTa: Number.isFinite(assignedTa) ? assignedTa : null,
        page,
        limit,
      });
      return paginatedJson(result.items, {
        page: result.pagination.page,
        limit: result.pagination.limit,
        total: result.pagination.total,
      });
    }

    // Legacy path
    const pageRaw = url.searchParams.get("page");
    const pageSizeRaw = url.searchParams.get("page_size");
    const page =
      pageRaw != null && pageRaw !== "" ? Number.parseInt(pageRaw, 10) : 1;
    const pageSize =
      pageSizeRaw != null && pageSizeRaw !== ""
        ? Number.parseInt(pageSizeRaw, 10)
        : 50;
    if (!Number.isFinite(page) || page <= 0) {
      return NextResponse.json({ detail: "Invalid page" }, { status: 422 });
    }
    if (!Number.isFinite(pageSize) || pageSize <= 0) {
      return NextResponse.json({ detail: "Invalid page_size" }, { status: 422 });
    }
    const data = await listRequisitionsRead({
      organizationId: user.organizationId,
      roles: user.roles,
      currentUserId: user.userId,
      status,
      raisedBy: Number.isFinite(raisedBy) ? raisedBy : null,
      myAssignments,
      assignedTo,
      assignedTa: Number.isFinite(assignedTa) ? assignedTa : null,
      page,
      pageSize,
    });
    const scopedData = interviewerScope.interviewerOnly
      ? data.filter((r) => interviewerScope.requisitionIds.has(r.req_id))
      : data;
    return NextResponse.json(scopedData, {
      headers: {
        "X-RMS-Requisitions-Legacy":
          "Pass `page` and `limit` (25/50/100) to receive the canonical paginated envelope.",
      },
    });
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/requisitions]");
  }
}
