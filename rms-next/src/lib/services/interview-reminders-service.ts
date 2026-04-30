import * as applicationsRepo from "@/lib/repositories/applications-repo";
import * as repo from "@/lib/repositories/candidates-repo";
import * as ivRepo from "@/lib/repositories/interviews-repo";
import { enqueueInterviewReminderNotification } from "@/lib/services/lifecycle-notifications";

/**
 * Fired by BullMQ delayed jobs (T-24h / T-1h). Enqueues a candidate email if interview still active.
 */
export async function runInterviewTimeReminder(input: {
  interviewId: number;
  kind: "24h" | "1h";
  organizationId: string;
}): Promise<void> {
  const row = await repo.selectInterviewById(
    input.interviewId,
    input.organizationId,
  );
  if (!row) {
    return;
  }
  if (row.status === "CANCELLED" || row.status === "COMPLETED") {
    return;
  }
  if (row.requisitionItemId == null) {
    return;
  }
  const app = await ivRepo.findApplicationForSchedule({
    candidateId: row.candidateId,
    requisitionItemId: row.requisitionItemId,
    organizationId: input.organizationId,
  });
  if (!app) {
    return;
  }
  const appRow = await applicationsRepo.selectApplicationById(
    app.applicationId,
    input.organizationId,
  );
  if (!appRow) {
    return;
  }
  const c = appRow.candidate;
  const scheduledAt = row.scheduledAt.toISOString();
  const roundName = row.roundName;

  try {
    await enqueueInterviewReminderNotification({
      organizationId: input.organizationId,
      applicationId: app.applicationId,
      candidateId: row.candidateId,
      requisitionId: appRow.application.requisitionId,
      requisitionItemId: row.requisitionItemId,
      interviewId: input.interviewId,
      candidateName: c.fullName,
      candidateEmail: c.email,
      roundName,
      scheduledAt,
      kind: input.kind,
    });
    try {
      const { enqueueNotificationDeliveryJob } = await import(
        "@/lib/queue/notification-delivery-queue"
      );
      await enqueueNotificationDeliveryJob();
    } catch {
      /* redis optional */
    }
  } catch {
    /* enqueue failure: ignore */
  }
}
