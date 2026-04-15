import { NextResponse } from "next/server";
import { z } from "zod";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import {
  getRequisitionDetailRead,
  listRequisitionsRead,
} from "@/lib/services/requisitions-read-service";
import { createRequisitionFromForm } from "@/lib/services/requisitions-write-service";
import { requisitionItemCreateBody } from "@/lib/validators/requisition-write";

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

    const data = await getRequisitionDetailRead(created.reqId);
    return NextResponse.json(data);
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/requisitions]");
  }
}

/**
 * GET /api/requisitions — parity with FastAPI list (read-only Phase C).
 * Query: status, raised_by, my_assignments, assigned_to=me, assigned_ta
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
    const pageRaw = url.searchParams.get("page");
    const pageSizeRaw = url.searchParams.get("page_size");
    const page =
      pageRaw != null && pageRaw !== "" ? Number.parseInt(pageRaw, 10) : 1;
    const pageSize =
      pageSizeRaw != null && pageSizeRaw !== ""
        ? Number.parseInt(pageSizeRaw, 10)
        : 50;

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
    if (!Number.isFinite(page) || page <= 0) {
      return NextResponse.json({ detail: "Invalid page" }, { status: 422 });
    }
    if (!Number.isFinite(pageSize) || pageSize <= 0) {
      return NextResponse.json({ detail: "Invalid page_size" }, { status: 422 });
    }

    const data = await listRequisitionsRead({
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
    return NextResponse.json(data);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/requisitions]");
  }
}
