import type { ConnectionOptions } from "bullmq";
import IORedis from "ioredis";

let sharedConnection: IORedis | null = null;

function getRedisUrl(): string {
  return process.env.REDIS_URL?.trim() || "redis://127.0.0.1:6379";
}

export function getQueueConnectionOptions(): ConnectionOptions {
  return {
    url: getRedisUrl(),
  };
}

export function getSharedRedisConnection(): IORedis {
  if (!sharedConnection) {
    sharedConnection = new IORedis(getRedisUrl(), {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
  }
  return sharedConnection;
}
