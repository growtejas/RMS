"use client";

/**
 * CandidateDetailModal — Shared modal for TA & HR views
 *
 * Sections:
 *  1. Resume Viewer (iframe for PDF, download link for others)
 *  2. Interview Timeline (vertical timeline of rounds)
 *  3. Round Scheduler (multi-step form to add interviews)
 *  4. Stage transition actions
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  FileText,
  Calendar,
  AlertCircle,
  Plus,
  ChevronDown,
  ChevronUp,
  Download,
  Mail,
  Phone,
  Trash2,
} from "lucide-react";
import type { Candidate, Interview } from "@/lib/api/candidateApi";
import {
  createInterview,
  updateInterview,
  deleteInterview,
  getCandidateWithApplication,
  getCandidateActionErrorMessage,
  updateCandidateStageCompatible,
  runAiEvaluationForRequisitionItem,
  fetchRequisitionItemRanking,
} from "@/lib/api/candidateApi";
import { apiClient } from "@/lib/api/client";
import CandidateEvaluationCard from "@/components/evaluation/CandidateEvaluationCard";
import type { CandidateEvaluationCardModel } from "@/components/evaluation/candidate-evaluation-card.types";
import {
  mapRankedCandidateToEvaluationCard,
  type EvaluationCardContext,
} from "@/components/evaluation/mapRankedCandidateToEvaluationCard";

/** Re-export for callers that need the 403 message text. */
export { TA_OWNERSHIP_DENIED_MESSAGE } from "@/lib/api/candidateApi";

interface CandidateDetailModalProps {
  candidate: Candidate;
  onClose: () => void;
  onUpdate: (updated: Candidate) => void;
  /** Roles that the current user has — used to show/hide action buttons */
  userRoles: string[];
  /** Base URL for the API to construct resume download URLs */
  apiBaseUrl?: string;
  /** Optional requisition context for role-fit mapping (experience years, required skills count). */
  evaluationContext?: EvaluationCardContext;
  /** When true, Shortlist from the evaluation card is disabled (e.g. TA item has no CV on file). */
  evaluationShortlistBlocked?: boolean;
  evaluationShortlistBlockedReason?: string;
  /**
   * `evaluate` = ATS evaluation only (shortlist/reject via card; no interviews or stage moves).
   * `execute` = full hiring workspace. Omit for legacy HR/manager screens (treated as execute).
   */
  pipelineWorkspace?: "evaluate" | "execute";
}

const STAGE_COLORS: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  Sourced: {
    bg: "rgba(100,116,139,0.1)",
    text: "#64748b",
    border: "rgba(100,116,139,0.3)",
  },
  Shortlisted: {
    bg: "rgba(59,130,246,0.1)",
    text: "#3b82f6",
    border: "rgba(59,130,246,0.3)",
  },
  Interviewing: {
    bg: "rgba(168,85,247,0.1)",
    text: "#a855f7",
    border: "rgba(168,85,247,0.3)",
  },
  Offered: {
    bg: "rgba(245,158,11,0.1)",
    text: "#f59e0b",
    border: "rgba(245,158,11,0.3)",
  },
  Hired: {
    bg: "rgba(16,185,129,0.1)",
    text: "#10b981",
    border: "rgba(16,185,129,0.3)",
  },
  Rejected: {
    bg: "rgba(239,68,68,0.1)",
    text: "#ef4444",
    border: "rgba(239,68,68,0.3)",
  },
};

const RESULT_COLORS: Record<string, string> = {
  Pass: "#10b981",
  Fail: "#ef4444",
  Hold: "#f59e0b",
};

/** Which forward transitions are available from each stage (UI side) */
const FORWARD_TRANSITIONS: Record<string, string[]> = {
  Sourced: ["Shortlisted", "Rejected"],
  Shortlisted: ["Interviewing", "Rejected"],
  Interviewing: ["Offered", "Rejected"],
  Offered: ["Hired", "Rejected"],
};

export default function CandidateDetailModal({
  candidate: initialCandidate,
  onClose,
  onUpdate,
  userRoles,
  evaluationContext,
  evaluationShortlistBlocked,
  evaluationShortlistBlockedReason,
  pipelineWorkspace,
}: CandidateDetailModalProps) {
  const isEvaluateWorkspace = pipelineWorkspace === "evaluate";

  const [candidate, setCandidate] = useState<Candidate>(initialCandidate);
  const modalBodyRef = useRef<HTMLDivElement>(null);
  const [showScheduler, setShowScheduler] = useState(false);
  const [showResume, setShowResume] = useState(false);
  const [showResumeParse, setShowResumeParse] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumeBlobUrl, setResumeBlobUrl] = useState<string | null>(null);
  const [resumeMimeType, setResumeMimeType] = useState<string | null>(null);
  const [loadingResume, setLoadingResume] = useState(false);
  const [resumeLoadError, setResumeLoadError] = useState<string | null>(null);

  // Scheduler form state
  const [interviewerName, setInterviewerName] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [scheduling, setScheduling] = useState(false);

  // Inline interview update
  const [editingInterview, setEditingInterview] = useState<number | null>(null);
  const [editStatus, setEditStatus] = useState<string>("");
  const [editResult, setEditResult] = useState<string>("");
  const [editFeedback, setEditFeedback] = useState<string>("");

  const [evaluationLoading, setEvaluationLoading] = useState(false);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [evaluationModel, setEvaluationModel] =
    useState<CandidateEvaluationCardModel | null>(null);
  const [evaluationRank, setEvaluationRank] = useState<number | null>(null);
  const [evaluationNotInSnapshot, setEvaluationNotInSnapshot] = useState(false);
  const [evaluationRefreshKey, setEvaluationRefreshKey] = useState(0);
  const [aiEvalWorking, setAiEvalWorking] = useState(false);

  /** Bumped when opening / hydrating or when user mutates candidate so stale fetches cannot overwrite. */
  const candidateHydrateGenRef = useRef(0);
  /** Avoid spamming auto-eval on every refresh/open. */
  const aiEvalAutoAttemptedRef = useRef<string | null>(null);

  const normalizedRoles = userRoles.map((r) => r.toLowerCase());
  const canEdit = normalizedRoles.some((r) =>
    ["ta", "hr", "admin"].includes(r),
  );
  const stageColor =
    STAGE_COLORS[candidate.current_stage] ?? STAGE_COLORS["Sourced"]!;

  useEffect(() => {
    setCandidate(initialCandidate);
    const gen = ++candidateHydrateGenRef.current;
    const { candidate_id, application_id } = initialCandidate;
    void (async () => {
      try {
        const full = await getCandidateWithApplication(
          candidate_id,
          application_id ?? undefined,
        );
        if (gen !== candidateHydrateGenRef.current) {
          return;
        }
        setCandidate({
          ...full,
          application_id:
            full.application_id ?? initialCandidate.application_id ?? undefined,
          stage_history:
            full.stage_history ?? initialCandidate.stage_history ?? [],
        });
      } catch {
        // Keep initialCandidate (already set); list payloads often omit interviews[]
      }
    })();
  }, [initialCandidate.candidate_id, initialCandidate.application_id]);

  useEffect(() => {
    if (isEvaluateWorkspace) {
      setShowScheduler(false);
    }
  }, [isEvaluateWorkspace]);

  const loadEvaluation = useCallback(async () => {
    const itemId = candidate.requisition_item_id;
    if (!itemId) {
      setEvaluationLoading(false);
      setEvaluationError(null);
      setEvaluationModel(null);
      setEvaluationRank(null);
      setEvaluationNotInSnapshot(false);
      return;
    }
    setEvaluationLoading(true);
    setEvaluationError(null);
    setEvaluationModel(null);
    setEvaluationRank(null);
    setEvaluationNotInSnapshot(false);
    try {
      const ctx: EvaluationCardContext = {
        requiredExperienceYears: evaluationContext?.requiredExperienceYears ?? null,
        requiredSkillsCount: evaluationContext?.requiredSkillsCount ?? undefined,
      };

      const loadFromRanking = async () => {
        const data = await fetchRequisitionItemRanking(itemId, { aiEval: true });
        const idx = data.ranked_candidates.findIndex(
        (r) => r.candidate_id === candidate.candidate_id,
        );
        if (idx < 0) {
          setEvaluationNotInSnapshot(true);
          return { row: null as null | (typeof data.ranked_candidates)[number], meta: data.meta };
        }
        const row = data.ranked_candidates[idx]!;
        const requiredSkillsCount =
          ctx.requiredSkillsCount ?? data.meta?.required_skills_count;
        const nextCtx: EvaluationCardContext = {
          ...ctx,
          requiredSkillsCount,
        };
        setEvaluationRank(idx + 1);
        setEvaluationModel(mapRankedCandidateToEvaluationCard(row, nextCtx));
        return { row, meta: data.meta };
      };

      const { row } = await loadFromRanking();

      // Lazy AI evaluation: if no cached score, compute+store once and reload.
      // Only in ATS evaluate workspace and only for users who can edit.
      const key = `${itemId}:${candidate.candidate_id}`;
      const missingAiScore =
        row != null &&
        !(
          row.explain.ai_score != null &&
          Number.isFinite(row.explain.ai_score as unknown as number)
        );
      if (
        missingAiScore &&
        isEvaluateWorkspace &&
        canEdit &&
        !aiEvalWorking &&
        aiEvalAutoAttemptedRef.current !== key
      ) {
        aiEvalAutoAttemptedRef.current = key;
        setAiEvalWorking(true);
        try {
          const res = await runAiEvaluationForRequisitionItem(itemId, {
            candidate_ids: [candidate.candidate_id],
            force: false,
          });
          const rr = res.results.find((r) => r.candidate_id === candidate.candidate_id);
          if (rr?.status === "llm_failed") {
            const reason = rr.llm_failure_reason ?? "llm_failed";
            const http = rr.llm_http_status != null ? ` (HTTP ${rr.llm_http_status})` : "";
            setEvaluationError(`AI evaluation failed: ${reason}${http}`);
            // Allow retry later
            aiEvalAutoAttemptedRef.current = null;
            return;
          }
          if (rr?.status === "disabled") {
            setEvaluationError("AI evaluation is disabled on this environment.");
            aiEvalAutoAttemptedRef.current = null;
            return;
          }
          await loadFromRanking();
        } catch (err: unknown) {
          // Don't hard-fail the whole evaluation panel — just show why AI isn't available.
          setEvaluationError(
            getCandidateActionErrorMessage(err, "AI evaluation failed"),
          );
          // Allow retry (manual button or next open) if it failed.
          aiEvalAutoAttemptedRef.current = null;
        } finally {
          setAiEvalWorking(false);
        }
      }
    } catch (err: unknown) {
      setEvaluationError(
        getCandidateActionErrorMessage(
          err,
          "Could not load role fit for this position.",
        ),
      );
    } finally {
      setEvaluationLoading(false);
    }
  }, [
    candidate.candidate_id,
    candidate.requisition_item_id,
    canEdit,
    evaluationContext?.requiredExperienceYears,
    evaluationContext?.requiredSkillsCount,
    isEvaluateWorkspace,
    evaluationRefreshKey,
  ]);

  useEffect(() => {
    void loadEvaluation();
  }, [loadEvaluation]);

  const handleEvaluationShortlist = async () => {
    setError(null);
    try {
      candidateHydrateGenRef.current += 1;
      const updated = await updateCandidateStageCompatible(candidate, {
        new_stage: "Shortlisted",
      });
      setCandidate(updated);
      onUpdate(updated);
      setEvaluationRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      setError(
        getCandidateActionErrorMessage(err, "Could not shortlist candidate"),
      );
    }
  };

  const handleEvaluationReject = async () => {
    setError(null);
    try {
      candidateHydrateGenRef.current += 1;
      const updated = await updateCandidateStageCompatible(candidate, {
        new_stage: "Rejected",
      });
      setCandidate(updated);
      onUpdate(updated);
      setEvaluationRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      setError(
        getCandidateActionErrorMessage(err, "Could not reject candidate"),
      );
    }
  };

  const handleRunAiEvalForCandidate = async () => {
    if (!candidate.requisition_item_id || !candidate.candidate_id) return;
    setError(null);
    setAiEvalWorking(true);
    try {
      const res = await runAiEvaluationForRequisitionItem(candidate.requisition_item_id, {
        candidate_ids: [candidate.candidate_id],
        force: false,
      });
      const row = res.results.find((r) => r.candidate_id === candidate.candidate_id);
      if (row?.status === "llm_failed") {
        const reason = row.llm_failure_reason ?? "llm_failed";
        const http = row.llm_http_status != null ? ` (HTTP ${row.llm_http_status})` : "";
        setError(`AI evaluation failed: ${reason}${http}`);
        return;
      }
      if (row?.status === "disabled") {
        setError("AI evaluation is disabled on this environment.");
        return;
      }
      if (row?.status === "not_found") {
        setError("AI evaluation could not find this candidate in the ranking snapshot yet.");
        return;
      }
      setEvaluationRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      setError(getCandidateActionErrorMessage(err, "AI evaluation failed"));
    } finally {
      setAiEvalWorking(false);
    }
  };

  const scrollModalBodyToTop = () => {
    modalBodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Refresh candidate data
  const refresh = async () => {
    candidateHydrateGenRef.current += 1;
    try {
      const updated = await getCandidateWithApplication(
        candidate.candidate_id,
        candidate.application_id,
      );
      setCandidate(updated);
      onUpdate(updated);
    } catch {
      // keep stale data
    }
  };

  // ---- Stage transition ----
  const handleStageChange = async (newStage: string) => {
    setError(null);
    setTransitioning(true);
    try {
      candidateHydrateGenRef.current += 1;
      const updated = await updateCandidateStageCompatible(candidate, {
        new_stage: newStage as Candidate["current_stage"],
      });
      setCandidate(updated);
      onUpdate(updated);
    } catch (err: unknown) {
      setError(
        getCandidateActionErrorMessage(err, `Failed to move to ${newStage}`),
      );
    } finally {
      setTransitioning(false);
    }
  };

  // ---- Schedule interview ----
  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!interviewerName.trim() || !scheduledAt) return;

    // Client-side past-date guard
    if (new Date(scheduledAt) < new Date()) {
      setError("You cannot select a past date for the interview schedule");
      return;
    }

    setScheduling(true);
    try {
      await createInterview({
        candidate_id: candidate.candidate_id,
        round_number: candidate.interviews.length + 1,
        interviewer_name: interviewerName.trim(),
        scheduled_at: new Date(scheduledAt).toISOString(),
      });
      setInterviewerName("");
      setScheduledAt("");
      setShowScheduler(false);
      await refresh();
    } catch (err: unknown) {
      setError(
        getCandidateActionErrorMessage(err, "Failed to schedule interview"),
      );
    } finally {
      setScheduling(false);
    }
  };

  // ---- Update interview result ----
  const handleUpdateInterview = async (interview: Interview) => {
    setError(null);
    try {
      await updateInterview(interview.id, {
        status: editStatus as Interview["status"],
        result: editResult
          ? (editResult as NonNullable<Interview["result"]>)
          : undefined,
        feedback: editFeedback || undefined,
      });
      setEditingInterview(null);
      await refresh();
    } catch (err: unknown) {
      setError(
        getCandidateActionErrorMessage(err, "Failed to update interview"),
      );
    }
  };

  // ---- Delete interview ----
  const handleDeleteInterview = async (id: number) => {
    try {
      await deleteInterview(id);
      await refresh();
    } catch (err: unknown) {
      setError(
        getCandidateActionErrorMessage(err, "Failed to delete interview"),
      );
    }
  };

  useEffect(() => {
    if (!showResume || !candidate.resume_path) return;
    if (candidate.resume_path.startsWith("http")) return;

    const filename = candidate.resume_path.split(/[/\\]/).pop();
    if (!filename) return;

    let objectUrl: string | null = null;
    const loadResume = async () => {
      setLoadingResume(true);
      setResumeLoadError(null);
      try {
        const response = await apiClient.get(`/uploads/resume/${encodeURIComponent(filename)}`, {
          responseType: "blob",
        });
        objectUrl = URL.createObjectURL(response.data);
        setResumeBlobUrl(objectUrl);
        setResumeMimeType(response.data.type || null);
      } catch {
        setResumeBlobUrl(null);
        setResumeMimeType(null);
        setResumeLoadError(
          "Could not load this resume. The file may be missing on the server or you may not have access.",
        );
      } finally {
        setLoadingResume(false);
      }
    };

    void loadResume();

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [showResume, candidate.resume_path]);

  const resumeUrl = candidate.resume_path
    ? candidate.resume_path.startsWith("http")
      ? candidate.resume_path
      : resumeBlobUrl
    : null;

  const isPdf = resumeUrl
    ? // Remote URL: decide by extension
      candidate.resume_path?.toLowerCase().endsWith(".pdf") ||
      // Local blob: decide by MIME type OR original filename
      (resumeMimeType ?? "").toLowerCase().includes("pdf")
    : false;

  const resumeFilename =
    candidate.resume_path?.split(/[/\\]/).pop() ?? "resume";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.5)",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          width: "90%",
          maxWidth: "720px",
          maxHeight: "90vh",
          backgroundColor: "var(--bg-primary)",
          borderRadius: "16px",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px rgba(0,0,0,0.25)",
        }}
      >
        {/* ---- Header ---- */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>
              {candidate.full_name}
            </h2>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginTop: "6px",
                fontSize: "13px",
                color: "var(--text-secondary)",
              }}
            >
              <span
                style={{ display: "flex", alignItems: "center", gap: "4px" }}
              >
                <Mail size={13} /> {candidate.email}
              </span>
              {candidate.phone && (
                <span
                  style={{ display: "flex", alignItems: "center", gap: "4px" }}
                >
                  <Phone size={13} /> {candidate.phone}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span
              style={{
                padding: "4px 12px",
                borderRadius: "20px",
                fontSize: "12px",
                fontWeight: 600,
                backgroundColor: stageColor.bg,
                color: stageColor.text,
                border: `1px solid ${stageColor.border}`,
              }}
            >
              {candidate.current_stage}
            </span>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "4px",
                color: "var(--text-secondary)",
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ---- Body (scrollable) ---- */}
        <div
          ref={modalBodyRef}
          style={{ flex: 1, overflowY: "auto", padding: "24px" }}
        >
          {error && (
            <div
              style={{
                marginBottom: "16px",
                padding: "12px 16px",
                borderRadius: "8px",
                backgroundColor: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.2)",
                color: "#ef4444",
                fontSize: "13px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <AlertCircle size={14} /> {error}
            </div>
          )}

          {isEvaluateWorkspace && (
            <div
              style={{
                marginBottom: "16px",
                padding: "12px 14px",
                borderRadius: "10px",
                backgroundColor: "rgba(59,130,246,0.06)",
                border: "1px solid rgba(59,130,246,0.2)",
                fontSize: "12px",
                color: "var(--text-secondary)",
                lineHeight: 1.45,
              }}
            >
              <strong>ATS evaluation:</strong> use role fit and shortlist or
              reject below. Scheduling interviews, editing rounds, and stage moves
              belong in the <strong>Shortlisted</strong> and{" "}
              <strong>Interviews</strong> tabs on the requisition.
            </div>
          )}

          {isEvaluateWorkspace &&
            evaluationShortlistBlocked === true &&
            evaluationShortlistBlockedReason ? (
            <div
              style={{
                marginBottom: "16px",
                padding: "12px 14px",
                borderRadius: "10px",
                backgroundColor: "rgba(245,158,11,0.08)",
                border: "1px solid rgba(245,158,11,0.28)",
                fontSize: "12px",
                color: "var(--text-secondary)",
                lineHeight: 1.45,
              }}
            >
              <strong style={{ color: "var(--text-primary)" }}>
                Shortlist unavailable:{" "}
              </strong>
              {evaluationShortlistBlockedReason} Upload the position CV on the
              requisition line (ATS) if you have not already.
            </div>
          ) : null}

          {/* ---- Role fit & evaluation (lazy-loaded) ---- */}
          <div style={{ marginBottom: "20px" }}>
            <div
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "var(--text-tertiary)",
                marginBottom: "8px",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Role fit & evaluation
            </div>
            {!candidate.requisition_item_id ? (
              <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                No position is linked to this candidate record.
              </div>
            ) : evaluationLoading ? (
              <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                Loading evaluation…
              </div>
            ) : evaluationError ? (
              <div style={{ fontSize: "13px", color: "#ef4444" }}>
                {evaluationError}
              </div>
            ) : evaluationNotInSnapshot ? (
              <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                This candidate is not in the current ranking snapshot for this
                position. Try refreshing the ranking from the requisition view.
              </div>
            ) : evaluationModel ? (
              <>
                {evaluationRank != null ? (
                  <div
                    style={{
                      fontSize: "11px",
                      color: "var(--text-tertiary)",
                      marginBottom: "8px",
                    }}
                  >
                    Rank #{evaluationRank} for this position
                  </div>
                ) : null}
                {canEdit &&
                evaluationModel.ai.score == null &&
                candidate.requisition_item_id ? (
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      marginBottom: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      AI score not calculated for this candidate yet.
                    </div>
                    <button
                      type="button"
                      className="action-button"
                      disabled={aiEvalWorking}
                      onClick={() => void handleRunAiEvalForCandidate()}
                      style={{ fontSize: 11, padding: "6px 12px" }}
                    >
                      {aiEvalWorking ? "AI evaluating..." : "Run AI evaluation"}
                    </button>
                  </div>
                ) : null}
                <CandidateEvaluationCard
                  model={evaluationModel}
                  readOnly={!canEdit}
                  disabled={evaluationShortlistBlocked === true}
                  shortlistDisabledReason={evaluationShortlistBlockedReason}
                  onShortlist={() => void handleEvaluationShortlist()}
                  onReject={() => void handleEvaluationReject()}
                  onViewDetails={scrollModalBodyToTop}
                />
              </>
            ) : null}
          </div>

          {/* ---- Stage Actions ---- */}
          {canEdit &&
            !isEvaluateWorkspace &&
            !["Hired", "Rejected"].includes(candidate.current_stage) && (
              <div style={{ marginBottom: "20px" }}>
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--text-tertiary)",
                    marginBottom: "8px",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Move Candidate
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {(FORWARD_TRANSITIONS[candidate.current_stage] ?? []).map(
                    (stage) => {
                      const sc =
                        STAGE_COLORS[stage] ?? STAGE_COLORS["Sourced"]!;
                      return (
                        <button
                          key={stage}
                          disabled={transitioning}
                          className="action-button"
                          style={{
                            fontSize: "12px",
                            padding: "6px 14px",
                            borderRadius: "8px",
                            backgroundColor: sc.bg,
                            color: sc.text,
                            border: `1px solid ${sc.border}`,
                            cursor: "pointer",
                          }}
                          onClick={() => handleStageChange(stage)}
                        >
                          → {stage}
                        </button>
                      );
                    },
                  )}
                </div>
              </div>
            )}

          {/* ---- Application Stage History (Phase 4) ---- */}
          {candidate.stage_history && candidate.stage_history.length > 0 && (
            <div style={{ marginBottom: "20px" }}>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--text-tertiary)",
                  marginBottom: "8px",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Stage History
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "10px",
                  padding: "10px",
                  backgroundColor: "var(--bg-secondary)",
                }}
              >
                {[...candidate.stage_history]
                  .sort((a, b) => {
                    const at = a.changed_at ? new Date(a.changed_at).getTime() : 0;
                    const bt = b.changed_at ? new Date(b.changed_at).getTime() : 0;
                    return at - bt;
                  })
                  .map((entry) => (
                    <div
                      key={entry.history_id}
                      style={{
                        fontSize: "12px",
                        color: "var(--text-secondary)",
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "8px",
                        borderBottom: "1px dashed var(--border-subtle)",
                        paddingBottom: "6px",
                      }}
                    >
                      <span>
                        {(entry.from_stage ?? "Start") + " -> " + entry.to_stage}
                        {entry.reason ? ` (${entry.reason})` : ""}
                      </span>
                      <span style={{ color: "var(--text-tertiary)" }}>
                        {entry.changed_at
                          ? new Date(entry.changed_at).toLocaleString()
                          : "—"}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* ---- Resume Section ---- */}
          <div style={{ marginBottom: "24px" }}>
            <button
              onClick={() => setShowResume(!showResume)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "12px 16px",
                borderRadius: "10px",
                backgroundColor: "var(--bg-secondary)",
              }}
            >
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontWeight: 600,
                  fontSize: "14px",
                }}
              >
                <FileText size={16} /> Resume
              </span>
              {showResume ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {showResume && (
              <div
                style={{
                  marginTop: "8px",
                  borderRadius: "10px",
                  border: "1px solid var(--border-subtle)",
                  overflow: "hidden",
                }}
              >
                {loadingResume ? (
                  <div
                    style={{
                      padding: "24px",
                      textAlign: "center",
                      color: "var(--text-tertiary)",
                      fontSize: "13px",
                    }}
                  >
                    Loading resume...
                  </div>
                ) : resumeLoadError ? (
                  <div
                    style={{
                      padding: "24px",
                      textAlign: "center",
                      color: "var(--error)",
                      fontSize: "13px",
                    }}
                  >
                    {resumeLoadError}
                  </div>
                ) : resumeUrl ? (
                  <>
                    {isPdf ? (
                      <iframe
                        src={resumeUrl}
                        title="Resume"
                        style={{
                          width: "100%",
                          height: "400px",
                          border: "none",
                        }}
                      />
                    ) : (
                      <div style={{ padding: "24px", textAlign: "center" }}>
                        <FileText
                          size={32}
                          style={{
                            marginBottom: "8px",
                            color: "var(--text-tertiary)",
                          }}
                        />
                        <p
                          style={{
                            fontSize: "13px",
                            color: "var(--text-secondary)",
                          }}
                        >
                          Preview not available for this file type.
                        </p>
                      </div>
                    )}
                    <div
                      style={{
                        padding: "10px 16px",
                        borderTop: "1px solid var(--border-subtle)",
                        display: "flex",
                        justifyContent: "flex-end",
                      }}
                    >
                      <a
                        href={resumeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={resumeFilename}
                        className="action-button"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          fontSize: "12px",
                          textDecoration: "none",
                        }}
                      >
                        <Download size={14} /> Download Resume
                      </a>
                    </div>
                  </>
                ) : (
                  <div
                    style={{
                      padding: "24px",
                      textAlign: "center",
                      color: "var(--text-tertiary)",
                      fontSize: "13px",
                    }}
                  >
                    No resume on file for this candidate.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ---- Resume parser (API / cache) ---- */}
          {(candidate.resume_parse != null || candidate.resume_path) && (
            <div style={{ marginBottom: "24px" }}>
              <button
                type="button"
                onClick={() => setShowResumeParse(!showResumeParse)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "12px 16px",
                  borderRadius: "10px",
                  backgroundColor: "var(--bg-secondary)",
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontWeight: 600,
                    fontSize: "14px",
                  }}
                >
                  <FileText size={16} /> Resume parser output
                  {candidate.resume_parse?.status ? (
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 500,
                        padding: "2px 8px",
                        borderRadius: "999px",
                        background:
                          candidate.resume_parse.status === "processed"
                            ? "rgba(16,185,129,0.15)"
                            : candidate.resume_parse.status === "failed"
                              ? "rgba(239,68,68,0.12)"
                              : "rgba(100,116,139,0.15)",
                        color:
                          candidate.resume_parse.status === "processed"
                            ? "#059669"
                            : candidate.resume_parse.status === "failed"
                              ? "#b91c1c"
                              : "#64748b",
                      }}
                    >
                      {candidate.resume_parse.status}
                    </span>
                  ) : null}
                  {candidate.resume_structured &&
                  (candidate.resume_structured.confidence_overall < 0.45 ||
                    candidate.resume_structured.issue_tags.includes(
                      "low_confidence_skills",
                    ) ||
                    candidate.resume_structured.issue_tags.includes(
                      "low_overall_confidence",
                    )) ? (
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 500,
                        padding: "2px 8px",
                        borderRadius: "999px",
                        background: "rgba(245,158,11,0.18)",
                        color: "#b45309",
                      }}
                      title="Structured resume extraction confidence is low; verify skills and experience."
                    >
                      Low confidence parse
                    </span>
                  ) : null}
                  {candidate.resume_structured?.issue_tags.includes(
                    "missing_contact",
                  ) ? (
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 500,
                        padding: "2px 8px",
                        borderRadius: "999px",
                        background: "rgba(100,116,139,0.15)",
                        color: "#475569",
                      }}
                      title="No email or phone was extracted from the resume text."
                    >
                      Missing contact on resume
                    </span>
                  ) : null}
                  {candidate.resume_structured?.issue_tags.includes(
                    "sparse_skills",
                  ) ? (
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 500,
                        padding: "2px 8px",
                        borderRadius: "999px",
                        background: "rgba(59,130,246,0.12)",
                        color: "#1d4ed8",
                      }}
                      title="Few skills were detected in the resume."
                    >
                      Sparse skills
                    </span>
                  ) : null}
                </span>
                {showResumeParse ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {showResumeParse && (
                <div
                  style={{
                    marginTop: "8px",
                    borderRadius: "10px",
                    border: "1px solid var(--border-subtle)",
                    padding: "12px 14px",
                    background: "var(--bg-primary, #fff)",
                  }}
                >
                  {candidate.resume_parse == null ? (
                    <p
                      style={{
                        margin: 0,
                        fontSize: "13px",
                        color: "var(--text-tertiary)",
                      }}
                    >
                      No parser cache for this candidate yet. It is filled when a resume
                      is uploaded and parsed (create candidate or ranking refresh).
                    </p>
                  ) : (
                    <>
                      <p
                        style={{
                          margin: "0 0 8px 0",
                          fontSize: "12px",
                          color: "var(--text-secondary)",
                        }}
                      >
                        Same payload as{" "}
                        <code style={{ fontSize: "11px" }}>GET /api/candidates/</code>
                        <code style={{ fontSize: "11px" }}>
                          {candidate.candidate_id}
                        </code>{" "}
                        field <code style={{ fontSize: "11px" }}>resume_parse</code>.
                      </p>
                      {candidate.resume_parse.error_message ? (
                        <p
                          style={{
                            margin: "0 0 8px 0",
                            fontSize: "12px",
                            color: "var(--error, #b91c1c)",
                          }}
                        >
                          {candidate.resume_parse.error_message}
                        </p>
                      ) : null}
                      <pre
                        style={{
                          margin: 0,
                          maxHeight: "360px",
                          overflow: "auto",
                          fontSize: "11px",
                          lineHeight: 1.45,
                          padding: "10px",
                          borderRadius: "8px",
                          background: "var(--bg-secondary, #f8fafc)",
                          border: "1px solid var(--border-subtle)",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}
                      >
                        {JSON.stringify(candidate.resume_parse, null, 2)}
                      </pre>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ---- Interview Timeline ---- */}
          {(!isEvaluateWorkspace || candidate.interviews.length > 0) && (
          <div style={{ marginBottom: "24px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "12px",
              }}
            >
              <span
                style={{
                  fontWeight: 600,
                  fontSize: "14px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <Calendar size={16} /> Interview Rounds (
                {candidate.interviews.length})
              </span>
              {canEdit && !isEvaluateWorkspace && (
                <button
                  className="action-button primary"
                  style={{
                    fontSize: "12px",
                    padding: "6px 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                  onClick={() => setShowScheduler(!showScheduler)}
                >
                  <Plus size={14} /> Schedule Round
                </button>
              )}
            </div>
            {!isEvaluateWorkspace ? (
            <p
              style={{
                fontSize: "12px",
                color: "var(--muted-foreground, #64748b)",
                margin: "0 0 12px 0",
              }}
            >
              Structured panelists and scorecards: API routes{" "}
              <code>{"/api/interviews/{id}/panelists"}</code> and{" "}
              <code>{"/api/interviews/{id}/scorecards"}</code>.
            </p>
            ) : null}

            {/* Scheduler form */}
            {showScheduler && !isEvaluateWorkspace && (
              <form
                onSubmit={handleSchedule}
                style={{
                  marginBottom: "16px",
                  padding: "16px",
                  borderRadius: "10px",
                  backgroundColor: "rgba(59,130,246,0.04)",
                  border: "1px solid rgba(59,130,246,0.15)",
                }}
              >
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    marginBottom: "12px",
                  }}
                >
                  Schedule Round {candidate.interviews.length + 1}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "12px",
                    marginBottom: "12px",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: 1, minWidth: "200px" }}>
                    <label
                      style={{
                        fontSize: "12px",
                        fontWeight: 500,
                        display: "block",
                        marginBottom: "4px",
                      }}
                    >
                      Interviewer Name *
                    </label>
                    <input
                      type="text"
                      value={interviewerName}
                      onChange={(e) => setInterviewerName(e.target.value)}
                      placeholder="e.g., Tech Lead"
                      required
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        border: "1px solid var(--border-subtle)",
                        fontSize: "13px",
                      }}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: "200px" }}>
                    <label
                      style={{
                        fontSize: "12px",
                        fontWeight: 500,
                        display: "block",
                        marginBottom: "4px",
                      }}
                    >
                      Date & Time *
                    </label>
                    <input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      min={new Date().toISOString().slice(0, 16)}
                      required
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        border: "1px solid var(--border-subtle)",
                        fontSize: "13px",
                      }}
                    />
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    type="button"
                    className="action-button"
                    style={{ fontSize: "12px", padding: "6px 14px" }}
                    onClick={() => setShowScheduler(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="action-button primary"
                    style={{ fontSize: "12px", padding: "6px 14px" }}
                    disabled={
                      scheduling || !interviewerName.trim() || !scheduledAt
                    }
                  >
                    {scheduling ? "Scheduling..." : "Schedule"}
                  </button>
                </div>
              </form>
            )}

            {/* Rounds list */}
            {candidate.interviews.length === 0 ? (
              <div
                style={{
                  padding: "20px",
                  textAlign: "center",
                  color: "var(--text-tertiary)",
                  fontSize: "13px",
                }}
              >
                No interviews scheduled yet.
              </div>
            ) : (
              <div
                style={{ display: "flex", flexDirection: "column", gap: "0" }}
              >
                {candidate.interviews.map((iv, idx) => {
                  const isEditing = editingInterview === iv.id;
                  const statusColor =
                    iv.status === "Completed"
                      ? "#10b981"
                      : iv.status === "Cancelled"
                        ? "#ef4444"
                        : "#3b82f6";
                  const resultColor = iv.result
                    ? (RESULT_COLORS[iv.result] ?? "#64748b")
                    : "#64748b";

                  return (
                    <div key={iv.id} style={{ display: "flex", gap: "12px" }}>
                      {/* Timeline connector */}
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          width: "24px",
                          flexShrink: 0,
                        }}
                      >
                        <div
                          style={{
                            width: "10px",
                            height: "10px",
                            borderRadius: "50%",
                            backgroundColor: statusColor,
                            marginTop: "6px",
                            flexShrink: 0,
                          }}
                        />
                        {idx < candidate.interviews.length - 1 && (
                          <div
                            style={{
                              width: "2px",
                              flex: 1,
                              backgroundColor: "var(--border-subtle)",
                              marginTop: "4px",
                            }}
                          />
                        )}
                      </div>

                      {/* Round card */}
                      <div
                        style={{
                          flex: 1,
                          padding: "12px 16px",
                          marginBottom: "12px",
                          borderRadius: "10px",
                          backgroundColor: "var(--bg-secondary)",
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600, fontSize: "13px" }}>
                              Round {iv.round_number} — {iv.interviewer_name}
                            </div>
                            <div
                              style={{
                                fontSize: "12px",
                                color: "var(--text-tertiary)",
                                marginTop: "2px",
                              }}
                            >
                              {new Date(iv.scheduled_at).toLocaleString()}
                            </div>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            <span
                              style={{
                                padding: "2px 8px",
                                borderRadius: "12px",
                                fontSize: "11px",
                                fontWeight: 600,
                                backgroundColor: `${statusColor}18`,
                                color: statusColor,
                              }}
                            >
                              {iv.status}
                            </span>
                            {iv.result && (
                              <span
                                style={{
                                  padding: "2px 8px",
                                  borderRadius: "12px",
                                  fontSize: "11px",
                                  fontWeight: 600,
                                  backgroundColor: `${resultColor}18`,
                                  color: resultColor,
                                }}
                              >
                                {iv.result}
                              </span>
                            )}
                          </div>
                        </div>

                        {iv.feedback && (
                          <div
                            style={{
                              marginTop: "8px",
                              fontSize: "12px",
                              color: "var(--text-secondary)",
                              fontStyle: "italic",
                            }}
                          >
                            {`"${iv.feedback}"`}
                          </div>
                        )}

                        {/* Inline edit for interview result */}
                        {canEdit &&
                          !isEvaluateWorkspace &&
                          iv.status !== "Cancelled" && (
                          <>
                            {!isEditing ? (
                              <div
                                style={{
                                  marginTop: "8px",
                                  display: "flex",
                                  gap: "6px",
                                }}
                              >
                                <button
                                  className="action-button"
                                  style={{
                                    fontSize: "11px",
                                    padding: "4px 10px",
                                  }}
                                  onClick={() => {
                                    setEditingInterview(iv.id);
                                    setEditStatus(iv.status);
                                    setEditResult(iv.result ?? "");
                                    setEditFeedback(iv.feedback ?? "");
                                  }}
                                >
                                  Update Result
                                </button>
                                <button
                                  className="action-button"
                                  style={{
                                    fontSize: "11px",
                                    padding: "4px 10px",
                                    color: "#ef4444",
                                  }}
                                  onClick={() => handleDeleteInterview(iv.id)}
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            ) : (
                              <div
                                style={{
                                  marginTop: "10px",
                                  padding: "12px",
                                  borderRadius: "8px",
                                  backgroundColor: "var(--bg-primary)",
                                  border: "1px solid var(--border-subtle)",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    gap: "10px",
                                    marginBottom: "8px",
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <select
                                    value={editStatus}
                                    onChange={(e) =>
                                      setEditStatus(e.target.value)
                                    }
                                    style={{
                                      padding: "6px 10px",
                                      borderRadius: "6px",
                                      border: "1px solid var(--border-subtle)",
                                      fontSize: "12px",
                                    }}
                                  >
                                    <option value="Scheduled">Scheduled</option>
                                    <option value="Completed">Completed</option>
                                    <option value="Cancelled">Cancelled</option>
                                  </select>
                                  <select
                                    value={editResult}
                                    onChange={(e) =>
                                      setEditResult(e.target.value)
                                    }
                                    style={{
                                      padding: "6px 10px",
                                      borderRadius: "6px",
                                      border: "1px solid var(--border-subtle)",
                                      fontSize: "12px",
                                    }}
                                  >
                                    <option value="">No Result</option>
                                    <option value="Pass">Pass</option>
                                    <option value="Fail">Fail</option>
                                    <option value="Hold">Hold</option>
                                  </select>
                                </div>
                                <textarea
                                  placeholder="Feedback..."
                                  value={editFeedback}
                                  onChange={(e) =>
                                    setEditFeedback(e.target.value)
                                  }
                                  rows={2}
                                  style={{
                                    width: "100%",
                                    padding: "8px 10px",
                                    borderRadius: "6px",
                                    border: "1px solid var(--border-subtle)",
                                    fontSize: "12px",
                                    resize: "vertical",
                                    marginBottom: "8px",
                                  }}
                                />
                                <div
                                  style={{
                                    display: "flex",
                                    gap: "6px",
                                    justifyContent: "flex-end",
                                  }}
                                >
                                  <button
                                    className="action-button"
                                    style={{
                                      fontSize: "11px",
                                      padding: "4px 10px",
                                    }}
                                    onClick={() => setEditingInterview(null)}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    className="action-button primary"
                                    style={{
                                      fontSize: "11px",
                                      padding: "4px 10px",
                                    }}
                                    onClick={() => handleUpdateInterview(iv)}
                                  >
                                    Save
                                  </button>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
