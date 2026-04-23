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
  Phone,
  Gift,
  DollarSign,
  RefreshCw,
  Eye,
} from "lucide-react";
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
  fetchRequisitionItemRanking,
  createCandidate,
  recomputeRequisitionItemRanking,
  runAiEvaluationForRequisitionItem,
  uploadResume,
  getCandidateActionErrorMessage,
  updateCandidateStageCompatible,
  type ApplicationRecord,
  type ApplicationsAtsBucketsResponse,
  type ApplicationsPipelineResponse,
  type Candidate,
  type CandidateCreate,
  type Interview,
  type RequisitionItemRankingCandidate,
  type RequisitionItemRankingResponse,
} from "@/lib/api/candidateApi";
import { InterviewStatusBadge } from "@/components/interviews/InterviewStatusBadge";
import { interviewUi } from "@/components/interviews/interview-ui-theme";
import { Table, TBody, THead, TD, TH, TR } from "@/components/ui/Table";
import "../../styles/hr/hr-dashboard.css";

interface RequisitionDetailsProps {
  requisitionId?: string | null;
  onBack?: () => void;
  onUpdate?: (ticket: TicketData) => void;
}

interface RequisitionItem {
  id: string;
  numericItemId: number; // Phase 7: Numeric item ID for API calls
  skill: string;
  level: string;
  experience: number;
  education: string;
  itemStatus: string;
  assignedEmployeeId?: string;
  assignedEmployeeName?: string;
  assignedDate?: string;
  description: string;
  cvFileUrl?: string;
  cvFileName?: string;
  assignedTAId?: number | null; // Phase 7: Item-level TA assignment
  requirements?: string;
  replacementHire?: boolean;
  replacedEmpId?: string | null;
  estimatedBudget?: number | null;
  approvedBudget?: number | null;
  currency?: string;
  jdFileKey?: string | null;
  /** When true (default), ranking uses manager requisition JD (item + header PDF). */
  pipelineRankingUseRequisitionJd?: boolean;
  pipelineJdText?: string | null;
  pipelineJdFileKey?: string | null;
  rankingRequiredSkills?: string[] | null;
}

// Phase 4: Item status milestone order for visual tracking
const ITEM_MILESTONE_ORDER: RequisitionItemStatus[] = [
  "Pending",
  "Sourcing",
  "Shortlisted",
  "Interviewing",
  "Offered",
  "Fulfilled",
];

const getItemMilestoneIndex = (status: string): number => {
  const idx = ITEM_MILESTONE_ORDER.indexOf(status as RequisitionItemStatus);
  return idx >= 0 ? idx : 0;
};

const ITEM_STATUS_ICONS: Record<string, React.ReactNode> = {
  Pending: <Clock size={14} />,
  Sourcing: <Search size={14} />,
  Shortlisted: <FileText size={14} />,
  Interviewing: <Phone size={14} />,
  Offered: <Gift size={14} />,
  Fulfilled: <CheckCircle size={14} />,
  Cancelled: <Ban size={14} />,
};

interface TimelineEvent {
  date: string;
  event: string;
  user: string;
}

interface NoteEntry {
  date: string;
  user: string;
  text: string;
}

interface TicketData {
  id: string;
  ticketId: string;
  projectName: string;
  projectCode: string;
  client: string;
  projectManager: string;
  requiredBy: string;
  workMode: string;
  location: string;
  priority: string;
  overallStatus: string;
  justification: string;
  dateCreated: string;
  assignedTA: string;
  assignedTAId?: number | null;
  raisedById?: number | null;
  approvedBy?: number | null;
  budgetApprovedBy?: number | null;
  approvalHistory?: string | null;
  assignedAt?: string | null;
  createdAt?: string | null;
  daysOpen: number;
  slaHours: number;
  budget: string;
  projectDuration: string;
  items: RequisitionItem[];
  timeline: TimelineEvent[];
  notes: NoteEntry[];
}

interface BackendRequisitionItem {
  item_id: number;
  req_id: number;
  role_position: string;
  skill_level?: string | null;
  experience_years?: number | null;
  education_requirement?: string | null;
  job_description: string;
  jd_file_key?: string | null;
  cv_file_key?: string | null;
  cv_file_name?: string | null;
  requirements?: string | null;
  item_status: string;
  assigned_ta?: number | null; // Phase 7: Item-level TA assignment
  replacement_hire?: boolean;
  replaced_emp_id?: string | null;
  estimated_budget?: number | null;
  approved_budget?: number | null;
  currency?: string | null;
  pipeline_ranking_use_requisition_jd?: boolean;
  pipeline_jd_text?: string | null;
  pipeline_jd_file_key?: string | null;
  ranking_required_skills?: string[] | null;
}

interface BackendRequisition {
  req_id: number;
  project_name?: string | null;
  client_name?: string | null;
  overall_status: string;
  required_by_date?: string | null;
  priority?: string | null;
  budget_amount?: number | null;
  created_at?: string | null;
  work_mode?: string | null;
  office_location?: string | null;
  justification?: string | null;
  duration?: string | null;
  raised_by?: number | null;
  assigned_ta?: number | null;
  budget_approved_by?: number | null;
  approved_by?: number | null;
  approval_history?: string | null;
  assigned_at?: string | null;
  jd_file_key?: string | null;
  items: BackendRequisitionItem[];
}

interface StatusHistoryEntry {
  history_id: number;
  req_id: number;
  old_status?: string | null;
  new_status?: string | null;
  changed_by?: number | null;
  changed_at: string;
}

interface AuditLogEntry {
  audit_id: number;
  entity_name: string;
  entity_id?: string | null;
  action: string;
  performed_by?: number | null;
  performed_by_username?: string | null;
  performed_by_full_name?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  performed_at: string;
}

interface UserDirectoryEntry {
  user_id: number;
  username: string;
  roles?: string[];
}

const RequisitionDetail: React.FC<RequisitionDetailsProps> = ({
  requisitionId,
  onBack,
  onUpdate,
}) => {
  const params = useParams();
  const id = params?.id as string | undefined;
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const effectiveTicketId = requisitionId ?? id;
  const getTodayDate = () =>
    new Date().toISOString().split("T")[0] ?? new Date().toISOString();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "overview" | "items" | "ats" | "shortlisted" | "interviews" | "timeline"
  >("overview");
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
  const [addingCandidate, setAddingCandidate] = useState(false);
  const [candidateStageFilter, setCandidateStageFilter] =
    useState<string>("all");
  const [candidateItemFilter, setCandidateItemFilter] = useState<
    number | "all"
  >("all");
  const [atsBoardItemId, setAtsBoardItemId] = useState<number | null>(null);
  const [atsBoardLoading, setAtsBoardLoading] = useState(false);
  const [atsBoardRanking, setAtsBoardRanking] =
    useState<RequisitionItemRankingResponse | null>(null);
  const [reqInterviews, setReqInterviews] = useState<Interview[]>([]);
  const [reqInterviewsLoading, setReqInterviewsLoading] = useState(false);
  const [shortlistBulkAppIds, setShortlistBulkAppIds] = useState<number[]>([]);
  const [shortlistBulkWorking, setShortlistBulkWorking] = useState(false);
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
  const [pipelineJdTextDraft, setPipelineJdTextDraft] = useState("");
  const [useRequisitionJd, setUseRequisitionJd] = useState(true);
  const [pipelineJdSaving, setPipelineJdSaving] = useState(false);
  const [pipelineJdUploading, setPipelineJdUploading] = useState(false);
  const [pipelineJdMessage, setPipelineJdMessage] = useState<string | null>(
    null,
  );
  const pipelineJdFileInputRef = useRef<HTMLInputElement>(null);
  const lastAtsFocusRefreshAtRef = useRef<number>(0);
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
      router.push(`/ta/candidates/${c.candidate_id}?${q.toString()}`);
    },
    [router, pathname],
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

  const atsBoardScoreByCandidateId = useMemo(() => {
    const m = new Map<
      number,
      {
        final_score: number | null;
        ai_status: "OK" | "PENDING" | "UNAVAILABLE";
        ai_summary?: string;
      }
    >();
    for (const rc of atsBoardRanking?.ranked_candidates ?? []) {
      m.set(rc.candidate_id, {
        final_score: rc.score.final_score,
        ai_status: rc.score.ai_status,
        ai_summary: rc.score.ai_summary,
      });
    }
    return m;
  }, [atsBoardRanking]);

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

  /** Ranking snapshot rows may include candidates not yet merged into `candidates` state — still open evaluate modal. */
  const openEvaluateFromRankedRow = useCallback(
    (rc: RequisitionItemRankingCandidate) => {
      const existing = candidates.find((c) => c.candidate_id === rc.candidate_id);
      if (existing) {
        openCandidateModal(existing, "evaluate");
        return;
      }
      const reqId = rankingData?.req_id;
      if (reqId == null) return;
      const minimal: Candidate = {
        candidate_id: rc.candidate_id,
        requisition_item_id: rc.requisition_item_id,
        requisition_id: reqId,
        full_name: rc.full_name,
        email: rc.email,
        phone: null,
        resume_path: null,
        current_stage: rc.current_stage,
        added_by: null,
        created_at: null,
        updated_at: null,
        interviews: [],
      };
      openCandidateModal(minimal, "evaluate");
    },
    [candidates, openCandidateModal, rankingData?.req_id],
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

  const parseReqId = (value?: string | null) => {
    if (!value) return null;
    const match = value.match(/\d+/);
    return match ? Number(match[0]) : null;
  };

  const formatRelativeTime = (dateValue?: string | null) => {
    if (!dateValue) return "—";
    const date = new Date(dateValue);
    const diffMs = Date.now() - date.getTime();
    if (Number.isNaN(diffMs)) return "—";
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 1) return "just now";
    if (diffMinutes < 60) return `${diffMinutes} min ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24)
      return `${diffHours} hr${diffHours === 1 ? "" : "s"} ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  };

  /**
   * Map a requisition status to a ticket-status CSS class.
   * Normalizes legacy values via canonical types/workflow.ts.
   */
  const getOverallStatusClass = (status: string) => {
    const normalized = normalizeStatus(status);
    switch (normalized) {
      case "Draft":
      case "Pending_Budget":
      case "Pending_HR":
        return "ticket-status open";
      case "Active":
        return "ticket-status in-progress";
      case "Fulfilled":
        return "ticket-status fulfilled";
      case "Rejected":
      case "Cancelled":
        return "ticket-status closed";
      default:
        return "ticket-status";
    }
  };

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
      projectName: req.project_name ?? "—",
      projectCode: `REQ-${req.req_id}`,
      client: req.client_name ?? "—",
      projectManager: req.raised_by ? `User #${req.raised_by}` : "—",
      requiredBy: req.required_by_date ?? "",
      workMode: req.work_mode ?? "—",
      location: req.office_location ?? "—",
      priority: req.priority ?? "—",
      overallStatus: req.overall_status ?? "—",
      justification: req.justification ?? "—",
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
          level: item.skill_level ?? "—",
          experience: item.experience_years ?? 0,
          education: item.education_requirement ?? "—",
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

  const parseSecondarySkills = (requirements?: string) => {
    if (!requirements) return [] as string[];
    const match = requirements.match(/Secondary Skills:\s*([^|]+)/i);
    const matched = match?.[1];
    if (!matched) return [] as string[];
    return matched
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean);
  };

  const parsePrimarySkill = (requirements?: string) => {
    if (!requirements) return null;
    const match = requirements.match(/Primary Skill:\s*([^|]+)/i);
    return match?.[1]?.trim() ?? null;
  };

  const formatItemBudget = (
    amount: number | null | undefined,
    currency: string = "INR",
  ) => {
    if (amount == null || amount === 0) return "—";
    try {
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(amount);
    } catch {
      return `${currency} ${amount.toLocaleString()}`;
    }
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

    const fetchStatusHistory = async () => {
      try {
        const response = await apiClient.get<StatusHistoryEntry[]>(
          `/requisitions/${reqId}/status-history`,
        );
        if (isMounted) {
          setStatusHistory(response.data ?? []);
        }
      } catch {
        if (isMounted) setStatusHistory([]);
      }
    };

    const fetchAuditLogs = async () => {
      try {
        const response = await apiClient.get<AuditLogEntry[]>(
          `/audit-logs?entity_name=requisition&entity_id=${reqId}`,
        );
        if (isMounted) {
          setAuditLogs(response.data ?? []);
        }
      } catch {
        if (isMounted) setAuditLogs([]);
      }
    };

    const fetchUsers = async () => {
      try {
        const rows = await getUsersListCached<UserDirectoryEntry>();
        if (!isMounted) return;
        const map: Record<number, string> = {};
        rows.forEach((userEntry) => {
          map[userEntry.user_id] = userEntry.username;
        });
        setUsersById(map);
      } catch {
        if (isMounted) setUsersById({});
      }
    };

    fetchRequisition();
    fetchStatusHistory();
    fetchAuditLogs();
    fetchUsers();

    return () => {
      isMounted = false;
    };
  }, [effectiveTicketId]);

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

  const loadRanking = useCallback(
    async (forceRecompute = false) => {
      if (!rankingItemId) {
        setRankingData(null);
        setRankingError(null);
        setAtsBucketsData(null);
        return;
      }
      if (forceRecompute) {
        setRankingRefreshing(true);
      } else {
        setRankingLoading(true);
      }
      setRankingError(null);
      try {
        if (forceRecompute) {
          await recomputeRequisitionItemRanking(rankingItemId);
        }
        const data = await fetchRequisitionItemRanking(rankingItemId, { aiEval: true });
        setRankingData(data);
        try {
          const ab = await fetchApplicationsAtsBuckets(rankingItemId);
          setAtsBucketsData(ab);
        } catch {
          setAtsBucketsData(null);
        }
      } catch {
        setRankingData(null);
        setAtsBucketsData(null);
        setRankingError("Unable to load ranking for this position.");
      } finally {
        setRankingLoading(false);
        setRankingRefreshing(false);
      }
    },
    [rankingItemId],
  );

  const runAiEvalAllPresent = useCallback(async () => {
    if (!rankingItemId) return;
    const ids = Array.from(
      new Set((rankingData?.ranked_candidates ?? []).map((rc) => rc.candidate_id)),
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
      void loadRanking(true);
    } catch (err: unknown) {
      setPipelineJdMessage(
        getCandidateActionErrorMessage(
          err,
          "Failed to save ranking JD settings",
        ),
      );
    } finally {
      setPipelineJdSaving(false);
    }
  };

  const uploadPipelineRankingJdPdf = async (file: File) => {
    if (!pipelineRankingTargetItem || !canEditPipelineRankingJd) return;
    const itemId = pipelineRankingTargetItem.numericItemId;
    setPipelineJdUploading(true);
    setPipelineJdMessage(null);
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
      void loadRanking(true);
    } catch (err: unknown) {
      setPipelineJdMessage(
        getCandidateActionErrorMessage(err, "Failed to upload ranking JD PDF"),
      );
    } finally {
      setPipelineJdUploading(false);
    }
  };

  const removePipelineRankingJdPdf = async () => {
    if (!pipelineRankingTargetItem || !canEditPipelineRankingJd) return;
    const itemId = pipelineRankingTargetItem.numericItemId;
    setPipelineJdUploading(true);
    setPipelineJdMessage(null);
    try {
      await apiClient.delete(
        `/requisitions/items/${itemId}/pipeline-ranking-jd/upload`,
      );
      await refetchRequisition();
      setPipelineJdMessage("Pipeline ranking PDF removed.");
      void loadRanking(true);
    } catch (err: unknown) {
      setPipelineJdMessage(
        getCandidateActionErrorMessage(err, "Failed to remove ranking JD PDF"),
      );
    } finally {
      setPipelineJdUploading(false);
    }
  };

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

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

  useEffect(() => {
    if (activeTab !== "ats" || atsBoardItemId == null) {
      return;
    }
    let cancelled = false;
    setAtsBoardLoading(true);
    void Promise.all([
      fetchRequisitionItemRanking(atsBoardItemId, { aiEval: true }),
      fetchApplicationsAtsBuckets(atsBoardItemId),
    ])
      .then(([ranking, ab]) => {
        if (!cancelled) {
          setAtsBoardRanking(ranking);
          setAtsBucketsData(ab);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAtsBoardRanking(null);
          setAtsBucketsData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setAtsBoardLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, atsBoardItemId]);

  useEffect(() => {
    if (activeTab !== "ats" || atsBoardItemId == null) {
      return;
    }
    const itemId = atsBoardItemId;
    // Non-blocking polling: keep refreshing ranking while any score is still pending.
    if (!atsBucketsData) {
      return;
    }
    const candidateIdsInBoard = new Set<number>();
    for (const b of ["BEST", "VERY_GOOD", "GOOD", "AVERAGE", "NOT_SUITABLE", "UNRANKED"] as const) {
      for (const app of atsBucketsData[b] ?? []) {
        candidateIdsInBoard.add(app.candidate_id);
      }
    }
    const hasPending = Array.from(candidateIdsInBoard).some((cid) => {
      const s = atsBoardScoreByCandidateId.get(cid);
      return !s || s.ai_status !== "OK" || s.final_score == null;
    });
    if (!hasPending) {
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 12;
    const intervalMs = 4000;

    async function tick() {
      if (cancelled) return;
      attempts += 1;
      try {
        const ranking = await fetchRequisitionItemRanking(itemId, { aiEval: true });
        if (!cancelled) {
          setAtsBoardRanking(ranking);
        }
      } catch {
        // ignore transient errors; keep polling within budget
      }
      if (cancelled) return;
      if (attempts >= maxAttempts) return;

      const stillPending = Array.from(candidateIdsInBoard).some((cid) => {
        const s = atsBoardScoreByCandidateId.get(cid);
        return !s || s.ai_status !== "OK" || s.final_score == null;
      });
      if (!stillPending) return;
      setTimeout(tick, intervalMs);
    }

    setTimeout(tick, intervalMs);
    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    atsBoardItemId,
    atsBucketsData,
    atsBoardScoreByCandidateId,
  ]);

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

  // Auto-open / item-switch should not force recompute; that can reset buckets while
  // AI evaluations are still pending. Use explicit Recompute button for hard refresh.
  useEffect(() => {
    if (activeTab !== "ats" || !pipelineAdvancedOpen) {
      return;
    }
    void loadRanking(false);
  }, [activeTab, pipelineAdvancedOpen, loadRanking]);

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

  // ---- Add candidate handler ----
  const handleAddCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket || !addCandidateItemId) return;
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
      id: "interviews" as const,
      label: "Interviews",
      icon: <Calendar size={16} />,
    },
    { id: "timeline" as const, label: "Timeline", icon: <History size={16} /> },
  ];

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
              Manage and update resource requirements - HR/TA View
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {!isEditing ? (
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
            <span>📊 {completionStats.totalItems} Total</span>
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
        {tabs.map((tab) => (
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
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr",
            gap: "24px",
          }}
        >
          {/* Left Column - Basic Info */}
          <div>
            <div className="master-data-manager">
              <div className="data-manager-header">
                <h2>Project & Client Details</h2>
                <p className="subtitle">
                  Complete project information and requirements
                </p>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "24px",
                  marginBottom: "24px",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      marginBottom: "12px",
                    }}
                  >
                    Project Information
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ color: "var(--text-secondary)" }}>
                        Project Name:
                      </span>
                      <span style={{ fontWeight: 500 }}>
                        {ticket.projectName}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      {/* <span style={{ color: "var(--text-secondary)" }}>
                        Project Code:
                      </span>
                      <span style={{ fontFamily: "monospace" }}>
                        {ticket.projectCode}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    > */}
                      <span style={{ color: "var(--text-secondary)" }}>
                        Client:
                      </span>
                      <span style={{ fontWeight: 500 }}>{ticket.client}</span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ color: "var(--text-secondary)" }}>
                        Project Manager:
                      </span>
                      <span>{resolveUserName(ticket.raisedById)}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      marginBottom: "12px",
                    }}
                  >
                    Logistics
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ color: "var(--text-secondary)" }}>
                        Work Mode:
                      </span>
                      <span style={{ fontWeight: 500 }}>{ticket.workMode}</span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ color: "var(--text-secondary)" }}>
                        Location:
                      </span>
                      <span>{ticket.location}</span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ color: "var(--text-secondary)" }}>
                        Project Duration:
                      </span>
                      <span>{ticket.projectDuration}</span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ color: "var(--text-secondary)" }}>
                        Budget:
                      </span>
                      <span style={{ fontWeight: 500 }}>{ticket.budget}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: "24px" }}>
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    marginBottom: "8px",
                  }}
                >
                  Business Justification
                </div>
                <div
                  style={{
                    padding: "16px",
                    backgroundColor: "var(--bg-secondary)",
                    borderRadius: "12px",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <p
                    style={{
                      color: "var(--text-primary)",
                      lineHeight: 1.5,
                      whiteSpace: "pre-line",
                    }}
                  >
                    {ticket.justification}
                  </p>
                </div>
              </div>

              {/* Assignment Info */}
              <div
                style={{
                  padding: "20px",
                  backgroundColor: "var(--bg-tertiary)",
                  borderRadius: "12px",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    marginBottom: "12px",
                  }}
                >
                  Assignment Details
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "16px",
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        marginBottom: "4px",
                      }}
                    >
                      <Users size={14} />
                      <span style={{ color: "var(--text-secondary)" }}>
                        Assigned TA:
                      </span>
                    </div>
                    <span style={{ fontWeight: 500 }}>
                      {ticket.assignedTAId
                        ? resolveUserName(ticket.assignedTAId)
                        : "Unassigned"}
                    </span>
                  </div>
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        marginBottom: "4px",
                      }}
                    >
                      <Calendar size={14} />
                      <span style={{ color: "var(--text-secondary)" }}>
                        Date Created:
                      </span>
                    </div>
                    <span style={{ fontWeight: 500 }}>
                      {ticket.dateCreated
                        ? new Date(ticket.dateCreated).toLocaleDateString(
                            "en-US",
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )
                        : "—"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Quick Stats & Actions */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: "24px" }}
          >
            {/* Quick Stats - aligned with HR */}
            <div className="audit-log-viewer">
              <div className="viewer-header">
                <h2>Quick Stats</h2>
                <p className="subtitle">Requisition metrics at a glance</p>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                  marginTop: "16px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ color: "var(--text-secondary)" }}>
                    Days Open
                  </span>
                  <span style={{ fontWeight: 600 }}>
                    {ticket.daysOpen} day{ticket.daysOpen !== 1 ? "s" : ""}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ color: "var(--text-secondary)" }}>
                    Completion
                  </span>
                  <span style={{ color: "var(--success)", fontWeight: 600 }}>
                    {completionStats.progress}%
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ color: "var(--text-secondary)" }}>
                    Open Positions
                  </span>
                  <span style={{ fontWeight: 600 }}>
                    {completionStats.openPositions} of{" "}
                    {completionStats.totalItems}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ color: "var(--text-secondary)" }}>
                    SLA Status
                  </span>
                  <span
                    className={`sla-timer ${
                      (() => {
                        const remainingHours =
                          ticket.slaHours - ticket.daysOpen * 24;
                        if (remainingHours <= 0) return "critical";
                        if (remainingHours <= 48) return "warning";
                        return "";
                      })()
                    }`}
                  >
                    {(() => {
                      const remainingHours =
                        ticket.slaHours - ticket.daysOpen * 24;
                      if (remainingHours <= 0) return "Breached";
                      return `${remainingHours}h remaining`;
                    })()}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Actions - wired like HR */}
            <div className="audit-log-viewer">
              <div className="viewer-header">
                <h2>Quick Actions</h2>
                <p className="subtitle">TA operations</p>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  marginTop: "16px",
                }}
              >
                <button
                  type="button"
                  className="action-button"
                  style={{ justifyContent: "flex-start", textAlign: "left" }}
                  onClick={() => setActiveTab("ats")}
                >
                  <Users size={16} />
                  View Candidates
                </button>
                <button
                  type="button"
                  className="action-button"
                  style={{ justifyContent: "flex-start", textAlign: "left" }}
                  onClick={() => setActiveTab("items")}
                >
                  <Briefcase size={16} />
                  Manage Requisition Items
                </button>
                <button
                  type="button"
                  className="action-button"
                  style={{ justifyContent: "flex-start", textAlign: "left" }}
                  onClick={() => {
                    setActiveTab("timeline");
                    setIsEditing(true);
                  }}
                >
                  <MessageSquare size={16} />
                  Add Internal Note
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "items" && (
        <div className="master-data-manager">
          <div className="data-manager-header">
            <h2>Requisition Items Management</h2>
            <p className="subtitle">
              Phase 4: TA Execution - Track milestones, upload CVs, and manage
              positions
            </p>
          </div>

          {/* Phase 4: Status Messages */}
          {transitionError && (
            <div
              style={{
                marginBottom: "16px",
                padding: "12px 16px",
                borderRadius: "10px",
                backgroundColor: "rgba(239, 68, 68, 0.08)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
                color: "var(--error)",
                fontSize: "13px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <AlertCircle size={16} />
              {transitionError}
              <button
                onClick={() => setTransitionError(null)}
                style={{
                  marginLeft: "auto",
                  background: "none",
                  border: "none",
                  color: "var(--error)",
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>
          )}

          {transitionSuccess && (
            <div
              style={{
                marginBottom: "16px",
                padding: "12px 16px",
                borderRadius: "10px",
                backgroundColor: "rgba(16, 185, 129, 0.08)",
                border: "1px solid rgba(16, 185, 129, 0.2)",
                color: "var(--success)",
                fontSize: "13px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <CheckCircle size={16} />
              {transitionSuccess}
            </div>
          )}

          {!canAssignResources && (
            <div
              style={{
                marginBottom: "16px",
                padding: "12px 16px",
                borderRadius: "10px",
                backgroundColor: "rgba(245, 158, 11, 0.08)",
                border: "1px solid rgba(245, 158, 11, 0.2)",
                color: "var(--warning)",
                fontSize: "13px",
              }}
            >
              {ticket?.assignedTAId
                ? "Assignment locked. This requisition is assigned to another TA."
                : "Assignment locked. HR must assign a TA before resources can be assigned."}
            </div>
          )}

          <div
            style={{ display: "flex", flexDirection: "column", gap: "16px" }}
          >
            {ticket.items.map((item) => {
              const primarySkill =
                parsePrimarySkill(item.requirements) ?? item.skill;
              const secondarySkills = parseSecondarySkills(item.requirements);
              const effectiveAssignedTAId =
                item.assignedTAId ?? ticket.assignedTAId ?? null;
              const assignedTALabel = effectiveAssignedTAId
                ? resolveUserName(effectiveAssignedTAId)
                : "Unassigned";
              const itemCandidates =
                candidatesByItemId.get(item.numericItemId) ?? [];

              return (
                <div
                  key={item.id}
                  style={{
                    padding: "20px",
                    backgroundColor: "var(--bg-primary)",
                    borderRadius: "12px",
                    border:
                      selectedItemForAssignment === item.id
                        ? "2px solid var(--primary-accent)"
                        : "1px solid var(--border-subtle)",
                    transition: "all 0.2s ease",
                  }}
                >
                  {/* Phase 4: Item Header with Status and Info */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      marginBottom: "16px",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          marginBottom: "8px",
                        }}
                      >
                        <span
                          className={
                            item.itemStatus === "Pending"
                              ? "ticket-status open"
                              : item.itemStatus === "Fulfilled"
                                ? "ticket-status fulfilled"
                                : item.itemStatus === "Cancelled"
                                  ? "ticket-status closed"
                                  : "ticket-status in-progress"
                          }
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          {ITEM_STATUS_ICONS[item.itemStatus]}
                          {ITEM_STATUS_LABELS[
                            item.itemStatus as RequisitionItemStatus
                          ] ?? item.itemStatus}
                        </span>
                        <strong style={{ fontSize: "15px" }}>
                          {item.skill} ({item.level})
                        </strong>
                        {/* Replacement badge */}
                        {item.replacementHire && (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              padding: "2px 8px",
                              borderRadius: "6px",
                              backgroundColor: "rgba(245, 158, 11, 0.1)",
                              color: "var(--warning)",
                              fontSize: "11px",
                              fontWeight: 600,
                            }}
                          >
                            <RefreshCw size={10} />
                            Replacement
                          </span>
                        )}
                        {item.jdFileKey && (
                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              marginLeft: "auto",
                            }}
                          >
                            <button
                              type="button"
                              className="action-button"
                              style={{
                                fontSize: "11px",
                                padding: "4px 8px",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                              onClick={() =>
                                openJdViewerForItem(item.numericItemId)
                              }
                            >
                              <Eye size={12} />
                              View JD
                            </button>
                            <a
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                apiClient
                                  .get(
                                    `/requisitions/items/${item.numericItemId}/jd`,
                                    { responseType: "blob" },
                                  )
                                  .then((res) => {
                                    const url = URL.createObjectURL(
                                      res.data as Blob,
                                    );
                                    const a = document.createElement("a");
                                    a.href = url;
                                    a.download = `JD_${item.skill}_${item.numericItemId}.pdf`;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                  })
                                  .catch(() => {});
                              }}
                              className="action-button"
                              style={{
                                fontSize: "11px",
                                padding: "4px 8px",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                                textDecoration: "none",
                                color: "inherit",
                              }}
                            >
                              <Download size={12} />
                              Download
                            </a>
                          </span>
                        )}
                      </div>

                      {/* Skills */}
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "6px",
                          marginBottom: "8px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 600,
                              color: "var(--text-tertiary)",
                              textTransform: "uppercase",
                              letterSpacing: "0.03em",
                            }}
                          >
                            Primary:
                          </span>
                          <span
                            style={{
                              padding: "3px 10px",
                              borderRadius: "6px",
                              backgroundColor: "rgba(99, 102, 241, 0.1)",
                              color: "var(--primary-accent)",
                              fontWeight: 600,
                              fontSize: "12px",
                            }}
                          >
                            {primarySkill}
                          </span>
                        </div>
                        {secondarySkills.length > 0 && (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              flexWrap: "wrap",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "11px",
                                fontWeight: 600,
                                color: "var(--text-tertiary)",
                                textTransform: "uppercase",
                                letterSpacing: "0.03em",
                              }}
                            >
                              Secondary:
                            </span>
                            {secondarySkills.map((skill) => (
                              <span
                                key={skill}
                                style={{
                                  padding: "3px 10px",
                                  borderRadius: "6px",
                                  backgroundColor: "var(--bg-tertiary)",
                                  border: "1px solid var(--border-subtle)",
                                  fontSize: "12px",
                                  color: "var(--text-secondary)",
                                  fontWeight: 500,
                                }}
                              >
                                {skill}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fill, minmax(160px, 1fr))",
                          gap: "12px",
                          marginTop: "4px",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: "11px",
                              fontWeight: 500,
                              color: "var(--text-tertiary)",
                              marginBottom: "2px",
                              textTransform: "uppercase",
                              letterSpacing: "0.03em",
                            }}
                          >
                            Experience
                          </div>
                          <div
                            style={{
                              fontSize: "13px",
                              color: "var(--text-primary)",
                              fontWeight: 500,
                            }}
                          >
                            {item.experience} years
                          </div>
                        </div>
                        <div>
                          <div
                            style={{
                              fontSize: "11px",
                              fontWeight: 500,
                              color: "var(--text-tertiary)",
                              marginBottom: "2px",
                              textTransform: "uppercase",
                              letterSpacing: "0.03em",
                            }}
                          >
                            Education
                          </div>
                          <div
                            style={{
                              fontSize: "13px",
                              color: "var(--text-primary)",
                              fontWeight: 500,
                            }}
                          >
                            {item.education}
                          </div>
                        </div>
                        <div>
                          <div
                            style={{
                              fontSize: "11px",
                              fontWeight: 500,
                              color: "var(--text-tertiary)",
                              marginBottom: "2px",
                              textTransform: "uppercase",
                              letterSpacing: "0.03em",
                            }}
                          >
                            Assigned TA
                          </div>
                          <div
                            style={{
                              fontSize: "13px",
                              color: effectiveAssignedTAId
                                ? "var(--text-primary)"
                                : "var(--text-tertiary)",
                              fontWeight: 500,
                            }}
                          >
                            {assignedTALabel}
                          </div>
                        </div>
                        {item.cvFileName && (
                          <div>
                            <div
                              style={{
                                fontSize: "11px",
                                fontWeight: 500,
                                color: "var(--text-tertiary)",
                                marginBottom: "2px",
                                textTransform: "uppercase",
                                letterSpacing: "0.03em",
                              }}
                            >
                              CV Uploaded
                            </div>
                            <div
                              style={{
                                fontSize: "13px",
                                color: "var(--success)",
                                fontWeight: 500,
                              }}
                            >
                              {item.cvFileName}
                            </div>
                          </div>
                        )}
                        <div>
                          <div
                            style={{
                              fontSize: "11px",
                              fontWeight: 500,
                              color: "var(--text-tertiary)",
                              marginBottom: "2px",
                              textTransform: "uppercase",
                              letterSpacing: "0.03em",
                            }}
                          >
                            Type
                          </div>
                          <div
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              fontSize: "13px",
                              fontWeight: 500,
                              color: item.replacementHire
                                ? "var(--warning)"
                                : "var(--success)",
                            }}
                          >
                            {item.replacementHire ? (
                              <>
                                <RefreshCw size={11} />
                                Replacement
                                {item.replacedEmpId && (
                                  <span
                                    style={{
                                      color: "var(--text-tertiary)",
                                      fontSize: "11px",
                                      fontWeight: 400,
                                    }}
                                  >
                                    ({item.replacedEmpId})
                                  </span>
                                )}
                              </>
                            ) : (
                              "New Hire"
                            )}
                          </div>
                        </div>
                        <div>
                          <div
                            style={{
                              fontSize: "11px",
                              fontWeight: 500,
                              color: "var(--text-tertiary)",
                              marginBottom: "2px",
                              textTransform: "uppercase",
                              letterSpacing: "0.03em",
                            }}
                          >
                            Est. Budget
                          </div>
                          <div
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              fontSize: "13px",
                              color: "var(--text-primary)",
                              fontWeight: 500,
                            }}
                          >
                            <DollarSign size={12} />
                            {formatItemBudget(
                              item.estimatedBudget,
                              item.currency,
                            )}
                          </div>
                        </div>
                        {item.approvedBudget != null &&
                          item.approvedBudget > 0 && (
                            <div>
                              <div
                                style={{
                                  fontSize: "11px",
                                  fontWeight: 500,
                                  color: "var(--text-tertiary)",
                                  marginBottom: "2px",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.03em",
                                }}
                              >
                                Approved Budget
                              </div>
                              <div
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  fontSize: "13px",
                                  color: "var(--success)",
                                  fontWeight: 500,
                                }}
                              >
                                <DollarSign size={12} />
                                {formatItemBudget(
                                  item.approvedBudget,
                                  item.currency,
                                )}
                              </div>
                            </div>
                          )}
                      </div>
                    </div>

                    {/* Phase 4: Action Buttons */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        flexWrap: "wrap",
                        justifyContent: "flex-end",
                      }}
                    >
                      {/* Workflow Transition Buttons based on current status (post-sourcing stages only) */}

                      {item.itemStatus === "Shortlisted" &&
                        canEditItem(item) && (
                          <button
                            className="action-button primary"
                            style={{
                              fontSize: "12px",
                              padding: "8px 12px",
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                            disabled={transitioningItem === item.id}
                            onClick={() =>
                              handleItemTransition(item.id, "interview")
                            }
                          >
                            <Phone size={12} />
                            {transitioningItem === item.id
                              ? "Processing..."
                              : "Schedule Interview"}
                          </button>
                        )}

                      {item.itemStatus === "Interviewing" &&
                        canEditItem(item) && (
                          <button
                            className="action-button primary"
                            style={{
                              fontSize: "12px",
                              padding: "8px 12px",
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                            disabled={transitioningItem === item.id}
                            onClick={() =>
                              handleItemTransition(item.id, "offer")
                            }
                          >
                            <Gift size={12} />
                            {transitioningItem === item.id
                              ? "Processing..."
                              : "Extend Offer"}
                          </button>
                        )}

                      {item.itemStatus === "Pending" && canEditItem(item) && (
                        <button
                          className="action-button primary"
                          style={{
                            fontSize: "12px",
                            padding: "8px 12px",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                          onClick={() =>
                            setSelectedItemForAssignment(
                              selectedItemForAssignment === item.id
                                ? null
                                : item.id,
                            )
                          }
                        >
                          <UserPlus size={12} />
                          {selectedItemForAssignment === item.id
                            ? "Cancel"
                            : "Start Sourcing"}
                        </button>
                      )}

                      {/* Phase 4: HR Kill Switch - Only HR can cancel items */}
                      {isHRUser &&
                        item.itemStatus !== "Fulfilled" &&
                        item.itemStatus !== "Cancelled" && (
                          <button
                            className="action-button"
                            style={{
                              fontSize: "12px",
                              padding: "8px 12px",
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              backgroundColor: "rgba(239, 68, 68, 0.1)",
                              color: "var(--error)",
                              border: "1px solid rgba(239, 68, 68, 0.2)",
                            }}
                            onClick={() => setCancelModalItem(item.id)}
                            title="HR Kill Switch: Cancel this item"
                          >
                            <Ban size={12} />
                            Cancel Item
                          </button>
                        )}
                    </div>
                  </div>

                  {selectedItemForAssignment === item.id &&
                    canEditItem(item) && (
                      <div
                        style={{
                          marginTop: "16px",
                          padding: "16px",
                          backgroundColor: "var(--bg-secondary)",
                          borderRadius: "8px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: "12px",
                          }}
                        >
                          <span style={{ fontSize: "13px", fontWeight: 600 }}>
                            Candidates ({itemCandidates.length})
                          </span>
                          {canEditItem(item) && (
                            <button
                              className="action-button primary"
                              style={{
                                fontSize: "11px",
                                padding: "4px 10px",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                              onClick={() => {
                                setAddCandidateItemId(item.numericItemId);
                                setShowAddCandidate(true);
                              }}
                            >
                              <UserPlus size={12} /> Add Candidate
                            </button>
                          )}
                        </div>
                        {itemCandidates.length === 0 ? (
                          <div
                            style={{
                              fontSize: "12px",
                              color: "var(--text-tertiary)",
                              textAlign: "center",
                              padding: "12px",
                            }}
                          >
                            No candidates yet. Add one to start the pipeline.
                          </div>
                        ) : (
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "8px",
                            }}
                          >
                            {itemCandidates.map((c) => (
                              <div
                                key={c.candidate_id}
                                style={{
                                  padding: "10px 12px",
                                  backgroundColor: "var(--bg-primary)",
                                  borderRadius: "8px",
                                  border: "1px solid var(--border-subtle)",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  cursor: "pointer",
                                }}
                                onClick={() => openCandidateModal(c, "execute")}
                              >
                                <div>
                                  <div
                                    style={{
                                      fontWeight: 500,
                                      fontSize: "13px",
                                    }}
                                  >
                                    {c.full_name}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "11px",
                                      color: "var(--text-tertiary)",
                                    }}
                                  >
                                    {c.email} • {c.interviews.length} round(s)
                                  </div>
                                </div>
                                <span
                                  style={{
                                    padding: "2px 8px",
                                    borderRadius: "12px",
                                    fontSize: "11px",
                                    fontWeight: 600,
                                    backgroundColor:
                                      c.current_stage === "Hired"
                                        ? "rgba(16,185,129,0.1)"
                                        : c.current_stage === "Rejected"
                                          ? "rgba(239,68,68,0.1)"
                                          : "rgba(59,130,246,0.1)",
                                    color:
                                      c.current_stage === "Hired"
                                        ? "#10b981"
                                        : c.current_stage === "Rejected"
                                          ? "#ef4444"
                                          : "#3b82f6",
                                  }}
                                >
                                  {c.current_stage}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Item Audit History - Compact timeline */}
                        <div style={{ marginTop: "16px" }}>
                          <AuditSection
                            entityType="requisition-item"
                            entityId={Number(item.id.replace("ITEM-", ""))}
                            title="Item Audit Trail"
                            compact
                            maxHeight={200}
                            relativeTime
                          />
                        </div>
                      </div>
                    )}
                </div>
              );
            })}
          </div>

          {/* Phase 4: Workflow Guidance */}
          <div
            style={{
              marginTop: "32px",
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
                marginBottom: "12px",
              }}
            >
              <AlertCircle size={16} color="var(--primary-accent)" />
              <strong
                style={{ fontSize: "13px", color: "var(--text-primary)" }}
              >
                Phase 4: TA Execution Workflow
              </strong>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "12px",
              }}
            >
              <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                <strong>1. Sourcing:</strong> Upload CV (mandatory) → Shortlist
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                <strong>2. Shortlisted:</strong> Schedule Interview
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                <strong>3. Interviewing:</strong> Extend Offer or Reject
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                <strong>4. Offered:</strong> Mark Fulfilled with employee ID
              </div>
            </div>
            <p
              style={{
                marginTop: "12px",
                fontSize: "11px",
                color: "var(--text-tertiary)",
              }}
            >
              Note: HR can cancel any item using the Kill Switch (requires
              reason). Auto-closure happens when all items are Fulfilled or
              Cancelled.
            </p>
          </div>

          {/* Phase 4: HR Kill Switch Modal */}
          {cancelModalItem && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
              }}
              onClick={() => {
                setCancelModalItem(null);
                setCancelReason("");
                setCancelError(null);
              }}
            >
              <div
                style={{
                  backgroundColor: "white",
                  borderRadius: "16px",
                  padding: "24px",
                  maxWidth: "480px",
                  width: "90%",
                  boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    marginBottom: "20px",
                  }}
                >
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "10px",
                      backgroundColor: "rgba(239, 68, 68, 0.1)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ban size={20} color="var(--error)" />
                  </div>
                  <div>
                    <h3
                      style={{ fontSize: "16px", fontWeight: 600, margin: 0 }}
                    >
                      Cancel Item - HR Kill Switch
                    </h3>
                    <p
                      style={{
                        fontSize: "12px",
                        color: "var(--text-tertiary)",
                        margin: 0,
                      }}
                    >
                      {cancelModalItem}
                    </p>
                  </div>
                </div>

                {cancelError && (
                  <div
                    style={{
                      marginBottom: "16px",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      backgroundColor: "rgba(239, 68, 68, 0.08)",
                      border: "1px solid rgba(239, 68, 68, 0.2)",
                      color: "var(--error)",
                      fontSize: "12px",
                    }}
                  >
                    {cancelError}
                  </div>
                )}

                <div style={{ marginBottom: "20px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "13px",
                      fontWeight: 500,
                      marginBottom: "8px",
                    }}
                  >
                    Cancellation Reason{" "}
                    <span style={{ color: "var(--error)" }}>*</span>
                  </label>
                  <textarea
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Enter reason for cancellation (minimum 10 characters)..."
                    rows={4}
                    style={{
                      width: "100%",
                      padding: "12px",
                      borderRadius: "8px",
                      border: `1px solid ${
                        cancelError && !cancelReason.trim()
                          ? "var(--error)"
                          : "var(--border-subtle)"
                      }`,
                      fontSize: "13px",
                      resize: "vertical",
                    }}
                  />
                  <p
                    style={{
                      fontSize: "11px",
                      color:
                        cancelReason.length < 10
                          ? "var(--text-tertiary)"
                          : "var(--success)",
                      marginTop: "4px",
                    }}
                  >
                    {cancelReason.length}/10 characters minimum
                  </p>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "12px",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    className="action-button"
                    onClick={() => {
                      setCancelModalItem(null);
                      setCancelReason("");
                      setCancelError(null);
                    }}
                    disabled={cancelling}
                  >
                    Keep Item
                  </button>
                  <button
                    className="action-button"
                    style={{
                      backgroundColor: "var(--error)",
                      color: "white",
                      border: "none",
                    }}
                    onClick={handleCancelItem}
                    disabled={cancelling || cancelReason.trim().length < 10}
                  >
                    {cancelling ? "Cancelling..." : "Confirm Cancellation"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {(activeTab === "ats" ||
        activeTab === "shortlisted" ||
        activeTab === "interviews") && (
        <div className="master-data-manager">
          <div
            className="data-manager-header"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <h2>Candidate Pipeline</h2>
              <p className="subtitle">
                {activeTab === "ats"
                  ? "Quality-bucket board for the selected line — shortlist or reject from the candidate panel."
                  : activeTab === "shortlisted"
                    ? "Shortlisted applications only. Open a row for interviews and stage moves."
                    : "Interviewing-stage roster and scheduled rounds for this requisition."}
              </p>
            </div>
            {ticket.items.some((it) => canEditItem(it)) && (
              <button
                className="action-button primary"
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
                onClick={() => {
                  const editableItem = ticket.items.find((it) =>
                    canEditItem(it),
                  );
                  setAddCandidateItemId(
                    editableItem?.numericItemId ??
                      ticket.items[0]?.numericItemId ??
                      null,
                  );
                  setShowAddCandidate(true);
                }}
                disabled={!ticket.items.length}
              >
                <UserPlus size={14} /> Add Candidate
              </button>
            )}
          </div>

          {/* Add Candidate Form */}
          {showAddCandidate && (
            <form
              onSubmit={handleAddCandidate}
              style={{
                marginBottom: "20px",
                padding: "20px",
                borderRadius: "12px",
                backgroundColor: "rgba(59,130,246,0.04)",
                border: "1px solid rgba(59,130,246,0.15)",
              }}
            >
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  marginBottom: "16px",
                }}
              >
                Add New Candidate
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  marginBottom: "12px",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ flex: 1, minWidth: "180px" }}>
                  <label
                    style={{
                      fontSize: "12px",
                      fontWeight: 500,
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    Position *
                  </label>
                  <select
                    value={addCandidateItemId ?? ""}
                    onChange={(e) =>
                      setAddCandidateItemId(Number(e.target.value))
                    }
                    required
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-subtle)",
                      fontSize: "13px",
                    }}
                  >
                    {ticket.items.map((it) => (
                      <option key={it.numericItemId} value={it.numericItemId}>
                        {it.skill} — {it.level}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: "180px" }}>
                  <label
                    style={{
                      fontSize: "12px",
                      fontWeight: 500,
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={newCandidateName}
                    onChange={(e) => setNewCandidateName(e.target.value)}
                    required
                    placeholder="e.g., Tejas Patil"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-subtle)",
                      fontSize: "13px",
                    }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: "180px" }}>
                  <label
                    style={{
                      fontSize: "12px",
                      fontWeight: 500,
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    Email *
                  </label>
                  <input
                    type="email"
                    value={newCandidateEmail}
                    onChange={(e) => setNewCandidateEmail(e.target.value)}
                    required
                    placeholder="tejas@example.com"
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
                  gap: "12px",
                  marginBottom: "16px",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ flex: 1, minWidth: "180px" }}>
                  <label
                    style={{
                      fontSize: "12px",
                      fontWeight: 500,
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={newCandidatePhone}
                    onChange={(e) => setNewCandidatePhone(e.target.value)}
                    placeholder="+91-XXXXXXXXXX"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-subtle)",
                      fontSize: "13px",
                    }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: "180px" }}>
                  <label
                    style={{
                      fontSize: "12px",
                      fontWeight: 500,
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    Resume (PDF/DOC)
                  </label>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
                    style={{ width: "100%", padding: "6px", fontSize: "12px" }}
                  />
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  marginBottom: "16px",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ flex: 1, minWidth: "140px" }}>
                  <label
                    style={{
                      fontSize: "12px",
                      fontWeight: 500,
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    Years experience (ATS)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={80}
                    step={0.5}
                    value={newCandidateExp}
                    onChange={(e) => setNewCandidateExp(e.target.value)}
                    placeholder="e.g. 5"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-subtle)",
                      fontSize: "13px",
                    }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: "140px" }}>
                  <label
                    style={{
                      fontSize: "12px",
                      fontWeight: 500,
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    Notice (days)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={newCandidateNotice}
                    onChange={(e) => setNewCandidateNotice(e.target.value)}
                    placeholder="0 = immediate"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-subtle)",
                      fontSize: "13px",
                    }}
                  />
                </div>
                <div
                  style={{
                    flex: "1 1 200px",
                    display: "flex",
                    alignItems: "flex-end",
                    paddingBottom: "4px",
                  }}
                >
                  <label
                    style={{
                      fontSize: "12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={newCandidateReferral}
                      onChange={(e) => setNewCandidateReferral(e.target.checked)}
                    />
                    Referral (ATS bonus)
                  </label>
                </div>
              </div>
              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Skills (comma-separated, ATS)
                </label>
                <input
                  type="text"
                  value={newCandidateSkills}
                  onChange={(e) => setNewCandidateSkills(e.target.value)}
                  placeholder="React, Python, AWS"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-subtle)",
                    fontSize: "13px",
                  }}
                />
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
                  style={{ fontSize: "12px", padding: "8px 16px" }}
                  onClick={() => {
                    setShowAddCandidate(false);
                    setAddCandidateItemId(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="action-button primary"
                  style={{ fontSize: "12px", padding: "8px 16px" }}
                  disabled={
                    addingCandidate ||
                    !newCandidateName.trim() ||
                    !newCandidateEmail.trim()
                  }
                >
                  {addingCandidate ? "Adding..." : "Add Candidate"}
                </button>
              </div>
            </form>
          )}


          {activeTab === "ats" && (
            <>
          <div
            style={{
              marginBottom: "18px",
              display: "flex",
              flexWrap: "wrap",
              gap: "12px",
              alignItems: "center",
            }}
          >
            <label
              style={{
                fontSize: "12px",
                fontWeight: 500,
                color: "var(--text-secondary)",
              }}
            >
              Position (line):
            </label>
            <select
              value={atsBoardItemId ?? ""}
              onChange={(e) => setAtsBoardItemId(Number(e.target.value))}
              style={{
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid var(--border-subtle)",
                fontSize: "12px",
                backgroundColor: "var(--bg-primary)",
                color: "var(--text-primary)",
                minWidth: "220px",
              }}
            >
              {ticket.items.map((item) => (
                <option key={item.numericItemId} value={item.numericItemId}>
                  {item.skill} — {item.level}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="action-button"
              style={{ fontSize: "11px", padding: "6px 12px" }}
              disabled={!atsBoardItemId || atsBoardLoading}
              onClick={() => {
                if (!atsBoardItemId) return;
                void (async () => {
                  setAtsBoardLoading(true);
                  try {
                    const ab = await fetchApplicationsAtsBuckets(atsBoardItemId);
                    setAtsBucketsData(ab);
                  } catch {
                    setAtsBucketsData(null);
                  } finally {
                    setAtsBoardLoading(false);
                  }
                })();
              }}
            >
              <RefreshCw size={12} style={{ marginRight: "4px" }} />
              Refresh buckets
            </button>
          </div>

          <div
            style={{
              marginBottom: "20px",
              padding: "14px",
              borderRadius: "12px",
              border: "1px solid var(--border-subtle)",
              backgroundColor: "var(--bg-secondary)",
            }}
          >
            <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>
              ATS evaluation board
            </div>
            <p
              style={{
                fontSize: "11px",
                color: "var(--text-tertiary)",
                marginTop: 0,
                marginBottom: "12px",
                lineHeight: 1.45,
              }}
            >
              Click a card for read-only evaluation and shortlist. Interview scheduling
              and pipeline moves are on the Shortlisted and Interviews tabs.
            </p>
            {atsBoardLoading ? (
              <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                Loading ATS buckets…
              </div>
            ) : !atsBucketsData ? (
              <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                No bucket data yet for this line. Open ranking settings below or
                refresh.
              </div>
            ) : (
              <>
                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    overflowX: "auto",
                    paddingBottom: "8px",
                  }}
                >
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
                    return (
                      <div
                        key={bucketKey}
                        style={{
                          minWidth: "160px",
                          flex: "0 0 auto",
                          border: "1px solid var(--border-subtle)",
                          borderRadius: "8px",
                          padding: "8px",
                          backgroundColor: "var(--bg-primary)",
                          maxHeight: "360px",
                          overflowY: "auto",
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
                            {atsBucketsData.meta?.truncated?.[bucketKey] ? "+" : ""}
                            )
                          </span>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "6px",
                          }}
                        >
                          {apps.map((app) => {
                            const bd = app.ranking?.breakdown;
                            const snippet = bd ? rankingBreakdownSnippet(bd) : "";
                            return (
                              <div
                                key={app.application_id}
                                role="button"
                                tabIndex={0}
                                onClick={() => openEvaluateFromAtsApp(app)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    openEvaluateFromAtsApp(app);
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
                                    const s = atsBoardScoreByCandidateId.get(app.candidate_id);
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
                  <div style={{ fontSize: "11px", fontWeight: 600, marginBottom: "6px" }}>
                    Unranked
                  </div>
                  <div style={{ display: "flex", gap: "10px", overflowX: "auto" }}>
                    {(atsBucketsData.UNRANKED ?? []).length === 0 ? (
                      <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                        None
                      </span>
                    ) : (
                      (atsBucketsData.UNRANKED ?? []).map((app) => (
                        <div
                          key={app.application_id}
                          role="button"
                          tabIndex={0}
                          onClick={() => openEvaluateFromAtsApp(app)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openEvaluateFromAtsApp(app);
                            }
                          }}
                          style={{
                            fontSize: "11px",
                            padding: "8px 10px",
                            borderRadius: "8px",
                            border: "1px solid var(--border-subtle)",
                            cursor: "pointer",
                            minWidth: "120px",
                            backgroundColor: "var(--bg-primary)",
                          }}
                        >
                          <div style={{ fontWeight: 600 }}>{app.candidate.full_name}</div>
                          <div style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>
                            {app.current_stage}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <details
            open={pipelineAdvancedOpen}
            onToggle={(e) =>
              setPipelineAdvancedOpen((e.target as HTMLDetailsElement).open)
            }
            style={{ marginBottom: "8px" }}
          >
            <summary
              style={{
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 600,
                marginBottom: "12px",
                userSelect: "none",
              }}
            >
              Ranking settings, pipeline board, and filters (advanced)
            </summary>

          {/* Phase 4 board columns (compact counters + full-stage expand) */}
          <div
            style={{
              marginBottom: "20px",
              padding: "14px",
              borderRadius: "12px",
              border: "1px solid var(--border-subtle)",
              backgroundColor: "var(--bg-secondary)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "10px",
              }}
            >
              <div style={{ fontSize: "13px", fontWeight: 600 }}>
                Applications Pipeline Board
              </div>
              <button
                className="action-button"
                onClick={() => {
                  void loadPipelineCompact();
                  if (expandedPipelineStage) {
                    setPipelineFull(null);
                    void loadPipelineFull();
                  }
                }}
                style={{ fontSize: "11px", padding: "4px 10px" }}
              >
                <RefreshCw size={12} style={{ marginRight: "4px" }} />
                Refresh
              </button>
            </div>

            {pipelineLoading ? (
              <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                Loading compact counters...
              </div>
            ) : (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {[
                  "Sourced",
                  "Shortlisted",
                  "Interviewing",
                  "Offered",
                  "Hired",
                  "Rejected",
                ].map((stage) => {
                  const isExpanded = expandedPipelineStage === stage;
                  return (
                    <button
                      key={stage}
                      onClick={() =>
                        setExpandedPipelineStage((prev) =>
                          prev === stage ? null : stage,
                        )
                      }
                      style={{
                        border: isExpanded
                          ? "2px solid var(--primary-accent)"
                          : "1px solid var(--border-subtle)",
                        borderRadius: "10px",
                        padding: "8px 12px",
                        background: isExpanded
                          ? "rgba(59,130,246,0.08)"
                          : "var(--bg-primary)",
                        cursor: "pointer",
                        minWidth: "132px",
                        textAlign: "left",
                      }}
                    >
                      <div style={{ fontSize: "12px", fontWeight: 600 }}>{stage}</div>
                      <div
                        style={{
                          fontSize: "18px",
                          fontWeight: 700,
                          color: "var(--text-primary)",
                        }}
                      >
                        {pipelineCountByStage[stage] ?? 0}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {expandedPipelineStage && (
              <div style={{ marginTop: "12px" }}>
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--text-tertiary)",
                    marginBottom: "8px",
                  }}
                >
                  Expanded stage: {expandedPipelineStage}
                </div>
                {pipelineFullLoading ? (
                  <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                    Loading full stage details...
                  </div>
                ) : expandedStageApplications.length === 0 ? (
                  <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                    No applications in this stage.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {expandedStageApplications.map((app) => (
                      <div
                        key={app.application_id}
                        onClick={() =>
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
                          )
                        }
                        style={{
                          padding: "10px 12px",
                          borderRadius: "8px",
                          border: "1px solid var(--border-subtle)",
                          backgroundColor: "var(--bg-primary)",
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: "13px", fontWeight: 600 }}>
                            {app.candidate.full_name}
                          </div>
                          <div
                            style={{
                              fontSize: "12px",
                              color: "var(--text-secondary)",
                            }}
                          >
                            {app.candidate.email}
                          </div>
                        </div>
                        <div
                          style={{
                            fontSize: "11px",
                            color: "var(--text-tertiary)",
                          }}
                        >
                          App #{app.application_id}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Phase 5 ranking visibility panel */}
          <div
            style={{
              marginBottom: "20px",
              padding: "14px",
              borderRadius: "12px",
              border: "1px solid var(--border-subtle)",
              backgroundColor: "var(--bg-secondary)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "10px",
                flexWrap: "wrap",
                marginBottom: "10px",
              }}
            >
              <div>
                <div style={{ fontSize: "13px", fontWeight: 600 }}>
                  Ranking & Semantic Fit
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                  Keyword + semantic/vector + business scoring
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  flexWrap: "wrap",
                }}
              >
                <select
                  value={rankingItemId ?? ""}
                  onChange={(e) => setAtsBoardItemId(Number(e.target.value))}
                  style={{
                    padding: "6px 10px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-subtle)",
                    fontSize: "12px",
                    backgroundColor: "var(--bg-primary)",
                    color: "var(--text-primary)",
                  }}
                >
                  {ticket.items.map((item) => (
                    <option key={item.numericItemId} value={item.numericItemId}>
                      Item #{item.numericItemId} - {item.skill}
                    </option>
                  ))}
                </select>
                <button
                  className="action-button"
                  onClick={() => void loadRanking(false)}
                  style={{ fontSize: "11px", padding: "4px 10px" }}
                >
                  <RefreshCw size={12} style={{ marginRight: "4px" }} />
                  Refresh
                </button>
                <button
                  className="action-button primary"
                  onClick={() => void loadRanking(true)}
                  style={{ fontSize: "11px", padding: "4px 10px" }}
                >
                  {rankingRefreshing ? "Recomputing..." : "Recompute"}
                </button>
                <button
                  className="action-button"
                  disabled={aiEvalWorking || !rankingItemId}
                  onClick={() => void runAiEvalAllPresent()}
                  style={{ fontSize: "11px", padding: "4px 10px" }}
                  title="Runs AI evaluation for all currently ranked candidates and stores results."
                >
                  {aiEvalWorking ? "AI evaluating..." : "AI Eval (All)"}
                </button>
              </div>
            </div>

            <div
              style={{
                marginBottom: "12px",
                paddingBottom: "12px",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>
                Ranking job description (ATS)
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--text-tertiary)",
                  marginBottom: "10px",
                  lineHeight: 1.45,
                }}
              >
                Optional text or PDF used only to rank candidates for the selected
                item. It does not replace the manager&apos;s requisition JD on the
                item.
              </div>
              {!canEditPipelineRankingJd ? (
                <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                  TA, HR, Admin, Owner, or Manager role is required to change these
                  settings.
                </div>
              ) : null}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "12px",
                  cursor: canEditPipelineRankingJd ? "pointer" : "default",
                  marginBottom: "10px",
                }}
              >
                <input
                  type="checkbox"
                  checked={useRequisitionJd}
                  disabled={!canEditPipelineRankingJd}
                  onChange={(e) => setUseRequisitionJd(e.target.checked)}
                />
                <span>Use same JD as requisition (manager item + header PDFs)</span>
              </label>
              {!useRequisitionJd ? (
                <>
                  <textarea
                    value={pipelineJdTextDraft}
                    onChange={(e) => setPipelineJdTextDraft(e.target.value)}
                    disabled={!canEditPipelineRankingJd || pipelineJdSaving}
                    placeholder="Paste or type a JD for ranking..."
                    rows={5}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "8px 10px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-subtle)",
                      fontSize: "12px",
                      fontFamily: "inherit",
                      resize: "vertical",
                      backgroundColor: "var(--bg-primary)",
                      color: "var(--text-primary)",
                    }}
                  />
                  <input
                    ref={pipelineJdFileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void uploadPipelineRankingJdPdf(file);
                    }}
                  />
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "8px",
                      marginTop: "8px",
                      alignItems: "center",
                    }}
                  >
                    <button
                      type="button"
                      className="action-button"
                      disabled={
                        !canEditPipelineRankingJd || pipelineJdUploading
                      }
                      onClick={() => pipelineJdFileInputRef.current?.click()}
                      style={{ fontSize: "11px", padding: "4px 10px" }}
                    >
                      <Upload size={12} style={{ marginRight: "4px" }} />
                      {pipelineJdUploading ? "Uploading..." : "Upload ranking PDF"}
                    </button>
                    {pipelineRankingTargetItem?.pipelineJdFileKey ? (
                      <button
                        type="button"
                        className="action-button"
                        disabled={
                          !canEditPipelineRankingJd || pipelineJdUploading
                        }
                        onClick={() => void removePipelineRankingJdPdf()}
                        style={{ fontSize: "11px", padding: "4px 10px" }}
                      >
                        Remove ranking PDF
                      </button>
                    ) : null}
                  </div>
                </>
              ) : null}
              {useRequisitionJd &&
              pipelineRankingTargetItem &&
              (Boolean(pipelineRankingTargetItem.pipelineJdText?.trim()) ||
                Boolean(pipelineRankingTargetItem.pipelineJdFileKey)) ? (
                <div
                  style={{
                    fontSize: "11px",
                    color: "var(--text-tertiary)",
                    marginTop: "8px",
                    lineHeight: 1.45,
                  }}
                >
                  Custom ranking text or PDF is saved but ignored while
                  &quot;Use same JD as requisition&quot; is checked.
                </div>
              ) : null}
              {!useRequisitionJd && pipelineRankingTargetItem?.pipelineJdFileKey ? (
                <div
                  style={{
                    fontSize: "11px",
                    color: "var(--text-secondary)",
                    marginTop: "6px",
                  }}
                >
                  A custom ranking PDF is attached for this item (combined with the
                  text above when both are present).
                </div>
              ) : null}
              <div style={{ marginTop: "12px" }}>
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    display: "block",
                    marginBottom: "6px",
                  }}
                >
                  ATS required skills (optional)
                </label>
                <div
                  style={{
                    fontSize: "11px",
                    color: "var(--text-tertiary)",
                    marginBottom: "6px",
                    lineHeight: 1.45,
                  }}
                >
                  Comma-separated list. Overrides Primary/Secondary parsing from item
                  requirements when non-empty.
                </div>
                <textarea
                  value={rankingRequiredSkillsDraft}
                  onChange={(e) => setRankingRequiredSkillsDraft(e.target.value)}
                  disabled={!canEditPipelineRankingJd || pipelineJdSaving}
                  placeholder="e.g. React, Node.js, PostgreSQL"
                  rows={2}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "8px 10px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-subtle)",
                    fontSize: "12px",
                    fontFamily: "inherit",
                    resize: "vertical",
                    backgroundColor: "var(--bg-primary)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>
              <div style={{ marginTop: "10px" }}>
                <button
                  type="button"
                  className="action-button primary"
                  disabled={
                    !canEditPipelineRankingJd ||
                    pipelineJdSaving ||
                    !pipelineRankingTargetItem
                  }
                  onClick={() => void savePipelineRankingJdSettings()}
                  style={{ fontSize: "11px", padding: "4px 10px" }}
                >
                  {pipelineJdSaving ? "Saving..." : "Save ranking JD settings"}
                </button>
              </div>
              {pipelineJdMessage ? (
                <div
                  style={{
                    marginTop: "8px",
                    fontSize: "11px",
                    color: "var(--text-secondary)",
                  }}
                >
                  {pipelineJdMessage}
                </div>
              ) : null}
            </div>

            {rankingLoading ? (
              <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                Loading ranking...
              </div>
            ) : rankingError ? (
              <div style={{ fontSize: "12px", color: "var(--error)" }}>{rankingError}</div>
            ) : !rankingData ? (
              <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                Ranking not available for this position yet.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap",
                    fontSize: "11px",
                    color: "var(--text-secondary)",
                  }}
                >
                  <span>Version: {rankingData.ranking_version}</span>
                  <span>Total: {rankingData.total_candidates}</span>
                  <span>
                    Generated: {new Date(rankingData.generated_at).toLocaleString()}
                  </span>
                </div>

                <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                  Candidate ranking preview is hidden on this page. Use the ATS evaluation board,
                  pipeline board, and filters above to manage candidates.
                </div>
              </div>
            )}
          </div>

          {/* Filters: Item and Stage */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              marginBottom: "20px",
            }}
          >
            {/* Item filter */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                flexWrap: "wrap",
              }}
            >
              <label
                style={{
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                }}
              >
                Filter by Position:
              </label>
              <select
                value={
                  candidateItemFilter === "all" ? "all" : candidateItemFilter
                }
                onChange={(e) =>
                  setCandidateItemFilter(
                    e.target.value === "all" ? "all" : Number(e.target.value),
                  )
                }
                style={{
                  padding: "6px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-subtle)",
                  fontSize: "12px",
                  backgroundColor: "var(--bg-primary)",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  minWidth: "200px",
                }}
              >
                <option value="all">All Positions</option>
                {ticket.items.map((item) => {
                  const itemCandidateCount =
                    candidatesByItemId.get(item.numericItemId)?.length ?? 0;
                  return (
                    <option key={item.numericItemId} value={item.numericItemId}>
                      {item.skill} ({itemCandidateCount})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Stage filter tabs */}
            <div
              style={{
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
              }}
            >
              {[
                "all",
                "Sourced",
                "Shortlisted",
                "Interviewing",
                "Offered",
                "Hired",
                "Rejected",
              ].map((stage) => {
                const filteredByItem =
                  candidateItemFilter === "all"
                    ? candidates
                    : (candidatesByItemId.get(candidateItemFilter) ?? []);
                const count =
                  stage === "all"
                    ? filteredByItem.length
                    : filteredByItem.filter((c) => c.current_stage === stage)
                        .length;
                const isActive = candidateStageFilter === stage;
                return (
                  <button
                    key={stage}
                    onClick={() => setCandidateStageFilter(stage)}
                    style={{
                      padding: "6px 14px",
                      borderRadius: "20px",
                      fontSize: "12px",
                      fontWeight: isActive ? 600 : 400,
                      border: isActive
                        ? "2px solid var(--primary-accent)"
                        : "1px solid var(--border-subtle)",
                      backgroundColor: isActive
                        ? "rgba(59,130,246,0.08)"
                        : "transparent",
                      color: isActive
                        ? "var(--primary-accent)"
                        : "var(--text-secondary)",
                      cursor: "pointer",
                    }}
                  >
                    {stage === "all" ? "All" : stage} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Candidate cards (Kanban-style by stage) */}
          {candidatesLoading ? (
            <div
              style={{
                padding: "40px",
                textAlign: "center",
                color: "var(--text-tertiary)",
              }}
            >
              Loading candidates...
            </div>
          ) : candidates.length === 0 ? (
            <div
              style={{
                padding: "40px",
                textAlign: "center",
                color: "var(--text-tertiary)",
                fontSize: "14px",
              }}
            >
              <UserPlus
                size={32}
                style={{ marginBottom: "8px", opacity: 0.4 }}
              />
              <p>
                No candidates yet. Add your first candidate to start the
                pipeline.
              </p>
            </div>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              {candidates
                .filter((c) => {
                  // Item filter
                  if (
                    candidateItemFilter !== "all" &&
                    c.requisition_item_id !== candidateItemFilter
                  ) {
                    return false;
                  }
                  // Stage filter
                  if (
                    candidateStageFilter !== "all" &&
                    c.current_stage !== candidateStageFilter
                  ) {
                    return false;
                  }
                  return true;
                })
                .map((c) => {
                  const linkedItem = ticket.items.find(
                    (it) => it.numericItemId === c.requisition_item_id,
                  );
                  const stageColors: Record<
                    string,
                    { bg: string; text: string }
                  > = {
                    Sourced: { bg: "rgba(100,116,139,0.1)", text: "#64748b" },
                    Shortlisted: {
                      bg: "rgba(59,130,246,0.1)",
                      text: "#3b82f6",
                    },
                    Interviewing: {
                      bg: "rgba(168,85,247,0.1)",
                      text: "#a855f7",
                    },
                    Offered: { bg: "rgba(245,158,11,0.1)", text: "#f59e0b" },
                    Hired: { bg: "rgba(16,185,129,0.1)", text: "#10b981" },
                    Rejected: { bg: "rgba(239,68,68,0.1)", text: "#ef4444" },
                  };
                  const sc =
                    stageColors[c.current_stage] ?? stageColors["Sourced"]!;

                  return (
                    <div
                      key={c.candidate_id}
                      onClick={() => openCandidateModal(c, "evaluate")}
                      style={{
                        padding: "16px 20px",
                        backgroundColor: "var(--bg-primary)",
                        borderRadius: "12px",
                        border: "1px solid var(--border-subtle)",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                          }}
                        >
                          <div
                            style={{
                              width: "40px",
                              height: "40px",
                              borderRadius: "8px",
                              background:
                                "linear-gradient(135deg, var(--slate-600), var(--slate-700))",
                              color: "white",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 600,
                              fontSize: "14px",
                            }}
                          >
                            {c.full_name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: "14px" }}>
                              {c.full_name}
                            </div>
                            <div
                              style={{
                                fontSize: "12px",
                                color: "var(--text-secondary)",
                              }}
                            >
                              {c.email}
                              {c.phone ? ` • ${c.phone}` : ""}
                            </div>
                            {linkedItem && (
                              <div
                                style={{
                                  fontSize: "11px",
                                  color: "var(--text-tertiary)",
                                  marginTop: "2px",
                                }}
                              >
                                Position: {linkedItem.skill} —{" "}
                                {linkedItem.level}
                              </div>
                            )}
                          </div>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "12px",
                              color: "var(--text-tertiary)",
                            }}
                          >
                            {c.interviews.length} round
                            {c.interviews.length !== 1 ? "s" : ""}
                          </span>
                          <span
                            style={{
                              padding: "4px 10px",
                              borderRadius: "20px",
                              fontSize: "11px",
                              fontWeight: 600,
                              backgroundColor: sc.bg,
                              color: sc.text,
                            }}
                          >
                            {c.current_stage}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
          </details>
            </>
          )}

        {activeTab === "shortlisted" && (
          <div style={{ marginTop: "8px" }}>
            {transitionError ? (
              <div
                style={{
                  marginBottom: "14px",
                  padding: "12px 16px",
                  borderRadius: "10px",
                  backgroundColor: "rgba(239, 68, 68, 0.08)",
                  border: "1px solid rgba(239, 68, 68, 0.2)",
                  color: "var(--error)",
                  fontSize: "13px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <AlertCircle size={16} />
                {transitionError}
                <button
                  type="button"
                  onClick={() => setTransitionError(null)}
                  style={{
                    marginLeft: "auto",
                    background: "none",
                    border: "none",
                    color: "var(--error)",
                    cursor: "pointer",
                  }}
                >
                  ×
                </button>
              </div>
            ) : null}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "12px",
                alignItems: "center",
                marginBottom: "14px",
              }}
            >
              <label style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                Position:
              </label>
              <select
                value={candidateItemFilter === "all" ? "all" : candidateItemFilter}
                onChange={(e) =>
                  setCandidateItemFilter(
                    e.target.value === "all" ? "all" : Number(e.target.value),
                  )
                }
                style={{
                  padding: "6px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-subtle)",
                  fontSize: "12px",
                  backgroundColor: "var(--bg-primary)",
                }}
              >
                <option value="all">All positions</option>
                {ticket.items.map((item) => (
                  <option key={item.numericItemId} value={item.numericItemId}>
                    {item.skill} — {item.level}
                  </option>
                ))}
              </select>
              {shortlistedCandidatesForTable.some((c) => c.application_id) ? (
                <button
                  type="button"
                  className="action-button"
                  style={{ fontSize: "11px", padding: "6px 12px" }}
                  onClick={() => {
                    const ids = shortlistedCandidatesForTable
                      .map((c) => c.application_id)
                      .filter((id): id is number => id != null);
                    const allSelected =
                      ids.length > 0 &&
                      ids.every((id) => shortlistBulkAppIds.includes(id));
                    if (allSelected) {
                      setShortlistBulkAppIds([]);
                    } else {
                      setShortlistBulkAppIds(ids);
                    }
                  }}
                >
                  Toggle all
                </button>
              ) : null}
              <button
                type="button"
                className="action-button primary"
                style={{ fontSize: "11px", padding: "6px 12px" }}
                disabled={
                  shortlistBulkWorking || shortlistBulkAppIds.length === 0
                }
                onClick={() => void handleBulkShortlistToInterviewing()}
              >
                {shortlistBulkWorking
                  ? "Updating…"
                  : `Move ${shortlistBulkAppIds.length} to Interviewing`}
              </button>
            </div>
            {candidatesLoading ? (
              <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                Loading…
              </div>
            ) : shortlistedCandidatesForTable.length === 0 ? (
              <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                No shortlisted candidates for this filter.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "12px",
                  }}
                >
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--text-tertiary)" }}>
                      <th
                        style={{
                          padding: "8px",
                          borderBottom: "1px solid var(--border-subtle)",
                        }}
                      >
                        Select
                      </th>
                      <th
                        style={{
                          padding: "8px 10px",
                          borderBottom: "1px solid var(--border-subtle)",
                        }}
                      >
                        Name
                      </th>
                      <th
                        style={{
                          padding: "8px 10px",
                          borderBottom: "1px solid var(--border-subtle)",
                        }}
                      >
                        Email
                      </th>
                      <th
                        style={{
                          padding: "8px 10px",
                          borderBottom: "1px solid var(--border-subtle)",
                        }}
                      >
                        Position
                      </th>
                      <th
                        style={{
                          padding: "8px 10px",
                          borderBottom: "1px solid var(--border-subtle)",
                        }}
                      >
                        Experience
                      </th>
                      <th
                        style={{
                          padding: "8px 10px",
                          borderBottom: "1px solid var(--border-subtle)",
                        }}
                      >
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...shortlistedCandidatesForTable]
                      .sort((a, b) =>
                        a.full_name.localeCompare(b.full_name, undefined, {
                          sensitivity: "base",
                        }),
                      )
                      .map((c) => {
                        const linkedItem = ticket.items.find(
                          (it) => it.numericItemId === c.requisition_item_id,
                        );
                        const appId = c.application_id;
                        return (
                          <tr
                            key={`${c.application_id ?? c.candidate_id}-${c.requisition_item_id}`}
                            style={{ backgroundColor: "var(--bg-primary)" }}
                          >
                            <td
                              style={{
                                padding: "8px",
                                borderBottom: "1px solid var(--border-subtle)",
                              }}
                            >
                              {appId != null ? (
                                <input
                                  type="checkbox"
                                  checked={shortlistBulkAppIds.includes(appId)}
                                  onChange={() => {
                                    setShortlistBulkAppIds((prev) =>
                                      prev.includes(appId)
                                        ? prev.filter((id) => id !== appId)
                                        : [...prev, appId],
                                    );
                                  }}
                                  aria-label={`Select ${c.full_name}`}
                                />
                              ) : null}
                            </td>
                            <td
                              style={{
                                padding: "10px",
                                borderBottom: "1px solid var(--border-subtle)",
                                fontWeight: 600,
                              }}
                            >
                              {c.full_name}
                            </td>
                            <td
                              style={{
                                padding: "10px",
                                borderBottom: "1px solid var(--border-subtle)",
                                color: "var(--text-secondary)",
                              }}
                            >
                              {c.email}
                            </td>
                            <td
                              style={{
                                padding: "10px",
                                borderBottom: "1px solid var(--border-subtle)",
                              }}
                            >
                              {linkedItem
                                ? `${linkedItem.skill} — ${linkedItem.level}`
                                : `Item #${c.requisition_item_id}`}
                            </td>
                            <td
                              style={{
                                padding: "10px",
                                borderBottom: "1px solid var(--border-subtle)",
                              }}
                            >
                              {c.total_experience_years != null
                                ? `${c.total_experience_years} yrs`
                                : "—"}
                            </td>
                            <td
                              style={{
                                padding: "10px",
                                borderBottom: "1px solid var(--border-subtle)",
                              }}
                            >
                              <button
                                type="button"
                                className="action-button"
                                style={{ fontSize: "11px", padding: "4px 10px" }}
                                onClick={() => openCandidateModal(c, "execute")}
                              >
                                Open
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "interviews" && (
          <div style={{ marginTop: "8px", fontFamily: interviewUi.fontSans }}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "12px",
                alignItems: "center",
                marginBottom: "16px",
                padding: "12px 14px",
                borderRadius: interviewUi.radiusMd,
                border: `1px solid ${interviewUi.border}`,
                backgroundColor: interviewUi.surface,
              }}
            >
              <label style={{ fontSize: "12px", color: interviewUi.textMuted }}>
                Position:
              </label>
              <select
                value={candidateItemFilter === "all" ? "all" : candidateItemFilter}
                onChange={(e) =>
                  setCandidateItemFilter(
                    e.target.value === "all" ? "all" : Number(e.target.value),
                  )
                }
                style={{
                  padding: "6px 12px",
                  borderRadius: interviewUi.radiusSm,
                  border: `1px solid ${interviewUi.border}`,
                  fontSize: "12px",
                  backgroundColor: interviewUi.bg,
                  color: interviewUi.text,
                }}
              >
                <option value="all">All positions</option>
                {ticket.items.map((item) => (
                  <option key={item.numericItemId} value={item.numericItemId}>
                    {item.skill} — {item.level}
                  </option>
                ))}
              </select>
            </div>

            <div
              style={{
                marginBottom: "24px",
                padding: "16px",
                borderRadius: interviewUi.radiusLg,
                border: `1px solid ${interviewUi.border}`,
                backgroundColor: interviewUi.surface,
                boxShadow: interviewUi.shadow,
              }}
            >
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  marginBottom: "6px",
                  color: interviewUi.text,
                }}
              >
                Candidates in Interviewing stage
              </div>
              <p
                style={{
                  fontSize: "11px",
                  color: interviewUi.textMuted,
                  marginTop: 0,
                  marginBottom: "12px",
                  lineHeight: 1.45,
                }}
              >
                Pipeline stage <strong style={{ color: interviewUi.text }}>Interviewing</strong>{" "}
                is separate from calendar rounds. Use{" "}
                <strong style={{ color: interviewUi.text }}>Schedule interview</strong> to add a
                round (or <strong style={{ color: interviewUi.text }}>Profile</strong> for the
                full hiring view).
              </p>
              {candidatesLoading ? (
                <div style={{ fontSize: "12px", color: interviewUi.textSubtle }}>
                  Loading…
                </div>
              ) : interviewingCandidatesForTable.length === 0 ? (
                <div style={{ fontSize: "12px", color: interviewUi.textSubtle }}>
                  No candidates in Interviewing for this filter. Move someone from Shortlisted or
                  open a profile to change stage.
                </div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Name</TH>
                      <TH>Email</TH>
                      <TH>Position</TH>
                      <TH>Stage</TH>
                      <TH>Actions</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {[...interviewingCandidatesForTable]
                      .sort((a, b) =>
                        a.full_name.localeCompare(b.full_name, undefined, {
                          sensitivity: "base",
                        }),
                      )
                      .map((c) => {
                        const linkedItem = ticket.items.find(
                          (it) => it.numericItemId === c.requisition_item_id,
                        );
                        return (
                          <TR
                            key={`int-pipeline-${c.application_id ?? c.candidate_id}-${c.requisition_item_id}`}
                            hover
                          >
                            <TD className="font-medium text-[--color-text]">
                              {c.full_name}
                            </TD>
                            <TD className="text-[--color-text-muted]">{c.email}</TD>
                            <TD className="text-[--color-text]">
                              {linkedItem
                                ? `${linkedItem.skill} — ${linkedItem.level}`
                                : `Item #${c.requisition_item_id}`}
                            </TD>
                            <TD className="text-[--color-text-muted]">
                              {c.current_stage}
                            </TD>
                            <TD>
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  className="rounded-lg bg-[--color-accent] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-95"
                                  onClick={() => openCandidateModal(c, "execute")}
                                >
                                  Schedule interview
                                </button>
                                <button
                                  type="button"
                                  className="rounded-lg border border-[--color-border] bg-white px-3 py-1.5 text-xs font-semibold text-[--color-text-muted] hover:bg-slate-50"
                                  onClick={() => openCandidateModal(c, "execute")}
                                >
                                  Profile
                                </button>
                              </div>
                            </TD>
                          </TR>
                        );
                      })}
                  </TBody>
                </Table>
              )}
            </div>

            <div
              style={{
                fontSize: "13px",
                fontWeight: 600,
                marginBottom: "10px",
                color: interviewUi.text,
              }}
            >
              Scheduled interview rounds
            </div>
            {reqInterviewsLoading ? (
              <div style={{ fontSize: "12px", color: interviewUi.textSubtle }}>
                Loading scheduled rounds…
              </div>
            ) : reqInterviews.length === 0 ? (
              <div
                style={{
                  padding: "14px 16px",
                  borderRadius: interviewUi.radiusMd,
                  border: `1px solid ${interviewUi.border}`,
                  borderLeft: `3px solid ${interviewUi.accent}`,
                  backgroundColor: interviewUi.surfaceElevated,
                  fontSize: "12px",
                  color: interviewUi.textMuted,
                  lineHeight: 1.5,
                }}
              >
                {interviewingCandidatesForTable.length > 0 ? (
                  <>
                    <strong style={{ color: interviewUi.text }}>
                      No calendar rounds yet — that’s expected.
                    </strong>{" "}
                    The table above is the <em>Interviewing</em> pipeline list. This section only
                    lists <strong style={{ color: interviewUi.text }}>scheduled</strong> rounds
                    (date, interviewer, status). Click{" "}
                    <strong style={{ color: interviewUi.text }}>Schedule interview</strong> on a
                    candidate to create one; it will show up here automatically.
                  </>
                ) : (
                  <>
                    No scheduled rounds for this requisition. When candidates reach{" "}
                    <strong style={{ color: interviewUi.text }}>Interviewing</strong> and you add
                    rounds from their profile, each round appears here as a separate row.
                  </>
                )}
              </div>
            ) : (
              <div
                style={{
                  overflowX: "auto",
                  borderRadius: interviewUi.radiusLg,
                  border: `1px solid ${interviewUi.border}`,
                  backgroundColor: interviewUi.surface,
                  boxShadow: interviewUi.shadow,
                  overflow: "hidden",
                }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "12px",
                    color: interviewUi.text,
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        textAlign: "left",
                        color: interviewUi.textSubtle,
                        backgroundColor: interviewUi.surfaceElevated,
                      }}
                    >
                      <th
                        style={{
                          padding: "8px 10px",
                          borderBottom: `1px solid ${interviewUi.border}`,
                        }}
                      >
                        Candidate
                      </th>
                      <th
                        style={{
                          padding: "8px 10px",
                          borderBottom: `1px solid ${interviewUi.border}`,
                        }}
                      >
                        Round
                      </th>
                      <th
                        style={{
                          padding: "8px 10px",
                          borderBottom: `1px solid ${interviewUi.border}`,
                        }}
                      >
                        Interviewer
                      </th>
                      <th
                        style={{
                          padding: "8px 10px",
                          borderBottom: `1px solid ${interviewUi.border}`,
                        }}
                      >
                        Scheduled
                      </th>
                      <th
                        style={{
                          padding: "8px 10px",
                          borderBottom: `1px solid ${interviewUi.border}`,
                        }}
                      >
                        Status
                      </th>
                      <th
                        style={{
                          padding: "8px 10px",
                          borderBottom: `1px solid ${interviewUi.border}`,
                        }}
                      >
                        Result
                      </th>
                      <th
                        style={{
                          padding: "8px 10px",
                          borderBottom: `1px solid ${interviewUi.border}`,
                        }}
                      >
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {reqInterviews.map((iv, rowIdx) => {
                      const cand = candidates.find(
                        (x) => x.candidate_id === iv.candidate_id,
                      );
                      return (
                        <tr
                          key={iv.id}
                          style={{
                            backgroundColor:
                              rowIdx % 2 === 0 ? interviewUi.surface : interviewUi.bg,
                          }}
                        >
                          <td
                            style={{
                              padding: "10px",
                              borderBottom: `1px solid ${interviewUi.border}`,
                              fontWeight: 600,
                            }}
                          >
                            {iv.candidate_name ??
                              cand?.full_name ??
                              `Candidate #${iv.candidate_id}`}
                            <div
                              style={{
                                fontSize: "11px",
                                fontWeight: 400,
                                color: interviewUi.textSubtle,
                              }}
                            >
                              {iv.candidate_email ?? cand?.email ?? ""}
                            </div>
                          </td>
                          <td
                            style={{
                              padding: "10px",
                              borderBottom: `1px solid ${interviewUi.border}`,
                            }}
                          >
                            {iv.round_name?.trim() || iv.round_number}
                          </td>
                          <td
                            style={{
                              padding: "10px",
                              borderBottom: `1px solid ${interviewUi.border}`,
                            }}
                          >
                            {iv.panelists && iv.panelists.length > 0
                              ? iv.panelists.map((p) => p.display_name).join(", ")
                              : iv.interviewer_name ?? "—"}
                          </td>
                          <td
                            style={{
                              padding: "10px",
                              borderBottom: `1px solid ${interviewUi.border}`,
                            }}
                          >
                            {new Date(iv.scheduled_at).toLocaleString()}
                          </td>
                          <td
                            style={{
                              padding: "10px",
                              borderBottom: `1px solid ${interviewUi.border}`,
                            }}
                          >
                            <InterviewStatusBadge status={iv.status} />
                          </td>
                          <td
                            style={{
                              padding: "10px",
                              borderBottom: `1px solid ${interviewUi.border}`,
                              color: interviewUi.textMuted,
                            }}
                          >
                            {iv.result ?? "—"}
                          </td>
                          <td
                            style={{
                              padding: "10px",
                              borderBottom: `1px solid ${interviewUi.border}`,
                            }}
                          >
                            {cand ? (
                              <button
                                type="button"
                                style={{
                                  fontSize: "11px",
                                  padding: "6px 12px",
                                  borderRadius: interviewUi.radiusSm,
                                  cursor: "pointer",
                                  backgroundColor: "transparent",
                                  color: interviewUi.textMuted,
                                  border: `1px solid ${interviewUi.border}`,
                                }}
                                onClick={() => openCandidateModal(cand, "execute")}
                              >
                                Open
                              </button>
                            ) : (
                              <span style={{ fontSize: "11px", color: interviewUi.textSubtle }}>
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        </div>
      )}

      {activeTab === "timeline" && (
        <div className="master-data-manager">
          <div className="data-manager-header">
            <h2>Activity Timeline</h2>
            <p className="subtitle">
              Complete history of requisition updates and assignments
            </p>
          </div>

          {timelineWithStatus.length === 0 ? (
            <div className="tickets-empty-state">No timeline activity yet.</div>
          ) : (
            <div className="milestone-timeline">
              {timelineWithStatus.map((item, idx) => {
                const statusClass = item.isCompleted
                  ? item.isDelayed
                    ? "milestone-node error"
                    : "milestone-node completed"
                  : item.isCurrent
                    ? "milestone-node current"
                    : "milestone-node upcoming";
                const timeLabel = item.time
                  ? formatRelativeTime(item.time)
                  : item.isUpcoming
                    ? "Upcoming"
                    : "Pending";
                return (
                  <div key={item.id} className="milestone-row">
                    <div className="milestone-track">
                      <div className={`milestone-node ${statusClass}`}>
                        {item.isCompleted ? <CheckCircle size={14} /> : idx + 1}
                      </div>
                      {idx < timelineWithStatus.length - 1 && (
                        <div
                          className={`milestone-line ${statusClass} ${item.isCurrent ? "active" : ""}`}
                        />
                      )}
                    </div>
                    <div className="milestone-card">
                      <div className="milestone-title">{item.title}</div>
                      <div className="milestone-meta">
                        <div className="milestone-avatar">
                          {item.actor
                            .split(" ")
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((part) => part[0]?.toUpperCase())
                            .join("")}
                        </div>
                        <div>
                          <div className="milestone-actor">{item.actor}</div>
                          <div className="milestone-time">{timeLabel}</div>
                        </div>
                      </div>
                      {item.note && (
                        <div className="milestone-note">Note: {item.note}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add New Event (if editing) */}
          {isEditing && (
            <div
              style={{
                marginTop: "32px",
                paddingTop: "24px",
                borderTop: "1px solid var(--border-subtle)",
              }}
            >
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  marginBottom: "12px",
                }}
              >
                Add Timeline Entry
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                <input
                  type="text"
                  placeholder="Event description..."
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-subtle)",
                  }}
                />
                <button className="action-button primary">Add Entry</button>
              </div>
            </div>
          )}
        </div>
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

export default RequisitionDetail;
