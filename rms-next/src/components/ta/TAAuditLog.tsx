"use client";

import React from "react";

import AuditLogViewer from "@/components/admin/AuditLogViewer";

/**
 * Thin TA-facing wrapper around the canonical AuditLogViewer.
 * The previous implementation rendered hard-coded mock data; the canonical
 * audit pipeline is now wired through `/api/audit-logs` (paginated envelope)
 * so the same component is reused across Admin/HR/Manager/TA surfaces.
 */
const TAAuditLog: React.FC = () => {
  return <AuditLogViewer />;
};

export default TAAuditLog;
