"use client";

import React from "react";
import {
  AlertCircle,
  Ban,
  CheckCircle,
  DollarSign,
  Download,
  Eye,
  Gift,
  Phone,
  RefreshCw,
  UserPlus,
} from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { AuditSection } from "@/components/audit";
import {
  ITEM_STATUS_LABELS,
  type RequisitionItemStatus,
} from "@/types/workflow";
import type { Candidate } from "@/lib/api/candidateApi";
import { ITEM_STATUS_ICONS } from "@/components/ta/requisition-detail/constants";
import type { RequisitionItem, TicketData } from "@/components/ta/requisition-detail/types";
import {
  formatItemBudget,
  parsePrimarySkill,
  parseSecondarySkills,
} from "@/components/ta/requisition-detail/utils";

export type ItemsTabProps = {
  readOnly: boolean;
  ticket: TicketData;
  canAssignResources: boolean;
  canEditItem: (item: RequisitionItem) => boolean;
  isHRUser: boolean;
  transitionError: string | null;
  setTransitionError: (v: string | null) => void;
  transitionSuccess: string | null;
  transitioningItem: string | null;
  handleItemTransition: (
    itemId: string,
    action: "shortlist" | "interview" | "offer" | "fulfill",
    employeeId?: string,
  ) => void | Promise<void>;
  selectedItemForAssignment: string | null;
  setSelectedItemForAssignment: (v: string | null) => void;
  candidatesByItemId: Map<number, Candidate[]>;
  resolveUserName: (userId?: number | null) => string;
  openJdViewerForItem: (numericItemId: number) => void;
  openCandidateModal: (
    c: Candidate,
    mode: "execute" | "evaluate",
  ) => void;
  setAddCandidateItemId: (id: number | null) => void;
  setShowAddCandidate: (v: boolean) => void;
  cancelModalItem: string | null;
  setCancelModalItem: (v: string | null) => void;
  cancelReason: string;
  setCancelReason: (v: string) => void;
  cancelError: string | null;
  setCancelError: (v: string | null) => void;
  cancelling: boolean;
  handleCancelItem: () => void | Promise<void>;
};

export function ItemsTab({
  readOnly,
  ticket,
  canAssignResources,
  canEditItem,
  isHRUser,
  transitionError,
  setTransitionError,
  transitionSuccess,
  transitioningItem,
  handleItemTransition,
  selectedItemForAssignment,
  setSelectedItemForAssignment,
  candidatesByItemId,
  resolveUserName,
  openJdViewerForItem,
  openCandidateModal,
  setAddCandidateItemId,
  setShowAddCandidate,
  cancelModalItem,
  setCancelModalItem,
  cancelReason,
  setCancelReason,
  cancelError,
  setCancelError,
  cancelling,
  handleCancelItem,
}: ItemsTabProps) {
  return (
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
                      {!readOnly && canEditItem(item) && (
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
                            key={
                              c.application_id != null
                                ? `app-${c.application_id}`
                                : `c-${c.candidate_id}-${c.requisition_item_id}`
                            }
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

  );
}
