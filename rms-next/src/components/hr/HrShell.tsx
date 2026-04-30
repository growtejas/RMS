"use client";

import React, { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/contexts/useAuth";
import Header from "@/components/Header";
import HrHeader from "@/components/hr/HRHeader";
import HrSidebar from "@/components/hr/HRSidebar";
import "@/styles/hr/hr-dashboard.css";
import PageShell from "@/components/common/PageShell";

export default function HrShell({ children }: { children: React.ReactNode }) {
  const { user, logout, isHydrating, isAuthenticated } = useAuth();
  const pathname = usePathname() || "";
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  const hasHrAccess = useMemo(() => {
    const roles = (user?.roles || []).map((r) => r.toLowerCase());
    return roles.includes("hr") || roles.includes("admin");
  }, [user?.roles]);

  const activeLabel = useMemo(() => {
    if (pathname.startsWith("/hr/create-employee")) {
      return "Create Employee";
    }
    if (pathname.startsWith("/hr/employee-profile")) {
      return "Employee Profile";
    }
    if (pathname.startsWith("/hr/employees")) {
      return "Employees";
    }
    if (pathname.startsWith("/hr/requisitions/")) {
      return "Requisition Details";
    }
    if (pathname.startsWith("/hr/requisitions")) {
      return "Requisitions";
    }
    if (pathname.startsWith("/hr/skills")) {
      return "Skills";
    }
    return "Dashboard";
  }, [pathname]);

  useEffect(() => {
    if (isHydrating) {
      return;
    }
    if (!isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isHydrating, router]);

  useEffect(() => {
    if (!user || isHydrating) {
      return;
    }
    if (!hasHrAccess) {
      router.replace("/unauthorized");
    }
  }, [hasHrAccess, isHydrating, router, user]);

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

  if (!isAuthenticated || !user) {
    return null;
  }

  if (!hasHrAccess) {
    return null;
  }

  return (
    <PageShell maxWidth="none">
      <div className={`admin-dashboard ${collapsed ? "sidebar-collapsed" : ""}`}>
        <HrSidebar
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((prev) => !prev)}
        />

        <div
          className={`admin-main-content ${collapsed ? "sidebar-collapsed" : ""}`}
        >
          <Header />

          <HrHeader
            title={activeLabel}
            user={user}
            onLogout={() => {
              logout();
              router.replace("/login");
            }}
          />

          <section className="admin-content-area">{children}</section>
        </div>
      </div>
    </PageShell>
  );
}
