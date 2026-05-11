import {
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";

import { fetchRequisitionItemRanking } from "@/lib/api/candidateApi";
import type {
  ApplicationsAtsBucketsResponse,
  RequisitionItemRankingResponse,
} from "@/lib/api/candidateApi";
import {
  collectBoardCandidateIds,
  isAiStillPending,
} from "@/lib/ta/ats-board-helpers";

/**
 * Load ranking + buckets for the selected line when the ATS tab is active.
 * Uses the same `loadRanking` as focus refresh and the advanced panel.
 */
export function useAtsTabInitialLoad(
  activeTab: string,
  rankingItemId: number | null,
  loadRanking: (forceRecompute: boolean) => void | Promise<unknown>,
): void {
  useEffect(() => {
    if (activeTab !== "ats" || rankingItemId == null) return;
    void loadRanking(false);
  }, [activeTab, rankingItemId, loadRanking]);
}

type AiEvalCompletedClientEvent = {
  itemId: number;
  candidateId: number;
  status: "OK" | "PENDING" | "UNAVAILABLE";
  finalScore: number | null;
  emittedAt: string;
};

/**
 * Phase 4 - SSE-driven AI score updates.
 *
 * Subscribes to `/api/ranking/requisition-items/<id>/events`. Each
 * `ai_eval_completed` event triggers a single targeted ranking refetch
 * (cheap, snapshot-cached) so the UI converges without 4 s polling.
 *
 * Polling is retained but throttled to 60 s and *only* used as a fallback
 * when the EventSource disconnects (offline, proxy timeout, browser tab
 * resumed from suspend).
 */
export function useAtsAiScoreStream(
  active: boolean,
  requisitionItemId: number | null,
  atsBucketsData: ApplicationsAtsBucketsResponse | null,
  rankingData: RequisitionItemRankingResponse | null,
  setRankingData: Dispatch<
    SetStateAction<RequisitionItemRankingResponse | null>
  >,
): void {
  const rankingRef = useRef(rankingData);
  rankingRef.current = rankingData;

  useEffect(() => {
    if (!active || requisitionItemId == null || !atsBucketsData) {
      return;
    }
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      return;
    }
    const itemId = requisitionItemId;
    const candidateIds = collectBoardCandidateIds(atsBucketsData);
    if (!isAiStillPending(candidateIds, rankingRef.current)) {
      return;
    }

    let cancelled = false;
    let inFlight = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const refetch = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const latest = await fetchRequisitionItemRanking(itemId, {
          aiEval: true,
        });
        if (!cancelled) {
          setRankingData(latest);
          if (!isAiStillPending(candidateIds, latest)) {
            cancelled = true;
            es.close();
            if (pollTimer) clearTimeout(pollTimer);
          }
        }
      } catch {
        // Transient errors are tolerated; SSE / fallback timer will drive
        // the next attempt.
      } finally {
        inFlight = false;
      }
    };

    const startFallbackPolling = () => {
      if (cancelled || pollTimer) return;
      const tick = async () => {
        if (cancelled) return;
        await refetch();
        if (!cancelled) {
          pollTimer = setTimeout(tick, 60_000);
        }
      };
      pollTimer = setTimeout(tick, 60_000);
    };

    const url = `/api/ranking/requisition-items/${itemId}/events`;
    const es = new EventSource(url, { withCredentials: true });
    es.addEventListener("ai_eval_completed", (raw: MessageEvent) => {
      try {
        const ev = JSON.parse(raw.data) as AiEvalCompletedClientEvent;
        if (ev.itemId !== itemId) return;
        if (!candidateIds.has(ev.candidateId)) return;
      } catch {
        // Ignore malformed event payloads.
        return;
      }
      void refetch();
    });
    es.addEventListener("error", () => {
      // EventSource auto-reconnects; we only kick the polling fallback if
      // it stays in CLOSED state (proxy stripped streaming, etc.).
      if (es.readyState === EventSource.CLOSED) {
        startFallbackPolling();
      }
    });

    return () => {
      cancelled = true;
      es.close();
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [active, requisitionItemId, atsBucketsData, setRankingData]);
}

/**
 * @deprecated Phase 4 - retained for `RMS_RANKING_NO_ENQUEUE=false` rollback.
 * Prefer `useAtsAiScoreStream`. The 4 s cadence stacks with simultaneous
 * recruiters and was the dominant client-side amplifier of ATS load.
 */
export function useAtsAiScorePolling(
  active: boolean,
  requisitionItemId: number | null,
  atsBucketsData: ApplicationsAtsBucketsResponse | null,
  rankingData: RequisitionItemRankingResponse | null,
  setRankingData: Dispatch<
    SetStateAction<RequisitionItemRankingResponse | null>
  >,
): void {
  const rankingRef = useRef(rankingData);
  rankingRef.current = rankingData;

  useEffect(() => {
    if (!active || requisitionItemId == null || !atsBucketsData) {
      return;
    }
    const itemId = requisitionItemId;
    const candidateIds = collectBoardCandidateIds(atsBucketsData);
    if (!isAiStillPending(candidateIds, rankingRef.current)) {
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 12;
    const intervalMs = 4000;

    async function tick() {
      if (cancelled) return;
      attempts += 1;
      let latest: RequisitionItemRankingResponse | null = null;
      try {
        latest = await fetchRequisitionItemRanking(itemId, {
          aiEval: true,
        });
        if (cancelled) return;
        setRankingData(latest);
      } catch {
        // Transient errors: keep polling within budget
      }
      if (cancelled) return;
      if (attempts >= maxAttempts) return;
      if (!isAiStillPending(candidateIds, latest)) return;
      setTimeout(tick, intervalMs);
    }

    setTimeout(tick, intervalMs);
    return () => {
      cancelled = true;
    };
  }, [active, requisitionItemId, atsBucketsData, setRankingData]);
}
