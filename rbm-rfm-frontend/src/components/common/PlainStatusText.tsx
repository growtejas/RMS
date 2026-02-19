import React from "react";
import {
  normalizeStatus,
  getStatusLabel,
  type RequisitionStatus,
} from "../../types/workflow";

export interface PlainStatusTextProps {
  /** Raw status string from backend or local state (e.g. "Pending_Budget"). */
  status: string;
  /** Optional extra class for typography/layout in tables or dashboards. */
  className?: string;
}

/**
 * PlainStatusText
 *
 * Renders workflow status as plain colored text only.
 * - No badges, buttons, borders, background color, or rounded shapes.
 * - Uses professional colors suitable for tables and dashboards.
 */
export const PlainStatusText: React.FC<PlainStatusTextProps> = ({
  status,
  className,
}) => {
  const normalized = normalizeStatus(status) as RequisitionStatus;
  const label = getStatusLabel(normalized);

  // Professional, accessible text colors per status
  const colorMap: Record<RequisitionStatus, string> = {
    Draft: "#4B5563", // gray-700
    Pending_Budget: "#2563EB", // blue-600
    Pending_HR: "#2563EB", // blue-600
    Active: "#1D4ED8", // blue-700
    Fulfilled: "#15803D", // green-700
    Rejected: "#B91C1C", // red-700
    Cancelled: "#B91C1C", // red-700
  };

  const color = colorMap[normalized] ?? "#374151"; // gray-700 fallback

  return (
    <span
      className={className}
      style={{
        // Plain colored text only — no backgrounds, borders, or rounded shapes
        color,
        fontWeight: 500,
        fontSize: "0.875rem", // 14px — good for tables and dashboards
      }}
    >
      {label}
    </span>
  );
};

export default PlainStatusText;

