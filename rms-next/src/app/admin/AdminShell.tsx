"use client";

import React, { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/contexts/useAuth";
import AdminSidebar from "@/components/admin/AdminSidebar";
import Header from "@/components/Header";
import AdminHeader from "@/components/admin/AdminHeader";
import "@/styles/legacy/Dashboard.css";

export default function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isHydrating, isAuthenticated } = useAuth();
  const pathname = usePathname() || "";
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const hasAdminAccess = user?.roles?.some((role) =>
    ["admin", "owner"].includes(role),
  );

  const title = useMemo(() => {
    if (pathname.startsWith("/admin/master-data")) {
      return "Master Data Management";
    }
    if (pathname.startsWith("/admin/audit-logs")) {
      return "Audit Log Review";
    }
    if (pathname.startsWith("/admin/users")) {
      return "User Management";
    }
    return "System Overview";
  }, [pathname]);

  useEffect(() => {
    if (isHydrating) {
      return;
    }
    if (!isAuthenticated) {
      router.replace("/login");
    }
  }, [isHydrating, isAuthenticated, router]);

  if (isHydrating) {
    return (
      <div
        style={{
          padding: "48px 24px",
          textAlign: "center",
          color: "#6b7280",
        }}
      >
        Restoring session…
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (!hasAdminAccess) {
    return (
      <div className="unauthorized-access">
        <h2>Unauthorized Access</h2>
        <p>You don&apos;t have permission to access the admin dashboard.</p>
      </div>
    );
  }

  return (
    <div
      className={`admin-dashboard ${
        sidebarCollapsed ? "sidebar-collapsed" : ""
      }`}
    >
      <AdminSidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
      />

      <div
        className={`admin-main-content ${
          sidebarCollapsed ? "sidebar-collapsed" : ""
        }`}
      >
        <Header />

        <AdminHeader
          title={title}
          user={user}
          onLogout={() => {}}
          showUser={false}
        />

        <div className="admin-content-area admin-content-area--gradient-panels">
          {children}
        </div>
      </div>
    </div>
  );
}
