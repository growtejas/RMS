import { and, asc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  candidates,
  interviewPanelists,
  interviewScorecards,
  interviews,
} from "@/lib/db/schema";

async function interviewInOrganization(
  interviewId: number,
  organizationId: string,
): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ one: interviews.id })
    .from(interviews)
    .innerJoin(candidates, eq(interviews.candidateId, candidates.candidateId))
    .where(
      and(
        eq(interviews.id, interviewId),
        eq(candidates.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row != null;
}

export async function listPanelistsForInterview(
  interviewId: number,
  organizationId: string,
) {
  const ok = await interviewInOrganization(interviewId, organizationId);
  if (!ok) {
    return null;
  }
  const db = getDb();
  return db
    .select()
    .from(interviewPanelists)
    .where(eq(interviewPanelists.interviewId, interviewId))
    .orderBy(asc(interviewPanelists.id));
}

export async function insertPanelist(params: {
  interviewId: number;
  organizationId: string;
  displayName: string;
  roleLabel?: string | null;
  userId?: number | null;
}) {
  const ok = await interviewInOrganization(params.interviewId, params.organizationId);
  if (!ok) {
    return null;
  }
  const db = getDb();
  const [row] = await db
    .insert(interviewPanelists)
    .values({
      interviewId: params.interviewId,
      displayName: params.displayName,
      roleLabel: params.roleLabel ?? null,
      userId: params.userId ?? null,
    })
    .returning();
  return row ?? null;
}

export async function listScorecardsForInterview(
  interviewId: number,
  organizationId: string,
) {
  const ok = await interviewInOrganization(interviewId, organizationId);
  if (!ok) {
    return null;
  }
  const db = getDb();
  return db
    .select()
    .from(interviewScorecards)
    .where(eq(interviewScorecards.interviewId, interviewId))
    .orderBy(asc(interviewScorecards.id));
}

export async function findScorecardForInterviewPanelist(
  interviewId: number,
  panelistId: number,
): Promise<(typeof interviewScorecards.$inferSelect) | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(interviewScorecards)
    .where(
      and(
        eq(interviewScorecards.interviewId, interviewId),
        eq(interviewScorecards.panelistId, panelistId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function insertScorecard(params: {
  interviewId: number;
  organizationId: string;
  panelistId?: number | null;
  scores: Record<string, unknown>;
  notes?: string | null;
  submittedBy: number;
}) {
  const ok = await interviewInOrganization(params.interviewId, params.organizationId);
  if (!ok) {
    return null;
  }
  const db = getDb();
  const [row] = await db
    .insert(interviewScorecards)
    .values({
      interviewId: params.interviewId,
      panelistId: params.panelistId ?? null,
      scores: params.scores,
      notes: params.notes ?? null,
      submittedBy: params.submittedBy,
    })
    .returning();
  return row ?? null;
}
