import type { ApiUser } from "@/lib/auth/api-guard";
import { HttpError } from "@/lib/http/http-error";
import * as applicationsRepo from "@/lib/repositories/applications-repo";
import { patchCandidateStageJson } from "@/lib/services/candidates-service";

const APPLICATION_STAGE_ORDER = [
  "Sourced",
  "Shortlisted",
  "Interviewing",
  "Offered",
  "Hired",
  "Rejected",
] as const;
const APPLICATION_STAGE_SET = new Set<string>(APPLICATION_STAGE_ORDER);

function applicationHistoryToJson(row: applicationsRepo.ApplicationStageHistoryRow) {
  return {
    history_id: row.historyId,
    application_id: row.applicationId,
    candidate_id: row.candidateId,
    from_stage: row.fromStage ?? null,
    to_stage: row.toStage,
    changed_by: row.changedBy ?? null,
    reason: row.reason ?? null,
    metadata: row.metadata ?? null,
    changed_at: row.changedAt?.toISOString() ?? null,
  };
}

function applicationToJson(row: applicationsRepo.ApplicationWithCandidateRow) {
  return {
    application_id: row.application.applicationId,
    candidate_id: row.application.candidateId,
    requisition_item_id: row.application.requisitionItemId,
    requisition_id: row.application.requisitionId,
    current_stage: row.application.currentStage,
    source: row.application.source,
    created_by: row.application.createdBy ?? null,
    created_at: row.application.createdAt?.toISOString() ?? null,
    updated_at: row.application.updatedAt?.toISOString() ?? null,
    candidate: {
      candidate_id: row.candidate.candidateId,
      full_name: row.candidate.fullName,
      email: row.candidate.email,
      phone: row.candidate.phone ?? null,
    },
  };
}

export async function listApplicationsJson(params: {
  requisitionId?: number | null;
  requisitionItemId?: number | null;
  currentStage?: string | null;
  candidateId?: number | null;
}) {
  const rows = await applicationsRepo.selectApplicationsFiltered(params);
  return rows.map(applicationToJson);
}

export async function getApplicationJson(applicationId: number) {
  const row = await applicationsRepo.selectApplicationById(applicationId);
  if (!row) {
    throw new HttpError(404, "Application not found");
  }
  const history = await applicationsRepo.selectApplicationHistory(applicationId);
  return {
    ...applicationToJson(row),
    stage_history: history.map(applicationHistoryToJson),
  };
}

export async function patchApplicationStageJson(
  applicationId: number,
  newStage: string,
  reason: string | undefined,
  user: ApiUser,
  roles: string[],
) {
  const app = await applicationsRepo.selectApplicationById(applicationId);
  if (!app) {
    throw new HttpError(404, "Application not found");
  }

  await patchCandidateStageJson(app.application.candidateId, newStage, user, roles, reason);

  const after = await applicationsRepo.selectApplicationByCandidateId(app.application.candidateId);
  if (!after) {
    throw new HttpError(500, "Application not found after stage update");
  }
  return getApplicationJson(after.applicationId);
}

export async function getApplicationsPipelineJson(params: {
  requisitionItemId?: number | null;
  requisitionId?: number | null;
  compact?: boolean;
}) {
  if (params.requisitionItemId == null && params.requisitionId == null) {
    throw new HttpError(422, "Provide requisition_item_id or requisition_id");
  }

  const rows = await applicationsRepo.selectApplicationsFiltered({
    requisitionItemId: params.requisitionItemId ?? null,
    requisitionId: params.requisitionId ?? null,
  });

  const seeded = new Map<string, ReturnType<typeof applicationToJson>[]>();
  for (const stage of APPLICATION_STAGE_ORDER) {
    seeded.set(stage, []);
  }

  for (const row of rows) {
    const stage = row.application.currentStage || "Sourced";
    const arr = seeded.get(stage) ?? [];
    arr.push(applicationToJson(row));
    seeded.set(stage, arr);
  }

  const stages = Array.from(seeded.entries()).map(([stage, applications]) =>
    params.compact
      ? {
          stage,
          count: applications.length,
        }
      : {
          stage,
          count: applications.length,
          applications,
        },
  );

  const unknown = rows
    .filter((r) => !APPLICATION_STAGE_SET.has(r.application.currentStage))
    .map(applicationToJson);
  if (unknown.length > 0) {
    if (params.compact) {
      stages.push({
        stage: "Unknown",
        count: unknown.length,
      });
    } else {
      stages.push({
        stage: "Unknown",
        count: unknown.length,
        applications: unknown,
      });
    }
  }

  return {
    requisition_item_id: params.requisitionItemId ?? null,
    requisition_id: params.requisitionId ?? null,
    total: rows.length,
    stages,
  };
}
