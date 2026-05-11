"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

import {
  ALL_ANALYTICS_SECTIONS,
  HiringIntelligenceContent,
  type AnalyticsSection,
} from "@/components/analytics/HiringIntelligenceContent";
import { Button } from "@/components/ui/Button";

const TABS: Array<{ id: string; label: string; sections: AnalyticsSection[] }> = [
  { id: "overview", label: "Overview", sections: ALL_ANALYTICS_SECTIONS },
  { id: "pipeline", label: "Pipeline", sections: ["header", "filters", "kpis", "candidateFunnel", "aiInsights"] },
  { id: "interviews", label: "Interviews", sections: ["header", "filters", "interviewFunnel", "interviewers"] },
  { id: "sources", label: "Sources", sections: ["header", "filters", "sources"] },
  { id: "recruiters", label: "Recruiters", sections: ["header", "filters", "recruiters", "tables"] },
  { id: "time", label: "Time Analytics", sections: ["header", "filters", "timeToHire"] },
  { id: "offers", label: "Offers", sections: ["header", "filters", "kpis"] },
];

export interface RequisitionReportsProps {
  requisitionId: number;
  requisitionLabel?: string;
}

/**
 * Requisition-scoped reports view (Track 2.3).
 *
 * Reuses the same `HiringIntelligenceContent` engine as the org-wide
 * report by passing `scope: { kind: "requisition", requisitionId }`.
 * Tab state lives in the URL `tab` param so deep-linking works.
 */
export function RequisitionReports(props: RequisitionReportsProps) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const activeTabId = params.get("tab") ?? "overview";
  const activeTab = TABS.find((t) => t.id === activeTabId) ?? TABS[0];

  const handleTabClick = (tabId: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("tab", tabId);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const subtitle = useMemo(
    () =>
      props.requisitionLabel
        ? `Analytics scoped to ${props.requisitionLabel}`
        : `Analytics scoped to requisition #${props.requisitionId}`,
    [props.requisitionLabel, props.requisitionId],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-text">Requisition Reports</h1>
        <div className="flex items-center gap-2">
          <Link href={`/ta/requisitions/${props.requisitionId}`}>
            <Button variant="secondary">Back to Requisition</Button>
          </Link>
          <Link href="/ta/reports/hiring-intelligence">
            <Button variant="secondary">Org-wide Report</Button>
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border" role="tablist" aria-label="Requisition report sections">
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => handleTabClick(tab.id)}
              className={`px-3 py-2 text-sm font-medium ${
                isActive
                  ? "border-b-2 border-indigo-500 text-text"
                  : "text-text-muted hover:text-text"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <HiringIntelligenceContent
        scope={{ kind: "requisition", requisitionId: props.requisitionId }}
        title="Requisition Hiring Intelligence"
        subtitle={subtitle}
        sections={activeTab.sections}
      />
    </div>
  );
}
