"use client";

import React, { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/contexts/useAuth";
import Header from "@/components/Header";
import ManagerHeader from "@/components/manager/ManagerHeader";
import ManagerSidebar from "@/components/manager/ManagerSidebar";
import "@/styles/hr/hr-dashboard.css";
import "@/styles/manager/manager-dashboard.css";

const viewLabels: Record<string, string> = {
  "manager-dashboard": "Dashboard",
  "raise-requisition": "Raise Requisition",
  "my-requisitions": "My Requisitions",
  "requisition-audit": "Requisition Audit",
};

export default function ManagerShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, logout, isHydrating, isAuthenticated } = useAuth();
  const pathname = usePathname() || "";
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  const isManager = useMemo(
    () => (user?.roles || []).map((r) => r.toLowerCase()).includes("manager"),
    [user?.roles],
  );

  const activeLabel = useMemo(() => {
    const path = pathname;
    if (path.startsWith("/manager/raise-requisition")) {
      return viewLabels["raise-requisition"]!;
    }
    if (path.startsWith("/manager/my-requisitions")) {
      return viewLabels["my-requisitions"]!;
    }
    if (path.startsWith("/manager/requisition-audit")) {
      return viewLabels["requisition-audit"]!;
    }
    return viewLabels["manager-dashboard"]!;
  }, [pathname]);

  useEffect(() => {
    if (isHydrating) {
      return;
    }
    if (!isAuthenticated) {
      router.replace("/login");
    }
  }, [isHydrating, isAuthenticated, router]);

  useEffect(() => {
    if (!user || isHydrating) {
      return;
    }
    if (!isManager) {
      router.replace("/unauthorized");
    }
  }, [isManager, router, user, isHydrating]);

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

  if (!isManager) {
    return null;
  }

  return (
    <div className={`admin-dashboard ${collapsed ? "sidebar-collapsed" : ""}`}>
      <ManagerSidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((prev) => !prev)}
      />

      <div
        className={`admin-main-content ${collapsed ? "sidebar-collapsed" : ""}`}
      >
        <Header />
        <ManagerHeader
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
  );
}
