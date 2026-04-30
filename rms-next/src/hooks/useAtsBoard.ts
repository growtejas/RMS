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

/**
 * Poll ranking until all board candidates have OK AI scores (or cap attempts).
 * Uses the latest `fetch` response to decide "still pending", not stale render state.
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
