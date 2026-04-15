"use client";

import React from "react";

export type PriorityLevel = "High" | "Medium" | "Low" | string;

export interface PlainPriorityTextProps {
  /** Priority value, e.g. "High" | "Medium" | "Low". */
  priority: PriorityLevel;
  /** Optional extra class for typography/layout in tables or dashboards. */
  className?: string;
}

/**
 * PlainPriorityText
 *
 * Renders priority as plain colored text only.
 * - No badges, buttons, borders, background color, or rounded shapes.
 * - Uses professional colors suitable for tables and dashboards.
 */
export const PlainPriorityText: React.FC<PlainPriorityTextProps> = ({
  priority,
  className,
}) => {
  const normalized = (priority || "").toString().trim();

  const colorMap: Record<string, string> = {
    High: "#B91C1C", // red-700
    Medium: "#92400E", // amber-800
    Low: "#1D4ED8", // blue-700
  };

  const color = colorMap[normalized] ?? "#4B5563"; // gray-700 fallback

  return (
    <span
      className={className}
      style={{
        color,
        fontWeight: 500,
        fontSize: "0.875rem", // 14px — good for tables/dashboards
      }}
    >
      {normalized || "—"}
    </span>
  );
};

export default PlainPriorityText;

