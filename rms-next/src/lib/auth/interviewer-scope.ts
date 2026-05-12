import type { ApiUser } from "@/lib/auth/api-guard";
import { listPanelistOnlyInterviews } from "@/lib/repositories/interviews-repo";

function hasAnyRole(user: ApiUser, roles: string[]): boolean {
  const normalized = user.roles.map((r) => r.toLowerCase());
  return roles.some((r) => normalized.includes(r.toLowerCase()));
}

export async function getInterviewerScope(user: ApiUser): Promise<{
  interviewerOnly: boolean;
  requisitionIds: Set<number>;
  candidateIds: Set<number>;
}> {
  const interviewerOnly =
    hasAnyRole(user, ["interviewer"]) &&
    !hasAnyRole(user, ["ta", "hr", "admin", "manager", "owner"]);

  if (!interviewerOnly) {
    return {
      interviewerOnly: false,
      requisitionIds: new Set<number>(),
      candidateIds: new Set<number>(),
    };
  }

  const rows = await listPanelistOnlyInterviews({
    organizationId: user.organizationId,
    userId: user.userId,
  });

  const requisitionIds = new Set<number>();
  const candidateIds = new Set<number>();
  for (const row of rows) {
    if (row.requisitionId != null) requisitionIds.add(row.requisitionId);
    if (row.interview.candidateId != null) candidateIds.add(row.interview.candidateId);
  }

  return { interviewerOnly, requisitionIds, candidateIds };
}
