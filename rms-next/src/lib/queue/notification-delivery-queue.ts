import { Queue, type JobsOptions } from "bullmq";

import { getQueueConnectionOptions } from "@/lib/queue/redis";

export const NOTIFICATION_DELIVERY_QUEUE = "notification-delivery";
export const PROCESS_PENDING_NOTIFICATIONS_JOB = "process-pending";

export type NotificationDeliveryJobPayload = Record<string, never>;

let queue: Queue<NotificationDeliveryJobPayload> | null = null;

function getQueue(): Queue<NotificationDeliveryJobPayload> {
  if (!queue) {
    queue = new Queue<NotificationDeliveryJobPayload>(NOTIFICATION_DELIVERY_QUEUE, {
      connection: getQueueConnectionOptions(),
    });
  }
  return queue;
}

/** Wake the worker; processing is idempotent and batches pending rows. */
export async function enqueueNotificationDeliveryJob(
  opts?: JobsOptions,
): Promise<void> {
  const q = getQueue();
  await q.add(
    PROCESS_PENDING_NOTIFICATIONS_JOB,
    {},
    { removeOnComplete: 100, removeOnFail: 40, ...opts },
  );
}
