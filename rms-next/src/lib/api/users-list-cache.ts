import { apiClient } from "@/lib/api/client";

/**
 * @deprecated Phase 3 - prefer `useUsersList` from `@/lib/query/hooks`.
 *
 * Kept as a non-hook entry point for legacy callers that fetch outside a
 * React render (e.g. event handlers, services). The TTL is bumped to
 * 10 minutes to match the rare-change `staleTime` policy used by
 * `useUsersList`, so a screen that mixes the two flows still hits the
 * same cache window. Once the remaining 4 call sites are migrated to
 * `useUsersList`, this file can be deleted.
 */
const TTL_MS = 10 * 60_000;

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
