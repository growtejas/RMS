/**
 * Run: `npm run worker:notification-delivery`
 * Processes pending rows in `notification_events` (emails / console in dev).
 */
import { Worker } from "bullmq";
import { processPendingNotificationBatch } from "@/lib/services/notification-delivery-service";
import {
  NOTIFICATION_DELIVERY_QUEUE,
  PROCESS_PENDING_NOTIFICATIONS_JOB,
  type NotificationDeliveryJobPayload,
} from "@/lib/queue/notification-delivery-queue";
import { getQueueConnectionOptions } from "@/lib/queue/redis";

const worker = new Worker<NotificationDeliveryJobPayload>(
  NOTIFICATION_DELIVERY_QUEUE,
  async (job) => {
    if (job.name !== PROCESS_PENDING_NOTIFICATIONS_JOB) {
      return;
    }
    const n = await processPendingNotificationBatch();
    if (n > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[notification-delivery] processed batch (${n} pending rows attempted)`,
      );
    }
  },
  { connection: getQueueConnectionOptions() },
);

worker.on("failed", (job, err) => {
  console.error("[notification-delivery] job failed", job?.id, err);
});

// eslint-disable-next-line no-console
console.log("Notification delivery worker listening…");
