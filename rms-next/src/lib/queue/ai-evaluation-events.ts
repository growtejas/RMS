import IORedis from "ioredis";

import { log } from "@/lib/logging/logger";
import { getSharedRedisConnection } from "@/lib/queue/redis";

/**
 * Phase 4 - real-time fan-out of AI evaluation completions.
 *
 * Workers publish `{ candidate_id, status }` to channel
 * `ai_eval:item:<itemId>` after committing a score. The Next SSE route
 * subscribes per browser-open ATS tab and pushes the event downstream.
 * Replaces the 4 s polling loop in `useAtsAiScorePolling`.
 *
 * Connection contract:
 *   - Publishers reuse the shared connection (no commands run on it that
 *     would conflict with PUBSUB - it remains in normal mode).
 *   - Subscribers must use a *dedicated* connection (Redis flips the
 *     connection into PUBSUB-only mode after `SUBSCRIBE`).
 */

export type AiEvalEventStatus = "OK" | "PENDING" | "UNAVAILABLE";

export type AiEvalCompletedEvent = {
  type: "ai_eval_completed";
  itemId: number;
  candidateId: number;
  status: AiEvalEventStatus;
  finalScore: number | null;
  /** ISO 8601 timestamp emitted by the worker. */
  emittedAt: string;
};

export function aiEvalChannelForItem(itemId: number): string {
  return `ai_eval:item:${itemId}`;
}

export async function publishAiEvalCompleted(
  event: Omit<AiEvalCompletedEvent, "type" | "emittedAt"> & {
    emittedAt?: string;
  },
): Promise<void> {
  if (!process.env.REDIS_URL && !process.env.REDIS_HOST) {
    return;
  }
  try {
    const redis = getSharedRedisConnection();
    const payload: AiEvalCompletedEvent = {
      type: "ai_eval_completed",
      itemId: event.itemId,
      candidateId: event.candidateId,
      status: event.status,
      finalScore: event.finalScore,
      emittedAt: event.emittedAt ?? new Date().toISOString(),
    };
    await redis.publish(
      aiEvalChannelForItem(event.itemId),
      JSON.stringify(payload),
    );
  } catch (e) {
    log("warn", "ai_eval_publish_failed", {
      error: e instanceof Error ? e.message : String(e),
      item_id: event.itemId,
      candidate_id: event.candidateId,
    });
  }
}

/**
 * Subscribe to the per-item channel. Returns an unsubscribe function. The
 * caller is responsible for closing the underlying connection on stream
 * teardown.
 */
export function subscribeAiEvalForItem(
  itemId: number,
  onMessage: (event: AiEvalCompletedEvent) => void,
): { close: () => Promise<void> } {
  const url = process.env.REDIS_URL?.trim() || "redis://127.0.0.1:6379";
  const sub = new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  const channel = aiEvalChannelForItem(itemId);
  sub.subscribe(channel).catch((e) => {
    log("warn", "ai_eval_subscribe_failed", {
      error: e instanceof Error ? e.message : String(e),
      item_id: itemId,
    });
  });
  sub.on("message", (chan, raw) => {
    if (chan !== channel) return;
    try {
      const parsed = JSON.parse(raw) as AiEvalCompletedEvent;
      if (parsed && parsed.type === "ai_eval_completed") {
        onMessage(parsed);
      }
    } catch {
      // Malformed events are dropped; observability is via worker-side
      // success log.
    }
  });
  return {
    close: async () => {
      try {
        await sub.unsubscribe(channel);
      } catch {
        /* best-effort */
      }
      try {
        await sub.quit();
      } catch {
        /* best-effort */
      }
    },
  };
}
