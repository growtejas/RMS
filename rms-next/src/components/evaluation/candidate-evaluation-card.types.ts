export type FitLabel = "Strong Fit" | "Good Fit" | "Moderate Fit" | "Low Fit";

export type Band = "high" | "medium" | "low";

export type AiStrengthLabel = "Strong" | "Good" | "Moderate" | "Weak";

export type HighlightTone = "positive" | "warning";

export type CandidateEvaluationCardModel = {
  candidateId: number;
  fullName: string;
  /** Same as pipeline list: deterministic rank score (before AI blend). */
  finalScoreRounded: number;
  /**
   * When GET used `ai_eval=1` and ranking blended AI into sort score, this is
   * the blended value (may differ from {@link finalScoreRounded}).
   */
  aiBlendedRankScoreRounded?: number;
  fitLabel: FitLabel;
  highlights: { text: string; tone: HighlightTone }[];
  skillsFit: Band;
  experienceFit: Band;
  ai: {
    score: number | null;
    strengthLabel: AiStrengthLabel | null;
    summaryLines: string[];
    /** Full AI summary (unclipped). */
    summaryFull?: string;
    unavailableMessage?: string;
  };
  risks: string[];
  rankingWhy: string[];
  shortlistPreview: { reasons: string[]; risk?: string };
};

export type CandidateEvaluationCardProps = {
  model: CandidateEvaluationCardModel;
  onShortlist: () => void;
  onReject: () => void;
  onViewDetails: () => void;
  disabled?: boolean;
  shortlistDisabledReason?: string;
  /** Hide Shortlist / Reject / View details (e.g. Manager read-only). */
  readOnly?: boolean;
};
