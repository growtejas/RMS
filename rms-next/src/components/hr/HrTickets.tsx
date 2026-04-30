"use client";

import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  memo,
} from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  Users,
  Target,
  Clock,
  CheckCircle,
  AlertCircle,
  Filter,
  Search,
  BarChart3,
} from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { getUsersListCached } from "@/lib/api/users-list-cache";
import { useAuth } from "@/contexts/useAuth";
import {
  approveBudget,
  approveHR,
  rejectRequisition,
  getWorkflowErrorMessage,
  getRequisitionAllowedTransitions,
  type AllowedTransitionsResponse,
} from "@/lib/api/workflowApi";
import {
  normalizeStatus,
  getStatusLabel,
  REQUISITION_STATUSES,
} from "@/types/workflow";
import { PlainPriorityText } from "@/components/common/PlainPriorityText";
import { HrToolbarCard } from "@/components/hr/HrToolbarCard";
import { HrPaginationBar } from "@/components/hr/HrPaginationBar";
import { HrEmptyState } from "@/components/hr/HrEmptyState";
import { useHrRequisitionsListQuery } from "@/hooks/hr/use-hr-queries";
import type { BackendRequisition } from "@/types/hr-requisition-backend";
import { toast } from "sonner";

const MatchmakingPanel = dynamic(
  () => import("./hr-tickets/MatchmakingPanel"),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-2xl border border-border bg-surface p-8 text-sm text-text-muted">
        Loading matchmaking…
      </div>
    ),
  },
);

const REQUISITION_LIST_PAGE_SIZE = 20;
/* ======================================================
   Types
   ====================================================== */

interface Requisition {
  reqId: number;
  id: string;
  project: string;
  client: string;
  priority: string;
  overallStatus: string;
  location: string;
  workMode: string;
  dateCreated: string;
  requiredBy: string;
  raisedBy: string;
  raised_by?: number | null;
  assignedTA?: string;
  assignedTAId?: number | null;
  assignedAt?: string | null;
  budgetAmount?: number;
  estimatedBudget?: number | null;
  approvedBudget?: number | null;
  budgetApprovedBy?: number | null;
  approvedBy?: number | null;
  approvalHistory?: string | null;
  rejectionReason?: string | null;
  items: RequisitionItem[];
}

interface RequisitionItem {
  id: string;
  skill: string;
  level: string;
  experience?: number;
  education: string;
  itemStatus: string;
  assignedTAId?: number | null;
  assignedEmployeeId?: string;
  assignedEmployeeName?: string;
}

interface EmployeeMatch {
  id: string;
  name: string;
  skill: string;
  level: string;
  experience?: number;
  location: string;
  availability: string;
  matchScore?: number;
  department: string;
}

interface BackendUser {
  user_id: number;
  username: string;
  roles?: string[];
}

interface BackendEmployee {
  emp_id: string;
  full_name: string;
  user_id?: number | null;
}

/* ======================================================
   Data helpers
   ====================================================== */

const mapRequisitions = (data: BackendRequisition[]): Requisition[] =>
  data.map((req) => ({
    reqId: req.req_id,
    id: `REQ-${req.req_id}`,
    project: req.project_name ?? "—",
    client: req.client_name ?? "—",
    priority: req.priority ?? "—",
    location: req.office_location ?? "—",
    workMode: req.work_mode ?? "—",
    overallStatus: req.overall_status ?? "—",
    dateCreated: req.created_at ?? "",
    requiredBy: req.required_by_date ?? "",
    raisedBy: req.raised_by ? `User #${req.raised_by}` : "—",
    raised_by: req.raised_by ?? null,
    assignedTAId: req.assigned_ta ?? null,
    assignedAt: req.assigned_at ?? null,
    assignedTA: req.assigned_ta ? `User #${req.assigned_ta}` : undefined,
    budgetAmount: req.budget_amount ?? undefined,
    estimatedBudget:
      req.total_estimated_budget != null
        ? Number(req.total_estimated_budget)
        : null,
    approvedBudget:
      req.total_approved_budget != null
        ? Number(req.total_approved_budget)
        : null,
    budgetApprovedBy: req.budget_approved_by ?? null,
    approvedBy: req.approved_by ?? null,
    approvalHistory: req.approval_history ?? null,
    rejectionReason: req.rejection_reason ?? null,
    items:
      req.items?.map((item) => ({
        id: `ITEM-${item.item_id}`,
        skill: item.role_position,
        level: item.skill_level ?? "—",
        experience: item.experience_years ?? undefined,
        education: item.education_requirement ?? "—",
        itemStatus: item.item_status,
        assignedTAId: item.assigned_ta ?? null,
      })) ?? [],
  }));

const getActiveItemAssignedTAIds = (req: Requisition): number[] =>
  Array.from(
    new Set(
      req.items
        .filter(
          (item) =>
            item.itemStatus !== "Fulfilled" &&
            item.itemStatus !== "Cancelled" &&
            item.assignedTAId != null,
        )
        .map((item) => item.assignedTAId as number),
    ),
  );

const mapEmployees = (data: BackendEmployee[]): EmployeeMatch[] =>
  data.map((emp) => ({
    id: emp.emp_id,
    name: emp.full_name,
    skill: "—",
    level: "—",
    experience: undefined,
    location: "—",
    availability: "Unknown",
    matchScore: undefined,
    department: "—",
  }));

/* ======================================================
   Props
   ====================================================== */

interface HrRequisitionsProps {
  currentUser?: string;
  onAssignRequisition?: (reqId: string, taId: string) => void;
  onAssignEmployee?: (itemId: string, empId: string) => void;
  onViewRequisition?: (reqId: string) => void;
}

/* ======================================================
   Helper Functions
   ====================================================== */

const getAgingDays = (dateString: string) => {
  const created = new Date(dateString);
  const today = new Date();
  const diffTime = Math.abs(today.getTime() - created.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const getAgingClass = (days: number) => {
  if (days > 30) return "aging-30-plus";
  if (days > 7) return "aging-8-30";
  return "aging-0-7";
};

/**
 * Map a requisition status to a ticket-status CSS class.
 * Normalizes legacy values via canonical types/workflow.ts.
 */
const getStatusClass = (status: string): string => {
  const normalized = normalizeStatus(status);
  switch (normalized) {
    case "Pending_Budget":
    case "Pending_HR":
      return "ticket-status open";
    case "Active":
      return "ticket-status in-progress";
    case "Fulfilled":
      return "ticket-status fulfilled";
    case "Rejected":
      return "ticket-status rejected";
    case "Cancelled":
      return "ticket-status closed";
    case "Draft":
      return "ticket-status open";
    default:
      return "";
  }
};

const calculateCompletion = (items: RequisitionItem[]) => {
  const total = items.length;
  const fulfilled = items.filter(
    (item) => item.itemStatus === "Fulfilled",
  ).length;
  const pending = items.filter((item) => item.itemStatus === "Pending").length;

  return {
    total,
    fulfilled,
    pending,
    progress: total > 0 ? Math.round((fulfilled / total) * 100) : 0,
  };
};

/* ======================================================
   Component: HrKpiCards
   ====================================================== */

const HrKpiCards = memo(function HrKpiCards({
  requisitions,
}: {
  requisitions: Requisition[];
}) {
  const stats = {
    totalOpen: requisitions.filter((r) => {
      const s = normalizeStatus(r.overallStatus);
      return ["Pending_Budget", "Pending_HR", "Active", "Draft"].includes(s);
    }).length,
    inProgress: requisitions.filter(
      (r) => normalizeStatus(r.overallStatus) === "Active",
    ).length,
    unassigned: requisitions.filter((r) => !r.assignedTAId).length,
    myAssignments: requisitions.filter((r) => r.assignedTAId !== null).length,
    totalPositions: requisitions.reduce(
      (sum, req) => sum + req.items.length,
      0,
    ),
    pendingItems: requisitions.reduce(
      (sum, req) =>
        sum + req.items.filter((item) => item.itemStatus === "Pending").length,
      0,
    ),
    benchCount: 3, // This would come from API
    avgAging:
      Math.round(
        requisitions.reduce(
          (sum, req) => sum + getAgingDays(req.dateCreated),
          0,
        ) / requisitions.length,
      ) || 0,
  };

  return (
    <div className="tickets-kpi-grid">
      <div className="ticket-kpi-card critical">
        <div className="kpi-number">{stats.totalOpen}</div>
        <div className="kpi-label">
          <AlertCircle size={12} />
          Unassigned Requisitions
        </div>
        <div className="kpi-trend negative">
          {stats.unassigned} need assignment
        </div>
      </div>

      <div className="ticket-kpi-card warning">
        <div className="kpi-number">{stats.pendingItems}</div>
        <div className="kpi-label">
          <Clock size={12} />
          Pending Positions
        </div>
        <div className="kpi-trend">
          Across {requisitions.length} requisitions
        </div>
      </div>

      <div className="ticket-kpi-card success">
        <div className="kpi-number">{stats.benchCount}</div>
        <div className="kpi-label">
          <Users size={12} />
          Resources on Bench
        </div>
        <div className="kpi-trend positive">Available for assignment</div>
      </div>

      {/* <div className="ticket-kpi-card neutral">
        <div className="kpi-number">{stats.avgAging}d</div>
        <div className="kpi-label">
          <Target size={12} />
          Average Aging
        </div>
        <div className="kpi-trend">
          {stats.avgAging > 30
            ? "Urgent attention needed"
            : "Within acceptable range"}
        </div>
      </div> */}
    </div>
  );
});
/* ======================================================
   Main Component
   ====================================================== */

const HrRequisitions: React.FC<HrRequisitionsProps> = ({
  currentUser = "Current User",
  onAssignEmployee,
  onViewRequisition,
}) => {
  const router = useRouter();
  const { user } = useAuth();
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [employees, setEmployees] = useState<EmployeeMatch[]>([]);
  const [taUsers, setTaUsers] = useState<BackendUser[]>([]);
  const [allUsers, setAllUsers] = useState<BackendUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [budgetDrafts, setBudgetDrafts] = useState<Record<number, string>>({});
  const [approverDrafts, setApproverDrafts] = useState<Record<number, string>>(
    {},
  );
  const [assignmentDrafts, setAssignmentDrafts] = useState<
    Record<number, string>
  >({});
  const [assignmentLoading, setAssignmentLoading] = useState<
    Record<number, boolean>
  >({});
  const [approvalLoading, setApprovalLoading] = useState<
    Record<number, boolean>
  >({});
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [selectedRequisition, setSelectedRequisition] =
    useState<Requisition | null>(null);
  const [activeFilter, setActiveFilter] = useState<
    "all" | "assigned" | "unassigned" | "my" | "approvals"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("All Priorities");
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [locationFilter, setLocationFilter] = useState("All Locations");
  const [modeFilter, setModeFilter] = useState("All Modes");
  const [approvalSearch, setApprovalSearch] = useState("");
  const [budgetSortDir] = useState<"asc" | "desc" | null>(null);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectingRequisition, setRejectingRequisition] =
    useState<Requisition | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectionError, setRejectionError] = useState<string | null>(null);
  const [rejectionLoading, setRejectionLoading] = useState<
    Record<number, boolean>
  >({});
  const [expandedRejections, setExpandedRejections] = useState<
    Record<number, boolean>
  >({});
  const [listPage, setListPage] = useState(1);

  const requisitionsQuery = useHrRequisitionsListQuery(true);
  const requisitionsBackendError =
    requisitionsQuery.error instanceof Error
      ? requisitionsQuery.error.message
      : requisitionsQuery.error
        ? "Failed to load requisitions"
        : null;

  useEffect(() => {
    setListPage(1);
  }, [
    activeFilter,
    searchQuery,
    priorityFilter,
    statusFilter,
    locationFilter,
    modeFilter,
  ]);
  // Backend-driven workflow state: stores allowed transitions per requisition
  const [allowedTransitionsMap, setAllowedTransitionsMap] = useState<
    Record<number, AllowedTransitionsResponse>
  >({});
  const [transitionsLoading, setTransitionsLoading] = useState<
    Record<number, boolean>
  >({});

  // Fetch allowed transitions for a single requisition from backend
  const fetchAllowedTransitions = useCallback(async (reqId: number) => {
    setTransitionsLoading((prev) => ({ ...prev, [reqId]: true }));
    try {
      const response = await getRequisitionAllowedTransitions(reqId);
      setAllowedTransitionsMap((prev) => ({ ...prev, [reqId]: response }));
    } catch {
      // Silently fail - buttons won't appear for this requisition
    } finally {
      setTransitionsLoading((prev) => ({ ...prev, [reqId]: false }));
    }
  }, []);

  // Check if a transition is allowed (backend-driven)
  const canTransitionTo = useCallback(
    (reqId: number, targetStatus: string): boolean => {
      const transitions = allowedTransitionsMap[reqId];
      if (!transitions) return false;
      return transitions.allowed_transitions.some(
        (t) => t.target_status === targetStatus && !t.is_system_only,
      );
    },
    [allowedTransitionsMap],
  );

  // Refresh transitions after a successful workflow action
  const refreshTransitions = useCallback(
    async (reqId: number) => {
      await fetchAllowedTransitions(reqId);
    },
    [fetchAllowedTransitions],
  );

  const formatCurrency = (value?: number) => {
    if (value === undefined || Number.isNaN(value)) return "—";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getInitials = (label?: string) => {
    if (!label) return "?";
    return label
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("");
  };

  const getTaLabel = (userId?: number | null) => {
    if (!userId) return "Unassigned";
    const match = taUsers.find((user) => user.user_id === userId);
    return match?.username ?? `User #${userId}`;
  };

  const resolveUserName = (userId?: number | null): string => {
    if (userId == null) return "—";
    const match = allUsers.find((u) => u.user_id === userId);
    return match?.username ?? `User #${userId}`;
  };

  useEffect(() => {
    const data = requisitionsQuery.data;
    const loading = requisitionsQuery.isPending;
    const errMsg = requisitionsBackendError;

    if (loading) {
      setIsLoading(true);
      setError(null);
      return;
    }

    setIsLoading(false);
    setError(errMsg);
    setRequisitions(data ? mapRequisitions(data) : []);
  }, [
    requisitionsQuery.data,
    requisitionsQuery.isPending,
    requisitionsBackendError,
  ]);

  useEffect(() => {
    let isMounted = true;

    const fetchEmployees = async () => {
      try {
        const response = await apiClient.get<BackendEmployee[]>(
          "/employees/employees",
        );
        if (isMounted) {
          setEmployees(mapEmployees(response.data));
        }
      } catch {
        if (isMounted) {
          setEmployees([]);
        }
      }
    };

    const fetchTaUsers = async () => {
      try {
        const list = await getUsersListCached<BackendUser>();
        if (!isMounted) return;
        setAllUsers(list);
        const filtered = list.filter((user: BackendUser) => {
          const roles = user.roles ?? [];
          return roles.some(
            (role: string) =>
              role === "TA" || role.toLowerCase() === "talent acquisition",
          );
        });
        setTaUsers(filtered);
      } catch {
        if (isMounted) {
          setAllUsers([]);
          setTaUsers([]);
        }
      }
    };

    fetchEmployees();
    fetchTaUsers();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    setBudgetDrafts((prev) => {
      const next = { ...prev };
      requisitions.forEach((req) => {
        if (next[req.reqId] === undefined) {
          next[req.reqId] =
            req.approvedBudget != null
              ? String(req.approvedBudget)
              : req.budgetAmount !== undefined
                ? String(req.budgetAmount)
                : "";
        }
      });
      return next;
    });

    setApproverDrafts((prev) => {
      const next = { ...prev };
      requisitions.forEach((req) => {
        if (next[req.reqId] === undefined) {
          next[req.reqId] = req.budgetApprovedBy
            ? String(req.budgetApprovedBy)
            : "";
        }
      });
      return next;
    });
  }, [requisitions]);

  const approvalStatuses = ["Pending_Budget", "Pending_HR", "Rejected"];

  const pendingApprovals = requisitions.filter((req) => {
    const normalized = normalizeStatus(req.overallStatus);
    return approvalStatuses.includes(normalized);
  });

  // Fetch allowed transitions for all pending approvals from backend
  useEffect(() => {
    pendingApprovals.forEach((req) => {
      if (!allowedTransitionsMap[req.reqId] && !transitionsLoading[req.reqId]) {
        fetchAllowedTransitions(req.reqId);
      }
    });
  }, [
    pendingApprovals,
    allowedTransitionsMap,
    transitionsLoading,
    fetchAllowedTransitions,
  ]);

  const unassignedPool = requisitions.filter((req) => {
    const itemLevelAssignees = getActiveItemAssignedTAIds(req);
    return (
      !req.assignedTAId &&
      itemLevelAssignees.length === 0 &&
      normalizeStatus(req.overallStatus) === "Active"
    );
  });

  // Filter requisitions based on active filter
  const filteredRequisitions = requisitions
    .filter((req) => {
      // Primary Tab Filters
      if (activeFilter === "assigned") {
        if (!req.assignedTAId && getActiveItemAssignedTAIds(req).length === 0)
          return false;
      } else if (activeFilter === "unassigned") {
        if (req.assignedTAId) return false;
        if (getActiveItemAssignedTAIds(req).length > 0) return false;
        if (normalizeStatus(req.overallStatus) !== "Active") return false;
      } else if (activeFilter === "my") {
        if (req.assignedTA !== currentUser) return false;
      } else if (activeFilter === "approvals") {
        if (!approvalStatuses.includes(normalizeStatus(req.overallStatus)))
          return false;
      }

      // Secondary Dropdown Filters
      if (
        priorityFilter !== "All Priorities" &&
        req.priority !== priorityFilter
      ) {
        return false;
      }
      if (statusFilter !== "All Status") {
        const normalized = normalizeStatus(req.overallStatus);
        if (normalized !== statusFilter) {
          return false;
        }
      }
      if (locationFilter !== "All Locations") {
        const reqLocation = req.location?.toLowerCase() ?? "";
        if (!reqLocation.includes(locationFilter.toLowerCase())) {
          return false;
        }
      }
      if (modeFilter !== "All Modes") {
        const reqMode = req.workMode?.toLowerCase() ?? "";
        if (reqMode !== modeFilter.toLowerCase()) {
          return false;
        }
      }

      return true;
    })
    .filter(
      (req) =>
        req.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        req.project.toLowerCase().includes(searchQuery.toLowerCase()) ||
        req.client.toLowerCase().includes(searchQuery.toLowerCase()),
    );

  const pagedListRequisitions = useMemo(() => {
    const start = (listPage - 1) * REQUISITION_LIST_PAGE_SIZE;
    return filteredRequisitions.slice(
      start,
      start + REQUISITION_LIST_PAGE_SIZE,
    );
  }, [filteredRequisitions, listPage]);

  const handleAssignEmployee = (itemId: string, empId: string) => {
    const employee = employees.find((emp) => emp.id === empId);
    if (!employee || !selectedRequisition) return;

    // NOTE: Assignment should go through the backend workflow API.
    // The local state update below is optimistic; a full backend integration
    // (e.g. calling the item fulfill endpoint) should be added.
    const updatedRequisitions = requisitions.map((req) => {
      if (req.id === selectedRequisition.id) {
        return {
          ...req,
          items: req.items.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  assignedEmployeeId: empId,
                  assignedEmployeeName: employee.name,
                }
              : item,
          ),
        };
      }
      return req;
    });

    setRequisitions(updatedRequisitions);
    setSelectedRequisition(
      updatedRequisitions.find((req) => req.id === selectedRequisition.id) ||
        null,
    );
    onAssignEmployee?.(itemId, empId);
  };

  const handleViewRequisition = (reqId: string) => {
    onViewRequisition?.(reqId);
  };

  const updateRequisitionState = (
    reqId: number,
    updates: Partial<Requisition>,
  ) => {
    setRequisitions((prev) =>
      prev.map((req) => (req.reqId === reqId ? { ...req, ...updates } : req)),
    );
  };

  const handleApproveRelease = async (req: Requisition) => {
    const approverRaw = approverDrafts[req.reqId]?.trim();
    const approverId = approverRaw ? Number(approverRaw) : user?.user_id;
    const budgetRaw = budgetDrafts[req.reqId] ?? "";
    const budgetNormalized = budgetRaw.replace(/,/g, "").trim();
    const budgetValue = budgetNormalized ? Number(budgetNormalized) : undefined;

    if (!approverId || !Number.isFinite(approverId)) {
      setApprovalError("Unable to resolve Budget Approved By user id.");
      return;
    }

    if (
      budgetNormalized &&
      (budgetValue === undefined ||
        !Number.isFinite(budgetValue) ||
        budgetValue < 0)
    ) {
      setApprovalError("Enter a valid budget amount.");
      return;
    }

    setApprovalLoading((prev) => ({ ...prev, [req.reqId]: true }));
    setApprovalError(null);

    try {
      // Update budget amount if specified
      if (budgetValue !== undefined) {
        await apiClient.patch(`/requisitions/${req.reqId}`, {
          budget_amount: budgetValue,
        });
      }

      // Use backend workflow API for transitions
      // Backend is single source of truth - check allowed transitions
      const currentStatus = normalizeStatus(req.overallStatus);

      if (currentStatus === "Pending_Budget") {
        // Budget approval: Pending_Budget → Pending_HR
        await approveBudget(req.reqId);
        // Then HR approval: Pending_HR → Active
        await approveHR(req.reqId);
      } else if (currentStatus === "Pending_HR") {
        // Just HR approval needed: Pending_HR → Active
        await approveHR(req.reqId);
      }

      // Update local state to reflect new status
      updateRequisitionState(req.reqId, {
        budgetApprovedBy: approverId,
        budgetAmount: budgetValue,
        approvedBudget: budgetValue ?? null,
        overallStatus: "Active",
      });

      // Refresh allowed transitions from backend after successful transition
      await refreshTransitions(req.reqId);
    } catch (err) {
      const message = getWorkflowErrorMessage(err);
      setApprovalError(message);
    } finally {
      setApprovalLoading((prev) => ({ ...prev, [req.reqId]: false }));
    }
  };

  const handleConfirmAssignment = async (req: Requisition) => {
    const raw = assignmentDrafts[req.reqId]?.trim();
    const selectedId = raw ? Number(raw) : NaN;

    if (!Number.isFinite(selectedId)) {
      toast.warning("Select a valid TA before confirming assignment.");
      return;
    }

    setAssignmentLoading((prev) => ({ ...prev, [req.reqId]: true }));

    try {
      await apiClient.patch(`/requisitions/${req.reqId}/assign-ta`, {
        ta_user_id: selectedId,
      });

      const label = getTaLabel(selectedId);
      updateRequisitionState(req.reqId, {
        assignedTAId: selectedId,
        assignedTA: label,
        overallStatus: "Active",
        assignedAt: new Date().toISOString(),
        items: req.items.map((item) => {
          if (
            item.itemStatus === "Fulfilled" ||
            item.itemStatus === "Cancelled"
          ) {
            return item;
          }
          return {
            ...item,
            assignedTAId: selectedId,
          };
        }),
      });
      toast.success(`Assigned ${label} to ${req.id}.`);
      setAssignmentDrafts((prev) => ({ ...prev, [req.reqId]: "" }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Assignment failed";
      toast.error(message);
    } finally {
      setAssignmentLoading((prev) => ({ ...prev, [req.reqId]: false }));
    }
  };

  const approvalSearchQuery = approvalSearch.trim().toLowerCase();
  const approvalSearchMatches = (req: Requisition) => {
    if (!approvalSearchQuery) return true;
    return (
      req.id.toLowerCase().includes(approvalSearchQuery) ||
      req.project.toLowerCase().includes(approvalSearchQuery) ||
      req.client.toLowerCase().includes(approvalSearchQuery)
    );
  };

  const sortedPendingApprovals = [...pendingApprovals]
    .filter(approvalSearchMatches)
    .sort((a, b) => {
      if (!budgetSortDir) return 0;
      const aValue = a.estimatedBudget ?? a.budgetAmount ?? 0;
      const bValue = b.estimatedBudget ?? b.budgetAmount ?? 0;
      return budgetSortDir === "asc" ? aValue - bValue : bValue - aValue;
    });

  const openRejectModal = (req: Requisition) => {
    setRejectingRequisition(req);
    setRejectionReason("");
    setRejectionError(null);
    setRejectModalOpen(true);
  };

  const closeRejectModal = () => {
    setRejectModalOpen(false);
    setRejectingRequisition(null);
    setRejectionReason("");
    setRejectionError(null);
  };

  const isRejectionValid = rejectionReason.trim().length >= 10;

  const handleRejectSubmit = async () => {
    if (!rejectingRequisition) return;
    const reason = rejectionReason.trim();
    if (reason.length < 10) {
      setRejectionError("Rejection reason must be at least 10 characters.");
      return;
    }

    setRejectionError(null);
    setRejectionLoading((prev) => ({
      ...prev,
      [rejectingRequisition.reqId]: true,
    }));

    try {
      // Use backend workflow API for rejection
      await rejectRequisition(rejectingRequisition.reqId, reason);

      updateRequisitionState(rejectingRequisition.reqId, {
        overallStatus: "Rejected",
        rejectionReason: reason,
      });

      setExpandedRejections((prev) => ({
        ...prev,
        [rejectingRequisition.reqId]: true,
      }));

      // Refresh allowed transitions from backend after successful rejection
      await refreshTransitions(rejectingRequisition.reqId);

      closeRejectModal();
    } catch (err) {
      const message = getWorkflowErrorMessage(err);
      setRejectionError(message);
    } finally {
      setRejectionLoading((prev) => ({
        ...prev,
        [rejectingRequisition.reqId]: false,
      }));
    }
  };

  return (
    <>
      {/* Header */}
      <div className="manager-header">
        <h2>HR Recruitment Dashboard</h2>
        <p className="subtitle">
          Talent Acquisition Portal - Manage requisitions and match resources
        </p>
      </div>

      {/* KPI Cards */}
      <HrKpiCards requisitions={requisitions} />

      {/* Filter Chips */}
      <div className="filter-chips">
        <button
          type="button"
          className={`filter-chip ${activeFilter === "all" ? "active" : ""}`}
          onClick={() => setActiveFilter("all")}
        >
          <span className="filter-chip-icon" aria-hidden>
            <Filter size={14} />
          </span>
          All Requisitions ({requisitions.length})
        </button>
        <button
          type="button"
          className={`filter-chip ${activeFilter === "unassigned" ? "active" : ""}`}
          onClick={() => setActiveFilter("unassigned")}
        >
          <span className="filter-chip-icon" aria-hidden>
            <AlertCircle size={14} />
          </span>
          Unassigned ({requisitions.filter((r) => !r.assignedTAId).length})
        </button>
        <button
          type="button"
          className={`filter-chip ${activeFilter === "assigned" ? "active" : ""}`}
          onClick={() => setActiveFilter("assigned")}
        >
          <span className="filter-chip-icon" aria-hidden>
            <CheckCircle size={14} />
          </span>
          Assigned Tickets ({requisitions.filter((r) => r.assignedTAId).length})
        </button>
        <button
          type="button"
          className={`filter-chip ${activeFilter === "approvals" ? "active" : ""}`}
          onClick={() => setActiveFilter("approvals")}
        >
          <span className="filter-chip-icon" aria-hidden>
            <Target size={14} />
          </span>
          Pending Approvals ({pendingApprovals.length})
        </button>
      </div>

      {/* Search and Filters */}
      <HrToolbarCard className="log-filters-wrap">
        <div className="log-filters">
          <div className="filter-group">
            <div className="search-box">
              <Search size={14} />
              <input
                type="text"
                placeholder="Search requisitions by ID, project, or client..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="filter-grid">
            <div className="filter-item">
              <label>Priority</label>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
              >
                <option>All Priorities</option>
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
            </div>
            <div className="filter-item">
              <label>Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option>All Status</option>
                {REQUISITION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {getStatusLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-item">
              <label>Location</label>
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
              >
                <option>All Locations</option>
                {Array.from(
                  new Set(
                    requisitions
                      .map((req) => req.location)
                      .filter((loc): loc is string =>
                        Boolean(loc && loc !== "—"),
                      ),
                  ),
                )
                  .sort((a, b) => a.localeCompare(b))
                  .map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
              </select>
            </div>
            <div className="filter-item">
              <label>Work Mode</label>
              <select
                value={modeFilter}
                onChange={(e) => setModeFilter(e.target.value)}
              >
                <option>All Modes</option>
                {Array.from(
                  new Set(
                    requisitions
                      .map((req) => req.workMode)
                      .filter((mode): mode is string =>
                        Boolean(mode && mode !== "—"),
                      ),
                  ),
                )
                  .sort((a, b) => a.localeCompare(b))
                  .map((mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        </div>
      </HrToolbarCard>

      {activeFilter === "approvals" && (
        <div className="approval-section">
          <div className="data-manager-header">
            <h2>Approval Control Center</h2>
            <p className="subtitle">
              Review pending requisitions and release them to TA after approval
            </p>
          </div>

          {approvalError && (
            <div className="empty-state approval-error">{approvalError}</div>
          )}

          <div className="log-filters approval-filters">
            <div className="filter-group">
              <div className="search-box">
                <Search size={14} />
                <input
                  type="text"
                  placeholder="Search approvals by ID, project, or client..."
                  value={approvalSearch}
                  onChange={(e) => setApprovalSearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="ticket-table-container approval-table-container">
            <table className="ticket-table approval-table">
              <thead>
                <tr>
                  <th>Req ID</th>
                  <th>Project / Client</th>
                  <th>Requester</th>
                  <th>Estimated Budget</th>
                  <th>Approved Budget</th>
                  <th>Budget Approved By</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedPendingApprovals.map((req) => {
                  // Backend-driven: check if transitions are allowed via allowedTransitionsMap
                  const canApprove =
                    canTransitionTo(req.reqId, "Pending_HR") ||
                    canTransitionTo(req.reqId, "Active");
                  const canReject = canTransitionTo(req.reqId, "Rejected");
                  const isTransitionsLoading = transitionsLoading[req.reqId];
                  const isActionLoading =
                    approvalLoading[req.reqId] ||
                    rejectionLoading[req.reqId] ||
                    isTransitionsLoading;
                  return (
                    <React.Fragment key={req.reqId}>
                      <tr>
                        <td>
                          <strong>{req.id}</strong>
                        </td>
                        <td>
                          <div>{req.project}</div>
                          <div className="approval-subtext">{req.client}</div>
                        </td>
                        <td>{resolveUserName(req.raised_by)}</td>
                        <td>
                          <span className="approval-budget-value">
                            {formatCurrency(
                              req.estimatedBudget ?? req.budgetAmount ?? 0,
                            )}
                          </span>
                        </td>
                        <td>
                          <span className="approval-budget-value">
                            {formatCurrency(req.approvedBudget ?? 0)}
                          </span>
                        </td>
                        <td>
                          <span className="approval-muted">
                            {resolveUserName(req.budgetApprovedBy)}
                          </span>
                        </td>
                        <td>
                          <span className={getStatusClass(req.overallStatus)}>
                            {getStatusLabel(req.overallStatus)}
                          </span>
                        </td>
                        <td>
                          <div className="approval-actions">
                            {(canApprove || canReject) && (
                              <>
                                {canApprove && (
                                  <button
                                    className="action-button primary compact approval-approve"
                                    disabled={isActionLoading}
                                    onClick={() => handleApproveRelease(req)}
                                  >
                                    {approvalLoading[req.reqId]
                                      ? "..."
                                      : "Approve & Release"}
                                  </button>
                                )}
                                {canReject && (
                                  <button
                                    className="action-button danger compact"
                                    disabled={isActionLoading}
                                    onClick={() => openRejectModal(req)}
                                  >
                                    Reject
                                  </button>
                                )}
                              </>
                            )}
                            {req.rejectionReason && (
                              <button
                                className="action-button compact"
                                onClick={() =>
                                  setExpandedRejections((prev) => ({
                                    ...prev,
                                    [req.reqId]: !prev[req.reqId],
                                  }))
                                }
                              >
                                {expandedRejections[req.reqId]
                                  ? "Hide Reason"
                                  : "View Reason"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {req.rejectionReason && expandedRejections[req.reqId] && (
                        <tr>
                          <td colSpan={8}>
                            <div className="approval-rejection-row">
                              <strong>Rejection Reason:</strong>{" "}
                              {req.rejectionReason}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {sortedPendingApprovals.length === 0 && (
                  <tr>
                    <td colSpan={8} className="approval-empty">
                      No pending approvals found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeFilter === "unassigned" && (
        <div style={{ marginBottom: "24px" }}>
          <div className="data-manager-header">
            <h2>Assignment & Handover</h2>
            <p className="subtitle">
              Move approved requisitions into active recruitment by assigning a
              TA
            </p>
          </div>

          {unassignedPool.length === 0 ? (
            <div className="tickets-empty-state">
              <BarChart3 size={48} style={{ marginBottom: "12px" }} />
              <h3>No approved requisitions awaiting assignment</h3>
              <p>All approved requisitions are already assigned.</p>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "16px",
              }}
            >
              {unassignedPool.map((req) => (
                <div
                  key={req.reqId}
                  className="stat-card"
                  style={{ padding: "16px" }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "12px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "var(--text-tertiary)",
                        }}
                      >
                        {req.id}
                      </div>
                      <div style={{ fontSize: "15px", fontWeight: 600 }}>
                        {req.project}
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "var(--text-tertiary)",
                        }}
                      >
                        {req.client}
                      </div>
                    </div>
                    <span className={getStatusClass(req.overallStatus)}>
                      {getStatusLabel(req.overallStatus)}
                    </span>
                  </div>

                  <div
                    className="form-field assign-ta-field"
                    style={{ marginBottom: "12px" }}
                  >
                    <label>Assign Talent Acquisition Specialist</label>
                    <select
                      className="assign-ta-select"
                      value={assignmentDrafts[req.reqId] ?? ""}
                      onChange={(e) =>
                        setAssignmentDrafts((prev) => ({
                          ...prev,
                          [req.reqId]: e.target.value,
                        }))
                      }
                    >
                      <option value="">Select TA...</option>
                      {taUsers.map((user) => (
                        <option key={user.user_id} value={user.user_id}>
                          {user.username}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    className="action-button primary"
                    type="button"
                    disabled={assignmentLoading[req.reqId]}
                    onClick={() => handleConfirmAssignment(req)}
                    style={{ width: "100%" }}
                  >
                    {assignmentLoading[req.reqId]
                      ? "Assigning..."
                      : "Confirm Assignment"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Content Area */}
      {activeFilter !== "approvals" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: selectedRequisition ? "1fr 1.5fr" : "1fr",
            gap: "24px",
          }}
        >
          {/* Requisitions Table */}
          <div>
            <div className="ticket-table-container">
              <table className="ticket-table">
                <thead>
                  <tr>
                    <th>Req ID</th>
                    <th>Project / Client</th>
                    <th>Items</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Days Open</th>
                    <th>Assigned TA</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {isLoading && (
                    <tr>
                      <td colSpan={8}>
                        <div className="tickets-empty-state">
                          Loading requisitions…
                        </div>
                      </td>
                    </tr>
                  )}

                  {!isLoading && error && (
                    <tr>
                      <td colSpan={8}>
                        <div
                          className="tickets-empty-state"
                          style={{ color: "var(--error)" }}
                        >
                          {error}
                        </div>
                      </td>
                    </tr>
                  )}

                  {!isLoading &&
                    !error &&
                    pagedListRequisitions.map((req) => {
                      const agingDays = getAgingDays(req.dateCreated);
                      const completion = calculateCompletion(req.items);
                      const isAssignedToMe = req.assignedTA === currentUser;
                      const itemLevelAssigneeIds =
                        getActiveItemAssignedTAIds(req);
                      const hasItemLevelAssignments =
                        itemLevelAssigneeIds.length > 0;
                      const itemLevelAssigneeLabel = itemLevelAssigneeIds
                        .map((id) => getTaLabel(id))
                        .join(", ");

                      return (
                        <tr
                          key={req.id}
                          style={{
                            background:
                              selectedRequisition?.id === req.id
                                ? "rgba(59, 130, 246, 0.05)"
                                : "inherit",
                            cursor: "pointer",
                          }}
                          onClick={() => {
                            // Embedded mode: open right-side panel in-place.
                            // Page mode: navigate directly to detail route without
                            // briefly rendering the panel (prevents visual flicker).
                            if (onViewRequisition) {
                              setSelectedRequisition(req);
                              handleViewRequisition(req.id);
                            } else {
                              router.push(`/hr/requisitions/${req.reqId}`);
                            }
                          }}
                        >
                          <td>
                            <strong>{req.id}</strong>
                          </td>

                          <td>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                              }}
                            >
                              <strong>{req.project}</strong>
                              <span
                                style={{
                                  fontSize: "12px",
                                  color: "var(--text-tertiary)",
                                }}
                              >
                                {req.client}
                              </span>
                            </div>
                          </td>

                          <td>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "4px",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                }}
                              >
                                <span
                                  className={`status-badge ${completion.pending > 0 ? "inactive" : "active"}`}
                                >
                                  {completion.pending} pending
                                </span>
                                <span
                                  style={{
                                    fontSize: "11px",
                                    color: "var(--text-tertiary)",
                                  }}
                                >
                                  ({completion.fulfilled}/{completion.total})
                                </span>
                              </div>
                              <div
                                style={{
                                  height: "3px",
                                  background: "var(--border-subtle)",
                                  borderRadius: "2px",
                                  overflow: "hidden",
                                  width: "80px",
                                }}
                              >
                                <div
                                  style={{
                                    width: `${completion.progress}%`,
                                    height: "100%",
                                    background:
                                      completion.progress === 100
                                        ? "var(--success)"
                                        : "var(--primary-accent)",
                                  }}
                                />
                              </div>
                            </div>
                          </td>

                          <td>
                            <span className={getStatusClass(req.overallStatus)}>
                              {getStatusLabel(req.overallStatus)}
                            </span>
                          </td>

                          <td>
                            <PlainPriorityText priority={req.priority} />
                          </td>

                          <td>
                            <span
                              className={`aging-indicator ${getAgingClass(agingDays)}`}
                            >
                              {agingDays} days
                            </span>
                          </td>

                          <td>
                            {req.assignedTAId ? (
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                }}
                              >
                                <div
                                  style={{
                                    width: "28px",
                                    height: "28px",
                                    borderRadius: "50%",
                                    background:
                                      "linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(59, 130, 246, 0.35))",
                                    color: "var(--primary-accent)",
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                >
                                  {getInitials(getTaLabel(req.assignedTAId))}
                                </div>
                                <div>
                                  <div style={{ fontSize: "13px" }}>
                                    {getTaLabel(req.assignedTAId)}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "11px",
                                      color: "var(--text-tertiary)",
                                    }}
                                  >
                                    Assigned TA
                                  </div>
                                </div>
                              </div>
                            ) : hasItemLevelAssignments ? (
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "2px",
                                }}
                              >
                                <div
                                  style={{ fontSize: "13px", fontWeight: 500 }}
                                >
                                  Assigned to {itemLevelAssigneeLabel}
                                </div>
                                <div
                                  style={{
                                    fontSize: "11px",
                                    color: "var(--text-tertiary)",
                                  }}
                                >
                                  Item-level assignment
                                </div>
                              </div>
                            ) : (
                              <span className="status-badge inactive">
                                Unassigned
                              </span>
                            )}
                          </td>

                          <td>
                            {!req.assignedTAId &&
                            !hasItemLevelAssignments &&
                            normalizeStatus(req.overallStatus) === "Active" ? (
                              <div className="assign-ta-inline">
                                <select
                                  className="assign-ta-select assign-ta-select--inline"
                                  value={assignmentDrafts[req.reqId] ?? ""}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    setAssignmentDrafts((prev) => ({
                                      ...prev,
                                      [req.reqId]: e.target.value,
                                    }));
                                  }}
                                >
                                  <option value="">Assign TA</option>
                                  {taUsers.map((user) => (
                                    <option
                                      key={user.user_id}
                                      value={user.user_id}
                                    >
                                      {user.username}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  className="action-button primary"
                                  style={{
                                    fontSize: "11px",
                                    padding: "6px 10px",
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleConfirmAssignment(req);
                                  }}
                                  disabled={assignmentLoading[req.reqId]}
                                >
                                  {assignmentLoading[req.reqId]
                                    ? "Assigning"
                                    : "Assign"}
                                </button>
                              </div>
                            ) : !req.assignedTAId && hasItemLevelAssignments ? (
                              <span
                                style={{
                                  fontSize: "11px",
                                  color: "var(--text-secondary)",
                                }}
                              >
                                Assigned to {itemLevelAssigneeLabel}
                              </span>
                            ) : !req.assignedTAId ? (
                              <span
                                style={{
                                  fontSize: "11px",
                                  color: "var(--text-tertiary)",
                                }}
                              >
                                Awaiting assignment
                              </span>
                            ) : isAssignedToMe ? (
                              <button
                                className="action-button"
                                style={{
                                  fontSize: "11px",
                                  padding: "6px 12px",
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedRequisition(req);
                                }}
                              >
                                Manage
                              </button>
                            ) : (
                              <span
                                style={{
                                  fontSize: "11px",
                                  color: "var(--text-tertiary)",
                                }}
                              >
                                Assigned
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                  {!isLoading &&
                    !error &&
                    filteredRequisitions.length === 0 && (
                      <tr>
                        <td colSpan={8} className="p-6">
                          <HrEmptyState
                            icon={BarChart3}
                            title="No requisitions found"
                            description="Try adjusting your filters or search criteria."
                          />
                        </td>
                      </tr>
                    )}
                </tbody>
              </table>
            </div>

            {!isLoading && !error && filteredRequisitions.length > 0 && (
              <div className="mt-4">
                <HrPaginationBar
                  page={listPage}
                  pageSize={REQUISITION_LIST_PAGE_SIZE}
                  total={filteredRequisitions.length}
                  onPageChange={setListPage}
                />
              </div>
            )}

            <div
              style={{
                marginTop: "20px",
                padding: "16px",
                backgroundColor: "var(--bg-tertiary)",
                borderRadius: "12px",
                fontSize: "12px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <strong>
                    {filteredRequisitions.length} match
                    {filteredRequisitions.length !== 1 ? "es" : ""}
                    {filteredRequisitions.length !== requisitions.length &&
                      ` (filtered from ${requisitions.length} total)`}
                  </strong>
                </div>
                <div>
                  <span
                    style={{
                      marginRight: "16px",
                      color: "var(--text-tertiary)",
                    }}
                  >
                    ⚠ {requisitions.filter((r) => !r.assignedTAId).length}{" "}
                    unassigned
                  </span>
                  <span style={{ color: "var(--text-tertiary)" }}>
                    ⏱ Avg aging:{" "}
                    {requisitions.length > 0
                      ? Math.round(
                          requisitions.reduce(
                            (sum, req) => sum + getAgingDays(req.dateCreated),
                            0,
                          ) / requisitions.length,
                        )
                      : 0}{" "}
                    days
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Matchmaking Panel */}
          {selectedRequisition && (
            <div
              style={{
                backgroundColor: "var(--bg-secondary)",
                borderRadius: "16px",
                padding: "24px",
                border: "1px solid var(--border-subtle)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "24px",
                }}
              >
                <div>
                  <h3
                    style={{
                      fontSize: "16px",
                      fontWeight: 600,
                      marginBottom: "4px",
                    }}
                  >
                    Matchmaking for {selectedRequisition.id}
                  </h3>
                  <p
                    style={{ fontSize: "12px", color: "var(--text-tertiary)" }}
                  >
                    Assign resources to requisition items - Work item by item
                  </p>
                </div>
                <button
                  className="action-button"
                  onClick={() => setSelectedRequisition(null)}
                  style={{ fontSize: "12px", padding: "8px 12px" }}
                >
                  Close Panel
                </button>
              </div>

              <div>
                <MatchmakingPanel
                  requisition={selectedRequisition}
                  employees={employees}
                  onAssignEmployee={handleAssignEmployee}
                  requesterDisplayName={
                    resolveUserName(selectedRequisition.raised_by) ||
                    selectedRequisition.raisedBy
                  }
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Workflow Note */}
      {!selectedRequisition && (
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
              marginBottom: "8px",
            }}
          >
            <AlertCircle size={16} color="var(--primary-accent)" />
            <strong style={{ fontSize: "13px", color: "var(--text-primary)" }}>
              HR Workflow Guide
            </strong>
          </div>
          <div
            style={{
              fontSize: "12px",
              color: "var(--text-secondary)",
              lineHeight: 1.6,
            }}
          >
            <p>
              1. <strong>Approvals</strong> — Use the &quot;Approvals&quot; filter to see
              requisitions in Pending Budget or Pending HR. Approve (with budget
              if needed) or Reject with a reason (min 10 characters).
            </p>
            <p>
              2. <strong>Assign TA</strong> — For approved (Active) requisitions,
              assign yourself or a TA so recruitment can start. Unassigned
              requisitions appear in the &quot;Unassigned&quot; filter.
            </p>
            <p>
              3. <strong>Matchmaking</strong> — Click a requisition row to open
              the detail view. Select a position and assign an employee from
              suggested matches; work through items until fulfilled or cancelled.
            </p>
            <p>
              4. <strong>Closure</strong> — A requisition moves to Fulfilled
              automatically when all positions are fulfilled or cancelled.
            </p>
          </div>
        </div>
      )}

      {rejectModalOpen && rejectingRequisition && (
        <div className="modal-overlay">
          <div className="modal-content rejection-modal">
            <div className="modal-header">
              <div>
                <h3>Reject Requisition</h3>
                <p className="modal-subtitle">
                  Provide a clear justification for the rejection.
                </p>
              </div>
              <button
                className="action-button compact"
                type="button"
                onClick={closeRejectModal}
              >
                Close
              </button>
            </div>

            <div className="modal-body rejection-body">
              <div className="rejection-meta">
                <div>
                  <span className="rejection-label">Requisition ID</span>
                  <div className="rejection-value">
                    {rejectingRequisition.id}
                  </div>
                </div>
                <div>
                  <span className="rejection-label">Project</span>
                  <div className="rejection-value">
                    {rejectingRequisition.project}
                  </div>
                </div>
              </div>

              <div className="form-field">
                <label>Rejection Reason</label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Enter a detailed rejection justification..."
                  rows={4}
                  className="rejection-textarea"
                />
                <div className="rejection-helper">
                  <span
                    className={`rejection-counter ${
                      isRejectionValid ? "valid" : "invalid"
                    }`}
                  >
                    {rejectionReason.trim().length}/10 minimum
                  </span>
                  {rejectionError && (
                    <span className="rejection-error">{rejectionError}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="action-button compact"
                type="button"
                onClick={closeRejectModal}
                disabled={
                  rejectingRequisition
                    ? rejectionLoading[rejectingRequisition.reqId]
                    : false
                }
              >
                Cancel
              </button>
              <button
                className="action-button danger compact"
                type="button"
                onClick={handleRejectSubmit}
                disabled={
                  !isRejectionValid ||
                  (rejectingRequisition
                    ? rejectionLoading[rejectingRequisition.reqId]
                    : false)
                }
              >
                {rejectingRequisition &&
                rejectionLoading[rejectingRequisition.reqId]
                  ? "Rejecting..."
                  : "Reject Requisition"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default HrRequisitions;
