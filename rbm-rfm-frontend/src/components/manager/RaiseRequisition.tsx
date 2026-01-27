import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

interface RequisitionItem {
  id: number;
  skill: string;
  level: string;
  education?: string;
  quantity: number;
  status: "Pending";
}

const RaiseRequisition: React.FC = () => {
  /* ================= STEP A: HEADER ================= */
  const [project, setProject] = useState("");
  const [priority, setPriority] = useState("");
  const [requiredBy, setRequiredBy] = useState("");
  const [justification, setJustification] = useState("");
  const [budget, setBudget] = useState("");

  /* ================= STEP B: ITEMS ================= */
  const [items, setItems] = useState<RequisitionItem[]>([]);

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: Date.now(),
        skill: "",
        level: "",
        education: "",
        quantity: 1,
        status: "Pending",
      },
    ]);
  };

  const updateItem = (id: number, field: keyof RequisitionItem, value: any) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
  };

  const removeItem = (id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const canSubmit =
    project && priority && requiredBy && justification && items.length > 0;

  return (
    <>
      {/* Page Header */}
      <div className="manager-header">
        <h2>Raise Requisition</h2>
        <p className="subtitle">
          Define your resource demand clearly so HR can act.
        </p>
      </div>

      {/* ================= STEP A ================= */}
      <div className="master-data-manager mb-6">
        <div className="data-manager-header">
          <h3>Requisition Details</h3>
          <p className="subtitle">This creates a single requisition record.</p>
        </div>

        <div className="form-field">
          <label>Project / Client *</label>
          <input
            value={project}
            onChange={(e) => setProject(e.target.value)}
            placeholder="Enter project or client name"
          />
        </div>

        <div className="form-field">
          <label>Priority *</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option value="">Select priority</option>
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
        </div>

        <div className="form-field">
          <label>Required By Date *</label>
          <input
            type="date"
            value={requiredBy}
            onChange={(e) => setRequiredBy(e.target.value)}
          />
        </div>

        <div className="form-field">
          <label>Business Justification *</label>
          <textarea
            rows={3}
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            placeholder="Explain why these resources are needed"
          />
        </div>

        <div className="form-field">
          <label>Budget (Optional)</label>
          <input
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="Optional budget reference"
          />
        </div>
      </div>

      {/* ================= STEP B ================= */}
      <div className="master-data-manager">
        <div className="data-manager-header">
          <h3>Requisition Items</h3>
          <p className="subtitle">
            Each item represents one or more required positions.
          </p>
        </div>

        {items.length === 0 && (
          <div className="empty-state">
            No requisition items added. At least one item is required.
          </div>
        )}

        {items.map((item, index) => (
          <div key={item.id} className="p-4 mb-4 border rounded-lg bg-slate-50">
            <div className="flex justify-between items-center mb-3">
              <strong>Item {index + 1}</strong>
              <button
                className="action-button text-sm"
                onClick={() => removeItem(item.id)}
              >
                <Trash2 size={14} />
                Remove
              </button>
            </div>

            <div className="form-field">
              <label>Skill *</label>
              <input
                value={item.skill}
                onChange={(e) => updateItem(item.id, "skill", e.target.value)}
                placeholder="e.g. Java, React, Python"
              />
            </div>

            <div className="form-field">
              <label>Level *</label>
              <select
                value={item.level}
                onChange={(e) => updateItem(item.id, "level", e.target.value)}
              >
                <option value="">Select level</option>
                <option>Junior</option>
                <option>Mid</option>
                <option>Senior</option>
              </select>
            </div>

            <div className="form-field">
              <label>Education (Optional)</label>
              <input
                value={item.education}
                onChange={(e) =>
                  updateItem(item.id, "education", e.target.value)
                }
                placeholder="Optional"
              />
            </div>

            <div className="form-field">
              <label>Quantity *</label>
              <input
                type="number"
                min={1}
                value={item.quantity}
                onChange={(e) =>
                  updateItem(item.id, "quantity", Number(e.target.value))
                }
              />
            </div>

            <div className="text-xs text-slate-500">
              Item Status: <strong>Pending</strong>
            </div>
          </div>
        ))}

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <button className="action-button" onClick={addItem}>
            <Plus size={14} />
            Add Requisition Item
          </button>

          <button
            className="action-button primary"
            disabled={!canSubmit}
            title={
              !canSubmit
                ? "Fill all required fields and add at least one item"
                : "Submit requisition"
            }
          >
            Submit Requisition
          </button>
        </div>
      </div>
    </>
  );
};

export default RaiseRequisition;
