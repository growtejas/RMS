"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  FilePlus,
  Menu,
  X,
} from "lucide-react";

interface ManagerSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const ManagerSidebar: React.FC<ManagerSidebarProps> = ({
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
      href: "/manager",
      label: "Dashboard",
      icon: <LayoutDashboard size={20} />,
      end: true,
    },
    {
      href: "/manager/raise-requisition",
      label: "Raise Requisition",
      icon: <FilePlus size={20} />,
    },
    {
      href: "/manager/my-requisitions",
      label: "My Requisitions",
      icon: <ClipboardList size={20} />,
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
            <span className="brand-text">Manager</span>
          </div>
        )}
        <button
          type="button"
          className="sidebar-toggle"
          onClick={onToggleCollapse}
        >
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

export default ManagerSidebar;
