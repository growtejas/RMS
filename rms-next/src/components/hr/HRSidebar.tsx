"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  UserPlus,
  UserCircle,
  Users,
  Award,
  FileText,
  Menu,
  X,
} from "lucide-react";

interface HrSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const HrSidebar: React.FC<HrSidebarProps> = ({
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
      href: "/hr",
      label: "Dashboard",
      icon: <LayoutDashboard size={20} />,
      end: true,
    },
    {
      href: "/hr/create-employee",
      label: "Create Employee",
      icon: <UserPlus size={20} />,
    },
    {
      href: "/hr/employee-profile",
      label: "Employee Profile",
      icon: <UserCircle size={20} />,
    },
    {
      href: "/hr/employees",
      label: "Employees",
      icon: <Users size={20} />,
    },
    {
      href: "/hr/requisitions",
      label: "Requisition",
      icon: <FileText size={20} />,
    },
    { href: "/hr/skills", label: "Skills", icon: <Award size={20} /> },
  ];

  const isActive = (href: string, end?: boolean) => {
    if (end) {
      return pathname === href || pathname === `${href}/`;
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <aside
      className={`admin-sidebar ${collapsed ? "collapsed" : ""}`}
      aria-label="HR dashboard navigation"
    >
      <div className="sidebar-header">
        {!collapsed && (
          <div className="sidebar-brand">
            <LayoutDashboard size={24} className="brand-icon" />
            <span className="brand-text">HR Dashboard</span>
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

export default HrSidebar;
