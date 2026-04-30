"use client";

import React, { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/contexts/useAuth";
import AdminSidebar from "@/components/admin/AdminSidebar";
import Header from "@/components/Header";
import AdminHeader from "@/components/admin/AdminHeader";
import PageShell from "@/components/common/PageShell";
import HrPageLayout from "@/components/hr/HrPageLayout";
import "@/styles/hr/hr-dashboard.css";

export default function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, logout, isHydrating, isAuthenticated } = useAuth();
  const pathname = usePathname() || "";
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  const privilegedAdmin = Boolean(
    user?.roles?.some((role) => ["admin", "owner"].includes(role)),
  );
  const isHr = Boolean(user?.roles?.includes("hr"));
  /** HR can maintain reference data; other admin routes stay admin/owner-only. */
  const canAccessAdminShell = Boolean(privilegedAdmin || isHr);

  const title = useMemo(() => {
    if (pathname.startsWith("/admin/access-requests")) {
      return "Access requests";
    }
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

  useEffect(() => {
    if (isHydrating || !isAuthenticated || !user) {
      return;
    }
    if (privilegedAdmin) {
      return;
    }
    if (isHr && !pathname.startsWith("/admin/master-data")) {
      router.replace("/admin/master-data");
    }
  }, [isHydrating, isAuthenticated, user, privilegedAdmin, isHr, pathname, router]);

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

  if (!canAccessAdminShell) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-14">
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="text-lg font-bold text-text">Unauthorized</h2>
          <p className="mt-1 text-sm text-text-muted">
            You don&apos;t have permission to access the admin dashboard.
          </p>
        </div>
      </div>
    );
  }

  return (
    <PageShell maxWidth="none">
      <div
        className={`admin-dashboard ${collapsed ? "sidebar-collapsed" : ""}`}
      >
        <AdminSidebar
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((prev) => !prev)}
          masterDataOnly={Boolean(isHr && !privilegedAdmin)}
        />

        <div
          className={`admin-main-content ${collapsed ? "sidebar-collapsed" : ""}`}
        >
          <Header />

          <AdminHeader
            title={title}
            user={user}
            onLogout={() => {
              logout();
              router.replace("/login");
            }}
          />

          <section className="admin-content-area admin-content-area--top-start">
            <HrPageLayout maxWidthClass="max-w-none w-full">
              {children}
            </HrPageLayout>
          </section>
        </div>
      </div>
    </PageShell>
  );
}
