/**
 * ============================================================================
 * HR Gatekeeper Panel - Phase 2 Budget & HR Validation UI
 * ============================================================================
 *
 * Implements the Gatekeeper workflow for requisitions in PENDING_BUDGET status.
 *
 * SECTIONS:
 * 1. Header Summary (Read Only)
 * 2. Step A — Financial Review (Per Item Budget Editing)
 * 3. Step B — Budget Clearance
 * 4. Step C — HR Authorization
 * 5. Workflow Action Bar
 *
 * STRICT RULES:
 * - No header budget editing
 * - No manual status changes
 * - No approval without validation
 * - Only workflow endpoints for transitions
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  DollarSign,
  Edit3,
  Loader2,
  Save,
  Shield,
  User,
  XCircle,
  Calendar,
  Briefcase,
  RefreshCw,
} from "lucide-react";
import { useHRGatekeeperUI } from "../../hooks/useHRGatekeeperUI";
import {
  editItemBudget,
  approveItemBudget,
  getWorkflowErrorMessage,
} from "../../api/workflowApi";
import type { Requisition, RequisitionItem } from "../../types/workflow";
import { useAuth } from "../../contexts/AuthContext";

// ============================================================================
// TYPES
// ============================================================================

interface HRGatekeeperPanelProps {
  requisition: Requisition;
  onRefresh: () => void;
  onApprovalComplete?: () => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CURRENCIES = [
  { code: "INR", label: "INR", symbol: "₹" },
  { code: "USD", label: "USD", symbol: "$" },
  { code: "EUR", label: "EUR", symbol: "€" },
  { code: "GBP", label: "GBP", symbol: "£" },
  { code: "AUD", label: "AUD", symbol: "A$" },
  { code: "SGD", label: "SGD", symbol: "S$" },
] as const;

const getCurrencySymbol = (code: string): string => {
  return CURRENCIES.find((c) => c.code === code)?.symbol || "₹";
};

const formatCurrency = (amount: number, currency: string = "INR"): string => {
  const symbol = getCurrencySymbol(currency);
  return `${symbol}${amount.toLocaleString("en-IN")}`;
};

const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
};

// ============================================================================
// STATUS BADGE COMPONENT
// ============================================================================

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const getStatusClass = () => {
    switch (status) {
      case "Pending_Budget":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "Pending_HR":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "Active":
        return "bg-green-100 text-green-800 border-green-200";
      case "Fulfilled":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "Rejected":
        return "bg-red-100 text-red-800 border-red-200";
      case "Cancelled":
        return "bg-slate-100 text-slate-800 border-slate-200";
      default:
        return "bg-slate-100 text-slate-600 border-slate-200";
    }
  };

  const getLabel = () => {
    switch (status) {
      case "Pending_Budget":
        return "Pending Budget";
      case "Pending_HR":
        return "Pending HR";
      default:
        return status;
    }
  };

  return (
    <span
      className={`px-3 py-1 text-sm font-medium rounded-full border ${getStatusClass()}`}
    >
      {getLabel()}
    </span>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const HRGatekeeperPanel: React.FC<HRGatekeeperPanelProps> = ({
  requisition,
  onRefresh,
  onApprovalComplete,
}) => {
  const { user } = useAuth();
  const userRole = user?.roles?.[0] || "";

  // Initialize hook
  const { state, actions, computed } = useHRGatekeeperUI(requisition, userRole);

  // Local state for saving individual items
  const [savingItems, setSavingItems] = useState<Set<number>>(new Set());
  const [approvingItems, setApprovingItems] = useState<Set<number>>(new Set());

  // Access control
  const hasAccess = useMemo(() => {
    const roles = (user?.roles || []).map((r) => r.toLowerCase());
    return roles.includes("hr") || roles.includes("admin");
  }, [user?.roles]);

  const isPendingBudget = requisition.overall_status === "Pending_Budget";

  // Initialize edits when requisition changes
  useEffect(() => {
    if (requisition) {
      actions.initializeFromRequisition(requisition);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requisition?.req_id]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleSaveItemBudget = async (item: RequisitionItem) => {
    const edit = state.itemEdits[item.item_id];
    if (!edit || !edit.isDirty) return;

    // Validate before saving
    if (!actions.validateItem(item.item_id)) {
      return;
    }

    const budgetValue = parseFloat(edit.estimated_budget.replace(/,/g, ""));

    setSavingItems((prev) => new Set(prev).add(item.item_id));
    actions.setGlobalError(null);

    try {
      await editItemBudget(item.item_id, {
        estimated_budget: budgetValue,
        currency: edit.currency,
      });

      actions.setGlobalMessage(`Budget saved for ${item.role_position}`);
      onRefresh();
    } catch (err) {
      actions.setGlobalError(getWorkflowErrorMessage(err));
    } finally {
      setSavingItems((prev) => {
        const next = new Set(prev);
        next.delete(item.item_id);
        return next;
      });
    }
  };

  const handleApproveItemBudget = async (item: RequisitionItem) => {
    const edit = state.itemEdits[item.item_id];
    if (!edit) return;

    const budgetValue = parseFloat(edit.estimated_budget.replace(/,/g, "") || "0");
    if (budgetValue <= 0) {
      actions.setGlobalError("Cannot approve item with zero or negative budget");
      return;
    }

    // Check for unsaved changes
    if (edit.isDirty) {
      actions.setGlobalError("Please save changes before approving");
      return;
    }

    setApprovingItems((prev) => new Set(prev).add(item.item_id));
    actions.setGlobalError(null);

    try {
      await approveItemBudget(item.item_id);
      actions.setGlobalMessage(`Budget approved for ${item.role_position}`);
      onRefresh();
    } catch (err) {
      actions.setGlobalError(getWorkflowErrorMessage(err));
    } finally {
      setApprovingItems((prev) => {
        const next = new Set(prev);
        next.delete(item.item_id);
        return next;
      });
    }
  };

  const handleAuthorizeAndApprove = async () => {
    // Validate all fields
    if (!actions.validateAll()) {
      actions.setGlobalError("Please fix validation errors before approving");
      return;
    }

    // Check for unsaved changes
    if (computed.hasUnsavedChanges) {
      actions.setGlobalError("Please save all item budget changes before approving");
      return;
    }

    // Check all items have valid budgets
    if (computed.hasInvalidBudgets) {
      actions.setGlobalError("All items must have valid estimated budgets > 0");
      return;
    }

    actions.setSubmitting(true);
    actions.setGlobalError(null);

    try {
      // Approve all pending item budgets
      const pendingItems = requisition.items.filter(
        (item) => item.approved_budget === null || item.approved_budget <= 0
      );

      for (const item of pendingItems) {
        await approveItemBudget(item.item_id);
      }

      actions.setGlobalMessage("All budgets approved successfully!");
      onRefresh();
      onApprovalComplete?.();
    } catch (err) {
      actions.setGlobalError(getWorkflowErrorMessage(err));
    } finally {
      actions.setSubmitting(false);
    }
  };

  // ============================================================================
  // ACCESS DENIED VIEW
  // ============================================================================

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Shield size={48} className="text-red-400 mb-4" />
        <h3 className="text-lg font-semibold text-slate-800">Access Denied</h3>
        <p className="text-sm text-slate-500 mt-2">
          Only HR and Admin users can access the Gatekeeper panel.
        </p>
      </div>
    );
  }

  // ============================================================================
  // NON-PENDING_BUDGET VIEW
  // ============================================================================

  if (!isPendingBudget) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <CheckCircle size={48} className="text-green-400 mb-4" />
        <h3 className="text-lg font-semibold text-slate-800">
          Budget Phase Complete
        </h3>
        <p className="text-sm text-slate-500 mt-2">
          This requisition is no longer in the budget approval phase.
        </p>
        <p className="text-sm text-slate-400 mt-1">
          Current status: <StatusBadge status={requisition.overall_status} />
        </p>
      </div>
    );
  }

  // ============================================================================
  // RENDER ITEM CARD
  // ============================================================================

  const renderItemCard = (item: RequisitionItem) => {
    const edit = state.itemEdits[item.item_id];
    const isSaving = savingItems.has(item.item_id);
    const isApproving = approvingItems.has(item.item_id);
    const isApproved = item.approved_budget !== null && item.approved_budget > 0;
    const canSave = edit?.isDirty && edit?.isValid && !isSaving && !isApproving;
    const canApprove =
      !isApproved &&
      edit?.isValid &&
      !edit?.isDirty &&
      parseFloat(edit?.estimated_budget?.replace(/,/g, "") || "0") > 0 &&
      !isSaving &&
      !isApproving;

    return (
      <div
        key={item.item_id}
        className={`bg-white border rounded-lg p-5 transition-all ${
          edit?.error
            ? "border-red-300 shadow-red-100"
            : isApproved
              ? "border-green-300 bg-green-50/30"
              : "border-slate-200 hover:border-slate-300"
        }`}
      >
        {/* Item Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h4 className="font-semibold text-slate-800 text-base">
              {item.role_position}
            </h4>
            <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
              {item.skill_level && (
                <span className="flex items-center gap-1">
                  <Briefcase size={12} />
                  {item.skill_level}
                </span>
              )}
              {item.experience_years && (
                <span>{item.experience_years} years exp</span>
              )}
            </div>
          </div>
          {isApproved && (
            <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700 flex items-center gap-1">
              <CheckCircle size={12} />
              Approved
            </span>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-slate-100 my-4" />

        {/* Budget Input Section */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Estimated Budget <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-500 text-sm">
                {getCurrencySymbol(edit?.currency || "INR")}
              </span>
              <input
                type="text"
                value={edit?.estimated_budget || ""}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9.]/g, "");
                  actions.setItemBudget(item.item_id, value);
                }}
                disabled={!isPendingBudget || isApproved || isSaving || isApproving}
                className={`w-full pl-8 pr-3 py-2 border rounded-lg text-sm transition-colors ${
                  edit?.error
                    ? "border-red-400 focus:ring-red-500 focus:border-red-500 bg-red-50"
                    : isApproved
                      ? "border-green-300 bg-green-50 text-green-800"
                      : "border-slate-300 focus:ring-blue-500 focus:border-blue-500"
                } disabled:bg-slate-100 disabled:cursor-not-allowed`}
                placeholder="Enter budget amount"
              />
            </div>
            {/* Real-time validation error */}
            {edit?.error && (
              <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                <AlertTriangle size={12} />
                {edit.error}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Currency
            </label>
            <select
              value={edit?.currency || "INR"}
              onChange={(e) => actions.setItemCurrency(item.item_id, e.target.value)}
              disabled={!isPendingBudget || isApproved || isSaving || isApproving}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
            >
              {CURRENCIES.map((curr) => (
                <option key={curr.code} value={curr.code}>
                  {curr.code} ({curr.symbol})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-100 my-4" />

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2">
          {!isApproved && (
            <>
              <button
                onClick={() => handleSaveItemBudget(item)}
                disabled={!canSave}
                className={`px-4 py-2 text-sm font-medium rounded-lg flex items-center gap-2 transition-colors ${
                  canSave
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-slate-100 text-slate-400 cursor-not-allowed"
                }`}
              >
                {isSaving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                Save Changes
              </button>

              <button
                onClick={() => handleApproveItemBudget(item)}
                disabled={!canApprove}
                className={`px-4 py-2 text-sm font-medium rounded-lg flex items-center gap-2 transition-colors ${
                  canApprove
                    ? "bg-green-600 text-white hover:bg-green-700"
                    : "bg-slate-100 text-slate-400 cursor-not-allowed"
                }`}
                title={
                  edit?.isDirty
                    ? "Save changes first"
                    : !edit?.isValid
                      ? "Fix validation errors"
                      : "Approve this item budget"
                }
              >
                {isApproving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <CheckCircle size={14} />
                )}
                Approve
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  return (
    <div className="space-y-8">
      {/* Global Messages */}
      {state.globalMessage && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle size={16} />
            {state.globalMessage}
          </span>
          <button
            onClick={() => actions.setGlobalMessage(null)}
            className="text-green-600 hover:text-green-800"
          >
            <XCircle size={16} />
          </button>
        </div>
      )}

      {state.globalError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center justify-between">
          <span className="flex items-center gap-2">
            <AlertTriangle size={16} />
            {state.globalError}
          </span>
          <button
            onClick={() => actions.setGlobalError(null)}
            className="text-red-600 hover:text-red-800"
          >
            <XCircle size={16} />
          </button>
        </div>
      )}

      {/* ================================================================== */}
      {/* SECTION 1 — HEADER SUMMARY (READ ONLY) */}
      {/* ================================================================== */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
          <h2 className="text-lg font-semibold text-slate-800">
            Requisition Summary
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Overview of the requisition being reviewed
          </p>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
            {/* Requisition ID */}
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                Requisition ID
              </p>
              <p className="text-lg font-bold text-blue-600 font-mono">
                REQ-{requisition.req_id.toString().padStart(4, "0")}
              </p>
            </div>

            {/* Project Name */}
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                Project Name
              </p>
              <p className="text-base font-medium text-slate-800">
                {requisition.project_name || "—"}
              </p>
            </div>

            {/* Required By Date */}
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                Required By
              </p>
              <p className="text-base font-medium text-slate-800 flex items-center gap-1">
                <Calendar size={14} className="text-slate-400" />
                {formatDate(requisition.required_by_date)}
              </p>
            </div>

            {/* Total Estimated Budget */}
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                Total Estimated
              </p>
              <p className="text-lg font-bold text-slate-800">
                {formatCurrency(computed.totalEstimatedBudget)}
              </p>
            </div>

            {/* Total Approved Budget */}
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                Total Approved
              </p>
              <p className="text-lg font-bold text-green-600">
                {formatCurrency(computed.totalApprovedBudget)}
              </p>
            </div>

            {/* Current Status */}
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                Status
              </p>
              <StatusBadge status={requisition.overall_status} />
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* SECTION 2 — STEP A: FINANCIAL REVIEW (Per Item) */}
      {/* ================================================================== */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <DollarSign size={20} className="text-blue-500" />
              Step A — Financial Review
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Review and approve budget for each requisition item
            </p>
          </div>
          <button
            onClick={onRefresh}
            className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Refresh data"
          >
            <RefreshCw size={18} />
          </button>
        </div>

        <div className="p-6">
          {/* Progress Indicator */}
          <div className="mb-6 p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">
                Budget Approval Progress
              </span>
              <span className="text-sm font-semibold text-slate-800">
                {requisition.items.filter(
                  (i) => i.approved_budget !== null && i.approved_budget > 0
                ).length}{" "}
                / {requisition.items.length} items approved
              </span>
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-300"
                style={{
                  width: `${
                    requisition.items.length > 0
                      ? (requisition.items.filter(
                          (i) => i.approved_budget !== null && i.approved_budget > 0
                        ).length /
                          requisition.items.length) *
                        100
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>

          {/* Item Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {requisition.items.map(renderItemCard)}
          </div>

          {requisition.items.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              No items found in this requisition.
            </div>
          )}
        </div>
      </section>

      {/* ================================================================== */}
      {/* SECTION 3 — STEP B: BUDGET CLEARANCE */}
      {/* ================================================================== */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Shield size={20} className="text-amber-500" />
            Step B — Budget Clearance
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Confirm budget authorization
          </p>
        </div>

        <div className="p-6">
          <div className="max-w-md">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Budget Approved By <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400">
                <User size={16} />
              </span>
              <input
                type="text"
                value={state.validation.budgetApprovedBy}
                onChange={(e) => actions.setBudgetApprovedBy(e.target.value)}
                placeholder="Enter name of budget approver"
                disabled={!isPendingBudget}
                className={`w-full pl-10 pr-3 py-2 border rounded-lg text-sm transition-colors ${
                  state.validation.budgetApprovedByError
                    ? "border-red-400 focus:ring-red-500 focus:border-red-500 bg-red-50"
                    : "border-slate-300 focus:ring-blue-500 focus:border-blue-500"
                } disabled:bg-slate-100 disabled:cursor-not-allowed`}
              />
            </div>
            {state.validation.budgetApprovedByError && (
              <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                <AlertTriangle size={12} />
                {state.validation.budgetApprovedByError}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* SECTION 4 — STEP C: HR AUTHORIZATION */}
      {/* ================================================================== */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <User size={20} className="text-green-500" />
            Step C — HR Authorization
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Confirm HR approval authority
          </p>
        </div>

        <div className="p-6">
          <div className="max-w-md">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Approved By (HR) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400">
                <User size={16} />
              </span>
              <input
                type="text"
                value={state.validation.approvedBy}
                onChange={(e) => actions.setApprovedBy(e.target.value)}
                placeholder="Enter name of HR approver"
                disabled={!isPendingBudget}
                className={`w-full pl-10 pr-3 py-2 border rounded-lg text-sm transition-colors ${
                  state.validation.approvedByError
                    ? "border-red-400 focus:ring-red-500 focus:border-red-500 bg-red-50"
                    : "border-slate-300 focus:ring-blue-500 focus:border-blue-500"
                } disabled:bg-slate-100 disabled:cursor-not-allowed`}
              />
            </div>
            {state.validation.approvedByError && (
              <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                <AlertTriangle size={12} />
                {state.validation.approvedByError}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* SECTION 5 — WORKFLOW ACTION BAR */}
      {/* ================================================================== */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between">
            {/* Status Summary */}
            <div className="space-y-2">
              <h3 className="font-semibold text-slate-800">Ready to Approve?</h3>
              <ul className="text-sm space-y-1">
                <li
                  className={`flex items-center gap-2 ${
                    !computed.hasInvalidBudgets ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {!computed.hasInvalidBudgets ? (
                    <CheckCircle size={14} />
                  ) : (
                    <XCircle size={14} />
                  )}
                  All item budgets valid (&gt; 0)
                </li>
                <li
                  className={`flex items-center gap-2 ${
                    !computed.hasUnsavedChanges ? "text-green-600" : "text-amber-600"
                  }`}
                >
                  {!computed.hasUnsavedChanges ? (
                    <CheckCircle size={14} />
                  ) : (
                    <AlertTriangle size={14} />
                  )}
                  {!computed.hasUnsavedChanges
                    ? "No unsaved changes"
                    : `${computed.dirtyItemIds.length} unsaved item(s)`}
                </li>
                <li
                  className={`flex items-center gap-2 ${
                    state.validation.budgetApprovedBy ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {state.validation.budgetApprovedBy ? (
                    <CheckCircle size={14} />
                  ) : (
                    <XCircle size={14} />
                  )}
                  Budget approver specified
                </li>
                <li
                  className={`flex items-center gap-2 ${
                    state.validation.approvedBy ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {state.validation.approvedBy ? (
                    <CheckCircle size={14} />
                  ) : (
                    <XCircle size={14} />
                  )}
                  HR approver specified
                </li>
              </ul>
            </div>

            {/* Action Button */}
            <div>
              <button
                onClick={handleAuthorizeAndApprove}
                disabled={!computed.canApprove || state.isSubmitting}
                className={`px-8 py-3 text-base font-semibold rounded-xl flex items-center gap-3 transition-all ${
                  computed.canApprove && !state.isSubmitting
                    ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 shadow-lg shadow-green-200"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed"
                }`}
              >
                {state.isSubmitting ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CheckCircle size={20} />
                    Authorize & Approve
                  </>
                )}
              </button>

              {!computed.canApprove && !state.isSubmitting && (
                <p className="mt-2 text-xs text-slate-500 text-right">
                  Complete all requirements above
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HRGatekeeperPanel;
