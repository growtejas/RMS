import type { Dispatch, FormEvent, RefObject, SetStateAction } from "react";

import type { PipelineJdFeedback } from "@/components/ta/requisition-advanced/types";
import type {
  ApplicationRecord,
  ApplicationsAtsBucketsResponse,
  Candidate,
  Interview,
  RequisitionItemRankingResponse,
} from "@/lib/api/candidateApi";
import type {
  ExperienceFitFlag,
  RequisitionDetailTabId,
  RequisitionItem,
  TicketData,
} from "../types";

export type RequisitionLineOption = {
  numericItemId: number;
  skill: string;
  level: string;
};

export type AtsBoardScoreMap = Map<
  number,
  {
    final_score: number | null;
    ai_status: "OK" | "PENDING" | "UNAVAILABLE";
    ai_summary?: string;
  }
>;

/** Props bag passed from RequisitionDetail orchestrator into pipeline chrome + tab panels. */
export type RequisitionPipelineBindings = {
  activeTab: RequisitionDetailTabId;
  ticket: TicketData;
  canEditItem: (item: RequisitionItem) => boolean;

  showAddCandidate: boolean;
  setShowAddCandidate: (v: boolean) => void;
  handleAddCandidate: (e: FormEvent) => void | Promise<void>;
  candidateUploadMode: "single" | "bulk";
  setCandidateUploadMode: (v: "single" | "bulk") => void;
  addCandidateItemId: number | null;
  setAddCandidateItemId: (v: number | null) => void;
  newCandidateName: string;
  setNewCandidateName: (v: string) => void;
  newCandidateEmail: string;
  setNewCandidateEmail: (v: string) => void;
  newCandidatePhone: string;
  setNewCandidatePhone: (v: string) => void;
  newCandidateExp: string;
  setNewCandidateExp: (v: string) => void;
  newCandidateNotice: string;
  setNewCandidateNotice: (v: string) => void;
  newCandidateReferral: boolean;
  setNewCandidateReferral: (v: boolean) => void;
  newCandidateSkills: string;
  setNewCandidateSkills: (v: string) => void;
  resumeFile: File | null;
  setResumeFile: (v: File | null) => void;
  addingCandidate: boolean;
  rankingItemId: number | null;
  loadCandidates: () => void | Promise<void>;
  loadPipelineCompact: () => void | Promise<void>;
  loadRanking: (recompute: boolean) => void | Promise<void>;

  atsBoardItemId: number | null;
  setAtsBoardItemId: (n: number) => void;
  rankingLoading: boolean;
  rankingRefreshing: boolean;
  rankingError: string | null;
  rankingData: RequisitionItemRankingResponse | null;
  aiEvalWorking: boolean;
  atsBucketsData: ApplicationsAtsBucketsResponse | null;
  atsBucketsError: string | null;
  atsBoardScoreByCandidateId: AtsBoardScoreMap;
  atsBoardExperienceFlagByCandidateId: Map<number, ExperienceFitFlag>;
  atsBoardRequiredExperienceYears: number | null;
  resolveExperienceFitFlag: (
    requiredYears: number | null,
    candidateYears: number | null | undefined,
  ) => ExperienceFitFlag | null;
  openEvaluateFromAtsApp: (app: ApplicationRecord) => void;
  rankingBreakdownSnippet: (breakdown: Record<string, unknown>) => string;
  pipelineAdvancedOpen: boolean;
  setPipelineAdvancedOpen: Dispatch<SetStateAction<boolean>>;
  pipelineLoading: boolean;
  pipelineCountByStage: Record<string, number>;
  expandedPipelineStage: string | null;
  setExpandedPipelineStage: Dispatch<SetStateAction<string | null>>;
  handlePipelineSectionRefresh: () => void;
  pipelineFullLoading: boolean;
  expandedStageApplications: ApplicationRecord[];
  openEvaluateFromPipelineRecord: (app: ApplicationRecord) => void;
  pipelineJdFileInputRef: RefObject<HTMLInputElement | null>;
  uploadPipelineRankingJdPdf: (file: File) => void | Promise<void>;
  removePipelineRankingJdPdf: () => void | Promise<void>;
  pipelineJdUploading: boolean;
  pipelineJdSaving: boolean;
  savePipelineRankingJdSettings: () => void | Promise<void>;
  pipelineJdMessage: string | null;
  pipelineJdFeedback: PipelineJdFeedback;
  pipelineRankingTargetItem: RequisitionItem | null;
  canEditPipelineRankingJd: boolean;
  useRequisitionJd: boolean;
  setUseRequisitionJd: (v: boolean) => void;
  pipelineJdTextDraft: string;
  setPipelineJdTextDraft: (v: string) => void;
  rankingRequiredSkillsDraft: string;
  setRankingRequiredSkillsDraft: (v: string) => void;
  showIgnoredCustomJdNote: boolean;
  runAiEvalAllPresent: () => void | Promise<void>;
  requisitionLineOptions: RequisitionLineOption[];

  candidateItemFilter: number | "all";
  setCandidateItemFilter: Dispatch<SetStateAction<number | "all">>;
  candidateStageFilter: string;
  setCandidateStageFilter: Dispatch<SetStateAction<string>>;
  candidatesLoading: boolean;
  candidates: Candidate[];

  transitionError: string | null;
  setTransitionError: (v: string | null) => void;
  shortlistedCandidatesForTable: Candidate[];
  handleBulkShortlistToInterviewing: () => void | Promise<void>;
  shortlistBulkAppIds: number[];
  setShortlistBulkAppIds: Dispatch<SetStateAction<number[]>>;
  shortlistBulkWorking: boolean;
  sendShortlistEmailAppId: number | null;
  handleSendShortlistEmail: (applicationId: number) => void | Promise<void>;
  shortlistEmailOk: string | null;
  setShortlistEmailOk: (v: string | null) => void;
  openCandidateModal: (c: Candidate, workspace: "evaluate" | "execute") => void;

  reqInterviews: Interview[];
  reqInterviewsLoading: boolean;
  interviewingCandidatesForTable: Candidate[];
};
