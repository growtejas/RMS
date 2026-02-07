import React, { useEffect, useState, useCallback } from "react";
import {
  Plus,
  Trash2,
  Calendar,
  Building,
  MapPin,
  Users,
  Target,
  DollarSign,
  Briefcase,
  CheckCircle,
  AlertCircle,
  Save,
  Send,
  Loader2,
} from "lucide-react";
import { apiClient } from "../../api/client";
import {
  submitRequisition,
  getWorkflowErrorMessage,
  WorkflowTransitionResponse,
} from "../../api/workflowApi";
import {
  RequisitionWizard,
  WizardStep,
  WizardNavigation,
} from "./RequisitionWizard";

interface RequisitionItem {
  id: number;
  role: string;
  primarySkillId: number | "";
  secondarySkillIds: number[];
  level: "Lead" | "Senior" | "Mid" | "Junior";
  experience: number;
  education: string;
  quantity: number;
  description: string;
}

interface RequisitionItemPayload {
  role_position: string;
  job_description: string;
  skill_level: "Lead" | "Senior" | "Mid" | "Junior";
  experience_years: number;
  education_requirement?: string;
  requirements?: string;
}

interface RequisitionManagerUpdatePayload {
  project_name?: string;
  client_name?: string;
  office_location?: string;
  work_mode?: string;
  required_by_date?: string;
  priority?: string;
  justification?: string;
  budget_amount?: number;
  duration?: string;
  is_replacement?: boolean;
  manager_notes?: string;
  items?: RequisitionItemPayload[];
}

interface RequisitionFormData {
  // Step 1
  projectName: string;
  clientName: string;
  officeLocation: string;
  workMode: "Remote" | "Hybrid" | "WFO";
  requiredBy: string;
  justification: string;
  priority: "Low" | "Medium" | "High";

  // Step 2 (items)
  items: RequisitionItem[];

  // Step 3
  budget: string;
  projectDuration: string;
  isReplacement: boolean;
  additionalNotes: string;
}

type SkillOption = {
  id: number;
  name: string;
};

type SkillResponse = {
  skill_id: number;
  skill_name: string;
};

type LocationResponse = {
  location_id: number;
  city?: string | null;
  country?: string | null;
};

const RaiseRequisition: React.FC = () => {
  const [activeStep, setActiveStep] = useState(0);
  const [formData, setFormData] = useState<RequisitionFormData>({
    projectName: "",
    clientName: "",
    officeLocation: "",
    workMode: "Hybrid",
    requiredBy: "",
    justification: "",
    priority: "Medium",
    items: [],
    budget: "",
    projectDuration: "",
    isReplacement: false,
    additionalNotes: "",
  });
  const [skills, setSkills] = useState<SkillOption[]>([]);
  const [skillLoadError, setSkillLoadError] = useState<string | null>(null);
  const [locations, setLocations] = useState<LocationResponse[]>([]);
  const [locationLoadError, setLocationLoadError] = useState<string | null>(
    null,
  );
  const [skillSearch, setSkillSearch] = useState<Record<number, string>>({});
  const [secondarySkillPick, setSecondarySkillPick] = useState<
    Record<number, number | "">
  >({});
  const [activeSkillField, setActiveSkillField] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [jdError, setJdError] = useState<string | null>(null);

  // Draft requisition tracking
  const [draftRequisitionId, setDraftRequisitionId] = useState<number | null>(
    null,
  );
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);

  const MAX_JD_SIZE = 10 * 1024 * 1024;

  useEffect(() => {
    const fetchSkills = async () => {
      try {
        const response = await apiClient.get<SkillResponse[]>("/skills/");
        const mapped = response.data.map((skill) => ({
          id: skill.skill_id,
          name: skill.skill_name,
        }));
        setSkills(mapped);
        setSkillLoadError(null);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to load skills";
        setSkillLoadError(message);
      }
    };

    const fetchLocations = async () => {
      try {
        const response = await apiClient.get<LocationResponse[]>("/locations/");
        setLocations(response.data);
        setLocationLoadError(null);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to load locations";
        setLocationLoadError(message);
      }
    };

    fetchSkills();
    fetchLocations();
  }, []);

  const getSkillName = (skillId: number | "") => {
    if (skillId === "") {
      return "";
    }
    return skills.find((skill) => skill.id === skillId)?.name ?? "";
  };

  // ================= STEP HANDLERS =================
  const handleJdChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setJdFile(null);
      setJdError(null);
      return;
    }

    if (file.type !== "application/pdf") {
      setJdError("Only PDF files are allowed.");
      setJdFile(null);
      return;
    }

    if (file.size > MAX_JD_SIZE) {
      setJdError("PDF must be 10MB or smaller.");
      setJdFile(null);
      return;
    }

    setJdFile(file);
    setJdError(null);
  };

  const handleJdRemove = () => {
    setJdFile(null);
    setJdError(null);
  };

  const handleNext = () => {
    if (activeStep < 2) setActiveStep(activeStep + 1);
  };

  const handleBack = () => {
    if (activeStep > 0) setActiveStep(activeStep - 1);
  };

  const getApiErrorMessage = (error: unknown): string => {
    const axiosError = error as {
      response?: { data?: { detail?: string; message?: string } };
      message?: string;
    };

    return (
      axiosError.response?.data?.detail ||
      axiosError.response?.data?.message ||
      axiosError.message ||
      "Request failed"
    );
  };

  const uploadJdFile = async (reqId: number, file: File) => {
    const fd = new FormData();
    fd.append("jd_file", file);
    await apiClient.post(`/requisitions/${reqId}/jd`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  };

  const buildItemsPayload = (): RequisitionItemPayload[] | null => {
    const invalidItem = formData.items.find((item) => {
      const roleText = item.role.trim();
      const descriptionText = item.description.trim();
      return (
        roleText.length < 2 ||
        descriptionText.length < 5 ||
        item.primarySkillId === ""
      );
    });

    if (invalidItem) {
      setSubmitError(
        "Each role needs a title (min 2 chars), primary skill, and description (min 5 chars).",
      );
      return null;
    }

    return formData.items.flatMap((item) => {
      const roleText = item.role.trim();
      const descriptionText = item.description.trim();
      const primarySkill = getSkillName(item.primarySkillId);
      const secondarySkills = item.secondarySkillIds
        .map((skillId) => getSkillName(skillId))
        .filter(Boolean);
      const requirementParts = [
        primarySkill ? `Primary Skill: ${primarySkill}` : "",
        secondarySkills.length
          ? `Secondary Skills: ${secondarySkills.join(", ")}`
          : "",
      ].filter(Boolean);

      const requirementsText = requirementParts.join(" | ") || undefined;

      const payloadItem: RequisitionItemPayload = {
        role_position: roleText,
        job_description: descriptionText,
        skill_level: item.level,
        experience_years: item.experience,
        education_requirement: item.education.trim() || undefined,
        requirements: requirementsText,
      };

      const quantity = Math.max(item.quantity || 1, 1);
      return Array.from({ length: quantity }, () => payloadItem);
    });
  };

  /**
   * Build the FormData payload for creating/updating a requisition.
   */
  const buildPayload = (): FormData | null => {
    const itemsPayload = buildItemsPayload();
    if (!itemsPayload) return null;

    const trimmedBudget = formData.budget.replace(/,/g, "").trim();
    const budgetValue = trimmedBudget ? Number(trimmedBudget) : undefined;

    if (
      trimmedBudget &&
      (budgetValue === undefined || !Number.isFinite(budgetValue))
    ) {
      setSubmitError("Budget must be a valid number.");
      return null;
    }

    const workModePayload =
      formData.workMode === "Remote" ? "WFH" : formData.workMode;
    const clientNamePayload = formData.clientName.trim();
    const durationPayload = formData.projectDuration.trim();

    const payload = new FormData();
    payload.append("project_name", formData.projectName || "");
    payload.append("client_name", clientNamePayload || "");
    payload.append("office_location", formData.officeLocation || "");
    payload.append("work_mode", workModePayload || "");
    payload.append("required_by_date", formData.requiredBy || "");
    payload.append("priority", formData.priority || "");
    payload.append("justification", formData.justification || "");
    payload.append("duration", durationPayload || "");
    payload.append("is_replacement", String(formData.isReplacement));
    payload.append("manager_notes", formData.additionalNotes || "");
    payload.append("items_json", JSON.stringify(itemsPayload));

    if (budgetValue !== undefined) {
      payload.append("budget_amount", String(budgetValue));
    }

    if (jdFile) {
      payload.append("jd_file", jdFile);
    }

    return payload;
  };

  /**
   * Build JSON payload for updating a draft requisition (PUT /requisitions/{id}).
   * This endpoint expects a JSON body, not multipart/form-data.
   */
  const buildUpdatePayload = (): RequisitionManagerUpdatePayload | null => {
    const itemsPayload = buildItemsPayload();
    if (!itemsPayload) return null;

    const trimmedBudget = formData.budget.replace(/,/g, "").trim();
    const budgetValue = trimmedBudget ? Number(trimmedBudget) : undefined;

    if (
      trimmedBudget &&
      (budgetValue === undefined || !Number.isFinite(budgetValue))
    ) {
      setSubmitError("Budget must be a valid number.");
      return null;
    }

    const workModePayload =
      formData.workMode === "Remote" ? "WFH" : formData.workMode;

    return {
      project_name: formData.projectName || undefined,
      client_name: formData.clientName.trim() || undefined,
      office_location: formData.officeLocation || undefined,
      work_mode: workModePayload || undefined,
      required_by_date: formData.requiredBy || undefined,
      priority: formData.priority || undefined,
      justification: formData.justification || undefined,
      budget_amount: budgetValue,
      duration: formData.projectDuration.trim() || undefined,
      is_replacement: formData.isReplacement,
      manager_notes: formData.additionalNotes || undefined,
      items: itemsPayload,
    };
  };

  /**
   * Save as Draft - creates the requisition in DRAFT status without submitting to workflow
   *
   * WORKFLOW ENGINE V2 COMPLIANCE:
   * - POST /api/requisitions creates requisition in DRAFT status ONLY
   * - Status remains DRAFT until workflow/submit is called
   * - No client-side status mutations
   */
  const handleSaveDraft = async () => {
    if (!validateStep(0)) {
      setSubmitError("Please complete required fields in Project Scope.");
      return;
    }

    if (jdError) {
      setSubmitError(jdError);
      return;
    }

    // If we have items, validate them
    if (formData.items.length > 0) {
      const payload = buildPayload();
      if (!payload) return;
    }

    setIsSavingDraft(true);
    setSubmitError(null);

    try {
      const payload = buildPayload();
      if (!payload && formData.items.length > 0) return;

      // Build minimal payload if no items yet
      const finalPayload =
        payload ||
        (() => {
          const fd = new FormData();
          fd.append("project_name", formData.projectName || "");
          fd.append("client_name", formData.clientName.trim() || "");
          fd.append("office_location", formData.officeLocation || "");
          fd.append(
            "work_mode",
            formData.workMode === "Remote" ? "WFH" : formData.workMode || "",
          );
          fd.append("required_by_date", formData.requiredBy || "");
          fd.append("priority", formData.priority || "");
          fd.append("justification", formData.justification || "");
          fd.append("duration", formData.projectDuration.trim() || "");
          fd.append("is_replacement", String(formData.isReplacement));
          fd.append("manager_notes", formData.additionalNotes || "");
          fd.append("items_json", "[]");
          return fd;
        })();

      if (draftRequisitionId) {
        // Update existing draft (JSON payload required)
        const updatePayload = buildUpdatePayload();
        if (!updatePayload) return;
        await apiClient.put(
          `/requisitions/${draftRequisitionId}`,
          updatePayload,
        );

        if (jdFile) {
          await uploadJdFile(draftRequisitionId, jdFile);
        }
      } else {
        // Create new draft (backend sets status to DRAFT)
        const response = await apiClient.post<{ req_id: number }>(
          "/requisitions/",
          finalPayload,
          {
            headers: { "Content-Type": "multipart/form-data" },
          },
        );
        setDraftRequisitionId(response.data.req_id);

        if (jdFile) {
          await uploadJdFile(response.data.req_id, jdFile);
        }
      }

      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 3000);
    } catch (error) {
      const errorMessage = getApiErrorMessage(error);
      setSubmitError(errorMessage);
    } finally {
      setIsSavingDraft(false);
    }
  };

  /**
   * Submit Requisition - saves draft if needed, then calls workflow/submit
   *
   * WORKFLOW ENGINE V2 COMPLIANCE:
   * 1. POST /api/requisitions creates requisition in DRAFT status
   * 2. POST /api/requisitions/{id}/workflow/submit transitions to Pending_Budget
   * 3. No client-side status mutations - backend is source of truth
   */
  const handleSubmit = async () => {
    if (!validateStep(2)) {
      setSubmitError("Please complete all required fields.");
      return;
    }

    if (jdError) {
      setSubmitError(jdError);
      return;
    }

    const payload = buildPayload();
    if (!payload) return;

    setIsSubmitting(true);
    setSubmitError(null);

    let reqId = draftRequisitionId;
    let draftCreated = false;

    try {
      // Step 1: Create or update the draft requisition (remains in DRAFT)
      if (reqId) {
        const updatePayload = buildUpdatePayload();
        if (!updatePayload) return;
        await apiClient.put(`/requisitions/${reqId}`, updatePayload);

        if (jdFile) {
          await uploadJdFile(reqId, jdFile);
        }
      } else {
        const response = await apiClient.post<{ req_id: number }>(
          "/requisitions/",
          payload,
          {
            headers: { "Content-Type": "multipart/form-data" },
          },
        );
        reqId = response.data.req_id;
        setDraftRequisitionId(reqId);
        draftCreated = true;

        if (jdFile) {
          await uploadJdFile(reqId, jdFile);
        }
      }

      // Step 2: Submit via WORKFLOW endpoint (DRAFT → Pending_Budget)
      // This is the ONLY way to transition status per Workflow Engine V2
      const transitionResult: WorkflowTransitionResponse =
        await submitRequisition(reqId);

      // Verify transition succeeded (backend confirmation)
      if (
        transitionResult.success &&
        transitionResult.new_status === "Pending_Budget"
      ) {
        alert(
          `Requisition #${reqId} submitted successfully!\n\nStatus: ${transitionResult.new_status}\nIt is now pending budget approval.`,
        );

        // Reset form only after confirmed workflow transition
        resetForm();
      } else {
        // Unexpected response - should not happen if API contract is correct
        throw new Error(
          `Unexpected workflow response: ${JSON.stringify(transitionResult)}`,
        );
      }
    } catch (error) {
      // Use workflow error utility for consistent error messaging
      const errorMessage = getWorkflowErrorMessage(error);

      // If draft was just created but workflow failed, inform user
      if (draftCreated && reqId) {
        setSubmitError(
          `Draft #${reqId} was saved, but workflow submission failed: ${errorMessage}\n\nYou can try submitting again.`,
        );
      } else {
        setSubmitError(errorMessage);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Reset form to initial state after successful submission
   */
  const resetForm = useCallback(() => {
    setFormData({
      projectName: "",
      clientName: "",
      officeLocation: "",
      workMode: "Hybrid",
      requiredBy: "",
      justification: "",
      priority: "Medium",
      items: [],
      budget: "",
      projectDuration: "",
      isReplacement: false,
      additionalNotes: "",
    });
    setSkillSearch({});
    setSecondarySkillPick({});
    setActiveStep(0);
    setJdFile(null);
    setJdError(null);
    setDraftRequisitionId(null);
    setDraftSaved(false);
  }, []);

  // ================= ITEM HANDLERS =================
  const addItem = () => {
    const newItem: RequisitionItem = {
      id: Date.now(),
      role: "",
      primarySkillId: "",
      secondarySkillIds: [],
      level: "Mid",
      experience: 3,
      education: "",
      quantity: 1,
      description: "",
    };
    setFormData({ ...formData, items: [...formData.items, newItem] });
  };

  const updateItem = (id: number, field: keyof RequisitionItem, value: any) => {
    setFormData({
      ...formData,
      items: formData.items.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    });
  };

  const removeItem = (id: number) => {
    setFormData({
      ...formData,
      items: formData.items.filter((item) => item.id !== id),
    });
  };

  // ================= VALIDATION =================
  const validateStep = (step: number): boolean => {
    switch (step) {
      case 0:
        return !!(
          formData.projectName &&
          formData.requiredBy &&
          formData.justification
        );
      case 1:
        return (
          formData.items.length > 0 &&
          formData.items.every(
            (item) =>
              item.role &&
              item.primarySkillId !== "" &&
              item.level &&
              item.experience > 0,
          )
        );
      case 2:
        return true;
      default:
        return false;
    }
  };

  const canProceed = validateStep(activeStep);
  const canSubmit = canProceed && !isSubmitting && !jdError;

  // Wizard step definitions
  const wizardSteps: WizardStep[] = [
    { id: "scope", label: "Project Scope", description: "Define requirements" },
    {
      id: "resources",
      label: "Resource Details",
      description: "Add positions",
    },
    {
      id: "finalize",
      label: "Budget & Finalize",
      description: "Review & submit",
    },
  ];

  // Track completed steps for navigation
  const completedSteps = new Set<number>();
  if (validateStep(0)) completedSteps.add(0);
  if (validateStep(1)) completedSteps.add(1);
  if (validateStep(2)) completedSteps.add(2);

  // ================= STEP 1: PROJECT SCOPE =================
  const renderStep1 = () => (
    <div className="master-data-manager">
      <div className="data-manager-header">
        <h3>Project Scope & Details</h3>
        <p className="subtitle">
          Define the overall project requirements and context
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
        <div className="form-field">
          <label>Project Name *</label>
          <div className="search-box" style={{ padding: "0" }}>
            <input
              value={formData.projectName}
              onChange={(e) =>
                setFormData({ ...formData, projectName: e.target.value })
              }
              placeholder="e.g., Client Modernization Phase 2"
            />
          </div>
        </div>

        <div className="form-field">
          <label>Client Name</label>
          <div className="search-box" style={{ padding: "0" }}>
            <input
              value={formData.clientName}
              onChange={(e) =>
                setFormData({ ...formData, clientName: e.target.value })
              }
              placeholder="Enter client or organization name"
            />
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "24px",
          marginBottom: "24px",
        }}
      >
        <div className="form-field">
          <label>
            <MapPin size={14} style={{ marginRight: "8px" }} />
            Office Location
          </label>
          <select
            value={formData.officeLocation}
            onChange={(e) =>
              setFormData({ ...formData, officeLocation: e.target.value })
            }
            style={{ width: "100%", padding: "12px 16px" }}
          >
            <option value="">Select location</option>
            {locations.map((location) => {
              const label = [location.city, location.country]
                .filter(Boolean)
                .join(", ");
              return (
                <option key={location.location_id} value={label}>
                  {label || `Location ${location.location_id}`}
                </option>
              );
            })}
          </select>
          {locationLoadError && (
            <div
              style={{
                marginTop: "6px",
                fontSize: "12px",
                color: "var(--error)",
              }}
            >
              {locationLoadError}
            </div>
          )}
        </div>

        <div className="form-field">
          <label>
            <Building size={14} style={{ marginRight: "8px" }} />
            Work Mode
          </label>
          <div style={{ display: "flex", gap: "8px" }}>
            {["Remote", "Hybrid", "WFO"].map((mode) => (
              <button
                key={mode}
                type="button"
                className="filter-chip"
                style={{
                  flex: 1,
                  background:
                    formData.workMode === mode
                      ? "var(--primary-accent)"
                      : "var(--bg-tertiary)",
                  color:
                    formData.workMode === mode
                      ? "white"
                      : "var(--text-secondary)",
                  borderColor:
                    formData.workMode === mode
                      ? "var(--primary-accent)"
                      : "var(--border-subtle)",
                  padding: "10px 16px",
                }}
                onClick={() =>
                  setFormData({ ...formData, workMode: mode as any })
                }
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "24px",
          marginBottom: "24px",
        }}
      >
        <div className="form-field">
          <label>
            <Calendar size={14} style={{ marginRight: "8px" }} />
            Required By Date *
          </label>
          <input
            type="date"
            value={formData.requiredBy}
            onChange={(e) =>
              setFormData({ ...formData, requiredBy: e.target.value })
            }
            style={{ width: "100%" }}
            min={new Date().toISOString().split("T")[0]}
          />
        </div>

        <div className="form-field">
          <label>
            <Target size={14} style={{ marginRight: "8px" }} />
            Priority *
          </label>
          <div style={{ display: "flex", gap: "8px" }}>
            {[
              {
                value: "Low",
                color: "var(--primary-accent)",
                bg: "rgba(59, 130, 246, 0.1)",
              },
              {
                value: "Medium",
                color: "var(--warning)",
                bg: "rgba(245, 158, 11, 0.1)",
              },
              {
                value: "High",
                color: "var(--error)",
                bg: "rgba(239, 68, 68, 0.1)",
              },
            ].map(({ value, color, bg }) => (
              <button
                key={value}
                type="button"
                className="priority-indicator"
                style={{
                  flex: 1,
                  background:
                    formData.priority === value ? bg : "var(--bg-tertiary)",
                  color:
                    formData.priority === value
                      ? color
                      : "var(--text-secondary)",
                  borderColor:
                    formData.priority === value
                      ? color
                      : "var(--border-subtle)",
                  padding: "10px 16px",
                  justifyContent: "center",
                }}
                onClick={() =>
                  setFormData({ ...formData, priority: value as any })
                }
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="form-field">
        <label>Business Justification *</label>
        <textarea
          rows={4}
          value={formData.justification}
          onChange={(e) =>
            setFormData({ ...formData, justification: e.target.value })
          }
          placeholder="Explain the business need, project goals, and expected outcomes..."
          style={{ width: "100%", resize: "vertical" }}
        />
      </div>
    </div>
  );

  // ================= STEP 2: RESOURCE DETAILS =================
  const renderStep2 = () => (
    <div className="master-data-manager">
      <div className="data-manager-header">
        <h3>Resource Requirements</h3>
        <p className="subtitle">
          Define each position required - each becomes a requisition item
        </p>
      </div>

      {formData.items.length === 0 ? (
        <div
          className="empty-state"
          style={{ padding: "40px 20px", textAlign: "center" }}
        >
          <Users
            size={48}
            style={{
              marginBottom: "16px",
              opacity: 0.5,
              color: "var(--text-tertiary)",
            }}
          />
          <h3 style={{ marginBottom: "8px", color: "var(--text-primary)" }}>
            No positions added
          </h3>
          <p style={{ color: "var(--text-tertiary)", marginBottom: "20px" }}>
            Add at least one position to continue. Each position will be tracked
            independently.
          </p>
          <button className="action-button primary" onClick={addItem}>
            <Plus size={16} />
            Add First Position
          </button>
        </div>
      ) : (
        <>
          {formData.items.map((item, index) => (
            <div
              key={item.id}
              className="requisition-item-card"
              style={{
                padding: "24px",
                marginBottom: "20px",
                backgroundColor: "var(--bg-primary)",
                borderRadius: "16px",
                border: "1px solid var(--border-subtle)",
                boxShadow: "var(--shadow-sm)",
                transition:
                  "all var(--transition-duration) var(--transition-smooth)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "20px",
                }}
              >
                <div>
                  <h4
                    style={{
                      fontSize: "15px",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                    }}
                  >
                    Position {index + 1}
                    {item.role && ` - ${item.role}`}
                  </h4>
                  <p
                    style={{ fontSize: "12px", color: "var(--text-tertiary)" }}
                  >
                    This will become one requisition item in the system
                  </p>
                </div>
                <button
                  className="action-button"
                  onClick={() => removeItem(item.id)}
                  style={{ fontSize: "12px", padding: "8px 12px" }}
                >
                  <Trash2 size={14} />
                  Remove
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: "20px",
                  marginBottom: "20px",
                }}
              >
                <div className="form-field">
                  <label>Role / Position Title *</label>
                  <input
                    value={item.role}
                    onChange={(e) =>
                      updateItem(item.id, "role", e.target.value)
                    }
                    placeholder="e.g., Full Stack Developer, QA Lead, DevOps Engineer"
                    style={{ width: "100%" }}
                  />
                </div>

                <div className="form-field">
                  <label>Primary Skill *</label>
                  <div style={{ position: "relative" }}>
                    <input
                      placeholder="Search skills"
                      value={skillSearch[item.id] ?? ""}
                      onChange={(e) => {
                        setSkillSearch({
                          ...skillSearch,
                          [item.id]: e.target.value,
                        });
                        setActiveSkillField(item.id);
                        if (!e.target.value) {
                          updateItem(item.id, "primarySkillId", "");
                        }
                      }}
                      onFocus={() => setActiveSkillField(item.id)}
                      onBlur={() =>
                        setTimeout(
                          () =>
                            setActiveSkillField((prev) =>
                              prev === item.id ? null : prev,
                            ),
                          150,
                        )
                      }
                      style={{ width: "100%" }}
                    />
                    {activeSkillField === item.id && (
                      <div
                        style={{
                          position: "absolute",
                          top: "calc(100% + 6px)",
                          left: 0,
                          right: 0,
                          background: "var(--bg-primary)",
                          border: "1px solid var(--border-subtle)",
                          borderRadius: "10px",
                          boxShadow: "var(--shadow-md)",
                          maxHeight: "220px",
                          overflowY: "auto",
                          zIndex: 5,
                        }}
                      >
                        {skills
                          .filter((skill) =>
                            skill.name
                              .toLowerCase()
                              .includes(
                                (skillSearch[item.id] ?? "").toLowerCase(),
                              ),
                          )
                          .map((skill) => (
                            <button
                              key={skill.id}
                              type="button"
                              className="action-button"
                              style={{
                                width: "100%",
                                justifyContent: "flex-start",
                                borderRadius: 0,
                                border: "none",
                                background:
                                  item.primarySkillId === skill.id
                                    ? "rgba(59, 130, 246, 0.12)"
                                    : "transparent",
                                color: "var(--text-primary)",
                                padding: "10px 12px",
                              }}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                updateItem(item.id, "primarySkillId", skill.id);
                                setSkillSearch({
                                  ...skillSearch,
                                  [item.id]: skill.name,
                                });
                                setActiveSkillField(null);
                              }}
                            >
                              {skill.name}
                            </button>
                          ))}
                        {skills.filter((skill) =>
                          skill.name
                            .toLowerCase()
                            .includes(
                              (skillSearch[item.id] ?? "").toLowerCase(),
                            ),
                        ).length === 0 && (
                          <div
                            style={{
                              padding: "10px 12px",
                              fontSize: "12px",
                              color: "var(--text-tertiary)",
                            }}
                          >
                            No skills found.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {skillLoadError && (
                    <div
                      style={{
                        marginTop: "6px",
                        fontSize: "12px",
                        color: "var(--error)",
                      }}
                    >
                      {skillLoadError}
                    </div>
                  )}
                </div>
              </div>

              <div className="form-field">
                <label>Secondary / Tertiary Skills</label>
                <div
                  style={{ display: "flex", gap: "12px", marginBottom: "12px" }}
                >
                  <select
                    value={secondarySkillPick[item.id] ?? ""}
                    onChange={(e) =>
                      setSecondarySkillPick({
                        ...secondarySkillPick,
                        [item.id]: e.target.value ? Number(e.target.value) : "",
                      })
                    }
                    style={{ flex: 1, background: "var(--bg-tertiary)" }}
                  >
                    <option value="">Select additional skill</option>
                    {skills
                      .filter((skill) => skill.id !== item.primarySkillId)
                      .map((skill) => (
                        <option key={skill.id} value={skill.id}>
                          {skill.name}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    className="action-button"
                    onClick={() => {
                      const selected = secondarySkillPick[item.id];
                      if (
                        !selected ||
                        item.secondarySkillIds.includes(selected)
                      ) {
                        return;
                      }
                      updateItem(item.id, "secondarySkillIds", [
                        ...item.secondarySkillIds,
                        selected,
                      ]);
                      setSecondarySkillPick({
                        ...secondarySkillPick,
                        [item.id]: "",
                      });
                    }}
                  >
                    Add Skill
                  </button>
                </div>
                {item.secondarySkillIds.length > 0 ? (
                  <div
                    style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}
                  >
                    {item.secondarySkillIds.map((skillId) => (
                      <button
                        key={skillId}
                        type="button"
                        className="filter-chip"
                        style={{ padding: "6px 10px" }}
                        onClick={() =>
                          updateItem(
                            item.id,
                            "secondarySkillIds",
                            item.secondarySkillIds.filter(
                              (id) => id !== skillId,
                            ),
                          )
                        }
                      >
                        {getSkillName(skillId) || "Skill"} ×
                      </button>
                    ))}
                  </div>
                ) : (
                  <div
                    style={{ fontSize: "12px", color: "var(--text-tertiary)" }}
                  >
                    Add secondary or tertiary skills to improve match accuracy.
                  </div>
                )}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "20px",
                  marginBottom: "20px",
                }}
              >
                <div className="form-field">
                  <label>Experience Level *</label>
                  <select
                    value={item.level}
                    onChange={(e) =>
                      updateItem(item.id, "level", e.target.value as any)
                    }
                    style={{ width: "100%", background: "var(--bg-tertiary)" }}
                  >
                    <option value="Lead">Lead</option>
                    <option value="Senior">Senior</option>
                    <option value="Mid">Mid</option>
                    <option value="Junior">Junior</option>
                  </select>
                </div>

                <div className="form-field">
                  <label>
                    Years of Experience *
                    {item.experience > 0 && (
                      <span
                        style={{
                          marginLeft: "8px",
                          fontSize: "12px",
                          color: "var(--text-tertiary)",
                        }}
                      >
                        ({item.experience} yrs)
                      </span>
                    )}
                  </label>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <input
                      type="range"
                      min="0"
                      max="15"
                      value={item.experience}
                      onChange={(e) =>
                        updateItem(
                          item.id,
                          "experience",
                          parseInt(e.target.value),
                        )
                      }
                      style={{ flex: 1 }}
                    />
                    <span
                      style={{
                        minWidth: "40px",
                        textAlign: "center",
                        fontSize: "13px",
                      }}
                    >
                      {item.experience}
                    </span>
                  </div>
                </div>

                <div className="form-field">
                  <label>Quantity *</label>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        updateItem(
                          item.id,
                          "quantity",
                          Math.max(1, item.quantity - 1),
                        )
                      }
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "8px",
                        border: "1px solid var(--border-subtle)",
                        background: "var(--bg-tertiary)",
                        cursor: "pointer",
                      }}
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) =>
                        updateItem(
                          item.id,
                          "quantity",
                          parseInt(e.target.value) || 1,
                        )
                      }
                      style={{ textAlign: "center", flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        updateItem(item.id, "quantity", item.quantity + 1)
                      }
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "8px",
                        border: "1px solid var(--border-subtle)",
                        background: "var(--bg-tertiary)",
                        cursor: "pointer",
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              <div className="form-field">
                <label>Education Requirements (Optional)</label>
                <select
                  value={item.education}
                  onChange={(e) =>
                    updateItem(item.id, "education", e.target.value)
                  }
                  style={{ width: "100%" }}
                >
                  <option value="">Any</option>
                  <option value="B.Tech/B.E.">B.Tech / B.E.</option>
                  <option value="M.Tech/M.E.">M.Tech / M.E.</option>
                  <option value="MCA">MCA</option>
                  <option value="BCA">BCA</option>
                  <option value="B.Sc">B.Sc (Computer Science)</option>
                  <option value="M.Sc">M.Sc (Computer Science)</option>
                  <option value="Ph.D">Ph.D</option>
                </select>
              </div>

              <div className="form-field">
                <label>Job Description / Key Responsibilities</label>
                <textarea
                  rows={3}
                  value={item.description}
                  onChange={(e) =>
                    updateItem(item.id, "description", e.target.value)
                  }
                  placeholder="Brief description of responsibilities, technologies used, etc."
                  style={{ width: "100%", resize: "vertical" }}
                />
              </div>
            </div>
          ))}

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginTop: "24px",
            }}
          >
            <button
              className="action-button"
              onClick={addItem}
              style={{ padding: "12px 24px" }}
            >
              <Plus size={16} />
              Add Another Position
            </button>
          </div>
        </>
      )}

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
          Each position above becomes a separate{" "}
          <strong>requisition item</strong>. HR will assign employees to each
          item independently, allowing for partial fulfillment. Once all items
          are fulfilled or cancelled, the requisition will be closed
          automatically.
        </p>
      </div>
    </div>
  );

  // ================= STEP 3: BUDGET & FINALIZE =================
  const renderStep3 = () => {
    const totalPositions = formData.items.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );

    return (
      <div className="master-data-manager">
        <div className="data-manager-header">
          <h3>Budget & Final Review</h3>
          <p className="subtitle">
            Complete the requisition details and review before submission
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "24px",
            marginBottom: "32px",
          }}
        >
          <div className="form-field">
            <label>
              <DollarSign size={14} style={{ marginRight: "8px" }} />
              Estimated Budget (Optional)
            </label>
            <div style={{ position: "relative" }}>
              <span
                style={{
                  position: "absolute",
                  left: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--text-tertiary)",
                }}
              >
                ₹
              </span>
              <input
                value={formData.budget}
                onChange={(e) =>
                  setFormData({ ...formData, budget: e.target.value })
                }
                placeholder="Enter budget amount"
                style={{ width: "100%", paddingLeft: "30px" }}
              />
            </div>
          </div>

          <div className="form-field">
            <label>
              <Calendar size={14} style={{ marginRight: "8px" }} />
              Project Duration
            </label>
            <select
              value={formData.projectDuration}
              onChange={(e) =>
                setFormData({ ...formData, projectDuration: e.target.value })
              }
              style={{ width: "100%" }}
            >
              <option value="">Select duration (optional)</option>
              <option value="1-3 months">1-3 months (Short-term)</option>
              <option value="3-6 months">3-6 months</option>
              <option value="6-12 months">6-12 months</option>
              <option value="1-2 years">1-2 years (Long-term)</option>
              <option value="2+ years">2+ years (Permanent)</option>
            </select>
          </div>
        </div>

        <div className="form-field" style={{ marginBottom: "32px" }}>
          <label>Job Description (PDF)</label>
          <input
            type="file"
            accept="application/pdf"
            onChange={handleJdChange}
          />
          {jdFile && (
            <div
              style={{
                marginTop: "8px",
                display: "flex",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <span
                style={{ fontSize: "12px", color: "var(--text-secondary)" }}
              >
                {jdFile.name}
              </span>
              <button
                type="button"
                className="action-button"
                onClick={handleJdRemove}
                style={{ fontSize: "12px", padding: "6px 10px" }}
              >
                Remove
              </button>
            </div>
          )}
          {jdError && (
            <div
              style={{
                marginTop: "6px",
                fontSize: "12px",
                color: "var(--error)",
              }}
            >
              {jdError}
            </div>
          )}
          {!jdError && (
            <div
              style={{
                marginTop: "6px",
                fontSize: "12px",
                color: "var(--text-tertiary)",
              }}
            >
              PDF only • Max size 10MB
            </div>
          )}
        </div>

        <div style={{ marginBottom: "32px" }}>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "12px",
            }}
          >
            <input
              type="checkbox"
              checked={formData.isReplacement}
              onChange={(e) =>
                setFormData({ ...formData, isReplacement: e.target.checked })
              }
              style={{ width: "16px", height: "16px" }}
            />
            <span
              style={{
                fontSize: "14px",
                fontWeight: 500,
                color: "var(--text-primary)",
              }}
            >
              This is a replacement hire (for an existing position)
            </span>
          </label>
          <p
            style={{
              fontSize: "12px",
              color: "var(--text-tertiary)",
              marginLeft: "24px",
            }}
          >
            Check this if you're replacing an employee who has left or is
            leaving the organization.
          </p>
        </div>

        <div className="form-field">
          <label>Additional Notes (Optional)</label>
          <textarea
            rows={3}
            value={formData.additionalNotes}
            onChange={(e) =>
              setFormData({ ...formData, additionalNotes: e.target.value })
            }
            placeholder="Any other information HR should know..."
            style={{ width: "100%", resize: "vertical" }}
          />
        </div>

        {/* SUMMARY PREVIEW */}
        <div
          style={{
            marginTop: "32px",
            padding: "24px",
            backgroundColor: "var(--bg-secondary)",
            borderRadius: "16px",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <h4
            style={{
              fontSize: "15px",
              fontWeight: 600,
              marginBottom: "16px",
              color: "var(--text-primary)",
            }}
          >
            <CheckCircle
              size={16}
              style={{ marginRight: "8px", verticalAlign: "middle" }}
            />
            Requisition Summary
          </h4>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "16px",
              marginBottom: "20px",
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
                Project
              </div>
              <div style={{ fontSize: "14px", fontWeight: 500 }}>
                {formData.projectName || "Not specified"}
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
                Client
              </div>
              <div style={{ fontSize: "14px", fontWeight: 500 }}>
                {formData.clientName || "Not specified"}
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
                Priority
              </div>
              <span
                className={`priority-indicator ${formData.priority === "High" ? "priority-high" : formData.priority === "Medium" ? "priority-medium" : "priority-low"}`}
              >
                {formData.priority}
              </span>
            </div>
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
              <div style={{ fontSize: "14px", fontWeight: 500 }}>
                {totalPositions}
              </div>
            </div>
          </div>

          <div
            style={{
              borderTop: "1px solid var(--border-subtle)",
              paddingTop: "16px",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                color: "var(--text-tertiary)",
                marginBottom: "8px",
              }}
            >
              Position Breakdown
            </div>
            {formData.items.length > 0 ? (
              <div
                style={{ display: "flex", flexDirection: "column", gap: "8px" }}
              >
                {formData.items.map((item, index) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      backgroundColor: "var(--bg-primary)",
                      borderRadius: "8px",
                      fontSize: "13px",
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 500 }}>
                        {item.role || `Position ${index + 1}`}
                      </span>
                      <span
                        style={{
                          marginLeft: "8px",
                          color: "var(--text-tertiary)",
                        }}
                      >
                        ({item.quantity}x {item.level})
                      </span>
                    </div>
                    <div style={{ color: "var(--text-tertiary)" }}>
                      {getSkillName(item.primarySkillId) || "Primary skill"}
                      {item.secondarySkillIds.length > 0 && (
                        <span>
                          {" "}
                          •{" "}
                          {item.secondarySkillIds
                            .map((skillId) => getSkillName(skillId))
                            .filter(Boolean)
                            .join(", ") || "Additional skills"}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                style={{
                  color: "var(--text-tertiary)",
                  fontSize: "13px",
                  fontStyle: "italic",
                }}
              >
                No positions added
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ================= MAIN RENDER =================
  return (
    <>
      {/* Page Header */}
      <div className="manager-header">
        <h2>Raise Resource Requisition</h2>
        <p className="subtitle">
          Create a new requisition demand following the 3-step wizard
        </p>
      </div>

      {/* Wizard with Step Indicators */}
      <RequisitionWizard
        steps={wizardSteps}
        activeStep={activeStep}
        completedSteps={completedSteps}
        allowStepNavigation={true}
        onStepClick={(index) => {
          // Only allow navigation to completed or current steps
          if (index <= activeStep || completedSteps.has(index - 1)) {
            setActiveStep(index);
          }
        }}
      >
        {/* Step Content */}
        {activeStep === 0 && renderStep1()}
        {activeStep === 1 && renderStep2()}
        {activeStep === 2 && renderStep3()}
      </RequisitionWizard>

      {/* Navigation Buttons */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: "32px",
          paddingTop: "24px",
          borderTop: "1px solid var(--border-subtle)",
        }}
      >
        <button
          type="button"
          className="action-button"
          onClick={handleBack}
          disabled={activeStep === 0}
          style={{
            opacity: activeStep === 0 ? 0.5 : 1,
            cursor: activeStep === 0 ? "not-allowed" : "pointer",
          }}
        >
          ← Back
        </button>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          {/* Draft Status Indicator */}
          {draftRequisitionId && (
            <span
              style={{
                fontSize: "12px",
                color: "var(--text-tertiary)",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <Save size={12} />
              Draft #{draftRequisitionId}
            </span>
          )}
          {draftSaved && (
            <span
              style={{
                fontSize: "12px",
                color: "var(--success)",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <CheckCircle size={12} />
              Saved
            </span>
          )}

          {/* Save Draft Button */}
          <button
            type="button"
            className="action-button"
            onClick={handleSaveDraft}
            disabled={isSavingDraft || !validateStep(0)}
            style={{
              opacity: !validateStep(0) ? 0.5 : 1,
              cursor: !validateStep(0) ? "not-allowed" : "pointer",
            }}
          >
            {isSavingDraft ? (
              <Loader2
                size={16}
                className="spin"
                style={{ marginRight: "6px" }}
              />
            ) : (
              <Save size={16} style={{ marginRight: "6px" }} />
            )}
            {isSavingDraft ? "Saving..." : "Save Draft"}
          </button>

          {activeStep < wizardSteps.length - 1 ? (
            <button
              type="button"
              className="action-button primary"
              onClick={handleNext}
              disabled={!canProceed}
              style={{ minWidth: "140px" }}
            >
              Continue to {wizardSteps[activeStep + 1]?.label ?? "Next"} →
            </button>
          ) : (
            <button
              type="button"
              className="action-button primary"
              onClick={handleSubmit}
              disabled={!canSubmit}
              style={{
                minWidth: "180px",
                background: canSubmit
                  ? "linear-gradient(135deg, var(--success), #059669)"
                  : "var(--bg-tertiary)",
              }}
            >
              {isSubmitting ? (
                <Loader2
                  size={16}
                  className="spin"
                  style={{ marginRight: "8px" }}
                />
              ) : (
                <Send size={16} style={{ marginRight: "8px" }} />
              )}
              {isSubmitting ? "Submitting..." : "Submit for Approval"}
            </button>
          )}
        </div>
      </div>

      {/* Error Display */}
      {submitError && (
        <div
          className="save-message save-message--error"
          style={{
            marginTop: "16px",
            padding: "12px 16px",
            borderRadius: "10px",
          }}
        >
          <AlertCircle
            size={16}
            style={{ marginRight: "8px", flexShrink: 0 }}
          />
          <span>{submitError}</span>
        </div>
      )}

      {/* Workflow Legend - Backend-Driven Status Transitions */}
      <div
        style={{
          marginTop: "40px",
          padding: "20px",
          backgroundColor: "var(--bg-tertiary)",
          borderRadius: "12px",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <h4
          style={{
            fontSize: "13px",
            fontWeight: 600,
            marginBottom: "12px",
            color: "var(--text-primary)",
          }}
        >
          <Briefcase
            size={16}
            style={{ marginRight: "8px", verticalAlign: "middle" }}
          />
          Workflow Engine V2 — Status Transitions
        </h4>
        <div
          style={{
            fontSize: "12px",
            color: "var(--text-secondary)",
            lineHeight: 1.8,
          }}
        >
          <p>
            <strong>1. Save Draft:</strong> Creates requisition in{" "}
            <code
              style={{
                background: "var(--bg-secondary)",
                padding: "2px 6px",
                borderRadius: "4px",
              }}
            >
              DRAFT
            </code>{" "}
            status. You can edit and return later.
          </p>
          <p>
            <strong>2. Submit for Approval:</strong> Triggers workflow
            transition{" "}
            <code
              style={{
                background: "var(--bg-secondary)",
                padding: "2px 6px",
                borderRadius: "4px",
              }}
            >
              DRAFT → Pending_Budget
            </code>
          </p>
          <p>
            <strong>3. Approval Flow:</strong>{" "}
            <code
              style={{
                background: "var(--bg-secondary)",
                padding: "2px 6px",
                borderRadius: "4px",
              }}
            >
              Pending_Budget → Pending_HR → Active
            </code>
          </p>
          <p
            style={{
              marginTop: "12px",
              color: "var(--text-tertiary)",
              fontStyle: "italic",
            }}
          >
            All status transitions are handled by the backend workflow engine.
            Frontend does not modify status directly.
          </p>
        </div>
      </div>
    </>
  );
};

export default RaiseRequisition;
