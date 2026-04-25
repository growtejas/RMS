"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield, Database, Users, FileText, UserCheck, Menu, X } from "lucide-react";

interface AdminSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** HR-only access: show Master Data link only. */
  masterDataOnly?: boolean;
}

const AdminSidebar: React.FC<AdminSidebarProps> = ({
  collapsed,
  onToggleCollapse,
  masterDataOnly = false,
}) => {
  const pathname = usePathname() || "";

  const allMenuItems: {
    href: string;
    label: string;
    icon: React.ReactNode;
    end?: boolean;
  }[] = [
    { href: "/admin", label: "Overview", icon: <Shield size={20} />, end: true },
    {
      href: "/admin/access-requests",
      label: "Access requests",
      icon: <UserCheck size={20} />,
    },
    {
      href: "/admin/master-data",
      label: "Master Data",
      icon: <Database size={20} />,
    },
    {
      href: "/admin/audit-logs",
      label: "Audit Logs",
      icon: <FileText size={20} />,
    },
    {
      href: "/admin/users",
      label: "User Management",
      icon: <Users size={20} />,
    },
  ];

  const menuItems = masterDataOnly
    ? allMenuItems.filter((item) => item.href === "/admin/master-data")
    : allMenuItems;

  const isActive = (href: string, end?: boolean) => {
    if (end) {
      return pathname === href || pathname === `${href}/`;
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <aside
      className={`admin-sidebar ${collapsed ? "collapsed" : ""}`}
      aria-label="Admin dashboard navigation"
    >
      <div className="sidebar-header">
        {!collapsed && (
          <div className="sidebar-brand">
            <Shield size={24} className="brand-icon" />
            <span className="brand-text">Admin</span>
          </div>
        )}
        <button
          type="button"
          className="sidebar-toggle"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
        >
          {collapsed ? <Menu size={20} /> : <X size={20} color="white" />}
        </button>
      </div>

      <nav className="sidebar-nav" aria-label="Main menu">
        <ul role="list">
          {menuItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`nav-item ${isActive(item.href, item.end) ? "active" : ""}`}
                title={collapsed ? item.label : undefined}
              >
                <span className="nav-icon" aria-hidden>
                  {item.icon}
                </span>
                {!collapsed && (
                  <span className="nav-label">{item.label}</span>
                )}
                {!collapsed && <span className="active-indicator" aria-hidden />}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
};

export default AdminSidebar;
