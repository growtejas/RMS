 "use client";

/* eslint-disable @typescript-eslint/no-unused-vars -- legacy Vite migration */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from "react";
import {
  ArrowLeft,
  Calendar,
  Users,
  Target,
  Clock,
  CheckCircle,
  FileText,
  MessageSquare,
  History,
  Download,
  Printer,
  ExternalLink,
  Shield,
  Edit,
  Save,
  X,
  UserPlus,
  AlertCircle,
  Briefcase,
  MapPin,
  ChevronDown,
  ChevronUp,
  Upload,
  Ban,
  Search,
  UserCheck,
  Mail,
  Phone,
  Gift,
  DollarSign,
  RefreshCw,
  Eye,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useParams, usePathname, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api/client";
import { getUsersListCached } from "@/lib/api/users-list-cache";
import { useAuth } from "@/contexts/useAuth";
import { AuditSection } from "@/components/audit";
import {
  normalizeStatus,
  getStatusLabel,
  isTerminalStatus,
  RequisitionItemStatus,
  ITEM_STATUS_LABELS,
  ITEM_STATUSES,
} from "@/types/workflow";
import {
  shortlistItem,
  startInterview,
  makeOffer,
  fulfillItem,
  cancelItem as cancelItemApi,
} from "@/lib/api/workflowApi";
import {
  fetchApplicationsAtsBuckets,
  fetchApplicationsPipeline,
  fetchCandidatesFromApplications,
  fetchInterviews,
  createCandidate,
  fetchRequisitionItemRanking,
  recomputeRequisitionItemRanking,
  runAiEvaluationForRequisitionItem,
  uploadResume,
  getCandidateActionErrorMessage,
  updateCandidateStageCompatible,
  sendShortlistEmail,
  type ApplicationRecord,
  type ApplicationsAtsBucketsResponse,
  type ApplicationsPipelineResponse,
  type Candidate,
  type CandidateCreate,
  type Interview,
  type RequisitionItemRankingResponse,
} from "@/lib/api/candidateApi";
import { useAtsAiScoreStream, useAtsTabInitialLoad } from "@/hooks/useAtsBoard";
import AtsBucketBoard from "@/components/ta/ats/AtsBucketBoard";
import PipelineOverview from "@/components/ta/requisition-advanced/PipelineOverview";
import RankingConfigPanel from "@/components/ta/requisition-advanced/RankingConfigPanel";
import CandidateFiltersBar from "@/components/ta/requisition-advanced/CandidateFiltersBar";
import type { PipelineJdFeedback } from "@/components/ta/requisition-advanced/types";
import { InterviewStatusBadge } from "@/components/interviews/InterviewStatusBadge";
import { interviewUi } from "@/components/interviews/interview-ui-theme";
import { Table, TBody, THead, TD, TH, TR } from "@/components/ui/Table";
import BulkResumeUploadPanel from "@/components/candidates/BulkResumeUploadPanel";
import { ITEM_STATUS_ICONS } from "@/components/ta/requisition-detail/constants";
import type {
  AuditLogEntry,
  BackendRequisition,
  BackendRequisitionItem,
  ExperienceFitFlag,
  RequisitionDetailTabId,
  RequisitionDetailsProps,
  RequisitionItem,
  StatusHistoryEntry,
  TicketData,
  UserDirectoryEntry,
} from "@/components/ta/requisition-detail/types";
import { OverviewTab } from "@/components/ta/requisition-detail/tabs/OverviewTab";
import { ItemsTab } from "@/components/ta/requisition-detail/tabs/ItemsTab";
import { CandidatePipelineChrome } from "@/components/ta/requisition-detail/tabs/CandidatePipelineChrome";
import { TimelineTab } from "@/components/ta/requisition-detail/tabs/TimelineTab";
import type { RequisitionPipelineBindings } from "@/components/ta/requisition-detail/tabs/pipelineTabBindings";
import {
  extractRequiredYearsFromText,
  getItemMilestoneIndex,
  getOverallStatusClass,
  parseReqId,
  resolveExperienceFitFlag,
} from "@/components/ta/requisition-detail/utils";
import "../../../styles/hr/hr-dashboard.css";

const AtsTabPanel = dynamic(
  () =>
    import("@/components/ta/requisition-detail/tabs/AtsTabPanel").then(
      (m) => m.AtsTabPanel,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="px-4 py-10 text-center text-sm text-slate-600">
        Loading ATS…
      </div>
    ),
  },
);

const ShortlistedTabPanel = dynamic(
  () =>
    import("@/components/ta/requisition-detail/tabs/ShortlistedTabPanel").then(
      (m) => m.ShortlistedTabPanel,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="px-4 py-10 text-center text-sm text-slate-600">
        Loading shortlisted…
      </div>
    ),
  },
);

const InterviewsTabPanel = dynamic(
  () =>
    import("@/components/ta/requisition-detail/tabs/InterviewsTabPanel").then(
      (m) => m.InterviewsTabPanel,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="px-4 py-10 text-center text-sm text-slate-600">
        Loading interviews…
      </div>
    ),
  },
);

const CandidatesWorkspaceTabPanel = dynamic(
  () =>
    import("@/components/ta/requisition-detail/tabs/CandidatesWorkspaceTabPanel").then(
      (m) => m.CandidatesWorkspaceTabPanel,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="px-4 py-10 text-center text-sm text-slate-600">
        Loading candidates…
      </div>
    ),
  },
);

const RequisitionDetailRoot: React.FC<RequisitionDetailsProps> = ({
  requisitionId,
  onBack,
  onUpdate,
  readOnly = false,
  candidateBasePath = "/ta/candidates",
}) => {
  const params = useParams();
  const id = params?.id as string | undefined;
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const isInterviewerRoute = pathname?.startsWith("/interviewer/") ?? false;
  const effectiveTicketId = requisitionId ?? id;
  const getTodayDate = () =>
    new Date().toISOString().split("T")[0] ?? new Date().toISOString();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<RequisitionDetailTabId>("overview");
  const [selectedItemForAssignment, setSelectedItemForAssignment] = useState<
    string | null
  >(null);
  const initialItemStatusesRef = useRef<Record<string, string>>({});
  const [newNote, setNewNote] = useState("");
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [statusHistory, setStatusHistory] = useState<StatusHistoryEntry[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [usersById, setUsersById] = useState<Record<number, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currentUserId = user?.user_id ?? null;
  const userRoles = user?.roles ?? [];
  const isHRUser = userRoles.some((r) =>
    ["hr", "admin"].includes(r.toLowerCase()),
  );

  // Phase 7: Per-item edit permission check
  // TA can edit items explicitly assigned to them OR,
  // if they are the header-level TA and the item has no item-level TA yet.
  const canEditItem = (item: RequisitionItem): boolean => {
    if (readOnly) return false;
    if (!currentUserId) return false;
    // HR/Admin can edit any item
    if (isHRUser) return true;

    const headerAssignedToMe =
      ticket?.assignedTAId != null && ticket.assignedTAId === currentUserId;

    // If item has an explicit TA, require it to match current user.
    if (item.assignedTAId != null) {
      return item.assignedTAId === currentUserId;
    }

    // Unassigned item: allow header-level TA to act as owner.
    return headerAssignedToMe;
  };

  // Legacy: Header-level check (kept for backward compatibility)
  const canAssignResources = Boolean(
    ticket?.assignedTAId &&
    currentUserId &&
    ticket.assignedTAId === currentUserId,
  );

  // Phase 4: CV Upload state
  const [cvUploading, setCvUploading] = useState<string | null>(null);
  const cvInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Phase 4: Item workflow transition state
  const [transitioningItem, setTransitioningItem] = useState<string | null>(
    null,
  );
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [transitionSuccess, setTransitionSuccess] = useState<string | null>(
    null,
  );

  // Phase 4: HR Kill Switch - Cancel Item Modal
  const [cancelModalItem, setCancelModalItem] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // JD PDF viewer (item-level only)
  const [showJdViewer, setShowJdViewer] = useState(false);
  const [jdItemId, setJdItemId] = useState<number | null>(null);
  const [jdBlobUrl, setJdBlobUrl] = useState<string | null>(null);
  const [loadingJd, setLoadingJd] = useState(false);

  // ---- Candidate Pipeline state ----
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [showAddCandidate, setShowAddCandidate] = useState(false);
  const [addCandidateItemId, setAddCandidateItemId] = useState<number | null>(
    null,
  );
  const [newCandidateName, setNewCandidateName] = useState("");
  const [newCandidateEmail, setNewCandidateEmail] = useState("");
  const [newCandidatePhone, setNewCandidatePhone] = useState("");
  const [newCandidateExp, setNewCandidateExp] = useState("");
  const [newCandidateNotice, setNewCandidateNotice] = useState("");
  const [newCandidateReferral, setNewCandidateReferral] = useState(false);
  const [newCandidateSkills, setNewCandidateSkills] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [candidateUploadMode, setCandidateUploadMode] = useState<"single" | "bulk">(
    "single",
  );
  const [addingCandidate, setAddingCandidate] = useState(false);
  const [candidateStageFilter, setCandidateStageFilter] =
    useState<string>("all");
  const [candidateItemFilter, setCandidateItemFilter] = useState<
    number | "all"
  >("all");
  const [atsBoardItemId, setAtsBoardItemId] = useState<number | null>(null);
  const [reqInterviews, setReqInterviews] = useState<Interview[]>([]);
  const [reqInterviewsLoading, setReqInterviewsLoading] = useState(false);
  const [shortlistBulkAppIds, setShortlistBulkAppIds] = useState<number[]>([]);
  const [shortlistBulkWorking, setShortlistBulkWorking] = useState(false);
  const [sendShortlistEmailAppId, setSendShortlistEmailAppId] = useState<
    number | null
  >(null);
  const [shortlistEmailOk, setShortlistEmailOk] = useState<string | null>(null);
  const [pipelineCompact, setPipelineCompact] =
    useState<ApplicationsPipelineResponse | null>(null);
  const [pipelineFull, setPipelineFull] =
    useState<ApplicationsPipelineResponse | null>(null);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [pipelineFullLoading, setPipelineFullLoading] = useState(false);
  const [expandedPipelineStage, setExpandedPipelineStage] = useState<
    string | null
  >(null);
  const [rankingData, setRankingData] =
    useState<RequisitionItemRankingResponse | null>(null);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingRefreshing, setRankingRefreshing] = useState(false);
  const [aiEvalWorking, setAiEvalWorking] = useState(false);
  const [rankingError, setRankingError] = useState<string | null>(null);
  const [atsBucketsData, setAtsBucketsData] =
    useState<ApplicationsAtsBucketsResponse | null>(null);
  const [atsBucketsError, setAtsBucketsError] = useState<string | null>(null);
  const [pipelineJdTextDraft, setPipelineJdTextDraft] = useState("");
  const [useRequisitionJd, setUseRequisitionJd] = useState(true);
  const [pipelineJdSaving, setPipelineJdSaving] = useState(false);
  const [pipelineJdUploading, setPipelineJdUploading] = useState(false);
  const [pipelineJdMessage, setPipelineJdMessage] = useState<string | null>(
    null,
  );
  const [pipelineJdFeedback, setPipelineJdFeedback] =
    useState<PipelineJdFeedback>("neutral");
  const pipelineJdFileInputRef = useRef<HTMLInputElement>(null);
  const lastAtsFocusRefreshAtRef = useRef<number>(0);
  const pipelineCompactLoadInFlightRef = useRef(false);
  const atsAutoAiEvalRunKeyRef = useRef<string | null>(null);
  const [rankingRequiredSkillsDraft, setRankingRequiredSkillsDraft] =
    useState("");
  /** Phase 2: hide pipeline board, ranking, buckets, and Kanban unless expanded. */
  const [pipelineAdvancedOpen, setPipelineAdvancedOpen] = useState(false);

  const candidatesByItemId = useMemo(() => {
    const m = new Map<number, Candidate[]>();
    for (const c of candidates) {
      const id = c.requisition_item_id;
      if (id == null) continue;
      const arr = m.get(id) ?? [];
      arr.push(c);
      m.set(id, arr);
    }
    return m;
  }, [candidates]);

  const shortlistedCandidatesForTable = useMemo(() => {
    return candidates.filter(
      (c) =>
        c.current_stage === "Shortlisted" &&
        (candidateItemFilter === "all" ||
          c.requisition_item_id === candidateItemFilter),
    );
  }, [candidates, candidateItemFilter]);

  const interviewingCandidatesForTable = useMemo(() => {
    return candidates.filter(
      (c) =>
        c.current_stage === "Interviewing" &&
        (candidateItemFilter === "all" ||
          c.requisition_item_id === candidateItemFilter),
    );
  }, [candidates, candidateItemFilter]);

  const openCandidateModal = useCallback(
    (c: Candidate, workspace: "evaluate" | "execute") => {
      const q = new URLSearchParams();
      if (c.application_id != null) {
        q.set("application_id", String(c.application_id));
      }
      q.set("workspace", workspace);
      if (pathname) {
        q.set("returnTo", pathname);
      }
      router.push(`${candidateBasePath}/${c.candidate_id}?${q.toString()}`);
    },
    [router, pathname, candidateBasePath],
  );

  const pipelineCountByStage = useMemo(() => {
    const out: Record<string, number> = {};
    for (const row of pipelineCompact?.stages ?? []) {
      out[row.stage] = row.count;
    }
    return out;
  }, [pipelineCompact]);

  const expandedStageApplications = useMemo(() => {
    if (!expandedPipelineStage) {
      return [];
    }
    const stageRow = (pipelineFull?.stages ?? []).find(
      (s) => s.stage === expandedPipelineStage && "applications" in s,
    );
    if (!stageRow || !("applications" in stageRow)) {
      return [];
    }
    return stageRow.applications;
  }, [expandedPipelineStage, pipelineFull]);

  const rankingItemId = useMemo(() => {
    return atsBoardItemId ?? ticket?.items?.[0]?.numericItemId ?? null;
  }, [atsBoardItemId, ticket?.items]);

  const atsBoardRequiredExperienceYears = useMemo(() => {
    if (!ticket?.items?.length) return null;
    const itemId = atsBoardItemId ?? ticket.items[0]?.numericItemId ?? null;
    if (itemId == null) return null;
    const item = ticket.items.find((i) => i.numericItemId === itemId);
    const explicit = item?.experience ?? null;
    if (explicit != null && Number.isFinite(explicit) && explicit >= 0) {
      return explicit;
    }
    if ((item?.level ?? "").trim().toLowerCase() === "fresher") {
      return 0;
    }
    const fromReq = extractRequiredYearsFromText(item?.requirements);
    if (fromReq != null && Number.isFinite(fromReq) && fromReq > 0) {
      return fromReq;
    }
    const fromDesc = extractRequiredYearsFromText(item?.description);
    if (fromDesc != null && Number.isFinite(fromDesc) && fromDesc > 0) {
      return fromDesc;
    }
    return null;
  }, [atsBoardItemId, ticket?.items]);

  const atsBoardScoreByCandidateId = useMemo(() => {
    const m = new Map<
      number,
      {
        final_score: number | null;
        ai_status: "OK" | "PENDING" | "UNAVAILABLE";
        ai_summary?: string;
      }
    >();
    for (const rc of rankingData?.ranked_candidates ?? []) {
      m.set(rc.candidate_id, {
        final_score: rc.score.final_score,
        ai_status: rc.score.ai_status,
        ai_summary: rc.score.ai_summary,
      });
    }
    return m;
  }, [rankingData]);

  const atsBoardExperienceFlagByCandidateId = useMemo(() => {
    const m = new Map<number, ExperienceFitFlag>();
    const requiredYears = atsBoardRequiredExperienceYears;
    const profileYearsByCandidateId = new Map<number, number | null>();
    for (const c of candidates) {
      profileYearsByCandidateId.set(c.candidate_id, c.total_experience_years ?? null);
    }
    for (const rc of rankingData?.ranked_candidates ?? []) {
      const candidateYearsFromRanking =
        rc.explain.ranking_signals?.ats?.experience_years ?? null;
      const candidateYears =
        candidateYearsFromRanking ??
        profileYearsByCandidateId.get(rc.candidate_id) ??
        null;
      const fit = resolveExperienceFitFlag(requiredYears, candidateYears);
      if (fit) {
        m.set(rc.candidate_id, fit);
      }
    }
    return m;
  }, [rankingData, atsBoardRequiredExperienceYears, candidates]);

  const candidateFromApplicationRecord = useCallback(
    (app: ApplicationRecord): Candidate => ({
      candidate_id: app.candidate_id,
      person_id: app.candidate.person_id,
      application_id: app.application_id,
      requisition_item_id: app.requisition_item_id,
      requisition_id: app.requisition_id,
      full_name: app.candidate.full_name,
      email: app.candidate.email,
      phone: app.candidate.phone,
      resume_path: app.candidate.resume_path ?? null,
      current_stage: app.current_stage,
      added_by: app.created_by,
      source: app.source,
      created_at: app.created_at,
      updated_at: app.updated_at,
      stage_history: app.stage_history ?? [],
      interviews: [],
    }),
    [],
  );

  const openEvaluateFromAtsApp = useCallback(
    (app: ApplicationRecord) => {
      const existing = candidates.find((c) => c.candidate_id === app.candidate_id);
      openCandidateModal(
        existing ?? candidateFromApplicationRecord(app),
        "evaluate",
      );
    },
    [candidates, candidateFromApplicationRecord, openCandidateModal],
  );

  const rankingBreakdownSnippet = (breakdown: Record<string, unknown>) => {
    const ai = breakdown.ai_summary;
    if (typeof ai === "string" && ai.trim()) {
      const t = ai.trim();
      return t.length > 140 ? `${t.slice(0, 137)}…` : t;
    }
    const risks = breakdown.ai_risks;
    if (Array.isArray(risks) && risks.length > 0) {
      const first = risks[0];
      if (typeof first === "string" && first.trim()) {
        return first.length > 120 ? `${first.slice(0, 117)}…` : first;
      }
    }
    return "";
  };

  const pipelineRankingTargetItem = useMemo(() => {
    if (!ticket?.items.length) return null;
    const id = rankingItemId ?? ticket.items[0]?.numericItemId ?? null;
    if (id == null) return null;
    return ticket.items.find((i) => i.numericItemId === id) ?? null;
  }, [ticket, rankingItemId]);

  const canEditPipelineRankingJd = useMemo(
    () =>
      userRoles.some((r) =>
        ["ta", "hr", "admin", "owner", "manager"].includes(r.toLowerCase()),
      ),
    [userRoles],
  );

  const requisitionLineOptions = useMemo(
    () =>
      (ticket?.items ?? []).map((it) => ({
        numericItemId: it.numericItemId,
        skill: it.skill,
        level: it.level,
      })),
    [ticket?.items],
  );

  const showIgnoredCustomJdNote = useMemo(
    () =>
      useRequisitionJd &&
      !!pipelineRankingTargetItem &&
      (Boolean(pipelineRankingTargetItem.pipelineJdText?.trim()) ||
        Boolean(pipelineRankingTargetItem.pipelineJdFileKey)),
    [useRequisitionJd, pipelineRankingTargetItem],
  );

  const openEvaluateFromPipelineRecord = useCallback(
    (app: ApplicationRecord) => {
      openCandidateModal(
        {
          candidate_id: app.candidate_id,
          application_id: app.application_id,
          requisition_item_id: app.requisition_item_id,
          requisition_id: app.requisition_id,
          full_name: app.candidate.full_name,
          email: app.candidate.email,
          phone: app.candidate.phone,
          resume_path: null,
          current_stage: app.current_stage,
          added_by: app.created_by,
          source: app.source,
          created_at: app.created_at,
          updated_at: app.updated_at,
          stage_history: app.stage_history ?? [],
          interviews: [],
        },
        "evaluate",
      );
    },
    [openCandidateModal],
  );

  const resolveUserName = (userId?: number | null) => {
    if (!userId) return "System";
    return usersById[userId] ?? `User #${userId}`;
  };

  const parseBudgetNote = () => {
    const budgetLog = auditLogs.find((log) => log.action === "BUDGET_UPDATE");
    if (!budgetLog?.new_value) return undefined;
    try {
      const newValue = JSON.parse(budgetLog.new_value);
      const oldValue = budgetLog.old_value
        ? JSON.parse(budgetLog.old_value)
        : {};
      if (newValue?.budget_amount !== undefined) {
        return `Budget updated from ${oldValue?.budget_amount ?? "—"} to ${newValue.budget_amount}.`;
      }
    } catch {
      return undefined;
    }
    return undefined;
  };

  const buildTicket = (req: BackendRequisition): TicketData => {
    const createdAt = req.created_at ? new Date(req.created_at) : null;
    const now = new Date();
    const daysOpen = createdAt
      ? Math.max(0, Math.ceil((now.getTime() - createdAt.getTime()) / 86400000))
      : 0;
    const budget = req.budget_amount
      ? new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: "INR",
          maximumFractionDigits: 0,
        }).format(req.budget_amount)
      : "—";

    const assignedTAId = req.assigned_ta ?? null;
    return {
      id: `REQ-${req.req_id}`,
      ticketId: `REQ-${req.req_id}`,
      projectName: req.project_name ?? "-",
      projectCode: `REQ-${req.req_id}`,
      client: req.client_name ?? "-",
      projectManager: req.raised_by ? `User #${req.raised_by}` : "-",
      requiredBy: req.required_by_date ?? "",
      workMode: req.work_mode ?? "-",
      location: req.office_location ?? "-",
      priority: req.priority ?? "-",
      overallStatus: req.overall_status ?? "-",
      justification: req.justification ?? "-",
      dateCreated: req.created_at ?? "",
      assignedTA: assignedTAId ? `User #${assignedTAId}` : "Unassigned",
      assignedTAId,
      raisedById: req.raised_by ?? null,
      approvedBy: req.approved_by ?? null,
      budgetApprovedBy: req.budget_approved_by ?? null,
      approvalHistory: req.approval_history ?? null,
      assignedAt: req.assigned_at ?? null,
      createdAt: req.created_at ?? null,
      daysOpen,
      slaHours: 72,
      budget,
      projectDuration: req.duration ?? "—",
      items:
        req.items?.map((item) => ({
          id: `ITEM-${item.item_id}`,
          numericItemId: item.item_id, // Phase 7: Numeric ID for API
          skill: item.role_position,
          level: item.skill_level ?? "-",
          experience: item.experience_years ?? 0,
          education: item.education_requirement ?? "-",
          itemStatus: item.item_status,
          description: item.job_description,
          assignedTAId: item.assigned_ta ?? null, // Phase 7: Item-level TA
          requirements: item.requirements ?? undefined,
          replacementHire: item.replacement_hire ?? false,
          replacedEmpId: item.replaced_emp_id ?? null,
          estimatedBudget: item.estimated_budget ?? null,
          approvedBudget: item.approved_budget ?? null,
          currency: item.currency ?? "INR",
          jdFileKey: (item as BackendRequisitionItem).jd_file_key ?? null,
          cvFileUrl: (item as BackendRequisitionItem).cv_file_key
            ? `/api/requisitions/items/${item.item_id}/cv`
            : undefined,
          cvFileName: (item as BackendRequisitionItem).cv_file_name ?? undefined,
          pipelineRankingUseRequisitionJd:
            item.pipeline_ranking_use_requisition_jd !== false,
          pipelineJdText: item.pipeline_jd_text ?? null,
          pipelineJdFileKey: item.pipeline_jd_file_key ?? null,
          rankingRequiredSkills: item.ranking_required_skills ?? null,
        })) ?? [],
      timeline: [],
      notes: [],
    };
  };

  useEffect(() => {
    if (!canAssignResources && selectedItemForAssignment) {
      setSelectedItemForAssignment(null);
    }
  }, [canAssignResources, selectedItemForAssignment]);

  useEffect(() => {
    let isMounted = true;
    const reqId = parseReqId(effectiveTicketId);

    if (!reqId) {
      setError("Invalid requisition id");
      setIsLoading(false);
      return;
    }

    const fetchRequisition = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await apiClient.get<BackendRequisition>(
          `/requisitions/${reqId}`,
        );
        if (isMounted) {
          const built = buildTicket(response.data);
          setTicket(built);
          const statusMap: Record<string, string> = {};
          built.items.forEach((item) => {
            statusMap[item.id] = item.itemStatus;
          });
          initialItemStatusesRef.current = statusMap;
        }
      } catch (err) {
        if (!isMounted) return;
        const message =
          err instanceof Error ? err.message : "Failed to load requisition";
        setError(message);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    // Phase 2: only the requisition header is needed to render the page
    // shell. status-history, audit-logs, and the users list are gated to
    // the tabs that actually consume them (see effects below).
    fetchRequisition();

    return () => {
      isMounted = false;
    };
  }, [effectiveTicketId]);

  // Phase 2 - per-tab loaders. Each runs only when its tab is active. The
  // previous "fan out four GETs at mount" pattern was the dominant cause
  // of the post-click stutter when the requisition detail page opens.
  useEffect(() => {
    if (activeTab !== "timeline") return;
    const reqId = parseReqId(effectiveTicketId);
    if (!reqId) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await apiClient.get<StatusHistoryEntry[]>(
          `/requisitions/${reqId}/status-history`,
        );
        if (!cancelled) setStatusHistory(response.data ?? []);
      } catch {
        if (!cancelled) setStatusHistory([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, effectiveTicketId]);

  useEffect(() => {
    if (activeTab !== "timeline") return;
    const reqId = parseReqId(effectiveTicketId);
    if (!reqId) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await apiClient.get<AuditLogEntry[]>(
          `/audit-logs?entity_name=requisition&entity_id=${reqId}`,
        );
        if (!cancelled) setAuditLogs(response.data ?? []);
      } catch {
        if (!cancelled) setAuditLogs([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, effectiveTicketId]);

  useEffect(() => {
    // The user list is consumed by Items / Candidates / Timeline tabs to
    // resolve usernames. Lazy-load only when one of those tabs is active.
    const needsUsers =
      activeTab === "items" ||
      activeTab === "candidates" ||
      activeTab === "timeline";
    if (!needsUsers) return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await getUsersListCached<UserDirectoryEntry>();
        if (cancelled) return;
        const map: Record<number, string> = {};
        rows.forEach((userEntry) => {
          map[userEntry.user_id] = userEntry.username;
        });
        setUsersById(map);
      } catch {
        if (!cancelled) setUsersById({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  // ---- Load candidates when requisition is available ----
  const loadCandidates = useCallback(async () => {
    const reqId = parseReqId(effectiveTicketId);
    if (!reqId) return;
    setCandidatesLoading(true);
    try {
      const data = await fetchCandidatesFromApplications({
        requisition_id: reqId,
      });
      setCandidates(data);
    } catch {
      setCandidates([]);
    } finally {
      setCandidatesLoading(false);
    }
  }, [effectiveTicketId]);

  const loadPipelineCompact = useCallback(async () => {
    const reqId = parseReqId(effectiveTicketId);
    if (!reqId) return;
    if (pipelineCompactLoadInFlightRef.current) return;
    pipelineCompactLoadInFlightRef.current = true;
    setPipelineLoading(true);
    try {
      const data = await fetchApplicationsPipeline({
        requisition_id: candidateItemFilter === "all" ? reqId : undefined,
        requisition_item_id:
          candidateItemFilter === "all" ? undefined : candidateItemFilter,
        compact: true,
      });
      setPipelineCompact(data);
    } catch {
      setPipelineCompact(null);
    } finally {
      setPipelineLoading(false);
      pipelineCompactLoadInFlightRef.current = false;
    }
  }, [effectiveTicketId, candidateItemFilter]);

  const loadPipelineFull = useCallback(async () => {
    const reqId = parseReqId(effectiveTicketId);
    if (!reqId) return;
    setPipelineFullLoading(true);
    try {
      const data = await fetchApplicationsPipeline({
        requisition_id: candidateItemFilter === "all" ? reqId : undefined,
        requisition_item_id:
          candidateItemFilter === "all" ? undefined : candidateItemFilter,
      });
      setPipelineFull(data);
    } catch {
      setPipelineFull(null);
    } finally {
      setPipelineFullLoading(false);
    }
  }, [effectiveTicketId, candidateItemFilter]);

  const handlePipelineSectionRefresh = useCallback(() => {
    void loadPipelineCompact();
    if (expandedPipelineStage) {
      setPipelineFull(null);
      void loadPipelineFull();
    }
  }, [loadPipelineCompact, loadPipelineFull, expandedPipelineStage]);

  const loadRanking = useCallback(
    async (forceRecompute = false) => {
      if (!rankingItemId) {
        setRankingData(null);
        setRankingError(null);
        setAtsBucketsData(null);
        setAtsBucketsError(null);
        return;
      }
      if (forceRecompute) {
        setRankingRefreshing(true);
      } else {
        setRankingLoading(true);
      }
      setRankingError(null);
      setAtsBucketsError(null);
      try {
        if (forceRecompute) {
          await recomputeRequisitionItemRanking(rankingItemId);
        }
        const data = await fetchRequisitionItemRanking(rankingItemId, { aiEval: true });
        setRankingData(data);
        try {
          const ab = await fetchApplicationsAtsBuckets(rankingItemId);
          setAtsBucketsData(ab);
          setAtsBucketsError(null);
        } catch {
          setAtsBucketsData(null);
          setAtsBucketsError(
            "Could not load quality buckets. Use Refresh to try again.",
          );
        }
      } catch {
        setRankingData(null);
        setAtsBucketsData(null);
        setAtsBucketsError(null);
        setRankingError("Unable to load ranking for this position.");
      } finally {
        setRankingLoading(false);
        setRankingRefreshing(false);
      }
    },
    [rankingItemId],
  );

  const runAiEvalAllPresent = useCallback(async (recomputeFirst = false) => {
    if (!rankingItemId) return;
    if (recomputeFirst) {
      try {
        await recomputeRequisitionItemRanking(rankingItemId);
      } catch {
        // Continue with best-effort fetch below.
      }
    }
    // Always read a fresh ranking snapshot so newly created/bulk-uploaded candidates
    // are included even before React state reconciliation completes.
    let sourceRanking = rankingData;
    try {
      sourceRanking = await fetchRequisitionItemRanking(rankingItemId, { aiEval: true });
      setRankingData(sourceRanking);
    } catch {
      // Keep existing in-memory ranking data as fallback.
    }
    const ids = Array.from(
      new Set((sourceRanking?.ranked_candidates ?? []).map((rc) => rc.candidate_id)),
    );
    if (ids.length === 0) {
      setTransitionError("No ranked candidates found to evaluate.");
      return;
    }
    setAiEvalWorking(true);
    setTransitionError(null);
    try {
      await runAiEvaluationForRequisitionItem(rankingItemId, {
        candidate_ids: ids,
        force: false,
      });
      await loadRanking(false);
    } catch (err: unknown) {
      setTransitionError(
        getCandidateActionErrorMessage(err, "AI evaluation failed"),
      );
    } finally {
      setAiEvalWorking(false);
    }
  }, [loadRanking, rankingItemId, rankingData?.ranked_candidates]);

  const runAiEvalForUnscoredCandidates = useCallback(async () => {
    if (!rankingItemId) return;
    let sourceRanking = rankingData;
    try {
      sourceRanking = await fetchRequisitionItemRanking(rankingItemId, { aiEval: true });
      setRankingData(sourceRanking);
    } catch {
      // Keep existing in-memory ranking data as fallback.
    }

    const unscored = (sourceRanking?.ranked_candidates ?? []).filter(
      (rc) =>
        rc.score.ai_status !== "OK" ||
        rc.score.final_score == null ||
        !Number.isFinite(rc.score.final_score),
    );
    const ids = Array.from(new Set(unscored.map((rc) => rc.candidate_id)));
    if (ids.length === 0) {
      return;
    }

    setAiEvalWorking(true);
    setTransitionError(null);
    try {
      await runAiEvaluationForRequisitionItem(rankingItemId, {
        candidate_ids: ids,
        force: false,
      });
      await loadRanking(false);
      const labelList = unscored
        .map((c) => c.full_name)
        .filter(Boolean)
        .slice(0, 3)
        .join(", ");
      const more = unscored.length > 3 ? ` +${unscored.length - 3} more` : "";
      setTransitionSuccess(
        `Recovered scores for ${unscored.length} unscored candidate(s): ${labelList}${more}`,
      );
      setTimeout(() => setTransitionSuccess(null), 4000);
    } catch (err: unknown) {
      setTransitionError(
        getCandidateActionErrorMessage(
          err,
          "Some candidates were unscored. Automatic recovery failed.",
        ),
      );
    } finally {
      setAiEvalWorking(false);
    }
  }, [loadRanking, rankingItemId, rankingData]);

  const refetchRequisition = useCallback(async () => {
    const reqId = parseReqId(effectiveTicketId);
    if (!reqId) return;
    try {
      const response = await apiClient.get<BackendRequisition>(
        `/requisitions/${reqId}`,
      );
      const built = buildTicket(response.data);
      setTicket(built);
      const statusMap: Record<string, string> = {};
      built.items.forEach((item) => {
        statusMap[item.id] = item.itemStatus;
      });
      initialItemStatusesRef.current = statusMap;
    } catch {
      // Keep existing ticket on refetch error
    }
  }, [effectiveTicketId]);

  useEffect(() => {
    if (!pipelineRankingTargetItem) return;
    setUseRequisitionJd(
      pipelineRankingTargetItem.pipelineRankingUseRequisitionJd !== false,
    );
    setPipelineJdTextDraft(pipelineRankingTargetItem.pipelineJdText ?? "");
    setRankingRequiredSkillsDraft(
      (pipelineRankingTargetItem.rankingRequiredSkills ?? []).join(", "),
    );
    setPipelineJdMessage(null);
    setPipelineJdFeedback("neutral");
  }, [
    pipelineRankingTargetItem?.numericItemId,
    pipelineRankingTargetItem?.pipelineRankingUseRequisitionJd,
    pipelineRankingTargetItem?.pipelineJdText,
    pipelineRankingTargetItem?.pipelineJdFileKey,
    pipelineRankingTargetItem?.rankingRequiredSkills,
  ]);

  const savePipelineRankingJdSettings = async () => {
    if (!pipelineRankingTargetItem || !canEditPipelineRankingJd) return;
    const itemId = pipelineRankingTargetItem.numericItemId;
    setPipelineJdSaving(true);
    setPipelineJdMessage(null);
    setPipelineJdFeedback("neutral");
    try {
      const body: Record<string, unknown> = {
        use_requisition_jd: useRequisitionJd,
      };
      if (!useRequisitionJd) {
        body.pipeline_jd_text =
          pipelineJdTextDraft.trim() === "" ? null : pipelineJdTextDraft;
      }
      const skillParts = rankingRequiredSkillsDraft
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      body.ranking_required_skills =
        skillParts.length > 0 ? skillParts : null;
      await apiClient.patch(
        `/requisitions/items/${itemId}/pipeline-ranking-jd`,
        body,
      );
      await refetchRequisition();
      setPipelineJdMessage("Saved.");
      setPipelineJdFeedback("success");
      void loadRanking(true);
    } catch (err: unknown) {
      setPipelineJdMessage(
        getCandidateActionErrorMessage(
          err,
          "Failed to save ranking JD settings",
        ),
      );
      setPipelineJdFeedback("error");
    } finally {
      setPipelineJdSaving(false);
    }
  };

  const uploadPipelineRankingJdPdf = async (file: File) => {
    if (!pipelineRankingTargetItem || !canEditPipelineRankingJd) return;
    const itemId = pipelineRankingTargetItem.numericItemId;
    setPipelineJdUploading(true);
    setPipelineJdMessage(null);
    setPipelineJdFeedback("neutral");
    try {
      const fd = new FormData();
      fd.append("jd_file", file);
      await apiClient.post(
        `/requisitions/items/${itemId}/pipeline-ranking-jd/upload`,
        fd,
      );
      await refetchRequisition();
      setUseRequisitionJd(false);
      setPipelineJdMessage(
        "PDF uploaded. Rankings were recomputed for this item.",
      );
      setPipelineJdFeedback("success");
      void loadRanking(true);
    } catch (err: unknown) {
      setPipelineJdMessage(
        getCandidateActionErrorMessage(err, "Failed to upload ranking JD PDF"),
      );
      setPipelineJdFeedback("error");
    } finally {
      setPipelineJdUploading(false);
    }
  };

  const removePipelineRankingJdPdf = async () => {
    if (!pipelineRankingTargetItem || !canEditPipelineRankingJd) return;
    const itemId = pipelineRankingTargetItem.numericItemId;
    setPipelineJdUploading(true);
    setPipelineJdMessage(null);
    setPipelineJdFeedback("neutral");
    try {
      await apiClient.delete(
        `/requisitions/items/${itemId}/pipeline-ranking-jd/upload`,
      );
      await refetchRequisition();
      setPipelineJdMessage("Pipeline ranking PDF removed.");
      setPipelineJdFeedback("success");
      void loadRanking(true);
    } catch (err: unknown) {
      setPipelineJdMessage(
        getCandidateActionErrorMessage(err, "Failed to remove ranking PDF"),
      );
      setPipelineJdFeedback("error");
    } finally {
      setPipelineJdUploading(false);
    }
  };

  // Phase 2 - candidates are only required by the "candidates", "ats",
  // and "interviews" tabs. The previous mount-time `loadCandidates()` was
  // a major contributor to TTFB clusters when opening a requisition.
  useEffect(() => {
    const needsCandidates =
      activeTab === "candidates" ||
      activeTab === "ats" ||
      activeTab === "interviews";
    if (!needsCandidates) return;
    void loadCandidates();
  }, [activeTab, loadCandidates]);

  useEffect(() => {
    if (!ticket?.items.length) {
      setAtsBoardItemId(null);
      return;
    }
    setAtsBoardItemId((prev) => {
      if (prev != null && ticket.items.some((i) => i.numericItemId === prev)) {
        return prev;
      }
      return ticket.items[0]!.numericItemId;
    });
  }, [ticket?.items]);

  useAtsTabInitialLoad(activeTab, rankingItemId, loadRanking);
  useAtsAiScoreStream(
    activeTab === "ats" && rankingItemId != null,
    rankingItemId,
    atsBucketsData,
    rankingData,
    setRankingData,
  );

  // Phase 4: the auto-"recover unscored" effect was removed. It used to
  // re-fire on every render that surfaced any PENDING/missing AI score,
  // which compounded with the now-deleted 4 s polling and the old
  // `loadCandidates` effect. Recovery is now opt-in via the explicit
  // "Run AI evaluation" button in the ATS tab; backfill of stale jobs is
  // owned by the periodic `ai-eval-backfill` worker (Phase 7).
  void atsAutoAiEvalRunKeyRef;
  void runAiEvalForUnscoredCandidates;

  useEffect(() => {
    const maybeRefresh = () => {
      if (activeTab !== "ats" || !rankingItemId) return;
      const now = Date.now();
      if (now - lastAtsFocusRefreshAtRef.current < 1500) return;
      lastAtsFocusRefreshAtRef.current = now;
      void loadRanking(false);
    };

    const onFocus = () => maybeRefresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        maybeRefresh();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [activeTab, rankingItemId, loadRanking]);

  useEffect(() => {
    const reqId = parseReqId(effectiveTicketId);
    if (activeTab !== "interviews" || reqId == null) {
      return;
    }
    let cancelled = false;
    setReqInterviewsLoading(true);
    void fetchInterviews({ requisitionId: reqId })
      .then((rows) => {
        if (!cancelled) setReqInterviews(rows);
      })
      .catch(() => {
        if (!cancelled) setReqInterviews([]);
      })
      .finally(() => {
        if (!cancelled) setReqInterviewsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, effectiveTicketId]);

  useEffect(() => {
    if (activeTab !== "interviews") {
      return;
    }
    void loadCandidates();
  }, [activeTab, loadCandidates]);

  useEffect(() => {
    setShortlistBulkAppIds([]);
  }, [candidateItemFilter]);

  useEffect(() => {
    if (activeTab !== "ats" || !pipelineAdvancedOpen) {
      return;
    }
    void loadPipelineCompact();
  }, [activeTab, pipelineAdvancedOpen, loadPipelineCompact]);

  useEffect(() => {
    if (activeTab !== "ats") {
      return;
    }
    if (candidateItemFilter === "all") {
      return;
    }
    const n =
      typeof candidateItemFilter === "number"
        ? candidateItemFilter
        : Number.parseInt(String(candidateItemFilter), 10);
    if (Number.isNaN(n) || n <= 0) {
      return;
    }
    setAtsBoardItemId((current) => (current === n ? current : n));
  }, [activeTab, candidateItemFilter, setAtsBoardItemId]);

  useEffect(() => {
    if (!expandedPipelineStage) {
      return;
    }
    if (pipelineFull) {
      return;
    }
    void loadPipelineFull();
  }, [expandedPipelineStage, pipelineFull, loadPipelineFull]);

  useEffect(() => {
    setExpandedPipelineStage(null);
    setPipelineFull(null);
  }, [candidateItemFilter]);

  // Load JD PDF for viewer when modal opens (item-level endpoint)
  useEffect(() => {
    if (!showJdViewer || !jdItemId) {
      if (jdBlobUrl) {
        URL.revokeObjectURL(jdBlobUrl);
        setJdBlobUrl(null);
      }
      return;
    }
    let objectUrl: string | null = null;
    const loadJd = async () => {
      setLoadingJd(true);
      try {
        const response = await apiClient.get<Blob>(
          `/requisitions/items/${jdItemId}/jd`,
          { responseType: "blob" },
        );
        objectUrl = URL.createObjectURL(response.data as Blob);
        setJdBlobUrl(objectUrl);
      } catch {
        setJdBlobUrl(null);
      } finally {
        setLoadingJd(false);
      }
    };
    void loadJd();
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setJdBlobUrl(null);
    };
  }, [showJdViewer, jdItemId]);

  const closeJdViewer = () => {
    setShowJdViewer(false);
    setJdItemId(null);
    if (jdBlobUrl) {
      URL.revokeObjectURL(jdBlobUrl);
      setJdBlobUrl(null);
    }
  };

  const openJdViewerForItem = (itemId: number) => {
    setJdItemId(itemId);
    setShowJdViewer(true);
  };

  const handleBulkShortlistToInterviewing = async () => {
    if (!shortlistBulkAppIds.length) return;
    setShortlistBulkWorking(true);
    setTransitionError(null);
    try {
      const targets = shortlistedCandidatesForTable.filter(
        (c) =>
          c.application_id != null &&
          shortlistBulkAppIds.includes(c.application_id),
      );
      let failures = 0;
      let lastDetail: string | null = null;
      for (const c of targets) {
        if (c.current_stage !== "Shortlisted") continue;
        try {
          await updateCandidateStageCompatible(c, { new_stage: "Interviewing" });
        } catch (err: unknown) {
          failures += 1;
          lastDetail = getCandidateActionErrorMessage(
            err,
            "Could not move to Interviewing",
          );
        }
      }
      if (failures === 0) {
        setShortlistBulkAppIds([]);
      } else {
        setTransitionError(
          failures === targets.length
            ? (lastDetail ?? "Bulk stage update failed.")
            : `${failures} of ${targets.length} updates failed. ${lastDetail ?? ""}`.trim(),
        );
      }
      await loadCandidates();
      void loadPipelineCompact();
    } finally {
      setShortlistBulkWorking(false);
    }
  };

  const handleSendShortlistEmail = async (applicationId: number) => {
    setSendShortlistEmailAppId(applicationId);
    setTransitionError(null);
    try {
      const r = await sendShortlistEmail(applicationId);
      if (r.enqueued) {
        if (r.real_email) {
          setShortlistEmailOk("Shortlist email was sent to the candidate’s inbox.");
        } else {
          setShortlistEmailOk(
            r.hint?.trim() ||
              "This server is not using SMTP (or a webhook), so the message was not delivered to a real inbox. Check the Next.js server terminal for the log, or set SMTP_HOST + SMTP_USER/SMTP_PASS in .env.local and restart dev.",
          );
        }
        window.setTimeout(() => setShortlistEmailOk(null), r.real_email ? 5000 : 12000);
      } else {
        setShortlistEmailOk(
          r.message?.trim() ||
            "No new email was queued. Check that lifecycle notifications are enabled.",
        );
        window.setTimeout(() => setShortlistEmailOk(null), 8000);
      }
    } catch (err: unknown) {
      setShortlistEmailOk(null);
      setTransitionError(
        getCandidateActionErrorMessage(
          err,
          "Could not send shortlist email. Try again or check your connection.",
        ),
      );
    } finally {
      setSendShortlistEmailAppId(null);
    }
  };

  // ---- Add candidate handler ----
  const handleAddCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket || !addCandidateItemId) return;
    if (candidateUploadMode === "bulk") return;
    setAddingCandidate(true);
    setTransitionError(null);
    try {
      let resumePath: string | undefined;
      if (resumeFile) {
        const uploaded = await uploadResume(resumeFile);
        resumePath = uploaded.file_url;
      }
      const reqId = parseReqId(effectiveTicketId);
      if (!reqId) return;
      const skillList = newCandidateSkills
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const expRaw = newCandidateExp.trim();
      const expNum =
        expRaw === "" ? undefined : Number.parseFloat(expRaw);
      const noticeRaw = newCandidateNotice.trim();
      const noticeNum =
        noticeRaw === "" ? undefined : Number.parseInt(noticeRaw, 10);
      const created = await createCandidate({
        requisition_item_id: addCandidateItemId,
        requisition_id: reqId,
        full_name: newCandidateName.trim(),
        email: newCandidateEmail.trim(),
        phone: newCandidatePhone.trim() || undefined,
        resume_path: resumePath,
        total_experience_years:
          expNum != null && Number.isFinite(expNum) ? expNum : null,
        notice_period_days:
          noticeNum != null && Number.isFinite(noticeNum) ? noticeNum : null,
        is_referral: newCandidateReferral,
        candidate_skills: skillList.length > 0 ? skillList : null,
      });
      // Reset form
      setNewCandidateName("");
      setNewCandidateEmail("");
      setNewCandidatePhone("");
      setNewCandidateExp("");
      setNewCandidateNotice("");
      setNewCandidateReferral(false);
      setNewCandidateSkills("");
      setResumeFile(null);
      // Keep the form mounted while we refresh data to avoid UI “glitches” from collapsing/expanding.
      // Refreshes can be slow (uploads + ranking), so we do them together, then close the form.
      await Promise.allSettled([loadCandidates(), loadPipelineCompact()]);

      /**
       * Root cause of "everyone becomes UNRANKED after adding a candidate":
       * - `recomputeRequisitionItemRanking()` creates a NEW `ranking_version_id`.
       * - ATS buckets read scores from `candidate_job_scores` for the LATEST ranking version.
       * - Until AI eval runs for that new version, all candidates appear UNRANKED.
       *
       * Fix: recompute first (so the new candidate is included), then run AI eval for ALL present
       * candidates to populate scores for the new ranking version (mostly cache hits), then refresh.
       */
      await recomputeRequisitionItemRanking(addCandidateItemId);
      try {
        const nextRanking = await fetchRequisitionItemRanking(addCandidateItemId, {
          aiEval: false,
        });
        const ids = Array.from(
          new Set((nextRanking?.ranked_candidates ?? []).map((rc) => rc.candidate_id)),
        );
        if (ids.length > 0) {
          await runAiEvaluationForRequisitionItem(addCandidateItemId, {
            candidate_ids: ids,
            force: false,
          });
        }
      } catch {
        // Best-effort: if AI eval fails here, the board may show UNRANKED until user triggers AI eval manually.
      }

      // Refresh the currently-selected ranking/buckets UI (without switching the user's context).
      if (rankingItemId === addCandidateItemId) {
        await loadRanking(false);
      }
      setPipelineFull(null);
      setShowAddCandidate(false);
      setAddCandidateItemId(null);
    } catch (err: any) {
      setTransitionError(
        getCandidateActionErrorMessage(err, "Failed to add candidate"),
      );
    } finally {
      setAddingCandidate(false);
    }
  };

  // ============================================================================
  // HOOKS THAT MUST BE CALLED BEFORE EARLY RETURNS (React Rules of Hooks)
  // ============================================================================

  // Phase 4: CV Upload Handler
  const handleCvUpload = useCallback(
    async (itemId: string, event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setCvUploading(itemId);
      setTransitionError(null);

      try {
        const numericId = Number.parseInt(itemId.replace("ITEM-", ""), 10);
        if (!Number.isFinite(numericId)) {
          throw new Error("Invalid item id");
        }
        const form = new FormData();
        form.append("cv_file", file);
        await apiClient.post(`/requisitions/items/${numericId}/cv`, form, {
          headers: { "Content-Type": "multipart/form-data" },
        });

        setTransitionSuccess(`CV uploaded: ${file.name}`);
        setTimeout(() => setTransitionSuccess(null), 3000);
        const reqId = parseReqId(effectiveTicketId);
        if (reqId) {
          const response = await apiClient.get<BackendRequisition>(
            `/requisitions/${reqId}`,
          );
          const built = buildTicket(response.data);
          setTicket(built);
        }
      } catch (err) {
        setTransitionError(
          err instanceof Error ? err.message : "Failed to upload CV",
        );
      } finally {
        setCvUploading(null);
        // allow re-uploading the same file
        event.target.value = "";
      }
    },
    [effectiveTicketId],
  );

  // Phase 4: Refresh requisition data
  const refreshRequisition = useCallback(async () => {
    const reqId = parseReqId(effectiveTicketId);
    if (!reqId) return;

    try {
      const response = await apiClient.get<BackendRequisition>(
        `/requisitions/${reqId}`,
      );
      const built = buildTicket(response.data);
      setTicket(built);
      const statusMap: Record<string, string> = {};
      built.items.forEach((item) => {
        statusMap[item.id] = item.itemStatus;
      });
      initialItemStatusesRef.current = statusMap;
    } catch {
      // Silent refresh failure
    }
  }, [effectiveTicketId]);

  // Phase 4: Item Workflow Transitions
  const handleItemTransition = useCallback(
    async (
      itemId: string,
      action: "shortlist" | "interview" | "offer" | "fulfill",
      employeeId?: string,
    ) => {
      const numericId = Number(itemId.replace("ITEM-", ""));
      if (isNaN(numericId)) {
        setTransitionError("Invalid item ID");
        return;
      }

      // Phase 7: Per-item authorization check
      const item = ticket?.items.find((i) => i.id === itemId);
      if (!item) {
        setTransitionError("Item not found");
        return;
      }

      // Phase 7: Check item-level TA permission
      if (!currentUserId) {
        setTransitionError("You must be logged in to update items.");
        return;
      }
      const isUserHRorAdmin = userRoles.some((r) =>
        ["hr", "admin"].includes(r.toLowerCase()),
      );

      const headerAssignedToMe =
        ticket?.assignedTAId != null && ticket.assignedTAId === currentUserId;
      const canUserEditItem = isUserHRorAdmin
        ? true
        : item.assignedTAId != null
          ? item.assignedTAId === currentUserId
          : headerAssignedToMe;

      if (!canUserEditItem) {
        setTransitionError(
          "You are not authorized to update this item. It is assigned to another TA.",
        );
        return;
      }

      // Phase 4: Shortlist requires CV upload
      if (action === "shortlist" && !item?.cvFileUrl) {
        setTransitionError("CV upload is mandatory before shortlisting");
        return;
      }

      setTransitioningItem(itemId);
      setTransitionError(null);
      setTransitionSuccess(null);

      try {
        switch (action) {
          case "shortlist":
            await shortlistItem(numericId);
            break;
          case "interview":
            await startInterview(numericId);
            break;
          case "offer":
            await makeOffer(numericId);
            break;
          case "fulfill":
            if (!employeeId) {
              throw new Error("Employee ID required for fulfillment");
            }
            await fulfillItem(numericId, employeeId);
            break;
        }

        setTransitionSuccess(
          `Item ${itemId} successfully moved to ${
            action === "shortlist"
              ? "Shortlisted"
              : action === "interview"
                ? "Interviewing"
                : action === "offer"
                  ? "Offered"
                  : "Fulfilled"
          }`,
        );

        // Refresh requisition data from backend
        await refreshRequisition();

        setTimeout(() => setTransitionSuccess(null), 3000);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Transition failed";
        const apiDetail =
          typeof err === "object" && err !== null && "response" in err
            ? (err as { response?: { data?: { detail?: string } } }).response
                ?.data?.detail
            : undefined;
        setTransitionError(apiDetail ?? message);
      } finally {
        setTransitioningItem(null);
      }
    },
    [ticket, refreshRequisition, currentUserId, userRoles],
  );

  // Phase 4: HR Kill Switch - Cancel Item
  const handleCancelItem = useCallback(async () => {
    if (!cancelModalItem || !cancelReason.trim()) {
      setCancelError("Reason is required for cancellation");
      return;
    }

    if (cancelReason.trim().length < 10) {
      setCancelError("Reason must be at least 10 characters");
      return;
    }

    const numericId = Number(cancelModalItem.replace("ITEM-", ""));
    if (isNaN(numericId)) {
      setCancelError("Invalid item ID");
      return;
    }

    setCancelling(true);
    setCancelError(null);

    try {
      await cancelItemApi(numericId, cancelReason.trim());

      setTransitionSuccess(`Item ${cancelModalItem} has been cancelled`);
      setCancelModalItem(null);
      setCancelReason("");

      // Refresh requisition data from backend
      await refreshRequisition();

      setTimeout(() => setTransitionSuccess(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Cancel failed";
      const apiDetail =
        typeof err === "object" && err !== null && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response
              ?.data?.detail
          : undefined;
      setCancelError(apiDetail ?? message);
    } finally {
      setCancelling(false);
    }
  }, [cancelModalItem, cancelReason, refreshRequisition]);

  // ============================================================================
  // EARLY RETURNS (after all hooks)
  // ============================================================================

  if (isLoading) {
    return (
      <div className="data-table-container">
        <div className="tickets-empty-state">Loading requisition…</div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="data-table-container">
        <div className="tickets-empty-state" style={{ color: "var(--error)" }}>
          {error ?? "Requisition not found"}
        </div>
      </div>
    );
  }

  const statusHistoryByStatus = statusHistory.reduce(
    (acc, entry) => {
      if (entry.new_status) {
        acc[entry.new_status] = entry;
      }
      return acc;
    },
    {} as Record<string, StatusHistoryEntry>,
  );

  const budgetNote = parseBudgetNote();

  const milestones = (() => {
    const steps: {
      id: string;
      title: string;
      actor: string;
      time?: string | null;
      note?: string;
      forceCompleted?: boolean;
    }[] = [];

    steps.push({
      id: "raised",
      title: "Requisition Raised",
      actor: resolveUserName(ticket.raisedById),
      time: ticket.createdAt ?? ticket.dateCreated,
    });

    if (ticket.budgetApprovedBy) {
      const budgetLog = auditLogs.find((log) => log.action === "BUDGET_UPDATE");
      const budgetTime =
        statusHistoryByStatus["Pending_HR"]?.changed_at ??
        statusHistoryByStatus["Pending HR Approval"]?.changed_at ??
        budgetLog?.performed_at ??
        ticket.createdAt ??
        null;
      steps.push({
        id: "budget",
        title: "Budget Cleared",
        actor: resolveUserName(ticket.budgetApprovedBy),
        time: budgetTime,
        note: budgetNote,
      });
    }

    if (ticket.approvedBy) {
      steps.push({
        id: "hr",
        title: "Validated by HR Admin",
        actor: resolveUserName(ticket.approvedBy),
        time: ticket.approvalHistory ?? null,
      });
    }

    if (ticket.assignedTAId) {
      const taAssignLog = auditLogs.find((log) => log.action === "TA_ASSIGN");
      steps.push({
        id: "ta",
        title: `Assigned to ${resolveUserName(ticket.assignedTAId)}`,
        actor:
          taAssignLog?.performed_by_full_name ||
          taAssignLog?.performed_by_username ||
          resolveUserName(taAssignLog?.performed_by),
        time: ticket.assignedAt ?? taAssignLog?.performed_at ?? null,
      });
    }

    const fulfilledItems = ticket.items.filter(
      (item) => item.itemStatus === "Fulfilled",
    );
    fulfilledItems.forEach((item) => {
      steps.push({
        id: `fulfilled-${item.id}`,
        title: `Position Fulfilled: ${item.skill}`,
        actor: item.assignedEmployeeName ?? "Assigned employee",
        time: null,
        note: "Fulfillment time not available in current data.",
        forceCompleted: true,
      });
    });

    {
      const normalized = normalizeStatus(ticket.overallStatus);
      if (
        normalized === "Fulfilled" ||
        normalized === "Cancelled" ||
        normalized === "Rejected"
      ) {
        steps.push({
          id: "fulfilled",
          title: `Requisition ${getStatusLabel(ticket.overallStatus)}`,
          actor: resolveUserName(statusHistoryByStatus[normalized]?.changed_by),
          time: statusHistoryByStatus[normalized]?.changed_at ?? null,
        });
      }
    }

    return steps;
  })();

  const firstPendingIndex = milestones.findIndex(
    (step) => !step.time && !step.forceCompleted,
  );
  const timelineWithStatus = milestones.map((step, index) => {
    const previous = milestones[index - 1];
    const timeValue = step.time ? new Date(step.time).getTime() : null;
    const previousTime = previous?.time
      ? new Date(previous.time).getTime()
      : null;
    const isDelayed =
      timeValue !== null &&
      previousTime !== null &&
      timeValue - previousTime > 48 * 60 * 60 * 1000;
    return {
      ...step,
      isDelayed,
      isCompleted:
        step.forceCompleted ||
        (firstPendingIndex === -1 ? true : index < firstPendingIndex),
      isCurrent: firstPendingIndex !== -1 && index === firstPendingIndex,
      isUpcoming: firstPendingIndex !== -1 && index > firstPendingIndex,
    };
  });

  const openPositions = ticket.items.filter(
    (item) =>
      item.itemStatus !== "Fulfilled" && item.itemStatus !== "Cancelled",
  ).length;
  const completionStats = {
    totalItems: ticket.items.length,
    fulfilled: ticket.items.filter((item) => item.itemStatus === "Fulfilled")
      .length,
    pending: ticket.items.filter((item) => item.itemStatus === "Pending")
      .length,
    cancelled: ticket.items.filter((item) => item.itemStatus === "Cancelled")
      .length,
    openPositions,
    progress:
      ticket.items.length > 0
        ? Math.round(
            (ticket.items.filter(
              (item) =>
                item.itemStatus === "Fulfilled" ||
                item.itemStatus === "Cancelled",
            ).length /
              ticket.items.length) *
              100,
          )
        : 0,
  };

  // Handle item status change
  const handleItemStatusChange = (
    itemId: string,
    newStatus: RequisitionItem["itemStatus"],
  ) => {
    if (!ticket) return;
    const updatedItems = ticket.items.map((item) =>
      item.id === itemId ? { ...item, itemStatus: newStatus } : item,
    );
    setTicket({ ...ticket, items: updatedItems });
    // NOTE: Overall status transitions are driven by the backend workflow engine.
    // Do NOT auto-set overallStatus here — save triggers the backend to evaluate.
  };

  // Handle employee assignment
  const handleAssignEmployee = (itemId: string, employeeId: string) => {
    // Legacy stub — assignments now go through the Candidate Pipeline
  };

  // Save changes
  const handleSave = async () => {
    if (!ticket) return;
    setIsSaving(true);

    try {
      const updates = ticket.items.filter((item) => {
        const original = initialItemStatusesRef.current[item.id];
        return original && original !== item.itemStatus;
      });

      await Promise.all(
        updates.map((item) => {
          const numericId = Number(item.id.replace("ITEM-", ""));
          return apiClient.patch(`/requisitions/items/${numericId}/status`, {
            status: item.itemStatus,
          });
        }),
      );

      const reqId = parseReqId(effectiveTicketId);
      if (reqId) {
        const response = await apiClient.get<BackendRequisition>(
          `/requisitions/${reqId}`,
        );
        const built = buildTicket(response.data);
        setTicket(built);
        const statusMap: Record<string, string> = {};
        built.items.forEach((item) => {
          statusMap[item.id] = item.itemStatus;
        });
        initialItemStatusesRef.current = statusMap;

        const historyResponse = await apiClient.get<StatusHistoryEntry[]>(
          `/requisitions/${reqId}/status-history`,
        );
        setStatusHistory(historyResponse.data ?? []);
      }

      setIsEditing(false);
      if (onUpdate) {
        onUpdate(ticket);
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Cancel editing
  const handleCancel = () => {
    setIsEditing(false);
  };

  // Add new note
  const handleAddNote = () => {
    if (!newNote.trim()) return;

    const newNoteObj = {
      date: getTodayDate(),
      user: "Current User",
      text: newNote,
    };

    setTicket((prev) =>
      prev ? { ...prev, notes: [...prev.notes, newNoteObj] } : prev,
    );
    setNewNote("");
  };

  // Tabs
  const tabs = [
    {
      id: "overview" as const,
      label: "Overview",
      icon: <FileText size={16} />,
    },
    {
      id: "items" as const,
      label: "Items",
      icon: <Briefcase size={16} />,
    },
    {
      id: "ats" as const,
      label: "ATS View",
      icon: <Target size={16} />,
    },
    {
      id: "shortlisted" as const,
      label: "Shortlisted",
      icon: <UserCheck size={16} />,
    },
    {
      id: "candidates" as const,
      label: "Candidates",
      icon: <Users size={16} />,
    },
    {
      id: "interviews" as const,
      label: "Interviews",
      icon: <Calendar size={16} />,
    },
    { id: "timeline" as const, label: "Timeline", icon: <History size={16} /> },
  ];

  const visibleTabs = isInterviewerRoute
    ? tabs.filter((tab) => tab.id !== "shortlisted" && tab.id !== "timeline")
    : tabs;

  const pipelineBindings: RequisitionPipelineBindings = {
    readOnly,
    activeTab,
    ticket,
    canEditItem,
    showAddCandidate,
    setShowAddCandidate,
    handleAddCandidate,
    candidateUploadMode,
    setCandidateUploadMode,
    addCandidateItemId,
    setAddCandidateItemId,
    newCandidateName,
    setNewCandidateName,
    newCandidateEmail,
    setNewCandidateEmail,
    newCandidatePhone,
    setNewCandidatePhone,
    newCandidateExp,
    setNewCandidateExp,
    newCandidateNotice,
    setNewCandidateNotice,
    newCandidateReferral,
    setNewCandidateReferral,
    newCandidateSkills,
    setNewCandidateSkills,
    resumeFile,
    setResumeFile,
    addingCandidate,
    rankingItemId,
    loadCandidates,
    loadPipelineCompact,
    loadRanking,
    atsBoardItemId,
    setAtsBoardItemId,
    rankingLoading,
    rankingRefreshing,
    rankingError,
    rankingData,
    aiEvalWorking,
    atsBucketsData,
    atsBucketsError,
    atsBoardScoreByCandidateId,
    atsBoardExperienceFlagByCandidateId,
    atsBoardRequiredExperienceYears,
    resolveExperienceFitFlag,
    openEvaluateFromAtsApp,
    rankingBreakdownSnippet,
    pipelineAdvancedOpen,
    setPipelineAdvancedOpen,
    pipelineLoading,
    pipelineCountByStage,
    expandedPipelineStage,
    setExpandedPipelineStage,
    handlePipelineSectionRefresh,
    pipelineFullLoading,
    expandedStageApplications,
    openEvaluateFromPipelineRecord,
    pipelineJdFileInputRef,
    uploadPipelineRankingJdPdf,
    removePipelineRankingJdPdf,
    pipelineJdUploading,
    pipelineJdSaving,
    savePipelineRankingJdSettings,
    pipelineJdMessage,
    pipelineJdFeedback,
    pipelineRankingTargetItem,
    canEditPipelineRankingJd,
    useRequisitionJd,
    setUseRequisitionJd,
    pipelineJdTextDraft,
    setPipelineJdTextDraft,
    rankingRequiredSkillsDraft,
    setRankingRequiredSkillsDraft,
    showIgnoredCustomJdNote,
    runAiEvalAllPresent,
    requisitionLineOptions,
    candidateItemFilter,
    setCandidateItemFilter,
    candidateStageFilter,
    setCandidateStageFilter,
    candidatesLoading,
    candidates,
    transitionError,
    setTransitionError,
    shortlistedCandidatesForTable,
    handleBulkShortlistToInterviewing,
    shortlistBulkAppIds,
    setShortlistBulkAppIds,
    shortlistBulkWorking,
    sendShortlistEmailAppId,
    handleSendShortlistEmail,
    shortlistEmailOk,
    setShortlistEmailOk,
    openCandidateModal,
    reqInterviews,
    reqInterviewsLoading,
    interviewingCandidatesForTable,
  };

  return (
    <div className="admin-content-area">
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "24px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <button
            onClick={() => (onBack ? onBack() : router.push("/ta/requisitions"))}
            className="action-button"
            style={{ display: "flex", alignItems: "center", gap: "8px" }}
          >
            <ArrowLeft size={16} />
            Back to Requisitions
          </button>
          <div>
            <h1
              style={{ fontSize: "20px", fontWeight: 600, marginBottom: "2px" }}
            >
              Requisition Details
            </h1>
            <p style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>
              {readOnly
                ? "Read-only requisition details"
                : "Manage and update resource requirements - HR/TA View"}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {readOnly ? null : !isEditing ? (
            <button
              className="action-button primary"
              onClick={() => setIsEditing(true)}
              style={{ display: "flex", alignItems: "center", gap: "8px" }}
            >
              <Edit size={16} />
              Edit Requisition
            </button>
          ) : (
            <>
              <button
                className="action-button"
                onClick={handleCancel}
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <X size={16} />
                Cancel
              </button>
              <button
                className="action-button primary"
                onClick={handleSave}
                disabled={isSaving}
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <Save size={16} />
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </>
          )}
          {/* <button className="action-button">
            <Download size={16} />
          </button>
          <button className="action-button">
            <Printer size={16} />
          </button> */}
        </div>
      </div>

      {/* Status & Progress */}
      <div
        style={{
          padding: "20px",
          marginBottom: "24px",
          backgroundColor: "var(--bg-primary)",
          borderRadius: "16px",
          border: "1px solid var(--border-subtle)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div
              style={{
                fontSize: "24px",
                fontWeight: 700,
                fontFamily: "monospace",
              }}
            >
              {ticket.ticketId}
            </div>
            <span className={getOverallStatusClass(ticket.overallStatus)}>
              {getStatusLabel(ticket.overallStatus)}
            </span>
            <span
              className={`priority-indicator priority-${ticket.priority.toLowerCase()}`}
            >
              {ticket.priority} Priority
            </span>
            <span
              className={`aging-indicator ${ticket.daysOpen <= 7 ? "aging-0-7" : ticket.daysOpen <= 30 ? "aging-8-30" : "aging-30-plus"}`}
            >
              {ticket.daysOpen} days open
            </span>
          </div>
          <div style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>
            Required by: {ticket.requiredBy}
          </div>
        </div>

        {/* Phase 5: Auto Closure Progress Display */}
        <div style={{ marginBottom: "8px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "8px",
            }}
          >
            <span style={{ fontSize: "14px", fontWeight: 500 }}>
              Completion Progress
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              {/* Phase 5: Fractional Progress Display */}
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color:
                    completionStats.progress === 100
                      ? "var(--success)"
                      : "var(--primary-accent)",
                }}
              >
                {completionStats.fulfilled + completionStats.cancelled} /{" "}
                {completionStats.totalItems} completed
              </span>
              <span style={{ fontSize: "14px", fontWeight: 600 }}>
                {completionStats.progress}%
              </span>
            </div>
          </div>
          <div
            style={{
              height: "8px",
              background: "var(--border-subtle)",
              borderRadius: "4px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${completionStats.progress}%`,
                height: "100%",
                background:
                  completionStats.progress === 100
                    ? "linear-gradient(135deg, var(--success), #059669)"
                    : "linear-gradient(135deg, var(--primary-accent), var(--primary-accent-dark))",
                transition: "width 0.3s ease",
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: "8px",
              fontSize: "12px",
              color: "var(--text-tertiary)",
            }}
          >
            <span style={{ color: "var(--success)" }}>
              ✓ {completionStats.fulfilled} Fulfilled
            </span>
            <span style={{ color: "var(--warning)" }}>
              ○ {completionStats.pending} Pending
            </span>
            <span>✕ {completionStats.cancelled} Cancelled</span>
            <span> {completionStats.totalItems} Total</span>
          </div>
          {/* Phase 5: Auto-closure indicator */}
          {completionStats.progress === 100 &&
            completionStats.pending === 0 && (
              <div
                style={{
                  marginTop: "12px",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  backgroundColor: "rgba(16, 185, 129, 0.08)",
                  border: "1px solid rgba(16, 185, 129, 0.2)",
                  fontSize: "12px",
                  color: "var(--success)",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <CheckCircle size={14} />
                <span>
                  <strong>Auto-Closure:</strong> All items are resolved.
                  Requisition will close automatically.
                </span>
              </div>
            )}
          {completionStats.pending > 0 && (
            <div
              style={{
                marginTop: "12px",
                fontSize: "11px",
                color: "var(--text-tertiary)",
              }}
            >
              Phase 5: Requisition will auto-close when all{" "}
              {completionStats.pending} pending items are fulfilled or
              cancelled.
            </div>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "24px",
          padding: "4px",
          backgroundColor: "var(--bg-tertiary)",
          borderRadius: "12px",
        }}
      >
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              padding: "12px 16px",
              borderRadius: "8px",
              border: "none",
              background:
                activeTab === tab.id ? "var(--bg-primary)" : "transparent",
              color:
                activeTab === tab.id
                  ? "var(--text-primary)"
                  : "var(--text-tertiary)",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              transition: "all 0.2s ease",
              boxShadow: activeTab === tab.id ? "var(--shadow-sm)" : "none",
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content based on active tab */}
      {activeTab === "overview" && (
        <OverviewTab
          ticket={ticket}
          completionStats={{
            progress: completionStats.progress,
            openPositions: completionStats.openPositions,
            totalItems: completionStats.totalItems,
          }}
          resolveUserName={resolveUserName}
          setActiveTab={(tab) => {
            if (
              isInterviewerRoute &&
              (tab === "shortlisted" || tab === "timeline")
            ) {
              setActiveTab("overview");
              return;
            }
            setActiveTab(tab);
          }}
          setIsEditing={readOnly ? () => undefined : setIsEditing}
        />
      )}

      {activeTab === "items" && (
        <ItemsTab
          readOnly={readOnly}
          ticket={ticket}
          canAssignResources={canAssignResources}
          canEditItem={canEditItem}
          isHRUser={isHRUser}
          transitionError={transitionError}
          setTransitionError={setTransitionError}
          transitionSuccess={transitionSuccess}
          transitioningItem={transitioningItem}
          handleItemTransition={handleItemTransition}
          selectedItemForAssignment={selectedItemForAssignment}
          setSelectedItemForAssignment={setSelectedItemForAssignment}
          candidatesByItemId={candidatesByItemId}
          resolveUserName={resolveUserName}
          openJdViewerForItem={openJdViewerForItem}
          openCandidateModal={openCandidateModal}
          setAddCandidateItemId={setAddCandidateItemId}
          setShowAddCandidate={setShowAddCandidate}
          cancelModalItem={cancelModalItem}
          setCancelModalItem={setCancelModalItem}
          cancelReason={cancelReason}
          setCancelReason={setCancelReason}
          cancelError={cancelError}
          setCancelError={setCancelError}
          cancelling={cancelling}
          handleCancelItem={handleCancelItem}
        />
      )}

      {(activeTab === "ats" ||
        (!isInterviewerRoute && activeTab === "shortlisted") ||
        activeTab === "interviews") && (
        <CandidatePipelineChrome bindings={pipelineBindings}>
          {activeTab === "ats" && <AtsTabPanel bindings={pipelineBindings} />}
          {!isInterviewerRoute && activeTab === "shortlisted" && (
            <ShortlistedTabPanel bindings={pipelineBindings} />
          )}
          {activeTab === "interviews" && (
            <InterviewsTabPanel bindings={pipelineBindings} />
          )}
        </CandidatePipelineChrome>
      )}

      {activeTab === "candidates" &&
        ticket &&
        parseReqId(effectiveTicketId) != null && (
          <CandidatesWorkspaceTabPanel
            requisitionId={parseReqId(effectiveTicketId)!}
            ticket={ticket}
            candidateBasePath={candidateBasePath}
          />
        )}

      {!isInterviewerRoute && activeTab === "timeline" && (
        <TimelineTab
          timelineWithStatus={timelineWithStatus}
          isEditing={isEditing}
        />
      )}

      {/* Notes Section */}
      <div className="master-data-manager" style={{ marginTop: "24px" }}>
        <div className="data-manager-header">
          <h2>Notes & Comments</h2>
          <p className="subtitle">Internal communication and updates</p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {ticket.notes.map((note, idx) => (
            <div
              key={idx}
              style={{
                padding: "16px",
                backgroundColor: "var(--bg-secondary)",
                borderRadius: "12px",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: "8px",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "12px" }}
                >
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      backgroundColor: "var(--primary-accent)",
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "14px",
                      fontWeight: 600,
                    }}
                  >
                    {note.user
                      .split(" ")
                      .map((n: string) => n[0])
                      .join("")}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{note.user}</div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--text-tertiary)",
                      }}
                    >
                      {note.date}
                    </div>
                  </div>
                </div>
                {isEditing && (
                  <button
                    className="action-button"
                    style={{ fontSize: "11px", padding: "4px 8px" }}
                  >
                    Edit
                  </button>
                )}
              </div>
              <p
                style={{
                  fontSize: "14px",
                  color: "var(--text-primary)",
                  lineHeight: 1.5,
                }}
              >
                {note.text}
              </p>
            </div>
          ))}

          {/* Add New Note */}
          {isEditing && (
            <div
              style={{
                padding: "20px",
                backgroundColor: "var(--bg-tertiary)",
                borderRadius: "12px",
                border: "2px dashed var(--border-subtle)",
              }}
            >
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  marginBottom: "12px",
                }}
              >
                Add New Note
              </div>
              <textarea
                placeholder="Enter your note or comment here..."
                rows={3}
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-subtle)",
                  backgroundColor: "var(--bg-primary)",
                  resize: "vertical",
                  fontSize: "14px",
                  marginBottom: "12px",
                }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "8px",
                }}
              >
                <button
                  className="action-button"
                  style={{ fontSize: "12px", padding: "8px 16px" }}
                  onClick={() => setNewNote("")}
                >
                  Cancel
                </button>
                <button
                  className="action-button primary"
                  style={{ fontSize: "12px", padding: "8px 16px" }}
                  onClick={handleAddNote}
                >
                  Add Note
                </button>
              </div>
            </div>
          )}

          {/* Workflow Audit History - Lazy loaded collapsible section */}
          {parseReqId(effectiveTicketId) && (
            <div style={{ marginTop: "24px" }}>
              <AuditSection
                entityType="requisition"
                entityId={parseReqId(effectiveTicketId)!}
                title="Workflow Audit History"
                relativeTime
              />
            </div>
          )}

          {/* Summary Stats Card */}
          <div
            style={{
              marginTop: "24px",
              padding: "20px",
              backgroundColor: "var(--bg-primary)",
              borderRadius: "12px",
              border: "1px solid var(--border-subtle)",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "16px",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--text-tertiary)",
                  marginBottom: "4px",
                }}
              >
                Total Positions
              </div>
              <div style={{ fontSize: "24px", fontWeight: 700 }}>
                {completionStats.totalItems}
              </div>
            </div>
            <div>
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--text-tertiary)",
                  marginBottom: "4px",
                }}
              >
                Fulfilled
              </div>
              <div
                style={{
                  fontSize: "24px",
                  fontWeight: 700,
                  color: "var(--success)",
                }}
              >
                {completionStats.fulfilled}
              </div>
            </div>
            <div>
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--text-tertiary)",
                  marginBottom: "4px",
                }}
              >
                Pending
              </div>
              <div
                style={{
                  fontSize: "24px",
                  fontWeight: 700,
                  color: "var(--warning)",
                }}
              >
                {completionStats.pending}
              </div>
            </div>
            <div>
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--text-tertiary)",
                  marginBottom: "4px",
                }}
              >
                Completion
              </div>
              <div
                style={{
                  fontSize: "24px",
                  fontWeight: 700,
                  color: "var(--primary-accent)",
                }}
              >
                {completionStats.progress}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Workflow Guidance */}
      {!isTerminalStatus(normalizeStatus(ticket.overallStatus)) && (
        <div
          style={{
            marginTop: "24px",
            padding: "20px",
            backgroundColor: "rgba(59, 130, 246, 0.05)",
            borderRadius: "12px",
            border: "1px solid rgba(59, 130, 246, 0.1)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "16px",
            }}
          >
            <AlertCircle size={20} color="var(--primary-accent)" />
            <div>
              <h3
                style={{
                  fontSize: "15px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                TA Workflow Guidance
              </h3>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                Recommended steps to source and fulfill this requisition
              </p>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
              gap: "16px",
            }}
          >
            <div
              style={{
                padding: "12px",
                backgroundColor: "white",
                borderRadius: "8px",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "8px",
                }}
              >
                <div
                  style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "6px",
                    backgroundColor: "rgba(59, 130, 246, 0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "var(--primary-accent)",
                    }}
                  >
                    1
                  </span>
                </div>
                <span style={{ fontSize: "13px", fontWeight: 600 }}>
                  Review Requirements
                </span>
              </div>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                  lineHeight: 1.4,
                }}
              >
                Review job descriptions, skills, and experience requirements for
                each position in the "Requisition Items" tab
              </p>
            </div>

            <div
              style={{
                padding: "12px",
                backgroundColor: "white",
                borderRadius: "8px",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "8px",
                }}
              >
                <div
                  style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "6px",
                    backgroundColor: "rgba(59, 130, 246, 0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "var(--primary-accent)",
                    }}
                  >
                    2
                  </span>
                </div>
                <span style={{ fontSize: "13px", fontWeight: 600 }}>
                  Source Candidates
                </span>
              </div>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                  lineHeight: 1.4,
                }}
              >
                Add candidates to items and move them through the pipeline:
                Sourcing → Shortlisted → Interviewing → Offered
              </p>
            </div>

            <div
              style={{
                padding: "12px",
                backgroundColor: "white",
                borderRadius: "8px",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "8px",
                }}
              >
                <div
                  style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "6px",
                    backgroundColor: "rgba(59, 130, 246, 0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "var(--primary-accent)",
                    }}
                  >
                    3
                  </span>
                </div>
                <span style={{ fontSize: "13px", fontWeight: 600 }}>
                  Manage Interviews
                </span>
              </div>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                  lineHeight: 1.4,
                }}
              >
                Schedule interviews, track feedback, and coordinate with hiring
                managers through the candidate pipeline
              </p>
            </div>

            <div
              style={{
                padding: "12px",
                backgroundColor: "white",
                borderRadius: "8px",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "8px",
                }}
              >
                <div
                  style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "6px",
                    backgroundColor: "rgba(59, 130, 246, 0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "var(--primary-accent)",
                    }}
                  >
                    4
                  </span>
                </div>
                <span style={{ fontSize: "13px", fontWeight: 600 }}>
                  Fulfill Positions
                </span>
              </div>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                  lineHeight: 1.4,
                }}
              >
                Once an offer is accepted, mark the item as "Fulfilled" and
                assign the selected employee to complete the requisition
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons Footer */}
      <div
        style={{
          marginTop: "32px",
          padding: "20px",
          backgroundColor: "var(--bg-tertiary)",
          borderRadius: "12px",
          border: "1px solid var(--border-subtle)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div
            style={{ fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}
          >
            Requisition Status
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
            Current status:{" "}
            <strong>{getStatusLabel(ticket.overallStatus)}</strong>
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px" }}>
          {/* NOTE: Status transitions (e.g. Mark as Fulfilled) are handled
             via WorkflowTransitionButtons which call the backend workflow
             engine. Client-side-only mutations have been removed. */}

          {/* <button
            className="action-button"
            onClick={() => window.print()}
            style={{
              fontSize: "12px",
              padding: "8px 16px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Printer size={14} />
            Print Summary
          </button> */}
        </div>
      </div>

      {/* Footer - Audit Trail */}
      <div
        style={{
          marginTop: "32px",
          paddingTop: "20px",
          borderTop: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            fontSize: "12px",
            color: "var(--text-tertiary)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Shield size={14} />
            <span>Audit Trail: All changes are logged for compliance</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Clock size={14} />
            <span>Last updated: Today, 14:30</span>
          </div>
        </div> */}

        {/* <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Target size={14} />
            <span>Requisition ID: {ticket.ticketId}</span>
          </div>
        </div> */}
      </div>

      {/* Help Section */}
      <div
      // style={{
      //   marginTop: "16px",
      //   padding: "12px",
      //   backgroundColor: "var(--bg-secondary)",
      //   borderRadius: "8px",
      //   border: "1px solid var(--border-subtle)",
      //   fontSize: "11px",
      //   color: "var(--text-tertiary)",
      //   textAlign: "center",
      // }}
      >
        <strong></strong>
      </div>

      {/* JD PDF Viewer Modal */}
      {showJdViewer && (
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
          onClick={(e) => e.target === e.currentTarget && closeJdViewer()}
        >
          <div
            style={{
              width: "90%",
              maxWidth: "900px",
              maxHeight: "90vh",
              backgroundColor: "var(--bg-primary)",
              borderRadius: "12px",
              boxShadow: "0 25px 50px rgba(0,0,0,0.25)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 20px",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: "18px",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <FileText size={20} color="var(--primary-accent)" />
                Job Description
              </h3>
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                {jdBlobUrl && (
                  <a
                    href={jdBlobUrl}
                    download={`JD_${ticket?.ticketId ?? "requisition"}.pdf`}
                    className="action-button"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "12px",
                      textDecoration: "none",
                    }}
                  >
                    <Download size={14} />
                    Download
                  </a>
                )}
                <button
                  type="button"
                  onClick={closeJdViewer}
                  style={{
                    padding: "8px",
                    borderRadius: "8px",
                    border: "none",
                    background: "var(--bg-secondary)",
                    cursor: "pointer",
                  }}
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div
              style={{
                flex: 1,
                minHeight: 0,
                padding: "16px",
                overflow: "auto",
              }}
            >
              {loadingJd ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "48px",
                    color: "var(--text-tertiary)",
                    fontSize: "13px",
                  }}
                >
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      border: "2px solid var(--border-subtle)",
                      borderTopColor: "var(--primary-accent)",
                      borderRadius: "50%",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                  <p style={{ marginTop: "16px" }}>Loading PDF...</p>
                </div>
              ) : jdBlobUrl ? (
                <iframe
                  src={jdBlobUrl}
                  title="Job Description PDF"
                  style={{
                    width: "100%",
                    height: "75vh",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "8px",
                  }}
                />
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "48px",
                    color: "var(--text-tertiary)",
                  }}
                >
                  <FileText size={48} style={{ marginBottom: "16px" }} />
                  <p style={{ fontSize: "14px" }}>Could not load PDF.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RequisitionDetailRoot;
