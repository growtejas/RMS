import React from "react";

interface PageShellProps {
  /** Optional: constrain inner width; when false, content can be full-width. */
  maxWidth?: "6xl" | "7xl" | "none";
  /** Page body content (including any page-specific headers). */
  children: React.ReactNode;
}

/**
 * PageShell
 *
 * Shared full-page layout wrapper used across the app.
 * - Applies the gradient background used on the Manager "Create New Requisition" page.
 * - Provides consistent vertical padding and responsive horizontal spacing.
 * - Optionally constrains inner content width.
 */
export const PageShell: React.FC<PageShellProps> = ({
  maxWidth = "6xl",
  children,
}) => {
  const maxWidthClass =
    maxWidth === "none"
      ? ""
      : maxWidth === "7xl"
        ? "max-w-7xl"
        : "max-w-6xl";

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className={`${maxWidthClass} mx-auto`}>{children}</div>
    </div>
  );
};

export default PageShell;

