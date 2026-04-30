"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarClock, LayoutDashboard, Menu, X } from "lucide-react";

import { useAuth } from "@/contexts/useAuth";
import Header from "@/components/Header";
import InterviewerHeader from "@/components/interviewer/InterviewerHeader";
import PageShell from "@/components/common/PageShell";
import "@/styles/hr/hr-dashboard.css";
import "@/styles/manager/manager-dashboard.css";

const viewLabels: Record<string, string> = {
  dashboard: "Dashboard",
  interviews: "Interviews",
};

function InterviewerSidebar({
  collapsed,
  onToggleCollapse,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const pathname = usePathname() || "";
  const items: { href: string; label: string; icon: React.ReactNode; end?: boolean }[] = [
    {
      href: "/interviewer/dashboard",
      label: "Dashboard",
      icon: <LayoutDashboard size={20} />,
      end: true,
    },
    {
      href: "/interviewer/interviews",
      label: "Interviews",
      icon: <CalendarClock size={20} />,
    },
  ];

  const isActive = (href: string, end?: boolean) => {
    if (end) {
      return pathname === href || pathname === `${href}/`;
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <aside className={`admin-sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-header">
        {!collapsed && (
          <div className="sidebar-brand">
            <LayoutDashboard size={24} className="brand-icon" />
            <span className="brand-text">Interviewer</span>
          </div>
        )}
        <button type="button" className="sidebar-toggle" onClick={onToggleCollapse}>
          {collapsed ? <Menu size={20} /> : <X size={20} color="white" />}
        </button>
      </div>

      <nav className="sidebar-nav">
        <ul>
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`nav-item ${isActive(item.href, item.end) ? "active" : ""}`}
                title={collapsed ? item.label : ""}
              >
                <span className="nav-icon">{item.icon}</span>
                {!collapsed && <span className="nav-label">{item.label}</span>}
                {!collapsed && <span className="active-indicator" />}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

export default function InterviewerShell({ children }: { children: React.ReactNode }) {
  const { user, logout, isHydrating, isAuthenticated } = useAuth();
  const pathname = usePathname() || "";
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  const isInterviewer = useMemo(
    () => (user?.roles ?? []).some((r) => r.toLowerCase() === "interviewer"),
    [user?.roles],
  );

  const activeLabel = useMemo(() => {
    if (pathname.startsWith("/interviewer/interviews")) {
      return viewLabels.interviews!;
    }
    return viewLabels.dashboard!;
  }, [pathname]);

  useEffect(() => {
    if (isHydrating) return;
    if (!isAuthenticated) {
      router.replace("/login");
    }
  }, [isHydrating, isAuthenticated, router]);

  useEffect(() => {
    if (!user || isHydrating) return;
    if (!isInterviewer) {
      router.replace("/unauthorized");
    }
  }, [isInterviewer, router, user, isHydrating]);

  if (isHydrating) {
    return (
      <div style={{ padding: "48px 24px", textAlign: "center", color: "#6b7280" }}>
        Restoring session…
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  if (!isInterviewer) {
    return null;
  }

  return (
    <PageShell maxWidth="none">
      <div className={`admin-dashboard ${collapsed ? "sidebar-collapsed" : ""}`}>
        <InterviewerSidebar
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((p) => !p)}
        />

        <div className={`admin-main-content ${collapsed ? "sidebar-collapsed" : ""}`}>
          <Header />
          <InterviewerHeader
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
