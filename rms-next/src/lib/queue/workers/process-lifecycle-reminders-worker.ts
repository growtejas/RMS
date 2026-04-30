/**
 * Run: `npm run worker:lifecycle-reminders`
 * Sends delayed T-24h / T-1h interview emails via the notification outbox.
 */
import { Worker } from "bullmq";
import { runInterviewTimeReminder } from "@/lib/services/interview-reminders-service";
import {
  LIFECYCLE_REMINDERS_QUEUE,
  INTERVIEW_TIME_REMINDER_JOB,
  type InterviewReminderJobPayload,
} from "@/lib/queue/lifecycle-reminders-queue";
import { getQueueConnectionOptions } from "@/lib/queue/redis";

const worker = new Worker<InterviewReminderJobPayload>(
  LIFECYCLE_REMINDERS_QUEUE,
  async (job) => {
    if (job.name !== INTERVIEW_TIME_REMINDER_JOB) {
      return;
    }
    const { interviewId, kind, organizationId } = job.data;
    await runInterviewTimeReminder({ interviewId, kind, organizationId });
  },
  { connection: getQueueConnectionOptions() },
);

worker.on("failed", (job, err) => {
  console.error("[lifecycle-reminders] job failed", job?.id, err);
});

// eslint-disable-next-line no-console
console.log("Lifecycle reminders worker listening…");
