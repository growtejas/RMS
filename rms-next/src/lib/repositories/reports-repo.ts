import { and, desc, eq, gte, inArray, lte, type SQL } from "drizzle-orm";

import { getReadDb } from "@/lib/db";
import {
  applicationStageHistory,
  applications,
  candidateJobScores,
  candidates,
  interviewScorecards,
  interviews,
  requisitionItems,
  requisitions,
  users,
} from "@/lib/db/schema";
import type { ReportFilters } from "@/lib/reports/types";

const APPLICATION_FETCH_LIMIT = 20_000;
const HISTORY_FETCH_LIMIT = 100_000;
const INTERVIEW_FETCH_LIMIT = 20_000;
const SCORECARD_FETCH_LIMIT = 40_000;
const SCORE_FETCH_LIMIT = 50_000;

function buildBaseAppConds(organizationId: string, filters: ReportFilters): SQL[] {
  const conds: SQL[] = [eq(applications.organizationId, organizationId)];
  if (filters.from) conds.push(gte(applications.createdAt, new Date(filters.from)));
  if (filters.to) conds.push(lte(applications.createdAt, new Date(filters.to)));
  if (filters.requisitionIds.length > 0) {
    conds.push(inArray(applications.requisitionId, filters.requisitionIds));
  }
  if (filters.requisitionItemIds.length > 0) {
    conds.push(inArray(applications.requisitionItemId, filters.requisitionItemIds));
  }
  if (filters.recruiterIds.length > 0) {
    conds.push(inArray(applications.createdBy, filters.recruiterIds));
  }
  if (filters.source.length > 0) {
    conds.push(inArray(applications.source, filters.source));
  }
  if (filters.pipelineStages.length > 0) {
    conds.push(inArray(applications.currentStage, filters.pipelineStages));
  }
  if (filters.department.length > 0) {
    conds.push(inArray(requisitions.projectName, filters.department));
  }
  if (filters.location.length > 0) {
    conds.push(inArray(requisitions.officeLocation, filters.location));
  }
  if (filters.employmentType.length > 0) {
    conds.push(inArray(requisitions.workMode, filters.employmentType));
  }
  return conds;
}

export async function fetchApplicationsForReport(
  organizationId: string,
  filters: ReportFilters,
) {
  const db = getReadDb();
  return db
    .select({
      applicationId: applications.applicationId,
      candidateId: applications.candidateId,
      candidateName: candidates.fullName,
      candidateEmail: candidates.email,
      requisitionId: applications.requisitionId,
      requisitionItemId: applications.requisitionItemId,
      currentStage: applications.currentStage,
      source: applications.source,
      createdAt: applications.createdAt,
      createdBy: applications.createdBy,
      offerMeta: applications.offerMeta,
      atsBucket: applications.atsBucket,
      recruiterName: users.username,
      rolePosition: requisitionItems.rolePosition,
      itemStatus: requisitionItems.itemStatus,
      department: requisitions.projectName,
      clientName: requisitions.clientName,
      officeLocation: requisitions.officeLocation,
      workMode: requisitions.workMode,
    })
    .from(applications)
    .leftJoin(users, eq(applications.createdBy, users.userId))
    .leftJoin(candidates, eq(applications.candidateId, candidates.candidateId))
    .leftJoin(requisitionItems, eq(applications.requisitionItemId, requisitionItems.itemId))
    .leftJoin(requisitions, eq(applications.requisitionId, requisitions.reqId))
    .where(and(...buildBaseAppConds(organizationId, filters)))
    .orderBy(desc(applications.createdAt))
    .limit(APPLICATION_FETCH_LIMIT);
}

export type ReportApplicationRow = Awaited<
  ReturnType<typeof fetchApplicationsForReport>
>[number];

export async function fetchApplicationStageHistory(applicationIds: number[]) {
  const db = getReadDb();
  if (applicationIds.length === 0) return [];
  return db
    .select({
      applicationId: applicationStageHistory.applicationId,
      fromStage: applicationStageHistory.fromStage,
      toStage: applicationStageHistory.toStage,
      reason: applicationStageHistory.reason,
      changedAt: applicationStageHistory.changedAt,
    })
    .from(applicationStageHistory)
    .where(inArray(applicationStageHistory.applicationId, applicationIds))
    .orderBy(desc(applicationStageHistory.changedAt))
    .limit(HISTORY_FETCH_LIMIT);
}

export type ReportStageHistoryRow = Awaited<
  ReturnType<typeof fetchApplicationStageHistory>
>[number];

export async function fetchInterviewsForReport(
  organizationId: string,
  filters: ReportFilters,
) {
  const db = getReadDb();
  const conds: SQL[] = [eq(applications.organizationId, organizationId)];
  if (filters.from) conds.push(gte(interviews.createdAt, new Date(filters.from)));
  if (filters.to) conds.push(lte(interviews.createdAt, new Date(filters.to)));
  if (filters.requisitionIds.length > 0) {
    conds.push(inArray(applications.requisitionId, filters.requisitionIds));
  }
  if (filters.requisitionItemIds.length > 0) {
    conds.push(inArray(applications.requisitionItemId, filters.requisitionItemIds));
  }
  if (filters.recruiterIds.length > 0) {
    conds.push(inArray(applications.createdBy, filters.recruiterIds));
  }
  if (filters.source.length > 0) {
    conds.push(inArray(applications.source, filters.source));
  }
  if (filters.interviewStage.length > 0) {
    conds.push(inArray(interviews.roundName, filters.interviewStage));
  }
  return db
    .select({
      interviewId: interviews.id,
      applicationId: interviews.applicationId,
      candidateId: interviews.candidateId,
      status: interviews.status,
      result: interviews.result,
      createdAt: interviews.createdAt,
      scheduledAt: interviews.scheduledAt,
      roundName: interviews.roundName,
      conductedBy: interviews.conductedBy,
      interviewer: users.username,
    })
    .from(interviews)
    .leftJoin(applications, eq(interviews.applicationId, applications.applicationId))
    .leftJoin(users, eq(interviews.conductedBy, users.userId))
    .where(and(...conds))
    .orderBy(desc(interviews.createdAt))
    .limit(INTERVIEW_FETCH_LIMIT);
}

export type ReportInterviewRow = Awaited<
  ReturnType<typeof fetchInterviewsForReport>
>[number];

export async function fetchInterviewScorecards(interviewIds: number[]) {
  const db = getReadDb();
  if (interviewIds.length === 0) return [];
  return db
    .select({
      interviewId: interviewScorecards.interviewId,
      submittedAt: interviewScorecards.submittedAt,
      scores: interviewScorecards.scores,
      submittedBy: interviewScorecards.submittedBy,
      submitter: users.username,
    })
    .from(interviewScorecards)
    .leftJoin(users, eq(interviewScorecards.submittedBy, users.userId))
    .where(inArray(interviewScorecards.interviewId, interviewIds))
    .limit(SCORECARD_FETCH_LIMIT);
}

export type ReportScorecardRow = Awaited<
  ReturnType<typeof fetchInterviewScorecards>
>[number];

export async function fetchInterviewScoresByCandidate(candidateIds: number[]) {
  const db = getReadDb();
  if (candidateIds.length === 0) return [];
  return db
    .select({
      candidateId: candidateJobScores.candidateId,
      score: candidateJobScores.score,
    })
    .from(candidateJobScores)
    .where(inArray(candidateJobScores.candidateId, candidateIds))
    .limit(SCORE_FETCH_LIMIT);
}

export async function fetchRequisitionDepartmentMap(organizationId: string) {
  const db = getReadDb();
  return db
    .select({
      reqId: requisitions.reqId,
      projectName: requisitions.projectName,
      clientName: requisitions.clientName,
      workMode: requisitions.workMode,
      officeLocation: requisitions.officeLocation,
      status: requisitions.overallStatus,
    })
    .from(requisitions)
    .where(eq(requisitions.organizationId, organizationId))
    .limit(20_000);
}
