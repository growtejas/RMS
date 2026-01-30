import React, { useEffect, useState } from "react";
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
} from "lucide-react";
import { apiClient } from "../../api/client";

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

interface RequisitionFormData {
  // Step 1
  projectName: string;
  clientName: string;
  officeLocation: string;
  workMode: "Remote" | "Hybrid" | "WFO";
  requiredBy: string;
  dateClosed: string;
  justification: string;
  priority: "Low" | "Medium" | "High";

  // Step 2 (items)
  items: RequisitionItem[];

  // Step 3
  budget: string;
  projectDuration: string;
  isReplacement: boolean;
  additionalNotes: string;
  approvedBy: string | null;
  budgetApprovedBy: string | null;
}

type SkillOption = {
  id: number;
  name: string;
};

type SkillResponse = {
  skill_id: number;
  skill_name: string;
};

const RaiseRequisition: React.FC = () => {
  const [activeStep, setActiveStep] = useState(0);
  const [formData, setFormData] = useState<RequisitionFormData>({
    projectName: "",
    clientName: "",
    officeLocation: "",
    workMode: "Hybrid",
    requiredBy: "",
    dateClosed: "",
    justification: "",
    priority: "Medium",
    items: [],
    budget: "",
    projectDuration: "",
    isReplacement: false,
    additionalNotes: "",
    approvedBy: null,
    budgetApprovedBy: null,
  });
  const [skills, setSkills] = useState<SkillOption[]>([]);
  const [skillLoadError, setSkillLoadError] = useState<string | null>(null);
  const [skillSearch, setSkillSearch] = useState<Record<number, string>>({});
  const [secondarySkillPick, setSecondarySkillPick] = useState<
    Record<number, number | "">
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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

    fetchSkills();
  }, []);

  const getSkillName = (skillId: number | "") => {
    if (skillId === "") {
      return "";
    }
    return skills.find((skill) => skill.id === skillId)?.name ?? "";
  };

  const getDaysUntil = (dateValue: string) => {
    if (!dateValue) {
      return null;
    }
    const today = new Date();
    const target = new Date(`${dateValue}T00:00:00`);
    if (Number.isNaN(target.getTime())) {
      return null;
    }
    const diffMs = target.getTime() - today.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  };

  // ================= STEP HANDLERS =================
  const handleNext = () => {
    if (activeStep < 2) setActiveStep(activeStep + 1);
  };

  const handleBack = () => {
    if (activeStep > 0) setActiveStep(activeStep - 1);
  };

  const handleSubmit = async () => {
    if (!validateStep(2)) {
      setSubmitError("Please complete all required fields.");
      return;
    }

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
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const trimmedBudget = formData.budget.replace(/,/g, "").trim();
      const budgetValue = trimmedBudget ? Number(trimmedBudget) : undefined;

      if (
        trimmedBudget &&
        (budgetValue === undefined || !Number.isFinite(budgetValue))
      ) {
        setSubmitError("Budget must be a valid number.");
        return;
      }

      const itemsPayload = formData.items.flatMap((item) => {
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

        const payloadItem = {
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

      const workModePayload =
        formData.workMode === "Remote" ? "WFH" : formData.workMode;

      await apiClient.post("/requisitions/", {
        project_name: formData.projectName || undefined,
        client_name: formData.clientName || undefined,
        office_location: formData.officeLocation || undefined,
        work_mode: workModePayload || undefined,
        required_by_date: formData.requiredBy || undefined,
        priority: formData.priority || undefined,
        justification: formData.justification || undefined,
        budget_amount: budgetValue,
        duration: formData.projectDuration || undefined,
        is_replacement: formData.isReplacement,
        manager_notes: formData.additionalNotes || undefined,
        date_closed: formData.dateClosed
          ? new Date(`${formData.dateClosed}T00:00:00`).toISOString()
          : undefined,
        items: itemsPayload,
      });

      alert("Requisition submitted successfully!");
      setFormData({
        projectName: "",
        clientName: "",
        officeLocation: "",
        workMode: "Hybrid",
        requiredBy: "",
        dateClosed: "",
        justification: "",
        priority: "Medium",
        items: [],
        budget: "",
        projectDuration: "",
        isReplacement: false,
        additionalNotes: "",
        approvedBy: null,
        budgetApprovedBy: null,
      });
      setSkillSearch({});
      setSecondarySkillPick({});
      setActiveStep(0);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to submit requisition";
      const apiMessage =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        (error as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail
          ? (error as { response?: { data?: { detail?: string } } }).response
              ?.data?.detail
          : null;

      setSubmitError(apiMessage ?? errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

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
          formData.clientName &&
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
        return !!formData.projectDuration;
      default:
        return false;
    }
  };

  const canProceed = validateStep(activeStep);
  const steps = ["Project Scope", "Resource Details", "Budget & Finalize"];

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
          <label>Client Name *</label>
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
            <option value="Mumbai">Mumbai HQ</option>
            <option value="Bengaluru">Bengaluru Office</option>
            <option value="Delhi">Delhi Office</option>
            <option value="Pune">Pune Development Center</option>
            <option value="Remote">Remote</option>
          </select>
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "24px",
          marginBottom: "24px",
        }}
      >
        <div className="form-field">
          <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Calendar size={14} />
            Project Fulfillment Deadline
            {(() => {
              const daysUntil = getDaysUntil(formData.dateClosed);
              if (daysUntil !== null && daysUntil <= 7) {
                return (
                  <span className="priority-indicator priority-medium">
                    {daysUntil <= 0 ? "Due" : `${daysUntil}d`}
                  </span>
                );
              }
              return null;
            })()}
          </label>
          <input
            type="date"
            value={formData.dateClosed}
            onChange={(e) =>
              setFormData({ ...formData, dateClosed: e.target.value })
            }
            style={{ width: "100%" }}
            min={new Date().toISOString().split("T")[0]}
          />
          <div
            style={{
              marginTop: "6px",
              fontSize: "12px",
              color: "var(--text-tertiary)",
            }}
          >
            If this deadline is reached without fulfillment, the requisition
            status will automatically move to "Closed".
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
                  gridTemplateColumns: "1fr 1fr",
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
                  <input
                    placeholder="Search skills"
                    value={skillSearch[item.id] ?? ""}
                    onChange={(e) =>
                      setSkillSearch({
                        ...skillSearch,
                        [item.id]: e.target.value,
                      })
                    }
                    style={{ width: "100%" }}
                  />
                  <select
                    value={item.primarySkillId}
                    onChange={(e) =>
                      updateItem(
                        item.id,
                        "primarySkillId",
                        e.target.value ? Number(e.target.value) : "",
                      )
                    }
                    style={{
                      width: "100%",
                      marginTop: "8px",
                      background: "var(--bg-tertiary)",
                    }}
                  >
                    <option value="">Select primary skill</option>
                    {skills
                      .filter((skill) =>
                        skill.name
                          .toLowerCase()
                          .includes((skillSearch[item.id] ?? "").toLowerCase()),
                      )
                      .map((skill) => (
                        <option key={skill.id} value={skill.id}>
                          {skill.name}
                        </option>
                      ))}
                  </select>
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
                  gridTemplateColumns: "1fr 1fr 1fr",
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
              Project Duration *
            </label>
            <select
              value={formData.projectDuration}
              onChange={(e) =>
                setFormData({ ...formData, projectDuration: e.target.value })
              }
              style={{ width: "100%" }}
            >
              <option value="">Select duration</option>
              <option value="1-3 months">1-3 months (Short-term)</option>
              <option value="3-6 months">3-6 months</option>
              <option value="6-12 months">6-12 months</option>
              <option value="1-2 years">1-2 years (Long-term)</option>
              <option value="2+ years">2+ years (Permanent)</option>
            </select>
          </div>
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
            <label>Approved By (HR Head)</label>
            <input
              value={formData.approvedBy ?? "Pending"}
              readOnly
              disabled
              style={{ width: "100%" }}
            />
          </div>
          <div className="form-field">
            <label>Budget Approved By</label>
            <input
              value={formData.budgetApprovedBy ?? "Pending"}
              readOnly
              disabled
              style={{ width: "100%" }}
            />
          </div>
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

      {/* Stepper Navigation */}
      <div style={{ marginBottom: "32px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
          }}
        >
          <div style={{ display: "flex", gap: "8px" }}>
            {steps.map((step, index) => (
              <button
                key={step}
                type="button"
                onClick={() => setActiveStep(index)}
                style={{
                  padding: "8px 16px",
                  borderRadius: "20px",
                  border: "none",
                  background:
                    activeStep === index
                      ? "var(--primary-accent)"
                      : "var(--bg-tertiary)",
                  color:
                    activeStep === index ? "white" : "var(--text-tertiary)",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition:
                    "all var(--transition-duration) var(--transition-smooth)",
                }}
              >
                {step}
              </button>
            ))}
          </div>

          <div style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>
            Step {activeStep + 1} of {steps.length}
          </div>
        </div>

        {/* Progress Bar */}
        <div
          style={{
            height: "4px",
            background: "var(--border-subtle)",
            borderRadius: "2px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${((activeStep + 1) / steps.length) * 100}%`,
              height: "100%",
              background:
                "linear-gradient(135deg, var(--primary-accent), var(--primary-accent-dark))",
              transition: "width 0.3s ease",
            }}
          />
        </div>
      </div>

      {/* Step Content */}
      {activeStep === 0 && renderStep1()}
      {activeStep === 1 && renderStep2()}
      {activeStep === 2 && renderStep3()}

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

        <div style={{ display: "flex", gap: "12px" }}>
          {activeStep < steps.length - 1 ? (
            <button
              className="action-button primary"
              onClick={handleNext}
              disabled={!canProceed}
              style={{ minWidth: "140px" }}
            >
              Continue to {steps[activeStep + 1]} →
            </button>
          ) : (
            <button
              className="action-button primary"
              onClick={handleSubmit}
              disabled={!canProceed || isSubmitting}
              style={{
                minWidth: "180px",
                background: canProceed
                  ? "linear-gradient(135deg, var(--success), #059669)"
                  : "var(--bg-tertiary)",
              }}
            >
              <CheckCircle size={16} style={{ marginRight: "8px" }} />
              {isSubmitting ? "Submitting..." : "Submit Requisition"}
            </button>
          )}
        </div>
      </div>

      {submitError && (
        <div
          style={{
            marginTop: "16px",
            padding: "12px 16px",
            borderRadius: "10px",
            background: "rgba(239, 68, 68, 0.08)",
            color: "var(--error)",
            fontSize: "13px",
            border: "1px solid rgba(239, 68, 68, 0.2)",
          }}
        >
          {submitError}
        </div>
      )}

      {/* Workflow Legend */}
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
          Workflow Summary
        </h4>
        <div
          style={{
            fontSize: "12px",
            color: "var(--text-secondary)",
            lineHeight: 1.6,
          }}
        >
          <p>
            <strong>Step 1:</strong> Creates the requisition header in the
            database (table: requisitions)
          </p>
          <p>
            <strong>Step 2:</strong> Each position becomes a separate record
            (table: requisition_items)
          </p>
          <p>
            <strong>Step 3:</strong> HR will work on each item independently.
            The requisition closes when all items are fulfilled or cancelled.
          </p>
        </div>
      </div>
    </>
  );
};

export default RaiseRequisition;
