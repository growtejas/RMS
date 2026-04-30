import type { RefObject } from "react";
import type { ApplicationRecord } from "@/lib/api/candidateApi";
import type { RequisitionItemRankingResponse } from "@/lib/api/candidateApi";
export type RequisitionItemOption = {
  numericItemId: number;
  skill: string;
  level: string;
};

export type PipelineJdFeedback = "neutral" | "success" | "error";

export type PipelineOverviewProps = {
  pipelineLoading: boolean;
  pipelineCountByStage: Record<string, number>;
  expandedPipelineStage: string | null;
  onToggleStage: (stage: string) => void;
  onRefresh: () => void;
  refreshDisabled?: boolean;
  pipelineFullLoading: boolean;
  expandedStageApplications: ApplicationRecord[];
  onOpenStageApplication: (app: ApplicationRecord) => void;
};

export type RankingConfigPanelProps = {
  rankingItemId: number | null;
  onLineChange: (itemId: number) => void;
  lineOptions: RequisitionItemOption[];
  onRefreshRanking: () => void;
  onRecompute: () => void;
  onAiEvalAll: () => void;
  rankingLoading: boolean;
  rankingRefreshing: boolean;
  rankingError: string | null;
  rankingData: RequisitionItemRankingResponse | null;
  aiEvalWorking: boolean;
  canEditPipelineRankingJd: boolean;
  useRequisitionJd: boolean;
  onUseRequisitionJdChange: (v: boolean) => void;
  pipelineJdTextDraft: string;
  onPipelineJdTextDraftChange: (v: string) => void;
  rankingRequiredSkillsDraft: string;
  onRankingRequiredSkillsDraftChange: (v: string) => void;
  pipelineJdFileInputRef: RefObject<HTMLInputElement>;
  onPickPdfFile: (file: File) => void;
  onClickUploadPdf: () => void;
  onClickRemovePdf: () => void;
  pipelineJdUploading: boolean;
  pipelineJdSaving: boolean;
  onSaveJdSettings: () => void;
  pipelineJdMessage: string | null;
  pipelineJdFeedback: PipelineJdFeedback;
  hasAttachedRankingPdf: boolean;
  showIgnoredCustomJdNote: boolean;
  showCustomPdfNote: boolean;
  pipelineRankingTargetItem: {
    pipelineJdText?: string | null;
    pipelineJdFileKey?: string | null;
  } | null;
};
