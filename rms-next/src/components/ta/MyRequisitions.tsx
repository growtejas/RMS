import React, { useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { useAuth } from "@/contexts/useAuth";
import { PlainStatusText } from "@/components/common/PlainStatusText";
import { PlainPriorityText } from "@/components/common/PlainPriorityText";
import { Table, TBody, THead, TH, TR } from "@/components/ui/Table";

/* ======================================================
   Types
   ====================================================== */

interface MyRequisition {
  id: string;
  project: string;
  role: string;
  status: string;
  priority: string;
  slaDaysRemaining: number;
}

interface BackendRequisitionItem {
  item_id: number;
  role_position: string;
  item_status: string;
}

interface BackendRequisition {
  req_id: number;
  project_name?: string | null;
  overall_status: string;
  priority?: string | null;
  created_at?: string | null;
  assigned_ta?: number | null;
  items: BackendRequisitionItem[];
}

const SLA_HOURS = 72;

/* ======================================================
   Props
   ====================================================== */

interface MyRequisitionsProps {
  onViewRequisition?: (reqId: string) => void;
}

/* ======================================================
   Helpers
   ====================================================== */

const getSlaPillClasses = (days: number) => {
  if (days <= 3) {
    return "border-red-200 bg-red-50 text-red-800";
  }
  if (days <= 7) {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  return "border-border bg-bg text-text-muted";
};

const getSlaDaysRemaining = (dateValue?: string | null): number => {
  if (!dateValue || String(dateValue).trim() === "") return 0;
  const created = new Date(dateValue);
  if (Number.isNaN(created.getTime())) return 0;
  const diffMs = Date.now() - created.getTime();
  const diffHours = Math.max(0, diffMs / 3600000);
  return Math.ceil((SLA_HOURS - diffHours) / 24);
};

/* ======================================================
   Component
   ====================================================== */

const MyRequisitions: React.FC<MyRequisitionsProps> = ({
  onViewRequisition,
}) => {
  const { user } = useAuth();
  const currentUserId = user?.user_id ?? null;
  const [requisitions, setRequisitions] = useState<MyRequisition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(20);

  useEffect(() => {
    let isMounted = true;

    const fetchRequisitions = async (cacheBust = false) => {
      try {
        setIsLoading(true);
        setError(null);
        const path = cacheBust
          ? `/requisitions?assigned_to=me&_t=${Date.now()}`
          : `/requisitions?assigned_to=me`;
        const response = await apiClient.get<BackendRequisition[]>(path);
        if (!isMounted) return;
        // Phase 7: Backend already filters by item-level assigned_ta,
        // so no need to filter by header-level assigned_ta here
        const mapped = (response.data ?? []).map((req) => {
          const primaryRole = req.items?.[0]?.role_position ?? "—";
          return {
            id: `REQ-${req.req_id}`,
            project: req.project_name ?? "—",
            role: primaryRole,
            status: req.overall_status ?? "—",
            priority: req.priority ?? "—",
            slaDaysRemaining: Math.max(
              0,
              getSlaDaysRemaining(req.created_at),
            ),
          };
        });
        setRequisitions(mapped);
        setVisibleCount(20);
      } catch (err) {
        if (!isMounted) return;
        const message =
          err instanceof Error ? err.message : "Failed to load requisitions";
        setError(message);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchRequisitions();
    
    // Phase 7: Listen for TA reassignment events to refresh the list
    const handleReassignment = () => {
      void fetchRequisitions(true);
    };
    
    window.addEventListener("requisition-reassigned", handleReassignment);

    return () => {
      isMounted = false;
      window.removeEventListener("requisition-reassigned", handleReassignment);
    };
  }, [currentUserId]);

  const visibleRequisitions = useMemo(() => requisitions, [requisitions]);

  return (
    <>
      {/* Header */}
      <div className="manager-header">
        <h2>My Requisitions</h2>
        <p className="subtitle">Requisitions assigned to you</p>
      </div>

      {/* Same table shell as TA /ta/requisitions (Requisitions.tsx) */}
      <div className="ticket-table-container">
        <Table className="[&_th]:py-3.5 [&_td]:py-4 [&_td]:align-middle [&_tbody_tr:hover]:bg-slate-50/70">
          <THead>
            <TR>
              <TH className="w-[1%] whitespace-nowrap text-center">Req ID</TH>
              <TH>Project</TH>
              <TH>Role</TH>
              <TH>Status</TH>
              <TH>Priority</TH>
              <TH>SLA</TH>
              <TH className="text-right">Action</TH>
            </TR>
          </THead>

          <TBody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-8">
                  <div className="tickets-empty-state text-sm text-text-muted">
                    Loading requisitions…
                  </div>
                </td>
              </tr>
            )}

            {!isLoading && error && (
              <tr>
                <td colSpan={7} className="px-4 py-8">
                  <div
                    className="tickets-empty-state text-sm text-red-700"
                  >
                    {error}
                  </div>
                </td>
              </tr>
            )}

            {!isLoading &&
              !error &&
              visibleRequisitions.slice(0, visibleCount).map((req) => (
                <tr key={req.id}>
                  <td className="text-center whitespace-nowrap">
                    <strong className="font-mono text-sm font-semibold tabular-nums text-text">
                      {req.id}
                    </strong>
                  </td>

                  <td className="max-w-[200px]">
                    <span className="line-clamp-2 text-text">{req.project}</span>
                  </td>

                  <td className="max-w-[260px]">
                    <span className="line-clamp-2 text-sm text-text">
                      {req.role}
                    </span>
                  </td>

                  <td>
                    <PlainStatusText status={req.status} />
                  </td>

                  <td>
                    <PlainPriorityText priority={req.priority} />
                  </td>

                  <td>
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getSlaPillClasses(req.slaDaysRemaining)}`}
                    >
                      {req.slaDaysRemaining} days left
                    </span>
                  </td>

                  <td className="text-right">
                    <button
                      type="button"
                      className="action-button primary inline-flex items-center justify-center text-xs font-semibold"
                      onClick={() => onViewRequisition?.(req.id)}
                    >
                      Continue Work
                    </button>
                  </td>
                </tr>
              ))}

            {!isLoading &&
              !error &&
              visibleRequisitions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10">
                    <div className="tickets-empty-state text-sm text-text-muted">
                      No requisitions assigned to you
                    </div>
                  </td>
                </tr>
              )}
          </TBody>
        </Table>
      </div>

      {!isLoading && !error && visibleRequisitions.length > visibleCount && (
        <div
          style={{
            marginTop: "16px",
            display: "flex",
            justifyContent: "center",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <button
            type="button"
            className="action-button"
            onClick={() => setVisibleCount((prev) => prev + 20)}
          >
            Load more requisitions
          </button>
          <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
            Showing {visibleCount} of {visibleRequisitions.length} requisitions
          </span>
        </div>
      )}

      {!isLoading && !error && visibleRequisitions.length > 0 && visibleRequisitions.length <= visibleCount && (
        <div
          style={{
            marginTop: "12px",
            fontSize: "12px",
            color: "var(--text-tertiary)",
            textAlign: "center",
          }}
        >
          Showing all {visibleRequisitions.length} requisitions
        </div>
      )}
    </>
  );
};

export default MyRequisitions;
