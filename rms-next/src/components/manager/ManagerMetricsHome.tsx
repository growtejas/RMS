"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Clock, TrendingUp } from "lucide-react";

import { getStatusLabel } from "@/types/workflow";
import { managerDashboardService } from "@/lib/api/managerDashboardService";
import type { ManagerDashboardMetrics } from "@/types/managerDashboard";
import { PageShell } from "@/components/common/PageShell";

export default function ManagerMetricsHome() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<ManagerDashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const loadMetrics = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await managerDashboardService.getMetrics(controller.signal);
        setMetrics(data);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "CanceledError") return;

        let message = "Failed to load manager metrics";
        const axiosErr = err as { response?: { data?: { detail?: unknown } } };
        const detail = axiosErr?.response?.data?.detail;

        if (Array.isArray(detail)) {
          message = detail
            .map(
              (item: Record<string, unknown>) =>
                (item?.msg as string) || JSON.stringify(item),
            )
            .filter(Boolean)
            .join("\n");
        } else if (typeof detail === "string") {
          message = detail;
        }

        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    loadMetrics();
    return () => controller.abort();
  }, []);

  const formattedMetrics = useMemo(() => {
    return [
      {
        label: "Total Requisitions",
        value: metrics?.total_requisitions ?? 0,
      },
      { label: getStatusLabel("Active"), value: metrics?.in_progress ?? 0 },
      { label: getStatusLabel("Pending_HR"), value: metrics?.open ?? 0 },
      { label: getStatusLabel("Fulfilled"), value: metrics?.closed ?? 0 },
      { label: "Pending Positions", value: metrics?.pending_positions ?? 0 },
    ];
  }, [metrics]);

  const isEmptyDashboard = useMemo(() => {
    if (!metrics) return false;
    return (
      metrics.total_requisitions === 0 &&
      metrics.pending_positions === 0 &&
      metrics.sla_risks.length === 0 &&
      metrics.pending_positions_alerts.length === 0
    );
  }, [metrics]);

  return (
    <PageShell maxWidth="7xl">
      {isLoading ? (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading manager metrics...</p>
        </div>
      ) : error ? (
        <div className="empty-state">
          <AlertTriangle size={32} />
          <p>{error}</p>
        </div>
      ) : isEmptyDashboard ? (
        <div className="empty-state">
          <Clock size={32} />
          <p>No requisition activity yet.</p>
        </div>
      ) : (
        <>
          <div className="admin-metrics">
            {formattedMetrics.map((metric) => (
              <div key={metric.label} className="stat-card">
                <span className="stat-number">{metric.value}</span>
                <span className="stat-label">{metric.label}</span>
              </div>
            ))}
          </div>

          <div className="audit-log-viewer" style={{ marginTop: "24px" }}>
            <div className="viewer-header">
              <h2>Alerts & Attention</h2>
              <p className="subtitle">Requisitions requiring review</p>
            </div>

            {metrics &&
            (metrics.sla_risks?.length ?? 0) === 0 &&
            (metrics.pending_positions_alerts?.length ?? 0) === 0 ? (
              <div className="empty-logs">No alerts at this time.</div>
            ) : (
              <div className="alert-row">
                {(metrics?.sla_risks ?? []).map((risk) => (
                  <div
                    key={`sla-${risk.requisition_id}`}
                    className="alert-card"
                    onClick={() =>
                      router.push(
                        `/manager/requisitions/${risk.requisition_id}`,
                      )
                    }
                  >
                    <div className="alert-card-left">
                      <AlertTriangle className="alert-icon--danger" size={18} />
                      <div>
                        <div className="alert-card-title">SLA Risk</div>
                        <div className="alert-card-detail">
                          REQ-{risk.requisition_id} open for {risk.days_open}{" "}
                          days
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="alert-card-action"
                      onClick={(event) => {
                        event.stopPropagation();
                        router.push(
                          `/manager/requisitions/${risk.requisition_id}`,
                        );
                      }}
                    >
                      Monitor
                    </button>
                  </div>
                ))}

                {(metrics?.pending_positions_alerts ?? []).map((alert) => (
                  <div
                    key={`pending-${alert.requisition_id}`}
                    className="alert-card"
                    onClick={() =>
                      router.push(
                        `/manager/requisitions/${alert.requisition_id}`,
                      )
                    }
                  >
                    <div className="alert-card-left">
                      <Clock className="alert-icon--warning" size={18} />
                      <div>
                        <div className="alert-card-title">
                          Pending Positions
                        </div>
                        <div className="alert-card-detail">
                          {alert.pending_count} positions pending in REQ-
                          {alert.requisition_id}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="alert-card-action"
                      onClick={(event) => {
                        event.stopPropagation();
                        router.push(
                          `/manager/requisitions/${alert.requisition_id}`,
                        );
                      }}
                    >
                      Monitor
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="insight-footer">
            <div className="insight-footer-inner">
              <TrendingUp size={18} />
              <div>
                <div className="insight-footer-title">Insight</div>
                <div className="insight-footer-text">
                  Most requisitions are progressing normally. SLA risks and
                  pending positions highlight items needing attention.
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}
