import { log } from "@/lib/logging/logger";

export type RankingEngineMode = "ai_only" | "hybrid" | "deterministic";

/**
 * Deterministic scoring sub-modes (legacy support).
 * - hybrid: Phase 5 + ATS V1 blend (+ skill gate)
 * - ats_v1: ATS V1 only
 * - phase5_only: Phase 5 only
 */
export type DeterministicEngineMode = "hybrid" | "ats_v1" | "phase5_only";

export type ResolvedRankingEngine = {
  engine: RankingEngineMode;
  deterministicSubmode: DeterministicEngineMode;
};

let didLogResolvedEngine = false;

/**
 * Central resolver for ranking engine behavior.
 *
 * Back-compat:
 * - RANKING_ENGINE=ats_v1|v1 => deterministic + ats_v1 submode
 * - RANKING_ENGINE=phase5_only|phase5 => deterministic + phase5_only submode
 * - RANKING_ENGINE=hybrid (legacy meaning) is now treated as engine=hybrid (AI+det blend).
 */
export function resolveRankingEngine(): ResolvedRankingEngine {
  const raw = (process.env.RANKING_ENGINE ?? "ai_only").trim().toLowerCase();

  if (!didLogResolvedEngine) {
    didLogResolvedEngine = true;
    log("info", "ranking_engine_resolved", { raw, default: "ai_only" });
  }

  if (raw === "ats_v1" || raw === "v1") {
    return { engine: "deterministic", deterministicSubmode: "ats_v1" };
  }
  if (raw === "phase5_only" || raw === "phase5") {
    return { engine: "deterministic", deterministicSubmode: "phase5_only" };
  }

  if (raw === "deterministic") {
    return { engine: "deterministic", deterministicSubmode: "hybrid" };
  }
  if (raw === "hybrid") {
    return { engine: "hybrid", deterministicSubmode: "hybrid" };
  }
  if (raw === "ai_only" || raw === "ai") {
    return { engine: "ai_only", deterministicSubmode: "hybrid" };
  }

  return { engine: "ai_only", deterministicSubmode: "hybrid" };
}

