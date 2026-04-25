"use client";

import React, { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/contexts/useAuth";
import Header from "@/components/Header";
import TAHeader from "@/components/ta/TAHeader";
import TASidebar from "@/components/ta/TASidebar";
import TADashboardHome from "@/components/ta/TADashboardHome";
import "@/styles/hr/hr-dashboard.css";
import PageShell from "@/components/common/PageShell";

const viewLabels: Record<string, string> = {
  dashboard: "Dashboard",
  requisitions: "Requisitions",
  "my-requisitions": "My Requisitions",
  "requisition-detail": "Requisition Detail",
  interviews: "Interviews",
  "resource-pool": "Resource Pool",
  reports: "Reports",
  "audit-logs": "Audit Logs",
};

export default function TaShell({ children }: { children: React.ReactNode }) {
  const { user, logout, isHydrating, isAuthenticated } = useAuth();
  const pathname = usePathname() || "";
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  const hasTaAccess = useMemo(() => {
    const roles = (user?.roles || []).map((r) => r.toLowerCase());
    return roles.includes("ta");
  }, [user?.roles]);

  const activeLabel = useMemo(() => {
    if (pathname.startsWith("/ta/requisitions/")) {
      return viewLabels["requisition-detail"]!;
    }
    if (pathname.startsWith("/ta/interviews")) {
      return viewLabels["interviews"]!;
    }
    if (pathname.startsWith("/ta/requisitions")) {
      return viewLabels["requisitions"]!;
    }
    if (pathname.startsWith("/ta/my-requisitions")) {
      return viewLabels["my-requisitions"]!;
    }
    if (pathname.startsWith("/ta/resource-pool")) {
      return viewLabels["resource-pool"]!;
    }
    if (pathname.startsWith("/ta/reports")) {
      return viewLabels["reports"]!;
    }
    if (pathname.startsWith("/ta/audit-logs")) {
      return viewLabels["audit-logs"]!;
    }
    return viewLabels["dashboard"]!;
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
    if (!hasTaAccess) {
      router.replace("/unauthorized");
    }
  }, [hasTaAccess, isHydrating, router, user]);

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

  if (!hasTaAccess) {
    return null;
  }

  const isHome = pathname === "/ta" || pathname === "/ta/";

  return (
    <PageShell maxWidth="none">
      <div className={`admin-dashboard ${collapsed ? "sidebar-collapsed" : ""}`}>
        <TASidebar
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((prev) => !prev)}
        />

        <div
          className={`admin-main-content ${collapsed ? "sidebar-collapsed" : ""}`}
        >
          <Header />

          <TAHeader
            title={activeLabel}
            user={user}
            onLogout={() => {
              logout();
              router.replace("/login");
            }}
          />

          <section className="admin-content-area">
            {isHome ? <TADashboardHome /> : children}
          </section>
        </div>
      </div>
    </PageShell>
  );
}
