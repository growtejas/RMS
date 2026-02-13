// components/hr/TicketDetail.tsx
import React, { useEffect, useState, useCallback } from "react";
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
  Search,
  Filter,
  AlertCircle,
  Briefcase,
  Award,
  GraduationCap,
  MapPin,
  ChevronDown,
  ChevronUp,
  DollarSign,
  UserCog,
  ArrowRightLeft,
} from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { apiClient } from "../../api/client";
import HRGatekeeperPanel from "./HRGatekeeperPanel";
import ReassignTAModal from "./ReassignTAModal";
import type { Requisition as WorkflowRequisition, RequisitionItem as WorkflowRequisitionItem } from "../../types/workflow";
import { useAuth } from "../../contexts/AuthContext";

interface TicketDetailsProps {
  ticketId?: string | null;
  onBack?: () => void;
  onUpdate?: (ticket: any) => void;
}

interface Employee {
  id: string;
  name: string;
  skill: string;
  level: string;
  experience: number;
  location: string;
  availability: "Available" | "On Project" | "On Notice";
  matchScore: number;
  department: string;
}

interface RequisitionItem {
  id: string;
  numericItemId: number;
  skill: string;
  level: string;
  experience: number;
  education: string;
  itemStatus: string;
  assignedEmployeeId?: string;
  assignedEmployeeName?: string;
  assignedDate?: string;
  assignedTAId?: number | null;
  description: string;
  requirements?: string;
}

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
  availableEmployees: Employee[];
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
  requirements?: string | null;
  item_status: string;
  assigned_ta?: number | null;
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

const TicketDetail: React.FC<TicketDetailsProps> = ({
  ticketId,
  onBack,
  onUpdate,
}) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const effectiveTicketId = ticketId ?? id;

  // Check if user is HR or Admin for Gatekeeper access
  const isHRRole = (user?.roles || []).some(
    (r) => r.toLowerCase() === "hr" || r.toLowerCase() === "admin"
  );

  // Raw requisition data for Gatekeeper panel
  const [rawRequisition, setRawRequisition] = useState<WorkflowRequisition | null>(null);
  const getTodayDate = () =>
    new Date().toISOString().split("T")[0] ?? new Date().toISOString();
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "overview" | "items" | "employees" | "timeline" | "gatekeeper"
  >("overview");
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [selectedItemForAssignment, setSelectedItemForAssignment] = useState<
    string | null
  >(null);
  const [newNote, setNewNote] = useState("");
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [statusHistory, setStatusHistory] = useState<StatusHistoryEntry[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [usersById, setUsersById] = useState<Record<number, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---- Phase 7: TA Reassignment state ----
  const [reassignModal, setReassignModal] = useState<{
    mode: "item" | "bulk";
    itemId?: number;
    itemLabel?: string;
    currentTAId: number | null;
  } | null>(null);
  const [bulkOldTAId, setBulkOldTAId] = useState<number | null>(null);

  /** TA users extracted from usersById (populated after fetch) */
  const taUsersList = Object.entries(usersById).map(([id, username]) => ({
    user_id: Number(id),
    username,
  }));

  const parseReqId = (value?: string | null) => {
    if (!value) return null;
    const match = value.match(/\d+/);
    return match ? Number(match[0]) : null;
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
      raisedById: req.raised_by ?? null,
      assignedTA: req.assigned_ta ? `User #${req.assigned_ta}` : "Unassigned",
      assignedTAId: req.assigned_ta ?? null,
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
          numericItemId: item.item_id,
          skill: item.role_position,
          level: item.skill_level ?? "—",
          experience: item.experience_years ?? 0,
          education: item.education_requirement ?? "—",
          itemStatus: item.item_status,
          assignedTAId: item.assigned_ta ?? null,
          description: item.job_description,
          requirements: item.requirements ?? undefined,
        })) ?? [],
      availableEmployees: [],
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

  const getInitials = (name?: string) => {
    if (!name) return "?";
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("");
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
          const data = response.data;
          setTicket(buildTicket(data));
          
          // Store raw data for Gatekeeper panel
          const workflowReq: WorkflowRequisition = {
            req_id: data.req_id,
            project_name: data.project_name ?? null,
            client_name: data.client_name ?? null,
            overall_status: data.overall_status as WorkflowRequisition["overall_status"],
            required_by_date: data.required_by_date ?? null,
            priority: data.priority ?? null,
            budget_amount: data.budget_amount ?? null,
            created_at: data.created_at ?? null,
            work_mode: data.work_mode ?? null,
            office_location: data.office_location ?? null,
            justification: data.justification ?? null,
            duration: data.duration ?? null,
            is_replacement: null,
            manager_notes: null,
            rejection_reason: null,
            jd_file_key: null,
            raised_by: data.raised_by ?? 0,
            assigned_ta: data.assigned_ta ?? null,
            budget_approved_by: data.budget_approved_by ?? null,
            approved_by: data.approved_by ?? null,
            approval_history: data.approval_history ?? null,
            assigned_at: data.assigned_at ?? null,
            total_items: data.items?.length ?? 0,
            fulfilled_items: data.items?.filter((i) => i.item_status === "Fulfilled").length ?? 0,
            cancelled_items: data.items?.filter((i) => i.item_status === "Cancelled").length ?? 0,
            active_items: data.items?.filter((i) => i.item_status !== "Fulfilled" && i.item_status !== "Cancelled").length ?? 0,
            progress_ratio: null,
            progress_text: null,
            total_estimated_budget: 0,
            total_approved_budget: 0,
            budget_approval_status: null,
            items: (data.items || []).map((item) => {
              const extItem = item as BackendRequisitionItem & {
                estimated_budget?: number | null;
                approved_budget?: number | null;
                currency?: string | null;
                replacement_hire?: boolean;
                replaced_emp_id?: string | null;
                assigned_ta?: number | null;
                assigned_emp_id?: string | null;
              };
              return {
                item_id: item.item_id,
                req_id: item.req_id,
                role_position: item.role_position,
                skill_level: item.skill_level ?? null,
                experience_years: item.experience_years ?? null,
                education_requirement: item.education_requirement ?? null,
                job_description: item.job_description,
                requirements: item.requirements ?? null,
                item_status: item.item_status as WorkflowRequisitionItem["item_status"],
                replacement_hire: extItem.replacement_hire ?? false,
                replaced_emp_id: extItem.replaced_emp_id ?? null,
                estimated_budget: extItem.estimated_budget ?? null,
                approved_budget: extItem.approved_budget ?? null,
                currency: extItem.currency ?? "INR",
                assigned_ta: extItem.assigned_ta ?? null,
                assigned_emp_id: extItem.assigned_emp_id ?? null,
              };
            }),
          };
          
          // Calculate totals
          workflowReq.total_estimated_budget = workflowReq.items.reduce(
            (sum, item) => sum + (item.estimated_budget || 0),
            0
          );
          workflowReq.total_approved_budget = workflowReq.items.reduce(
            (sum, item) => sum + (item.approved_budget || 0),
            0
          );
          
          setRawRequisition(workflowReq);
          
          // Auto-switch to Gatekeeper tab if status is Pending_Budget and user is HR
          if (data.overall_status === "Pending_Budget" && isHRRole) {
            setActiveTab("gatekeeper");
          }
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
        const response = await apiClient.get<UserDirectoryEntry[]>("/users");
        if (!isMounted) return;
        const map: Record<number, string> = {};
        response.data.forEach((userEntry) => {
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

  // Refresh data callback for Gatekeeper panel
  // IMPORTANT: This hook must be called before any early returns
  const handleRefreshData = useCallback(async () => {
    const reqId = parseReqId(effectiveTicketId);
    if (!reqId) return;

    try {
      // Phase 7: Add cache-busting timestamp to ensure fresh data after reassignment
      const response = await apiClient.get<BackendRequisition>(
        `/requisitions/${reqId}?_t=${Date.now()}`,
      );
      const data = response.data;
      setTicket(buildTicket(data));

      // Update raw data for Gatekeeper panel
      const workflowReq: WorkflowRequisition = {
        req_id: data.req_id,
        project_name: data.project_name ?? null,
        client_name: data.client_name ?? null,
        overall_status: data.overall_status as WorkflowRequisition["overall_status"],
        required_by_date: data.required_by_date ?? null,
        priority: data.priority ?? null,
        budget_amount: data.budget_amount ?? null,
        created_at: data.created_at ?? null,
        work_mode: data.work_mode ?? null,
        office_location: data.office_location ?? null,
        justification: data.justification ?? null,
        duration: data.duration ?? null,
        is_replacement: null,
        manager_notes: null,
        rejection_reason: null,
        jd_file_key: null,
        raised_by: data.raised_by ?? 0,
        assigned_ta: data.assigned_ta ?? null,
        budget_approved_by: data.budget_approved_by ?? null,
        approved_by: data.approved_by ?? null,
        approval_history: data.approval_history ?? null,
        assigned_at: data.assigned_at ?? null,
        total_items: data.items?.length ?? 0,
        fulfilled_items: data.items?.filter((i) => i.item_status === "Fulfilled").length ?? 0,
        cancelled_items: data.items?.filter((i) => i.item_status === "Cancelled").length ?? 0,
        active_items: data.items?.filter((i) => i.item_status !== "Fulfilled" && i.item_status !== "Cancelled").length ?? 0,
        progress_ratio: null,
        progress_text: null,
        total_estimated_budget: 0,
        total_approved_budget: 0,
        budget_approval_status: null,
        items: (data.items || []).map((item) => {
          const extItem = item as BackendRequisitionItem & {
            estimated_budget?: number | null;
            approved_budget?: number | null;
            currency?: string | null;
            replacement_hire?: boolean;
            replaced_emp_id?: string | null;
            assigned_ta?: number | null;
            assigned_emp_id?: string | null;
          };
          return {
            item_id: item.item_id,
            req_id: item.req_id,
            role_position: item.role_position,
            skill_level: item.skill_level ?? null,
            experience_years: item.experience_years ?? null,
            education_requirement: item.education_requirement ?? null,
            job_description: item.job_description,
            requirements: item.requirements ?? null,
            item_status: item.item_status as WorkflowRequisitionItem["item_status"],
            replacement_hire: extItem.replacement_hire ?? false,
            replaced_emp_id: extItem.replaced_emp_id ?? null,
            estimated_budget: extItem.estimated_budget ?? null,
            approved_budget: extItem.approved_budget ?? null,
            currency: extItem.currency ?? "INR",
            assigned_ta: extItem.assigned_ta ?? null,
            assigned_emp_id: extItem.assigned_emp_id ?? null,
          };
        }),
      };

      workflowReq.total_estimated_budget = workflowReq.items.reduce(
        (sum, item) => sum + (item.estimated_budget || 0),
        0
      );
      workflowReq.total_approved_budget = workflowReq.items.reduce(
        (sum, item) => sum + (item.approved_budget || 0),
        0
      );

      setRawRequisition(workflowReq);

      // If status changed from Pending_Budget, switch to overview
      if (data.overall_status !== "Pending_Budget" && activeTab === "gatekeeper") {
        setActiveTab("overview");
      }
    } catch (err) {
      // Silent refresh error
      console.error("Failed to refresh requisition:", err);
    }
  }, [effectiveTicketId, activeTab]);

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

    // F-002 FIX: Use "Fulfilled" instead of "Closed"
    if (ticket.overallStatus === "Fulfilled") {
      steps.push({
        id: "fulfilled",
        title: "Requisition Fulfilled",
        actor: resolveUserName(statusHistoryByStatus["Fulfilled"]?.changed_by),
        time: statusHistoryByStatus["Fulfilled"]?.changed_at ?? null,
      });
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

  // Calculate completion stats
  const completionStats = {
    totalItems: ticket.items.length,
    fulfilled: ticket.items.filter((item) => item.itemStatus === "Fulfilled")
      .length,
    pending: ticket.items.filter((item) => item.itemStatus === "Pending")
      .length,
    cancelled: ticket.items.filter((item) => item.itemStatus === "Cancelled")
      .length,
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

    // Update overall status if all items are done
    // F-002 FIX: Use "Fulfilled" instead of "Closed"
    const allItemsDone = updatedItems.every(
      (item) =>
        item.itemStatus === "Fulfilled" || item.itemStatus === "Cancelled",
    );
    if (allItemsDone) {
      setTicket((prev) =>
        prev ? { ...prev, overallStatus: "Fulfilled" } : prev,
      );
    }
  };

  // Handle employee assignment
  const handleAssignEmployee = (itemId: string, employeeId: string) => {
    if (!ticket) return;
    const employee = ticket.availableEmployees.find(
      (emp) => emp.id === employeeId,
    );
    if (!employee) return;

    const updatedItems = ticket.items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            itemStatus: "Fulfilled" as const,
            assignedEmployeeId: employeeId,
            assignedEmployeeName: employee.name,
            assignedDate: getTodayDate(),
          }
        : item,
    );

    setTicket({ ...ticket, items: updatedItems });
    setSelectedItemForAssignment(null);

    // Add to timeline
    setTicket((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        timeline: [
          ...prev.timeline,
          {
            date: getTodayDate(),
            event: `Assigned ${employee.name} to ${prev.items.find((i) => i.id === itemId)?.skill ?? "resource"}`,
            user: "Current User",
          },
        ],
      };
    });

    if (onUpdate) {
      onUpdate({ ...ticket, items: updatedItems });
    }
  };

  // Toggle item expansion
  const toggleItemExpansion = (itemId: string) => {
    setExpandedItems((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId],
    );
  };

  // Save changes
  const handleSave = () => {
    setIsEditing(false);
    if (onUpdate) {
      onUpdate(ticket);
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

  // Check if Gatekeeper tab should be shown
  const showGatekeeperTab =
    isHRRole &&
    (ticket?.overallStatus === "Pending_Budget" ||
      ticket?.overallStatus === "Pending Budget Approval");

  // Tabs
  const tabs = [
    ...(showGatekeeperTab
      ? [
          {
            id: "gatekeeper" as const,
            label: "Gatekeeper",
            icon: <DollarSign size={16} />,
          },
        ]
      : []),
    {
      id: "overview" as const,
      label: "Overview",
      icon: <FileText size={16} />,
    },
    {
      id: "items" as const,
      label: "Requisition Items",
      icon: <Briefcase size={16} />,
    },
    {
      id: "employees" as const,
      label: "Available Employees",
      icon: <Users size={16} />,
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
            onClick={() => (onBack ? onBack() : navigate("/hr/requisitions"))}
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
              Manage and update resource requirements
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
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <Save size={16} />
                Save Changes
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
            <span
              className={`ticket-status ${ticket.overallStatus.toLowerCase().replace(" ", "-")}`}
            >
              {ticket.overallStatus}
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

        {/* Progress Bar */}
        <div style={{ marginBottom: "8px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "8px",
            }}
          >
            <span style={{ fontSize: "14px", fontWeight: 500 }}>
              Completion Progress
            </span>
            <span style={{ fontSize: "14px", fontWeight: 600 }}>
              {completionStats.progress}%
            </span>
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
                  "linear-gradient(135deg, var(--primary-accent), var(--primary-accent-dark))",
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
            <span> {completionStats.fulfilled} Fulfilled</span>
            <span> {completionStats.pending} Pending</span>
            <span> {completionStats.cancelled} Cancelled</span>
            <span> {completionStats.totalItems} Total Positions</span>
          </div>
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
      {activeTab === "gatekeeper" && rawRequisition && (
        <HRGatekeeperPanel
          requisition={rawRequisition}
          onRefresh={handleRefreshData}
          onApprovalComplete={() => {
            // Refresh data and switch to overview after approval completes
            handleRefreshData();
          }}
        />
      )}

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
                      <span style={{ color: "var(--text-secondary)" }}>
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
                    >
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
                      <span>{ticket.projectManager}</span>
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
                    <span style={{ fontWeight: 500 }}>{ticket.assignedTA}</span>
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
                    <span>{ticket.dateCreated}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Quick Stats & Actions */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: "24px" }}
          >
            {/* Quick Stats */}
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
                    SLA Status
                  </span>
                  <span
                    className={`sla-timer ${ticket.daysOpen > 10 ? "critical" : "warning"}`}
                  >
                    {ticket.slaHours - ticket.daysOpen * 24}h remaining
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
                    Match Rate
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
                    Bench Availability
                  </span>
                  <span style={{ color: "var(--success)", fontWeight: 600 }}>
                    {completionStats.pending} open positions
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="audit-log-viewer">
              <div className="viewer-header">
                <h2>Quick Actions</h2>
                <p className="subtitle">HR operations</p>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  marginTop: "16px",
                }}
              >
                {/* <button
                  className="action-button"
                  style={{ justifyContent: "flex-start", textAlign: "left" }}
                  onClick={() => setActiveTab("employees")}
                >
                  <Users size={16} />
                  View Available Employees
                </button> */}
                {/* <button
                  className="action-button"
                  style={{ justifyContent: "flex-start", textAlign: "left" }}
                  onClick={() => setActiveTab("items")}
                >
                  <Briefcase size={16} />
                  Manage Requisition Items
                </button> */}
                <button
                  className="action-button"
                  style={{ justifyContent: "flex-start", textAlign: "left" }}
                >
                  <MessageSquare size={16} />
                  Add Internal Note
                </button>
                {/* <button
                  className="action-button primary"
                  style={{ justifyContent: "center" }}
                >
                  <ExternalLink size={16} />
                  Generate Onboarding Plan
                </button> */}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "items" && (
        <div className="master-data-manager">
          <div className="data-manager-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <h2>Requisition Items Management</h2>
              <p className="subtitle">
                Manage individual positions - Update status or assign resources
              </p>
            </div>

            {/* Phase 7: Bulk Change TA — HR Admin only */}
            {isHRRole && ticket.items.some(
              (i) => i.itemStatus !== "Fulfilled" && i.itemStatus !== "Cancelled" && i.assignedTAId,
            ) && (
              <button
                className="action-button"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "13px",
                  padding: "10px 16px",
                  whiteSpace: "nowrap",
                }}
                onClick={() => {
                  // Find the most common currently assigned TA for pre-selection
                  const taCounts: Record<number, number> = {};
                  ticket.items.forEach((i) => {
                    if (
                      i.assignedTAId &&
                      i.itemStatus !== "Fulfilled" &&
                      i.itemStatus !== "Cancelled"
                    ) {
                      taCounts[i.assignedTAId] =
                        (taCounts[i.assignedTAId] ?? 0) + 1;
                    }
                  });
                  const topTA = Object.entries(taCounts).sort(
                    (a, b) => b[1] - a[1],
                  )[0];
                  const defaultOldTA = topTA ? Number(topTA[0]) : null;
                  setBulkOldTAId(defaultOldTA);
                  setReassignModal({
                    mode: "bulk",
                    currentTAId: defaultOldTA,
                  });
                }}
              >
                <ArrowRightLeft size={14} />
                Bulk Change TA
              </button>
            )}
          </div>

          <div
            style={{ display: "flex", flexDirection: "column", gap: "16px" }}
          >
            {ticket.items.map((item) => {
              const isExpanded = expandedItems.includes(item.id);
              const secondarySkills = parseSecondarySkills(item.requirements);
              const primarySkill =
                parsePrimarySkill(item.requirements) ?? item.skill;
              const matchedEmployees = ticket.availableEmployees
                .filter(
                  (emp) =>
                    emp.skill.includes(item.skill.split(" ")[0] ?? "") &&
                    emp.level === item.level,
                )
                .sort((a, b) => b.matchScore - a.matchScore);

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
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      marginBottom: "16px",
                    }}
                  >
                    <div>
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
                                : "ticket-status closed"
                          }
                        >
                          {item.itemStatus}
                        </span>
                        <strong style={{ fontSize: "15px" }}>
                          {item.skill} ({item.level})
                        </strong>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: "16px",
                          fontSize: "12px",
                          color: "var(--text-tertiary)",
                        }}
                      >
                        <span>📊 {item.experience} years exp</span>
                        <span>🎓 {item.education}</span>
                        <span>
                          {item.assignedEmployeeName
                            ? `👤 Assigned: ${item.assignedEmployeeName}`
                            : "👤 Unassigned"}
                        </span>
                        {/* TA Badge */}
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            padding: "2px 8px",
                            borderRadius: "6px",
                            backgroundColor: item.assignedTAId
                              ? "rgba(59, 130, 246, 0.08)"
                              : "rgba(245, 158, 11, 0.08)",
                            color: item.assignedTAId
                              ? "var(--primary-accent)"
                              : "var(--warning)",
                            fontSize: "11px",
                            fontWeight: 500,
                          }}
                        >
                          <UserCog size={10} />
                          {item.assignedTAId
                            ? `TA: ${usersById[item.assignedTAId] ?? `#${item.assignedTAId}`}`
                            : "No TA Assigned"}
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      {/* Phase 7: Change TA / Assign TA — HR Admin only, non-terminal items */}
                      {isHRRole &&
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
                            }}
                            onClick={() =>
                              setReassignModal({
                                mode: "item",
                                itemId: item.numericItemId,
                                itemLabel: `${item.skill} (Item #${item.numericItemId})`,
                                currentTAId: item.assignedTAId ?? null,
                              })
                            }
                          >
                            <ArrowRightLeft size={12} />
                            {item.assignedTAId ? "Change TA" : "Assign TA"}
                          </button>
                        )}

                      {item.itemStatus === "Pending" && (
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
                            : "Assign Employee"}
                        </button>
                      )}

                      {isEditing && (
                        <div style={{ display: "flex", gap: "4px" }}>
                          <button
                            className="action-button"
                            style={{ fontSize: "11px", padding: "6px 10px" }}
                            onClick={() =>
                              handleItemStatusChange(item.id, "Fulfilled")
                            }
                            disabled={item.itemStatus === "Fulfilled"}
                          >
                            Mark Fulfilled
                          </button>
                          <button
                            className="action-button"
                            style={{ fontSize: "11px", padding: "6px 10px" }}
                            onClick={() =>
                              handleItemStatusChange(item.id, "Cancelled")
                            }
                          >
                            Cancel
                          </button>
                        </div>
                      )}

                      <button
                        className="action-button"
                        style={{
                          width: "32px",
                          height: "32px",
                          padding: "0",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        onClick={() => toggleItemExpansion(item.id)}
                      >
                        {isExpanded ? (
                          <ChevronUp size={14} />
                        ) : (
                          <ChevronDown size={14} />
                        )}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div
                      style={{
                        marginTop: "16px",
                        paddingTop: "16px",
                        borderTop: "1px solid var(--border-subtle)",
                      }}
                    >
                      <div
                        style={{
                          padding: "16px",
                          borderRadius: "10px",
                          backgroundColor: "var(--bg-secondary)",
                          border: "1px solid var(--border-subtle)",
                          marginBottom: "12px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "13px",
                            fontWeight: 600,
                            marginBottom: "10px",
                          }}
                        >
                          Skill Profile
                        </div>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                            fontSize: "12px",
                          }}
                        >
                          <div>
                            <span
                              className="priority-indicator priority-high"
                              style={{ marginRight: "8px" }}
                            >
                              {item.skill}
                            </span>
                            <span style={{ color: "var(--text-tertiary)" }}>
                              Level: {item.level} • Experience:{" "}
                              {item.experience} yrs
                            </span>
                          </div>
                          <div>
                            <span style={{ color: "var(--text-tertiary)" }}>
                              Secondary Skills
                            </span>
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "8px",
                                marginTop: "6px",
                              }}
                            >
                              {secondarySkills.length > 0 ? (
                                secondarySkills.map((skill) => (
                                  <span
                                    key={skill}
                                    className="filter-chip"
                                    style={{ padding: "6px 10px" }}
                                  >
                                    {skill}
                                  </span>
                                ))
                              ) : (
                                <span style={{ color: "var(--text-tertiary)" }}>
                                  No secondary skills specified.
                                </span>
                              )}
                            </div>
                            <div
                              style={{
                                marginTop: "6px",
                                color: "var(--text-tertiary)",
                              }}
                            >
                              Level: {item.level} • Experience:{" "}
                              {item.experience} yrs
                            </div>
                          </div>
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: "13px",
                          color: "var(--text-secondary)",
                          marginBottom: "12px",
                        }}
                      >
                        {item.description}
                      </div>

                      {selectedItemForAssignment === item.id && (
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
                              fontSize: "13px",
                              fontWeight: 600,
                              marginBottom: "12px",
                            }}
                          >
                            Available Matches ({matchedEmployees.length})
                          </div>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "8px",
                            }}
                          >
                            {matchedEmployees.map((emp) => (
                              <div
                                key={emp.id}
                                style={{
                                  padding: "12px",
                                  backgroundColor: "var(--bg-primary)",
                                  borderRadius: "8px",
                                  border: "1px solid var(--border-subtle)",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                }}
                              >
                                <div>
                                  <div style={{ fontWeight: 500 }}>
                                    {emp.name}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "11px",
                                      color: "var(--text-tertiary)",
                                    }}
                                  >
                                    {emp.department} • {emp.location} •{" "}
                                    {emp.experience}y exp
                                  </div>
                                </div>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "12px",
                                  }}
                                >
                                  <span
                                    style={{
                                      padding: "4px 8px",
                                      borderRadius: "12px",
                                      fontSize: "11px",
                                      background:
                                        emp.availability === "Available"
                                          ? "rgba(16, 185, 129, 0.1)"
                                          : "rgba(245, 158, 11, 0.1)",
                                      color:
                                        emp.availability === "Available"
                                          ? "var(--success)"
                                          : "var(--warning)",
                                    }}
                                  >
                                    {emp.availability}
                                  </span>
                                  <span
                                    style={{
                                      fontWeight: 600,
                                      color: "var(--primary-accent)",
                                    }}
                                  >
                                    {emp.matchScore}% match
                                  </span>
                                  <button
                                    className="action-button primary"
                                    style={{
                                      fontSize: "11px",
                                      padding: "6px 12px",
                                    }}
                                    onClick={() =>
                                      handleAssignEmployee(item.id, emp.id)
                                    }
                                  >
                                    Assign
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

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
              <strong
                style={{ fontSize: "13px", color: "var(--text-primary)" }}
              >
                Workflow Note
              </strong>
            </div>
            <p
              style={{
                fontSize: "12px",
                color: "var(--text-secondary)",
                lineHeight: 1.5,
              }}
            >
              Each requisition item represents one position. When you assign an
              employee, the item status changes to "Fulfilled". The overall
              requisition will close automatically when all items are either
              "Fulfilled" or "Cancelled".
            </p>
          </div>
        </div>
      )}

      {activeTab === "employees" && (
        <div className="master-data-manager">
          <div className="data-manager-header">
            <h2>Available Employees</h2>
            <p className="subtitle">
              Match resources to open positions based on skills and availability
            </p>
          </div>

          {/* Search and Filter */}
          <div className="filter-grid" style={{ marginBottom: "24px" }}>
            <div className="filter-item">
              <label>Skill Match</label>
              <select style={{ width: "100%" }}>
                <option>All Skills</option>
                <option>Python Developer</option>
                <option>React Developer</option>
                <option>DevOps Engineer</option>
              </select>
            </div>
            <div className="filter-item">
              <label>Availability</label>
              <select style={{ width: "100%" }}>
                <option>All Status</option>
                <option>Available</option>
                <option>On Project</option>
                <option>On Notice</option>
              </select>
            </div>
            <div className="filter-item">
              <label>Location</label>
              <select style={{ width: "100%" }}>
                <option>All Locations</option>
                <option>Bengaluru</option>
                <option>Mumbai</option>
                <option>Delhi</option>
                <option>Pune</option>
              </select>
            </div>
          </div>

          {/* Employees List */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            {ticket.availableEmployees.map((emp) => {
              const openItems = ticket.items.filter(
                (item) =>
                  item.itemStatus === "Pending" &&
                  item.skill.includes(emp.skill.split(" ")[0] ?? "") &&
                  item.level === emp.level,
              );

              return (
                <div
                  key={emp.id}
                  style={{
                    padding: "20px",
                    backgroundColor: "var(--bg-primary)",
                    borderRadius: "12px",
                    border: "1px solid var(--border-subtle)",
                    transition: "all 0.2s ease",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      marginBottom: "16px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          marginBottom: "8px",
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
                          {emp.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </div>
                        <div>
                          <div style={{ fontSize: "15px", fontWeight: 600 }}>
                            {emp.name}
                          </div>
                          <div
                            style={{
                              fontSize: "13px",
                              color: "var(--text-secondary)",
                            }}
                          >
                            {emp.skill} • {emp.level} • {emp.department}
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "16px",
                          fontSize: "12px",
                          color: "var(--text-tertiary)",
                        }}
                      >
                        <span>📍 {emp.location}</span>
                        <span>📊 {emp.experience} years exp</span>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: "12px",
                            background:
                              emp.availability === "Available"
                                ? "rgba(16, 185, 129, 0.1)"
                                : emp.availability === "On Notice"
                                  ? "rgba(245, 158, 11, 0.1)"
                                  : "rgba(100, 116, 139, 0.1)",
                            color:
                              emp.availability === "Available"
                                ? "var(--success)"
                                : emp.availability === "On Notice"
                                  ? "var(--warning)"
                                  : "var(--slate-500)",
                          }}
                        >
                          {emp.availability}
                        </span>
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div
                        style={{
                          fontSize: "20px",
                          fontWeight: 700,
                          color: "var(--primary-accent)",
                        }}
                      >
                        {emp.matchScore}%
                      </div>
                      <div
                        style={{
                          fontSize: "11px",
                          color: "var(--text-tertiary)",
                        }}
                      >
                        Match Score
                      </div>
                    </div>
                  </div>

                  {/* Matching Positions */}
                  {openItems.length > 0 && (
                    <div
                      style={{
                        marginTop: "16px",
                        paddingTop: "16px",
                        borderTop: "1px solid var(--border-subtle)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "13px",
                          fontWeight: 600,
                          marginBottom: "8px",
                        }}
                      >
                        Matching Open Positions ({openItems.length})
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                        }}
                      >
                        {openItems.map((item) => (
                          <div
                            key={item.id}
                            style={{
                              padding: "10px 12px",
                              backgroundColor: "var(--bg-secondary)",
                              borderRadius: "8px",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <div>
                              <div
                                style={{ fontWeight: 500, fontSize: "13px" }}
                              >
                                {item.skill}
                              </div>
                              <div
                                style={{
                                  fontSize: "11px",
                                  color: "var(--text-tertiary)",
                                }}
                              >
                                {item.level} • {item.experience}y exp •{" "}
                                {item.education}
                              </div>
                            </div>
                            <button
                              className="action-button primary"
                              style={{ fontSize: "11px", padding: "6px 12px" }}
                              onClick={() =>
                                handleAssignEmployee(item.id, emp.id)
                              }
                            >
                              Assign to Position
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
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
                  ? "completed"
                  : item.isCurrent
                    ? "current"
                    : "upcoming";
                const timeLabel = item.time
                  ? `${formatRelativeTime(item.time)} · ${new Date(item.time).toLocaleString("en-IN")}`
                  : item.forceCompleted
                    ? "Completed (time unavailable)"
                    : "Pending";

                return (
                  <div key={item.id} className="milestone-row">
                    <div className="milestone-track">
                      <div
                        className={`milestone-node ${statusClass}`}
                        aria-hidden
                      />
                      {idx < timelineWithStatus.length - 1 && (
                        <div
                          className={`milestone-line ${statusClass} ${
                            item.isDelayed ? "delayed" : ""
                          }`}
                          aria-hidden
                        />
                      )}
                    </div>
                    <div className="milestone-card">
                      <div className="milestone-title">{item.title}</div>
                      <div className="milestone-meta">
                        <div className="milestone-avatar">
                          {getInitials(item.actor)}
                        </div>
                        <div className="milestone-actor">{item.actor}</div>
                        <div className="milestone-time">{timeLabel}</div>
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
      {ticket.overallStatus !== "Fulfilled" && (
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
                HR Workflow Guidance
              </h3>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                Recommended steps to process this requisition
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
                  Review Open Items
                </span>
              </div>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                  lineHeight: 1.4,
                }}
              >
                Check all pending positions in the "Requisition Items" tab
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
                  Match Resources
                </span>
              </div>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                  lineHeight: 1.4,
                }}
              >
                Use the "Available Employees" tab to find and assign matches
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
                  Update Status
                </span>
              </div>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                  lineHeight: 1.4,
                }}
              >
                Mark items as fulfilled or cancelled as you work through them
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
                  Document Progress
                </span>
              </div>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                  lineHeight: 1.4,
                }}
              >
                Add notes in the timeline section to track your progress
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
            <strong
              style={{
                color:
                  ticket.overallStatus === "Open"
                    ? "#2563eb"
                    : ticket.overallStatus === "In Progress"
                      ? "#d97706"
                      : "#059669",
              }}
            >
              {ticket.overallStatus}
            </strong>
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px" }}>
          {ticket.overallStatus !== "Fulfilled" && (
            <>
              {/* <button
                className="action-button"
                onClick={() => {
                  setTicket((prev) => ({ ...prev, priority: "High" }));
                }}
                style={{
                  fontSize: "12px",
                  padding: "8px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <AlertCircle size={14} />
                Mark as Urgent
              </button> */}

              <button
                className="action-button primary"
                onClick={() => {
                  if (
                    window.confirm(
                      "Are you sure you want to mark this requisition as fulfilled? This action cannot be undone.",
                    )
                  ) {
                    setTicket((prev) =>
                      prev ? { ...prev, overallStatus: "Fulfilled" } : prev,
                    );
                  }
                }}
                style={{
                  fontSize: "12px",
                  padding: "8px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <CheckCircle size={14} />
                Mark as Fulfilled
              </button>
            </>
          )}

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
      {/* <div
        style={{
          marginTop: "32px",
          paddingTop: "20px",
          borderTop: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div
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
        </div>

        <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Target size={14} />
            <span>Requisition ID: {ticket.ticketId}</span>
          </div>
        </div>
      </div> */}

      {/* Help Section */}
      {/* Phase 7: TA Reassignment Modal */}
      {reassignModal && (
        <ReassignTAModal
          mode={reassignModal.mode}
          reqId={parseReqId(effectiveTicketId) ?? 0}
          itemId={reassignModal.itemId}
          itemLabel={reassignModal.itemLabel}
          currentTAId={reassignModal.currentTAId}
          oldTAId={reassignModal.mode === "bulk" ? bulkOldTAId : undefined}
          taUsers={taUsersList}
          usersById={usersById}
          activeItemCount={
            reassignModal.mode === "bulk" && bulkOldTAId
              ? ticket.items.filter(
                  (i) =>
                    i.assignedTAId === bulkOldTAId &&
                    i.itemStatus !== "Fulfilled" &&
                    i.itemStatus !== "Cancelled",
                ).length
              : undefined
          }
          onSuccess={handleRefreshData}
          onClose={() => setReassignModal(null)}
        />
      )}
    </div>
  );
};

export default TicketDetail;
