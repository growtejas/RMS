"use client";

import { useMemo } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  type AnalyticsArrayFilterKey,
} from "@/lib/analytics/use-analytics-filters";

export interface AnalyticsFilterBarProps {
  searchInput: string;
  fromDate: string;
  toDate: string;
  pageLimit: number;
  arrays: Record<AnalyticsArrayFilterKey, string[]>;
  activeBadges: Array<{ key: string; label: string; clear: () => void }>;
  onSearchChange: (value: string) => void;
  onRangeStart: (value: string) => void;
  onRangeEnd: (value: string) => void;
  onLimitChange: (value: number) => void;
  onArrayInput: (key: AnalyticsArrayFilterKey, csv: string) => void;
  onResetAll: () => void;
  dropdownOptions?: Partial<
    Record<AnalyticsArrayFilterKey, Array<{ value: string; label: string }>>
  >;
  requisitionOnly?: boolean;
}

/**
 * Reusable filter bar shared by every analytics surface (org-wide and
 * requisition-scoped). Renders a date range, search box, page-size
 * selector, the canonical multi-select list, and active filter badges.
 */
export function AnalyticsFilterBar(props: AnalyticsFilterBarProps) {
  const {
    searchInput,
    fromDate,
    toDate,
    pageLimit,
    arrays,
    activeBadges,
    onSearchChange,
    onRangeStart,
    onRangeEnd,
    onLimitChange,
    onArrayInput,
    onResetAll,
    dropdownOptions,
    requisitionOnly,
  } = props;

  const arrayFields = useMemo(() => {
    const labels: Record<AnalyticsArrayFilterKey, string> = {
      requisitionIds: "Requisition",
      requisitionItemIds: "Requisition Item",
      department: "Department",
      recruiterIds: "Recruiter",
      hiringManagerIds: "Hiring Manager",
      source: "Source",
      pipelineStages: "Pipeline Stage",
      interviewStage: "Interview Stage",
      location: "Location",
      employmentType: "Employment Type",
    };
    const preferredOrder: AnalyticsArrayFilterKey[] = requisitionOnly
      ? ["requisitionIds"]
      : [
          "requisitionIds",
          "department",
          "source",
          "pipelineStages",
          "interviewStage",
          "recruiterIds",
          "location",
          "employmentType",
        ];
    return preferredOrder.map((key) => ({
      key,
      label: labels[key],
      value: arrays[key][0] ?? "",
      options: dropdownOptions?.[key] ?? [],
    }));
  }, [arrays, dropdownOptions, requisitionOnly]);

  if (requisitionOnly) {
    const reqField = arrayFields.find((f) => f.key === "requisitionIds");
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-surface px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between">
          <label htmlFor="hiring-intel-requisition-filter" className="text-sm font-semibold text-text">
            Requisition
          </label>
          {activeBadges.length > 0 ? (
            <button
              type="button"
              onClick={onResetAll}
              className="text-xs font-medium text-text-muted hover:text-text"
            >
              Clear
            </button>
          ) : null}
        </div>
        <Select
          id="hiring-intel-requisition-filter"
          value={reqField?.value ?? ""}
          onChange={(e) => onArrayInput("requisitionIds", e.target.value ? e.target.value : "")}
          aria-label="Requisition"
          className="max-w-xl"
        >
          <option value="">Select requisition</option>
          {(reqField?.options ?? []).map((opt) => (
            <option key={`requisitionIds-${opt.value}`} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </div>
    );
  }

  return (
    <Card className="sticky top-[88px] z-10">
      <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex-1">
          <CardTitle>Global Filters</CardTitle>
          <p className="mt-1 text-xs text-text-muted">
            {activeBadges.length} active filter{activeBadges.length === 1 ? "" : "s"}
          </p>
          {activeBadges.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {activeBadges.map((badge) => (
                <button
                  key={badge.key}
                  type="button"
                  onClick={badge.clear}
                  className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs text-text-muted hover:bg-surface"
                >
                  {badge.label} <span aria-hidden>×</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="grid flex-[3] gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {!requisitionOnly ? (
            <>
              <Input
                value={searchInput}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search candidates..."
                aria-label="Search"
              />
              <Input
                type="date"
                value={fromDate.slice(0, 10)}
                onChange={(e) => onRangeStart(e.target.value)}
                aria-label="From date"
              />
              <Input
                type="date"
                value={toDate.slice(0, 10)}
                onChange={(e) => onRangeEnd(e.target.value)}
                aria-label="To date"
              />
              <Select
                value={String(pageLimit)}
                onChange={(e) => onLimitChange(Number.parseInt(e.target.value, 10) || 25)}
                aria-label="Page size"
              >
                <option value="25">25 rows</option>
                <option value="50">50 rows</option>
                <option value="100">100 rows</option>
              </Select>
            </>
          ) : null}
          {arrayFields.map(({ key, label, value, options }) => (
            <Select
              key={key}
              value={value}
              onChange={(e) => onArrayInput(key, e.target.value ? e.target.value : "")}
              aria-label={key}
            >
              <option value="">All {label}</option>
              {options.map((opt) => (
                <option key={`${key}-${opt.value}`} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          ))}
        </div>
        <Button variant="secondary" onClick={onResetAll}>
          Reset
        </Button>
      </CardHeader>
    </Card>
  );
}
