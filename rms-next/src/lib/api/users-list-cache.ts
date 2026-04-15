import { apiClient } from "@/lib/api/client";

/**
 * Deduplicates concurrent GET /users and reuses a short in-memory result so
 * multiple screens (TA list, detail, HR tickets) do not each trigger a full fetch.
 */
const TTL_MS = 45_000;

let cacheAt = 0;
let cached: unknown[] | null = null;
let inflight: Promise<unknown[]> | null = null;

export async function getUsersListCached<T = unknown>(): Promise<T[]> {
  const now = Date.now();
  if (cached != null && now - cacheAt < TTL_MS) {
    return cached as T[];
  }
  if (inflight) {
    return inflight as Promise<T[]>;
  }
  inflight = apiClient
    .get<T[]>("/users")
    .then((r) => {
      const data = r.data ?? [];
      cached = data;
      cacheAt = Date.now();
      inflight = null;
      return data;
    })
    .catch((e) => {
      inflight = null;
      throw e;
    });
  return inflight as Promise<T[]>;
}

export function invalidateUsersListCache(): void {
  cached = null;
  cacheAt = 0;
}
