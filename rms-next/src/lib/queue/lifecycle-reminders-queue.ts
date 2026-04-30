import { Queue, type JobsOptions } from "bullmq";

import { getQueueConnectionOptions } from "@/lib/queue/redis";

export const LIFECYCLE_REMINDERS_QUEUE = "lifecycle-reminders";
export const INTERVIEW_TIME_REMINDER_JOB = "interview-time-reminder";

export type InterviewReminderJobPayload = {
  interviewId: number;
  kind: "24h" | "1h";
  organizationId: string;
};

let queue: Queue<InterviewReminderJobPayload> | null = null;

function getQueue(): Queue<InterviewReminderJobPayload> {
  if (!queue) {
    queue = new Queue<InterviewReminderJobPayload>(LIFECYCLE_REMINDERS_QUEUE, {
      connection: getQueueConnectionOptions(),
    });
  }
  return queue;
}

function jobIdFor(interviewId: number, kind: "24h" | "1h") {
  return `reminder:interview:${interviewId}:${kind}`;
}

export async function removeInterviewReminderJobs(interviewId: number) {
  const q = getQueue();
  for (const kind of ["24h", "1h"] as const) {
    const id = jobIdFor(interviewId, kind);
    try {
      const job = await q.getJob(id);
      if (job) {
        await job.remove();
      }
    } catch {
      /* ignore */
    }
  }
}

export async function scheduleInterviewReminderJobs(input: {
  interviewId: number;
  organizationId: string;
  scheduledAt: Date;
}) {
  await removeInterviewReminderJobs(input.interviewId);
  const q = getQueue();
  const t = input.scheduledAt.getTime();
  const now = Date.now();
  const d24 = t - 24 * 60 * 60 * 1000 - now;
  const d1 = t - 60 * 60 * 1000 - now;

  const baseOpts: JobsOptions = {
    removeOnComplete: 100,
    removeOnFail: 30,
  };

  if (d24 > 0) {
    await q.add(
      INTERVIEW_TIME_REMINDER_JOB,
      {
        interviewId: input.interviewId,
        kind: "24h",
        organizationId: input.organizationId,
      },
      { ...baseOpts, delay: d24, jobId: jobIdFor(input.interviewId, "24h") },
    );
  }
  if (d1 > 0) {
    await q.add(
      INTERVIEW_TIME_REMINDER_JOB,
      {
        interviewId: input.interviewId,
        kind: "1h",
        organizationId: input.organizationId,
      },
      { ...baseOpts, delay: d1, jobId: jobIdFor(input.interviewId, "1h") },
    );
  }
}
