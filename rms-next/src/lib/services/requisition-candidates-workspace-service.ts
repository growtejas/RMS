import * as applicationsRepo from "@/lib/repositories/applications-repo";
import * as cieRepo from "@/lib/repositories/cie-repo";
import * as interviewsRepo from "@/lib/repositories/interviews-repo";
import {
  buildPaginationMeta,
  computePagePosition,
} from "@/lib/pagination/contract";
import { buildLifecyclePayloadForApplication } from "@/lib/services/interview-lifecycle-service";
import type { RequisitionCandidatesWorkspaceQuery } from "@/lib/validators/requisition-candidates-workspace";

function parseExperienceYears(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const n = Number.parseFloat(String(raw));
  return Number.isFinite(n) ? n : null;
}

export async function listRequisitionCandidatesWorkspaceJson(params: {
  organizationId: string;
  requisitionId: number;
  query: RequisitionCandidatesWorkspaceQuery;
}) {
  const { organizationId, requisitionId, query } = params;

  const filterBase = {
    organizationId,
    requisitionId,
    requisitionItemId: query.requisition_item_id,
    q: query.q,
    currentStage: query.current_stage,
    source: query.source,
    createdBy: query.created_by,
    appliedFrom: query.applied_from,
    appliedToExclusive: query.applied_to_inclusive,
    expMin: query.exp_min,
    expMax: query.exp_max,
    includeUnknownExp: query.include_unknown_exp,
    interviewStatus:
      query.interview_status === "any" ? null : query.interview_status,
  };

  const total = await applicationsRepo.countApplicationsWorkspace(filterBase);
  const { page, offset, totalPages } = computePagePosition({
    pageRequested: query.page,
    total,
    limit: query.limit,
  });
  const [rows, facets] =
    totalPages === 0
      ? await Promise.all([
          Promise.resolve([] as Awaited<
            ReturnType<typeof applicationsRepo.selectApplicationsWorkspacePage>
          >),
          applicationsRepo.selectRequisitionWorkspaceFacets({
            organizationId,
            requisitionId,
          }),
        ])
      : await Promise.all([
          applicationsRepo.selectApplicationsWorkspacePage({
            ...filterBase,
            offset,
            limit: query.limit,
          }),
          applicationsRepo.selectRequisitionWorkspaceFacets({
            organizationId,
            requisitionId,
          }),
        ]);

  const candidateIds = rows.map((r) => r.candidate.candidateId);
  const cieMap = await cieRepo.selectLatestReportFieldsByCandidateIds(
    organizationId,
    candidateIds,
  );

  const appIds = rows.map((r) => r.application.applicationId);
  const allIv = await interviewsRepo.selectInterviewsByApplicationIds(appIds);
  const ivByApp = new Map<number, typeof allIv>();
  for (const iv of allIv) {
    const aid = iv.applicationId;
    if (aid == null || !Number.isFinite(aid)) continue;
    const list = ivByApp.get(aid) ?? [];
    list.push(iv);
    ivByApp.set(aid, list);
  }

  const items = rows.map((r) => {
    const cie = cieMap.get(r.candidate.candidateId) ?? null;
    const ivRows = ivByApp.get(r.application.applicationId) ?? [];
    const lifecycle = buildLifecyclePayloadForApplication({
      applicationId: r.application.applicationId,
      candidateId: r.application.candidateId,
      currentStage: r.application.currentStage,
      interviewRows: ivRows,
    });

    const years = parseExperienceYears(r.candidate.totalExperienceYears);

    return {
      application_id: r.application.applicationId,
      candidate_id: r.application.candidateId,
      requisition_item_id: r.application.requisitionItemId,
      role_label: r.rolePosition ?? null,
      full_name: r.candidate.fullName,
      email: r.candidate.email,
      phone: r.candidate.phone,
      current_stage: r.application.currentStage,
      source: r.application.source,
      created_at: r.application.createdAt?.toISOString() ?? null,
      recruiter:
        r.recruiter?.userId != null && r.recruiter.username != null
          ? { id: r.recruiter.userId, name: r.recruiter.username }
          : null,
      experience: {
        years,
        cie_level: cie?.experience_level ?? null,
      },
      lifecycle,
    };
  });

  return {
    items,
    pagination: buildPaginationMeta({ page, limit: query.limit, total }),
    facets: {
      stages: facets.stages,
      sources: facets.sources,
      recruiters: facets.recruiters,
    },
  };
}
