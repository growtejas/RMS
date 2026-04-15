import PDFDocument from "pdfkit";
import { PassThrough, Readable } from "node:stream";

import { listAuditLogsForExport } from "@/lib/repositories/audit-logs-read";

type AuditRow = Awaited<ReturnType<typeof listAuditLogsForExport>>[number];

function parseValue(raw: string | null): unknown {
  if (raw == null || raw === "") {
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function formatDetails(log: Pick<AuditRow, "old_value" | "new_value" | "action">): string {
  const oldV = parseValue(log.old_value);
  const newV = parseValue(log.new_value);
  if (oldV != null || newV != null) {
    return `${String(oldV ?? "")} -> ${String(newV ?? "")}`.trim();
  }
  return log.action;
}

function formatTimestamp(iso: string): string {
  if (!iso) {
    return "";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/**
 * PDF audit export — same row set as FastAPI `GET /api/audit-logs/export` (date range + write-only filters via listAuditLogsForApi).
 */
export async function buildAuditLogPdfStream(params: {
  dateFrom: string;
  dateTo: string;
  limit: number;
}): Promise<{ stream: Readable; filename: string; rowCount: number }> {
  const rows = await listAuditLogsForExport({
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    limit: params.limit,
  });

  const doc = new PDFDocument({ margin: 48, size: "LETTER" });
  const out = new PassThrough();
  doc.on("error", (e) => out.destroy(e));
  out.on("error", () => {
    try {
      doc.end();
    } catch {
      // ignore
    }
  });
  doc.pipe(out);

  const pageBottom = 720;

  doc.font("Helvetica-Bold").fontSize(14).text("Audit Log Report");
  doc.moveDown(0.35);
  doc.font("Helvetica").fontSize(9);
  doc.text(`Generated: ${formatTimestamp(new Date().toISOString())} UTC`);
  doc.text(`Date range: ${params.dateFrom.trim()} to ${params.dateTo.trim()}`);
  doc.text(`Rows: ${rows.length}`);
  doc.moveDown(0.6);

  for (const r of rows) {
    if (doc.y > pageBottom) {
      doc.addPage();
    }

    const ts = formatTimestamp(r.performed_at);
    const disp =
      r.performed_by_full_name ||
      r.performed_by_username ||
      (r.performed_by == null ? "System" : `user ${r.performed_by}`);
    const roles =
      r.performed_by_roles?.length > 0 ? r.performed_by_roles.join(", ") : "-";
    const details = formatDetails(r);

    doc.font("Helvetica-Bold").fontSize(8).text(`${ts} — ${disp} (${roles})`);
    doc.font("Helvetica").fontSize(8);
    doc.text(`Action: ${r.action}   Entity: ${r.entity_name}`, { width: 515 });
    doc.text(`Details: ${details}`, { width: 515 });
    doc.moveDown(0.45);
  }

  doc.end();

  const day = new Date().toISOString().slice(0, 10);
  const filename = `audit-log-${day}.pdf`;
  return { stream: out, filename, rowCount: rows.length };
}
