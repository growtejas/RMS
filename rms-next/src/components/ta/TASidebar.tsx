"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  ClipboardList,
  Users,
  BarChart3,
  History,
  Menu,
  X,
  Calendar,
} from "lucide-react";

interface TASidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const TASidebar: React.FC<TASidebarProps> = ({
  collapsed,
  onToggleCollapse,
}) => {
  const pathname = usePathname() || "";

  const menuItems: {
    href: string;
    label: string;
    icon: React.ReactNode;
    end?: boolean;
  }[] = [
    {
      href: "/ta",
      label: "Dashboard",
      icon: <LayoutDashboard size={20} />,
      end: true,
    },
    {
      href: "/ta/requisitions",
      label: "Requisitions",
      icon: <FileText size={20} />,
    },
    {
      href: "/ta/my-requisitions",
      label: "My Requisitions",
      icon: <ClipboardList size={20} />,
    },
    {
      href: "/ta/interviews",
      label: "Interviews",
      icon: <Calendar size={20} />,
    },
    {
      href: "/ta/candidates",
      label: "Candidates (Global)",
      icon: <Users size={20} />,
    },
    {
      href: "/ta/resource-pool",
      label: "Resource Pool",
      icon: <Users size={20} />,
    },
    {
      href: "/ta/reports",
      label: "Reports",
      icon: <BarChart3 size={20} />,
    },
    {
      href: "/ta/audit-logs",
      label: "Audit logs",
      icon: <History size={20} />,
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
            <span className="brand-text">TA Dashboard</span>
          </div>
        )}
        <button type="button" className="sidebar-toggle" onClick={onToggleCollapse}>
          {collapsed ? <Menu size={20} /> : <X size={20} color="white" />}
        </button>
      </div>

      <nav className="sidebar-nav">
        <ul>
          {menuItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`nav-item ${isActive(item.href, item.end) ? "active" : ""}`}
                title={collapsed ? item.label : ""}
              >
                <span className="nav-icon">{item.icon}</span>
                {!collapsed && <span className="nav-label">{item.label}</span>}
                {!collapsed && <span className="active-indicator"></span>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
};

export default TASidebar;
