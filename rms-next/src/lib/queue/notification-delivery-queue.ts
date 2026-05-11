import type { JobsOptions, Queue } from "bullmq";

import { jobOptionsFor } from "@/lib/queue/queue-policies";
import { getSharedQueue } from "@/lib/queue/queue-registry";

export const NOTIFICATION_DELIVERY_QUEUE = "notification-delivery";
export const PROCESS_PENDING_NOTIFICATIONS_JOB = "process-pending";

export type NotificationDeliveryJobPayload = Record<string, never>;

function getQueue(): Queue<NotificationDeliveryJobPayload> {
  return getSharedQueue<NotificationDeliveryJobPayload>(
    NOTIFICATION_DELIVERY_QUEUE,
  );
}

/** Wake the worker; processing is idempotent and batches pending rows. */
export async function enqueueNotificationDeliveryJob(
  opts?: JobsOptions,
): Promise<void> {
  const q = getQueue();
  await q.add(PROCESS_PENDING_NOTIFICATIONS_JOB, {}, {
    ...jobOptionsFor("notification-delivery"),
    ...opts,
  });
}
