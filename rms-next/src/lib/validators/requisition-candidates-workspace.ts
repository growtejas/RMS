import { HttpError } from "@/lib/http/http-error";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  type PageSize,
} from "@/lib/pagination/contract";

export const WORKSPACE_INTERVIEW_STATUS = [
  "any",
  "none",
  "scheduled",
  "in_progress",
  "failed",
  "rejected",
  "passed_latest",
] as const;

export type WorkspaceInterviewStatus = (typeof WORKSPACE_INTERVIEW_STATUS)[number];

const PAGE_SIZE_NUM_SET = new Set<number>(PAGE_SIZE_OPTIONS);

function optInt(s: string | null): number | null {
  if (s == null || s.trim() === "") return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function optFloat(s: string | null): number | null {
  if (s == null || s.trim() === "") return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function parseIsoDateStart(s: string | null): Date | null {
  if (s == null || s.trim() === "") return null;
  const d = new Date(`${s.trim()}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** End of calendar day UTC (inclusive upper bound for `created_at <=`). */
function parseIsoDateEndInclusive(s: string | null): Date | null {
  if (s == null || s.trim() === "") return null;
  const d = new Date(`${s.trim()}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type RequisitionCandidatesWorkspaceQuery = {
  page: number;
  /** Canonical page size (25 / 50 / 100). */
  limit: PageSize;
  q: string | null;
  requisition_item_id: number | null;
  current_stage: string | null;
  source: string | null;
  created_by: number | null;
  applied_from: Date | null;
  applied_to_inclusive: Date | null;
  exp_min: number | null;
  exp_max: number | null;
  include_unknown_exp: boolean;
  interview_status: WorkspaceInterviewStatus;
};

export function parseRequisitionCandidatesWorkspaceQuery(
  url: URL,
): RequisitionCandidatesWorkspaceQuery {
  const pageRaw = optInt(url.searchParams.get("page"));
  const page = pageRaw != null && pageRaw >= 1 ? pageRaw : 1;
  // Accept both the canonical `limit` and legacy `page_size` so old callers
  // keep working until UI consumers migrate.
  const limitRaw = optInt(
    url.searchParams.get("limit") ?? url.searchParams.get("page_size"),
  );
  const limit: PageSize =
    limitRaw != null && PAGE_SIZE_NUM_SET.has(limitRaw)
      ? (limitRaw as PageSize)
      : DEFAULT_PAGE_SIZE;

  const requisition_item_id = optInt(url.searchParams.get("requisition_item_id"));
  const created_by = optInt(url.searchParams.get("created_by"));

  const applied_from = parseIsoDateStart(url.searchParams.get("applied_from"));
  const applied_to_raw = url.searchParams.get("applied_to");
  const applied_to_inclusive =
    applied_to_raw != null && applied_to_raw.trim() !== ""
      ? parseIsoDateEndInclusive(applied_to_raw)
      : null;
  if (url.searchParams.has("applied_from") && applied_from == null) {
    throw new HttpError(422, "applied_from must be a valid YYYY-MM-DD date");
  }
  if (url.searchParams.has("applied_to") && applied_to_inclusive == null) {
    throw new HttpError(422, "applied_to must be a valid YYYY-MM-DD date");
  }

  const exp_min = optFloat(url.searchParams.get("exp_min"));
  const exp_max = optFloat(url.searchParams.get("exp_max"));
  if (exp_min != null && exp_max != null && exp_min > exp_max) {
    throw new HttpError(422, "exp_min cannot be greater than exp_max");
  }

  const ivParam = url.searchParams.get("interview_status");
  const ivRaw =
    ivParam == null || ivParam.trim() === ""
      ? "any"
      : ivParam.trim().toLowerCase();
  if (!(WORKSPACE_INTERVIEW_STATUS as readonly string[]).includes(ivRaw)) {
    throw new HttpError(
      422,
      `interview_status must be one of: ${WORKSPACE_INTERVIEW_STATUS.join(", ")}`,
    );
  }
  const interview_status = ivRaw as WorkspaceInterviewStatus;

  return {
    page,
    limit,
    q: url.searchParams.get("q")?.trim() || null,
    requisition_item_id,
    current_stage: url.searchParams.get("current_stage")?.trim() || null,
    source: url.searchParams.get("source")?.trim() || null,
    created_by,
    applied_from,
    applied_to_inclusive,
    exp_min,
    exp_max,
    include_unknown_exp:
      url.searchParams.get("include_unknown_exp") === "1" ||
      url.searchParams.get("include_unknown_exp")?.toLowerCase() === "true",
    interview_status,
  };
}
