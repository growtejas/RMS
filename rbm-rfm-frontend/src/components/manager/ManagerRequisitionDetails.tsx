import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Edit,
  Save,
  X,
  FileText,
  Calendar,
  User,
  Briefcase,
  DollarSign,
  Clock,
  AlertCircle,
  Download,
  CheckCircle,
  XCircle,
  ClockIcon,
  Eye,
  Lock,
  Unlock,
  History,
  ChevronRight,
} from "lucide-react";
import { apiClient } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";
import {
  canEditRequisition,
  RequisitionStatus,
} from "../../lib/workflow/requisition.permissions";
import "../../styles/hr/hr-dashboard.css";

// Types
interface RequisitionItem {
  item_id: number;
  role_position: string;
  skill_level?: string | null;
  experience_years?: number | null;
  education_requirement?: string | null;
  job_description: string;
  requirements?: string | null;
  item_status: string;
}

interface Requisition {
  req_id: number;
  project_name?: string | null;
  client_name?: string | null;
  office_location?: string | null;
  work_mode?: string | null;
  required_by_date?: string | null;
  priority?: string | null;
  justification?: string | null;
  budget_amount?: number | null;
  duration?: string | null;
  is_replacement?: boolean | null;
  manager_notes?: string | null;
  overall_status: RequisitionStatus;
  raised_by: number;
  raised_by_name?: string | null;
  jd_file_key?: string | null;
  created_at: string;
  updated_at: string;
  items: RequisitionItem[];
  budget_approved_by?: number | null;
  budget_approved_at?: string | null;
  hr_approved_by?: number | null;
  hr_approved_at?: string | null;
}

interface StatusHistoryEntry {
  history_id: number;
  req_id: number;
  old_status?: string | null;
  new_status: string;
  changed_by: number;
  changed_by_name?: string | null;
  changed_at: string;
  justification?: string | null;
  comments?: string | null;
}

interface ItemFormData {
  id: number | "new";
  role_position: string;
  skill_level: string;
  experience_years: number;
  education_requirement: string;
  job_description: string;
  requirements: string;
}

interface RequisitionFormData {
  project_name: string;
  client_name: string;
  office_location: string;
  work_mode: string;
  required_by_date: string;
  priority: string;
  justification: string;
  budget_amount: string;
  duration: string;
  is_replacement: boolean;
  manager_notes: string;
  items: ItemFormData[];
}

// Status badge styling
const getStatusBadgeClass = (status: RequisitionStatus) => {
  const statusMap: Record<string, string> = {
    Draft: "status-badge draft",
    "Pending Budget Approval": "status-badge pending",
    "Budget Approved": "status-badge approved",
    "Budget Rejected": "status-badge rejected",
    "Pending HR Approval": "status-badge pending",
    "HR Approved": "status-badge approved",
    "HR Rejected": "status-badge rejected",
    "Released to TA": "status-badge released",
    Active: "status-badge active",
    "On Hold": "status-badge hold",
    Closed: "status-badge closed",
  };

  return statusMap[status] || "status-badge inactive";
};

const getStatusIcon = (status: RequisitionStatus) => {
  switch (status) {
    case "Draft":
      return <FileText size={16} />;
    case "Pending Budget Approval":
    case "Pending HR Approval":
      return <ClockIcon size={16} />;
    case "Budget Approved":
    case "HR Approved":
      return <CheckCircle size={16} />;
    case "Budget Rejected":
    case "HR Rejected":
      return <XCircle size={16} />;
    case "Released to TA":
      return <ChevronRight size={16} />;
    case "Active":
      return <Briefcase size={16} />;
    case "On Hold":
      return <AlertCircle size={16} />;
    case "Closed":
      return <Lock size={16} />;
    default:
      return <FileText size={16} />;
  }
};

// Date formatting
const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatCurrency = (amount?: number | null) => {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

// Timeline component
interface TimelineProps {
  history: StatusHistoryEntry[];
}

const Timeline: React.FC<TimelineProps> = ({ history }) => {
  const getTimelineIcon = (status: string) => {
    if (status.includes("Approved")) return "✓";
    if (status.includes("Rejected")) return "✗";
    if (status.includes("Pending")) return "⏱";
    if (status.includes("Draft")) return "📝";
    if (status.includes("Released")) return "🚀";
    return "•";
  };

  const getTimelineColor = (status: string) => {
    if (status.includes("Approved")) return "var(--success)";
    if (status.includes("Rejected")) return "var(--error)";
    if (status.includes("Pending")) return "var(--warning)";
    return "var(--primary-accent)";
  };

  return (
    <div className="milestone-timeline">
      {history.map((entry, index) => (
        <div className="milestone-row" key={entry.history_id}>
          <div className="milestone-track">
            <div
              className="milestone-node"
              style={{
                backgroundColor: getTimelineColor(entry.new_status),
              }}
            >
              {getTimelineIcon(entry.new_status)}
            </div>
            {index < history.length - 1 && <div className="milestone-line" />}
          </div>
          <div className="milestone-card">
            <div className="milestone-title">{entry.new_status}</div>
            <div className="milestone-meta">
              <div className="milestone-avatar">
                {entry.changed_by_name?.charAt(0) || "U"}
              </div>
              <span className="milestone-actor">
                {entry.changed_by_name || `User ${entry.changed_by}`}
              </span>
              <span className="milestone-time">
                {formatDateTime(entry.changed_at)}
              </span>
            </div>
            {entry.justification && (
              <div className="milestone-note">
                <strong>Reason:</strong> {entry.justification}
              </div>
            )}
            {entry.comments && (
              <div className="milestone-note">
                <strong>Comments:</strong> {entry.comments}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

// Main component
const ManagerRequisitionDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  // State
  const [requisition, setRequisition] = useState<Requisition | null>(null);
  const [statusHistory, setStatusHistory] = useState<StatusHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<RequisitionFormData | null>(null);
  const [saveMessage, setSaveMessage] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [jdError, setJdError] = useState<string | null>(null);
  const [isUploadingJd, setIsUploadingJd] = useState(false);
  const [isRemovingJd, setIsRemovingJd] = useState(false);
  const [jdInputKey, setJdInputKey] = useState(0);

  // Permission check
  const canEdit = useMemo(() => {
    if (!requisition || !user) return false;

    // Check if user is the creator
    const isCreator = user.user_id === requisition.raised_by;
    if (!isCreator) return false;

    // Check workflow permissions
    return canEditRequisition(requisition.overall_status);
  }, [requisition, user]);

  // Fetch data
  useEffect(() => {
    if (!id) {
      setError("Invalid requisition ID");
      setIsLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const [requisitionRes, historyRes] = await Promise.all([
          apiClient.get<Requisition>(`/requisitions/${id}`),
          apiClient.get<StatusHistoryEntry[]>(
            `/requisitions/${id}/status-history`,
          ),
        ]);

        setRequisition(requisitionRes.data);
        setStatusHistory(historyRes.data || []);
      } catch (err: any) {
        setError(
          err.response?.data?.detail || "Failed to load requisition details",
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [id]);

  // Handle before unload for unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue =
          "You have unsaved changes. Are you sure you want to leave?";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Initialize form data
  const initializeFormData = useCallback((data: Requisition) => {
    setFormData({
      project_name: data.project_name || "",
      client_name: data.client_name || "",
      office_location: data.office_location || "",
      work_mode: data.work_mode || "Hybrid",
      required_by_date: data.required_by_date || "",
      priority: data.priority || "Medium",
      justification: data.justification || "",
      budget_amount: data.budget_amount?.toString() || "",
      duration: data.duration || "",
      is_replacement: Boolean(data.is_replacement),
      manager_notes: data.manager_notes || "",
      items: data.items.map((item) => ({
        id: item.item_id,
        role_position: item.role_position,
        skill_level: item.skill_level || "Mid",
        experience_years: item.experience_years || 3,
        education_requirement: item.education_requirement || "",
        job_description: item.job_description,
        requirements: item.requirements || "",
      })),
    });
  }, []);

  // Enter edit mode
  const handleEditStart = () => {
    if (!requisition) return;
    initializeFormData(requisition);
    setIsEditing(true);
    setSaveMessage(null);
    setHasUnsavedChanges(false);
  };

  // Cancel edit
  const handleEditCancel = () => {
    if (
      hasUnsavedChanges &&
      !window.confirm(
        "You have unsaved changes. Are you sure you want to cancel?",
      )
    ) {
      return;
    }
    setIsEditing(false);
    setFormData(null);
    setSaveMessage(null);
    setHasUnsavedChanges(false);
  };

  // Update form field
  const handleFieldChange = <K extends keyof RequisitionFormData>(
    field: K,
    value: RequisitionFormData[K],
  ) => {
    if (!formData) return;
    setFormData({ ...formData, [field]: value });
    setHasUnsavedChanges(true);
  };

  // Handle item updates
  const handleItemUpdate = (
    index: number,
    field: keyof ItemFormData,
    value: string | number,
  ) => {
    if (!formData) return;

    const updatedItems = [...formData.items];
    const current = updatedItems[index];
    if (!current) return;
    updatedItems[index] = { ...current, [field]: value };

    setFormData({ ...formData, items: updatedItems });
    setHasUnsavedChanges(true);
  };

  const handleAddItem = () => {
    if (!formData) return;

    const newItem: ItemFormData = {
      id: "new",
      role_position: "",
      skill_level: "Mid",
      experience_years: 3,
      education_requirement: "",
      job_description: "",
      requirements: "",
    };

    setFormData({ ...formData, items: [...formData.items, newItem] });
    setHasUnsavedChanges(true);
  };

  const handleRemoveItem = (index: number) => {
    if (!formData || formData.items.length <= 1) return;

    const updatedItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: updatedItems });
    setHasUnsavedChanges(true);
  };

  // Validate form
  const validateForm = (): string[] => {
    const errors: string[] = [];

    if (!formData) return ["Form data not initialized"];

    if (!formData.project_name.trim()) {
      errors.push("Project name is required");
    }

    if (!formData.required_by_date) {
      errors.push("Required by date is required");
    }

    if (formData.items.length === 0) {
      errors.push("At least one position is required");
    }

    formData.items.forEach((item, index) => {
      if (!item.role_position.trim()) {
        errors.push(`Position ${index + 1}: Role/Position is required`);
      }
      if (!item.job_description.trim()) {
        errors.push(`Position ${index + 1}: Job description is required`);
      }
    });

    return errors;
  };

  // Save changes
  const handleSave = async () => {
    if (!formData || !requisition) return;

    // Validate
    const errors = validateForm();
    if (errors.length > 0) {
      setSaveMessage({
        type: "error",
        message: `Please fix the following errors:\n${errors.join("\n")}`,
      });
      return;
    }

    try {
      setIsSaving(true);
      setSaveMessage(null);

      const payload = {
        project_name: formData.project_name,
        client_name: formData.client_name || null,
        office_location: formData.office_location,
        work_mode: formData.work_mode,
        required_by_date: formData.required_by_date,
        priority: formData.priority,
        justification: formData.justification,
        budget_amount: formData.budget_amount
          ? parseFloat(formData.budget_amount)
          : null,
        duration: formData.duration || null,
        is_replacement: formData.is_replacement,
        manager_notes: formData.manager_notes,
        items: formData.items.map((item) => ({
          role_position: item.role_position,
          job_description: item.job_description,
          skill_level: item.skill_level,
          experience_years: item.experience_years,
          education_requirement: item.education_requirement || null,
          requirements: item.requirements || null,
        })),
      };

      await apiClient.put(`/requisitions/${requisition.req_id}`, payload);

      // Refresh data
      const [requisitionRes, historyRes] = await Promise.all([
        apiClient.get<Requisition>(`/requisitions/${id}`),
        apiClient.get<StatusHistoryEntry[]>(
          `/requisitions/${id}/status-history`,
        ),
      ]);

      setRequisition(requisitionRes.data);
      setStatusHistory(historyRes.data || []);

      setSaveMessage({
        type: "success",
        message: "Requisition updated successfully",
      });
      setIsEditing(false);
      setHasUnsavedChanges(false);

      // Clear success message after 5 seconds
      setTimeout(() => setSaveMessage(null), 5000);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      let errorMessage = "Failed to update requisition";

      if (Array.isArray(detail)) {
        errorMessage = detail
          .map((item) => item?.msg || JSON.stringify(item))
          .filter(Boolean)
          .join("\n");
      } else if (typeof detail === "string") {
        errorMessage = detail;
      } else if (err?.response?.data) {
        try {
          errorMessage = JSON.stringify(err.response.data);
        } catch {
          // keep default
        }
      }

      setSaveMessage({
        type: "error",
        message: errorMessage,
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Download JD
  const handleDownloadJD = async () => {
    if (!requisition?.jd_file_key) return;

    try {
      const response = await apiClient.get(
        `/requisitions/${requisition.req_id}/jd`,
        {
          responseType: "blob",
        },
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `JD_REQ-${requisition.req_id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setSaveMessage({
        type: "error",
        message: "Failed to download job description",
      });
    }
  };

  const handleJdFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) {
      setJdFile(null);
      setJdError(null);
      return;
    }

    if (file.type !== "application/pdf") {
      setJdFile(null);
      setJdError("Only PDF files are allowed.");
      e.target.value = "";
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setJdFile(null);
      setJdError("File exceeds 10MB.");
      e.target.value = "";
      return;
    }

    setJdFile(file);
    setJdError(null);
  };

  const handleUploadJD = async () => {
    if (!requisition || !jdFile) return;

    setIsUploadingJd(true);
    setJdError(null);

    try {
      const payload = new FormData();
      payload.append("jd_file", jdFile);

      const response = await apiClient.post(
        `/requisitions/${requisition.req_id}/jd`,
        payload,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );

      const jdKey = response.data?.jd_file_key ?? requisition.jd_file_key;
      setRequisition((prev) =>
        prev ? { ...prev, jd_file_key: jdKey || prev.jd_file_key } : prev,
      );
      setJdFile(null);
      setJdInputKey((prev) => prev + 1);
      setSaveMessage({
        type: "success",
        message: requisition.jd_file_key
          ? "Job description replaced"
          : "Job description uploaded",
      });
      setTimeout(() => setSaveMessage(null), 5000);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      let errorMessage = "Failed to upload job description";

      if (Array.isArray(detail)) {
        errorMessage = detail
          .map((item) => item?.msg || JSON.stringify(item))
          .filter(Boolean)
          .join("\n");
      } else if (typeof detail === "string") {
        errorMessage = detail;
      }

      setSaveMessage({
        type: "error",
        message: errorMessage,
      });
    } finally {
      setIsUploadingJd(false);
    }
  };

  const handleRemoveJD = async () => {
    if (!requisition?.jd_file_key) return;

    setIsRemovingJd(true);
    setJdError(null);

    try {
      await apiClient.delete(`/requisitions/${requisition.req_id}/jd`);
      setRequisition((prev) => (prev ? { ...prev, jd_file_key: null } : prev));
      setJdFile(null);
      setJdInputKey((prev) => prev + 1);
      setSaveMessage({
        type: "success",
        message: "Job description removed",
      });
      setTimeout(() => setSaveMessage(null), 5000);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      let errorMessage = "Failed to remove job description";

      if (Array.isArray(detail)) {
        errorMessage = detail
          .map((item) => item?.msg || JSON.stringify(item))
          .filter(Boolean)
          .join("\n");
      } else if (typeof detail === "string") {
        errorMessage = detail;
      }

      setSaveMessage({
        type: "error",
        message: errorMessage,
      });
    } finally {
      setIsRemovingJd(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="admin-content-area">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading requisition details...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !requisition) {
    return (
      <div className="admin-content-area">
        <div className="empty-state">
          <AlertCircle size={48} />
          <h3>Unable to Load Requisition</h3>
          <p>{error || "Requisition not found"}</p>
          <button
            className="action-button primary"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft size={16} />
            Back to List
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-content-area">
      {/* Sticky Header */}
      <div className="manager-header sticky-header">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              className="action-button"
              onClick={() => navigate(-1)}
              style={{ minWidth: "100px" }}
            >
              <ArrowLeft size={16} />
              Back
            </button>

            <div>
              <h1 style={{ fontSize: "24px", marginBottom: "4px" }}>
                REQ-{requisition.req_id}
              </h1>
              <div className="flex items-center gap-2">
                <span
                  className={getStatusBadgeClass(requisition.overall_status)}
                >
                  {getStatusIcon(requisition.overall_status)}
                  {requisition.overall_status}
                </span>
                <span className="text-xs text-slate-500">
                  Created: {formatDate(requisition.created_at)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isEditing ? (
              <button
                className={`action-button ${canEdit ? "primary" : ""}`}
                onClick={handleEditStart}
                disabled={!canEdit}
                title={
                  canEdit
                    ? "Edit requisition"
                    : "Editing is locked. HR has already acted on this requisition."
                }
              >
                {canEdit ? <Edit size={16} /> : <Lock size={16} />}
                {canEdit ? "Edit Requisition" : "Editing Locked"}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                {hasUnsavedChanges && (
                  <span className="text-xs text-warning flex items-center gap-1">
                    <AlertCircle size={12} />
                    Unsaved changes
                  </span>
                )}
                <button
                  className="action-button"
                  onClick={handleEditCancel}
                  disabled={isSaving}
                >
                  <X size={16} />
                  Cancel
                </button>
                <button
                  className="action-button primary"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <>
                      <div className="spinner-small" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Save message */}
        {saveMessage && (
          <div
            className={`mt-3 p-3 rounded-lg ${saveMessage.type === "success" ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-800"}`}
          >
            <div className="flex items-center gap-2">
              {saveMessage.type === "success" ? (
                <CheckCircle size={16} />
              ) : (
                <AlertCircle size={16} />
              )}
              <span>{saveMessage.message}</span>
            </div>
          </div>
        )}

        {/* Permission warning */}
        {!canEdit && !isEditing && (
          <div className="mt-3 p-3 rounded-lg bg-orange-50 border border-orange-200 text-orange-800">
            <div className="flex items-center gap-2">
              <Lock size={16} />
              <span>
                <strong>Editing is locked.</strong> This requisition has
                progressed beyond the point where manager edits are allowed.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Quick Stats */}
      <div className="admin-metrics">
        <div className="stat-card">
          <div className="stat-icon-wrapper users">
            <Calendar size={20} />
          </div>
          <span className="stat-number">
            {formatDate(requisition.required_by_date)}
          </span>
          <span className="stat-label">Required By</span>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper total-employees">
            <DollarSign size={20} />
          </div>
          <span className="stat-number">
            {formatCurrency(requisition.budget_amount)}
          </span>
          <span className="stat-label">Budget</span>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper total-departments">
            <Briefcase size={20} />
          </div>
          <span className="stat-number">{requisition.items.length}</span>
          <span className="stat-label">Positions</span>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper uptime">
            <Clock size={20} />
          </div>
          <span className="stat-number">{requisition.duration || "—"}</span>
          <span className="stat-label">Duration</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        {/* Left Column - Main Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Information */}
          <div className="master-data-manager">
            <div className="data-manager-header">
              <h3>Basic Information</h3>
              <p className="subtitle">Core requisition details</p>
            </div>

            {!isEditing ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-slate-500">Project Name</div>
                  <div className="font-medium">
                    {requisition.project_name || "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Client Name</div>
                  <div>{requisition.client_name || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Required By Date</div>
                  <div>{formatDate(requisition.required_by_date)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Priority</div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`priority-indicator priority-${requisition.priority?.toLowerCase()}`}
                    >
                      {requisition.priority || "Medium"}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              formData && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="form-field">
                    <label>Project Name *</label>
                    <input
                      value={formData.project_name}
                      onChange={(e) =>
                        handleFieldChange("project_name", e.target.value)
                      }
                      placeholder="Enter project name"
                    />
                  </div>
                  <div className="form-field">
                    <label>Client Name</label>
                    <input
                      value={formData.client_name}
                      onChange={(e) =>
                        handleFieldChange("client_name", e.target.value)
                      }
                      placeholder="Enter client name"
                    />
                  </div>
                  <div className="form-field">
                    <label>Required By Date *</label>
                    <input
                      type="date"
                      value={formData.required_by_date}
                      onChange={(e) =>
                        handleFieldChange("required_by_date", e.target.value)
                      }
                      min={new Date().toISOString().split("T")[0]}
                    />
                  </div>
                  <div className="form-field">
                    <label>Priority</label>
                    <select
                      value={formData.priority}
                      onChange={(e) =>
                        handleFieldChange("priority", e.target.value)
                      }
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Critical">Critical</option>
                    </select>
                  </div>
                </div>
              )
            )}
          </div>

          {/* Project Details */}
          <div className="master-data-manager">
            <div className="data-manager-header">
              <h3>Project Details</h3>
              <p className="subtitle">Work arrangement and location</p>
            </div>

            {!isEditing ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-slate-500">Work Mode</div>
                  <div>{requisition.work_mode || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Office Location</div>
                  <div>{requisition.office_location || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Duration</div>
                  <div>{requisition.duration || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">
                    Replacement Position
                  </div>
                  <div>{requisition.is_replacement ? "Yes" : "No"}</div>
                </div>
              </div>
            ) : (
              formData && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="form-field">
                    <label>Work Mode</label>
                    <select
                      value={formData.work_mode}
                      onChange={(e) =>
                        handleFieldChange("work_mode", e.target.value)
                      }
                    >
                      <option value="Remote">Remote</option>
                      <option value="Hybrid">Hybrid</option>
                      <option value="On-site">On-site</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Office Location</label>
                    <input
                      value={formData.office_location}
                      onChange={(e) =>
                        handleFieldChange("office_location", e.target.value)
                      }
                      placeholder="Enter office location"
                    />
                  </div>
                  <div className="form-field">
                    <label>Duration</label>
                    <input
                      value={formData.duration}
                      onChange={(e) =>
                        handleFieldChange("duration", e.target.value)
                      }
                      placeholder="e.g., 6 months, 1 year"
                    />
                  </div>
                  <div className="form-field">
                    <label>Replacement Position</label>
                    <select
                      value={formData.is_replacement ? "yes" : "no"}
                      onChange={(e) =>
                        handleFieldChange(
                          "is_replacement",
                          e.target.value === "yes",
                        )
                      }
                    >
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </div>
                </div>
              )
            )}
          </div>

          {/* Skills Required */}
          <div className="master-data-manager">
            <div className="data-manager-header">
              <h3>Skills Required</h3>
              <p className="subtitle">Position requirements and descriptions</p>
            </div>

            {!isEditing ? (
              requisition.items.length === 0 ? (
                <div className="empty-state">
                  <AlertCircle size={32} />
                  <p>No positions added</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {requisition.items.map((item, index) => (
                    <div
                      key={item.item_id}
                      className="p-4 border border-slate-200 rounded-lg hover:border-slate-300 transition-colors"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h4 className="font-semibold text-slate-800">
                            {item.role_position}
                          </h4>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">
                              {item.skill_level || "Not specified"}
                            </span>
                            <span className="text-xs text-slate-500">
                              {item.experience_years || "—"} years experience
                            </span>
                            <span className="text-xs text-slate-500">
                              {item.education_requirement || "—"}
                            </span>
                          </div>
                        </div>
                        <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded">
                          Position {index + 1}
                        </span>
                      </div>

                      <div className="mt-3">
                        <div className="text-xs text-slate-500 mb-1">
                          Job Description
                        </div>
                        <p className="text-sm text-slate-700">
                          {item.job_description}
                        </p>
                      </div>

                      {item.requirements && (
                        <div className="mt-3">
                          <div className="text-xs text-slate-500 mb-1">
                            Additional Requirements
                          </div>
                          <p className="text-sm text-slate-700">
                            {item.requirements}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            ) : (
              formData && (
                <div className="space-y-6">
                  {formData.items.map((item, index) => (
                    <div
                      key={index}
                      className="p-4 border border-slate-200 rounded-lg bg-slate-50"
                    >
                      <div className="flex justify-between items-center mb-4">
                        <h4 className="font-semibold text-slate-800">
                          Position {index + 1}
                        </h4>
                        {formData.items.length > 1 && (
                          <button
                            type="button"
                            className="text-xs text-red-600 hover:text-red-800"
                            onClick={() => handleRemoveItem(index)}
                          >
                            Remove
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="form-field">
                          <label>Role / Position *</label>
                          <input
                            value={item.role_position}
                            onChange={(e) =>
                              handleItemUpdate(
                                index,
                                "role_position",
                                e.target.value,
                              )
                            }
                            placeholder="e.g., Senior Frontend Developer"
                          />
                        </div>
                        <div className="form-field">
                          <label>Skill Level</label>
                          <select
                            value={item.skill_level}
                            onChange={(e) =>
                              handleItemUpdate(
                                index,
                                "skill_level",
                                e.target.value,
                              )
                            }
                          >
                            <option value="Junior">Junior</option>
                            <option value="Mid">Mid</option>
                            <option value="Senior">Senior</option>
                            <option value="Lead">Lead</option>
                            <option value="Architect">Architect</option>
                          </select>
                        </div>
                        <div className="form-field">
                          <label>Experience (years)</label>
                          <input
                            type="number"
                            min="0"
                            max="50"
                            value={item.experience_years}
                            onChange={(e) =>
                              handleItemUpdate(
                                index,
                                "experience_years",
                                parseInt(e.target.value) || 0,
                              )
                            }
                          />
                        </div>
                        <div className="form-field">
                          <label>Education Requirement</label>
                          <input
                            value={item.education_requirement}
                            onChange={(e) =>
                              handleItemUpdate(
                                index,
                                "education_requirement",
                                e.target.value,
                              )
                            }
                            placeholder="e.g., B.Tech, MBA"
                          />
                        </div>
                      </div>

                      <div className="form-field mt-4">
                        <label>Job Description *</label>
                        <textarea
                          rows={3}
                          value={item.job_description}
                          onChange={(e) =>
                            handleItemUpdate(
                              index,
                              "job_description",
                              e.target.value,
                            )
                          }
                          placeholder="Describe the role responsibilities..."
                        />
                      </div>

                      <div className="form-field mt-4">
                        <label>Additional Requirements</label>
                        <textarea
                          rows={2}
                          value={item.requirements}
                          onChange={(e) =>
                            handleItemUpdate(
                              index,
                              "requirements",
                              e.target.value,
                            )
                          }
                          placeholder="Any specific certifications, skills, or requirements..."
                        />
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    className="action-button"
                    onClick={handleAddItem}
                  >
                    <Briefcase size={16} />
                    Add Another Position
                  </button>
                </div>
              )
            )}
          </div>

          {/* Budget & Justification */}
          <div className="master-data-manager">
            <div className="data-manager-header">
              <h3>Budget & Justification</h3>
              <p className="subtitle">Financial details and business case</p>
            </div>

            {!isEditing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-slate-500">Budget Amount</div>
                    <div className="font-medium">
                      {formatCurrency(requisition.budget_amount)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Replacement</div>
                    <div>{requisition.is_replacement ? "Yes" : "No"}</div>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-500 mb-2">
                    Justification
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg">
                    {requisition.justification || "No justification provided"}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-500 mb-2">
                    Manager Notes
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg">
                    {requisition.manager_notes || "No additional notes"}
                  </div>
                </div>
              </div>
            ) : (
              formData && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="form-field">
                      <label>Budget Amount</label>
                      <div className="flex items-center">
                        <span className="mr-2 text-slate-500">₹</span>
                        <input
                          type="number"
                          min="0"
                          value={formData.budget_amount}
                          onChange={(e) =>
                            handleFieldChange("budget_amount", e.target.value)
                          }
                          placeholder="Enter amount"
                        />
                      </div>
                    </div>
                    <div className="form-field">
                      <label>Replacement Position</label>
                      <select
                        value={formData.is_replacement ? "yes" : "no"}
                        onChange={(e) =>
                          handleFieldChange(
                            "is_replacement",
                            e.target.value === "yes",
                          )
                        }
                      >
                        <option value="no">No - New Position</option>
                        <option value="yes">Yes - Backfill</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-field">
                    <label>Justification *</label>
                    <textarea
                      rows={4}
                      value={formData.justification}
                      onChange={(e) =>
                        handleFieldChange("justification", e.target.value)
                      }
                      placeholder="Explain why this position is needed, business impact, etc."
                    />
                  </div>

                  <div className="form-field">
                    <label>Manager Notes</label>
                    <textarea
                      rows={3}
                      value={formData.manager_notes}
                      onChange={(e) =>
                        handleFieldChange("manager_notes", e.target.value)
                      }
                      placeholder="Any additional notes or context..."
                    />
                  </div>
                </div>
              )
            )}
          </div>
        </div>

        {/* Right Column - Timeline & Attachments */}
        <div className="space-y-6">
          {/* Job Description PDF */}
          <div className="master-data-manager">
            <div className="data-manager-header">
              <h3>Job Description</h3>
              <p className="subtitle">Attached documents</p>
            </div>

            {requisition.jd_file_key ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <FileText size={20} className="text-slate-400" />
                    <div>
                      <div className="font-medium">Job Description.pdf</div>
                      <div className="text-xs text-slate-500">
                        Uploaded with requisition
                      </div>
                    </div>
                  </div>
                  <button
                    className="action-button primary"
                    onClick={handleDownloadJD}
                  >
                    <Download size={16} />
                    Download
                  </button>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <FileText size={32} />
                <p>No job description uploaded</p>
              </div>
            )}

            {canEdit && (
              <div className="mt-3 space-y-2">
                <input
                  key={jdInputKey}
                  type="file"
                  accept="application/pdf"
                  onChange={handleJdFileChange}
                  disabled={isUploadingJd || isRemovingJd}
                />
                {jdError && (
                  <div className="text-xs text-red-600">{jdError}</div>
                )}
                <div className="flex gap-2 flex-wrap">
                  <button
                    className="action-button primary"
                    onClick={handleUploadJD}
                    disabled={!jdFile || isUploadingJd || isRemovingJd}
                  >
                    {isUploadingJd
                      ? "Uploading..."
                      : requisition.jd_file_key
                        ? "Replace JD"
                        : "Upload JD"}
                  </button>
                  {requisition.jd_file_key && (
                    <button
                      className="action-button"
                      onClick={handleRemoveJD}
                      disabled={isRemovingJd || isUploadingJd}
                    >
                      {isRemovingJd ? "Removing..." : "Remove"}
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-500">PDF only. Max 10MB.</p>
              </div>
            )}
          </div>

          {/* Status Timeline */}
          <div className="master-data-manager">
            <div className="data-manager-header">
              <h3>Status Timeline</h3>
              <p className="subtitle">History of status transitions</p>
            </div>

            {statusHistory.length === 0 ? (
              <div className="empty-state">
                <History size={32} />
                <p>No status history available</p>
              </div>
            ) : (
              <Timeline history={statusHistory} />
            )}
          </div>

          {/* Approval Information */}
          {(requisition.budget_approved_at || requisition.hr_approved_at) && (
            <div className="master-data-manager">
              <div className="data-manager-header">
                <h3>Approval Details</h3>
                <p className="subtitle">Review and approval information</p>
              </div>

              <div className="space-y-4">
                {requisition.budget_approved_at && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle size={16} className="text-green-600" />
                      <span className="font-medium text-green-800">
                        Budget Approved
                      </span>
                    </div>
                    <div className="text-xs text-green-700">
                      Approved on:{" "}
                      {formatDateTime(requisition.budget_approved_at)}
                    </div>
                  </div>
                )}

                {requisition.hr_approved_at && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle size={16} className="text-green-600" />
                      <span className="font-medium text-green-800">
                        HR Approved
                      </span>
                    </div>
                    <div className="text-xs text-green-700">
                      Approved on: {formatDateTime(requisition.hr_approved_at)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          {/* <div className="data-manager-header">
              <h3>Actions</h3>
              <p className="subtitle">Quick actions for this requisition</p>
            </div> */}

          {/* <div className="space-y-2">
              <button
                className="action-button"
                onClick={() => navigate(`/manager/requisitions/${id}/print`)}
                style={{ width: "100%", justifyContent: "center" }}
              >
                <FileText size={16} />
                Print Summary
              </button>

              <button
                className="action-button"
                onClick={() => window.print()}
                style={{ width: "100%", justifyContent: "center" }}
              >
                <Download size={16} />
                Export as PDF
              </button>

              <button
                className="action-button"
                onClick={() =>
                  navigator.clipboard.writeText(window.location.href)
                }
                style={{ width: "100%", justifyContent: "center" }}
              >
                <LinkIcon size={16} />
                Copy Link
              </button>
            </div> */}
        </div>
      </div>
    </div>
  );
};

// Add this icon component
const LinkIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

export default ManagerRequisitionDetails;
