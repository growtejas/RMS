import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { Readable } from "node:stream";

import { buildAuditLogPdfStream } from "@/lib/services/audit-export-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/audit-logs/export — parity with FastAPI ReportLab PDF (pdfkit on Node). */
export async function GET(request: Request) {
  try {
    const user = await requireBearerUser(request);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Admin", "Owner", "HR");
    if (denied) {
      return denied;
    }

    const url = new URL(request.url);
    const dateFrom = url.searchParams.get("date_from");
    const dateTo = url.searchParams.get("date_to");

    if (!dateFrom?.trim() || !dateTo?.trim()) {
      return NextResponse.json(
        { detail: "date_from and date_to are required for export" },
        { status: 422 },
      );
    }

    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return NextResponse.json({ detail: "Invalid date range" }, { status: 422 });
    }
    const maxDays = Number.parseInt(process.env.AUDIT_EXPORT_MAX_DAYS ?? "31", 10);
    const maxMs = (Number.isFinite(maxDays) && maxDays > 0 ? maxDays : 31) * 86_400_000;
    if (to.getTime() - from.getTime() > maxMs) {
      return NextResponse.json(
        { detail: `Date range too large (max ${maxDays} days)` },
        { status: 422 },
      );
    }

    const maxRows = Number.parseInt(process.env.AUDIT_EXPORT_MAX_ROWS ?? "5000", 10);
    const limit = Number.isFinite(maxRows) && maxRows > 0 ? maxRows : 5000;

    const { stream, filename } = await buildAuditLogPdfStream({
      dateFrom,
      dateTo,
      limit,
    });

    const body = Readable.toWeb(stream) as unknown as ReadableStream;
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/audit-logs/export]", request);
  }
}
