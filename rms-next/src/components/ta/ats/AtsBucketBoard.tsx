"use client";

import type {
  ApplicationRecord,
  ApplicationsAtsBucketsResponse,
} from "@/lib/api/candidateApi";

type ExperienceFitTone = "green" | "blue" | "red";

export type ExperienceFitFlag = {
  tone: ExperienceFitTone;
  label: string;
  candidateYears: number;
  requiredYears: number;
};

type ScoreInfo = {
  final_score: number | null;
  ai_status: "OK" | "PENDING" | "UNAVAILABLE";
  ai_summary?: string;
};

function getComparableScore(scoreByCandidateId: Map<number, ScoreInfo>, candidateId: number) {
  const rawScore = scoreByCandidateId.get(candidateId)?.final_score;
  return typeof rawScore === "number" && Number.isFinite(rawScore) ? rawScore : null;
}

/** Row layout: wrap columns so we never get a horizontal scrollbar on the page/section. */
const bucketRowStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: "10px",
  paddingBottom: "8px" as const,
  width: "100%" as const,
  maxWidth: "100%" as const,
  minWidth: 0,
};

function AtsBoardSkeleton() {
  return (
    <div
      style={bucketRowStyle}
      aria-busy
      aria-label="Loading ATS evaluation board"
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          style={{
            minWidth: "min(100%, 160px)",
            flex: "1 1 160px",
            border: "1px solid var(--border-subtle)",
            borderRadius: "8px",
            padding: "8px",
            backgroundColor: "var(--bg-primary)",
            minHeight: "120px",
            maxWidth: "100%",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              height: "12px",
              width: "70%",
              borderRadius: "4px",
              backgroundColor: "var(--border-subtle)",
              marginBottom: "10px",
              opacity: 0.75,
            }}
          />
          <div
            style={{
              height: "36px",
              borderRadius: "6px",
              backgroundColor: "var(--bg-tertiary)",
              marginBottom: "8px",
            }}
          />
          <div
            style={{
              height: "36px",
              borderRadius: "6px",
              backgroundColor: "var(--bg-tertiary)",
            }}
          />
        </div>
      ))}
    </div>
  );
}

export interface AtsBucketBoardProps {
  loading: boolean;
  rankingError: string | null;
  bucketsError: string | null;
  atsBucketsData: ApplicationsAtsBucketsResponse | null;
  scoreByCandidateId: Map<number, ScoreInfo>;
  experienceFlagByCandidateId: Map<number, ExperienceFitFlag>;
  requiredExperienceYears: number | null;
  resolveExperienceFit: (
    requiredYears: number | null,
    candidateYears: number | null | undefined,
  ) => ExperienceFitFlag | null;
  onOpenApp: (app: ApplicationRecord) => void;
  rankingBreakdownSnippet: (breakdown: Record<string, unknown>) => string;
  onRetryLoad: () => void;
}

export default function AtsBucketBoard({
  loading,
  rankingError,
  bucketsError,
  atsBucketsData,
  scoreByCandidateId,
  experienceFlagByCandidateId,
  requiredExperienceYears,
  resolveExperienceFit,
  onOpenApp,
  rankingBreakdownSnippet,
  onRetryLoad,
}: AtsBucketBoardProps) {
  if (loading) {
    return <AtsBoardSkeleton />;
  }

  if (rankingError) {
    return (
      <div style={{ fontSize: "12px", color: "var(--error)" }} role="alert">
        {rankingError}
        <button
          type="button"
          className="action-button"
          style={{ fontSize: "11px", padding: "4px 10px", marginLeft: "10px" }}
          onClick={onRetryLoad}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!atsBucketsData) {
    return (
      <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
        {bucketsError ? (
          <span style={{ color: "var(--error)" }} role="alert">
            {bucketsError}{" "}
            <button
              type="button"
              className="action-button"
              style={{ fontSize: "11px", padding: "4px 10px", marginLeft: "6px" }}
              onClick={onRetryLoad}
            >
              Retry
            </button>
          </span>
        ) : (
          "No bucket data yet for this line. Open ranking settings below or refresh."
        )}
      </div>
    );
  }

  return (
    <>
      {bucketsError ? (
        <div
          style={{
            fontSize: "11px",
            color: "var(--warning, #b45309)",
            marginBottom: "10px",
            padding: "8px 10px",
            borderRadius: "8px",
            border: "1px solid rgba(245, 158, 11, 0.35)",
            backgroundColor: "rgba(245, 158, 11, 0.06)",
          }}
          role="status"
        >
          {bucketsError}
        </div>
      ) : null}
        <div style={bucketRowStyle}>
          {(
            [
              "BEST",
              "VERY_GOOD",
              "GOOD",
              "AVERAGE",
              "NOT_SUITABLE",
            ] as const
          ).map((bucketKey) => {
            const labels: Record<string, string> = {
              BEST: "Best",
              VERY_GOOD: "Very good",
              GOOD: "Good",
              AVERAGE: "Average",
              NOT_SUITABLE: "Not suitable",
            };
            const apps = atsBucketsData[bucketKey] ?? [];
            const sortedApps = apps
              .map((app, index) => ({
                app,
                index,
                score: getComparableScore(scoreByCandidateId, app.candidate_id),
              }))
              .sort((a, b) => {
                if (a.score == null && b.score == null) return a.index - b.index;
                if (a.score == null) return 1;
                if (b.score == null) return -1;
                if (b.score !== a.score) return b.score - a.score;
                return a.index - b.index;
              })
              .map((entry) => entry.app);
            return (
              <div
                key={bucketKey}
                style={{
                  minWidth: "min(100%, 160px)",
                  flex: "1 1 160px",
                  maxWidth: "100%",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "8px",
                  padding: "8px",
                  backgroundColor: "var(--bg-primary)",
                  maxHeight: "360px",
                  overflowY: "auto",
                  boxSizing: "border-box",
                }}
              >
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    marginBottom: "6px",
                  }}
                >
                  {labels[bucketKey] ?? bucketKey}{" "}
                  <span style={{ color: "var(--text-tertiary)" }}>
                    ({apps.length}
                    {atsBucketsData.meta?.truncated?.[bucketKey] ? "+" : ""})
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  {apps.length === 0 ? (
                    <span
                      style={{
                        fontSize: "10px",
                        color: "var(--text-tertiary)",
                        fontStyle: "italic",
                      }}
                    >
                      No candidates
                    </span>
                  ) : null}
                  {sortedApps.map((app) => {
                    const bd = app.ranking?.breakdown;
                    const snippet = bd ? rankingBreakdownSnippet(bd) : "";
                    const fallbackYears =
                      bd && typeof bd === "object"
                        ? (() => {
                            const exp = (
                              bd as {
                                ranking_signals?: {
                                  ats?: { experience_years?: number | null };
                                };
                              }
                            ).ranking_signals?.ats?.experience_years;
                            return exp ?? null;
                          })()
                        : null;
                    const expFlag =
                      experienceFlagByCandidateId.get(app.candidate_id) ??
                      resolveExperienceFit(
                        requiredExperienceYears,
                        fallbackYears,
                      );
                    return (
                      <div
                        key={app.application_id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onOpenApp(app)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onOpenApp(app);
                          }
                        }}
                        style={{
                          fontSize: "11px",
                          padding: "8px 10px",
                          borderRadius: "8px",
                          border: "1px solid var(--border-subtle)",
                          cursor: "pointer",
                          lineHeight: 1.35,
                          backgroundColor: "var(--bg-secondary)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                            gap: "6px",
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>
                            {app.candidate.full_name}
                          </span>
                          {(() => {
                            const s = scoreByCandidateId.get(app.candidate_id);
                            const status = s?.ai_status ?? "PENDING";
                            const score = s?.final_score ?? null;
                            return (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  fontWeight: 700,
                                  fontSize: "11px",
                                }}
                              >
                                <span>
                                  {status === "OK" && score != null
                                    ? Math.round(score)
                                    : "—"}
                                </span>
                                {status !== "OK" ? (
                                  <span
                                    style={{
                                      fontWeight: 600,
                                      fontSize: "10px",
                                      color: "var(--text-tertiary)",
                                    }}
                                  >
                                    {status}
                                  </span>
                                ) : null}
                              </span>
                            );
                          })()}
                        </div>
                        {snippet ? (
                          <div
                            style={{
                              color: "var(--text-tertiary)",
                              fontSize: "10px",
                              marginTop: "4px",
                            }}
                          >
                            {snippet}
                          </div>
                        ) : null}
                        {expFlag ? (
                          <div
                            style={{
                              marginTop: "5px",
                            }}
                          >
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                fontSize: "10px",
                                fontWeight: 700,
                                padding: "2px 6px",
                                borderRadius: "999px",
                                backgroundColor:
                                  expFlag.tone === "red"
                                    ? "#FEE2E2"
                                    : expFlag.tone === "blue"
                                      ? "#DBEAFE"
                                      : "#DCFCE7",
                                color:
                                  expFlag.tone === "red"
                                    ? "#991B1B"
                                    : expFlag.tone === "blue"
                                      ? "#1E3A8A"
                                      : "#166534",
                              }}
                            >
                              {expFlag.label}
                            </span>
                          </div>
                        ) : null}
                        <div
                          style={{
                            color: "var(--text-tertiary)",
                            fontSize: "10px",
                            marginTop: "4px",
                          }}
                        >
                          {app.current_stage}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: "12px" }}>
          <div
            style={{ fontSize: "11px", fontWeight: 600, marginBottom: "6px" }}
          >
            Unranked
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "10px",
              width: "100%",
              maxWidth: "100%",
              minWidth: 0,
            }}
          >
            {(atsBucketsData.UNRANKED ?? []).length === 0 ? (
              <span
                style={{ fontSize: "11px", color: "var(--text-tertiary)" }}
              >
                None
              </span>
            ) : (
              (atsBucketsData.UNRANKED ?? []).map((app) => {
                const bd = app.ranking?.breakdown;
                const fallbackYears =
                  bd && typeof bd === "object"
                    ? (() => {
                        const exp = (
                          bd as {
                            ranking_signals?: {
                              ats?: { experience_years?: number | null };
                            };
                          }
                        ).ranking_signals?.ats?.experience_years;
                        return exp ?? null;
                      })()
                    : null;
                const expFlag =
                  experienceFlagByCandidateId.get(app.candidate_id) ??
                  resolveExperienceFit(
                    requiredExperienceYears,
                    fallbackYears,
                  );
                return (
                  <div
                    key={app.application_id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpenApp(app)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onOpenApp(app);
                      }
                    }}
                    style={{
                      fontSize: "11px",
                      padding: "8px 10px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-subtle)",
                      cursor: "pointer",
                      minWidth: "min(100%, 120px)",
                      flex: "1 1 120px",
                      maxWidth: "100%",
                      boxSizing: "border-box",
                      backgroundColor: "var(--bg-primary)",
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{app.candidate.full_name}</div>
                    {expFlag ? (
                      <div style={{ marginTop: "4px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            fontSize: "10px",
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: "999px",
                            backgroundColor:
                              expFlag.tone === "red"
                                ? "#FEE2E2"
                                : expFlag.tone === "blue"
                                  ? "#DBEAFE"
                                  : "#DCFCE7",
                            color:
                              expFlag.tone === "red"
                                ? "#991B1B"
                                : expFlag.tone === "blue"
                                  ? "#1E3A8A"
                                  : "#166534",
                          }}
                        >
                          {expFlag.label}
                        </span>
                      </div>
                    ) : null}
                    <div
                      style={{
                        fontSize: "10px",
                        color: "var(--text-tertiary)",
                      }}
                    >
                      {app.current_stage}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
    </>
  );
}
