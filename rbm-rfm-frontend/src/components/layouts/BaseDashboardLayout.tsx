import React, { useEffect, useMemo, useState } from "react";
import { LayoutDashboard, Menu, X } from "lucide-react";
import Header from "../Header";
import "../../styles/admin/Dashboard.css";

export interface SidebarItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

interface BaseDashboardLayoutProps {
  headerTitle: string;
  sidebarItems: SidebarItem[];
  children: React.ReactNode;
  activeItem?: string;
  onItemChange?: (id: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  headerContent?: React.ReactNode;
  brandTitle?: string;
  headerSubtitle?: string;
}

const BaseDashboardLayout: React.FC<BaseDashboardLayoutProps> = ({
  headerTitle,
  sidebarItems,
  children,
  activeItem,
  onItemChange,
  collapsed,
  onToggleCollapse,
  headerContent,
  brandTitle,
  headerSubtitle = "Manage and monitor your resource fulfillment system",
}) => {
  const firstItemId = useMemo(() => sidebarItems[0]?.id ?? "", [sidebarItems]);
  const [internalActiveItem, setInternalActiveItem] = useState(firstItemId);
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const currentActiveItem = activeItem ?? internalActiveItem;
  const isCollapsed = collapsed ?? internalCollapsed;
  const handleItemChange = (id: string) => {
    if (onItemChange) {
      onItemChange(id);
    } else {
      setInternalActiveItem(id);
    }
  };
  const handleToggleCollapse = () => {
    if (onToggleCollapse) {
      onToggleCollapse();
    } else {
      setInternalCollapsed((prev) => !prev);
    }
  };

  useEffect(() => {
    if (
      !onItemChange &&
      !sidebarItems.some((item) => item.id === currentActiveItem)
    ) {
      setInternalActiveItem(firstItemId);
    }
  }, [currentActiveItem, firstItemId, onItemChange, sidebarItems]);

  return (
    <div
      className={`admin-dashboard ${isCollapsed ? "sidebar-collapsed" : ""}`}
    >
      <aside className={`admin-sidebar ${isCollapsed ? "collapsed" : ""}`}>
        <div className="sidebar-header">
          {!isCollapsed && (
            <div className="sidebar-brand">
              <LayoutDashboard size={24} className="brand-icon" />
              <span className="brand-text">{brandTitle ?? headerTitle}</span>
            </div>
          )}
          <button
            className="sidebar-toggle"
            onClick={handleToggleCollapse}
            type="button"
          >
            {isCollapsed ? <Menu size={20} /> : <X size={20} />}
          </button>
        </div>

        <nav className="sidebar-nav">
          <ul>
            {sidebarItems.map((item) => (
              <li key={item.id}>
                <button
                  className={`nav-item ${
                    currentActiveItem === item.id ? "active" : ""
                  }`}
                  onClick={() => handleItemChange(item.id)}
                  title={isCollapsed ? item.label : ""}
                  type="button"
                >
                  <span className="nav-icon">{item.icon}</span>
                  {!isCollapsed && (
                    <span className="nav-label">{item.label}</span>
                  )}
                  {!isCollapsed && currentActiveItem === item.id && (
                    <span className="active-indicator"></span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div
        className={`admin-main-content ${isCollapsed ? "sidebar-collapsed" : ""}`}
      >
        <Header />

        {headerContent ? (
          headerContent
        ) : (
          <header className="admin-header">
            <div className="header-title">
              <h1>{headerTitle}</h1>
              <p>{headerSubtitle}</p>
            </div>
          </header>
        )}

        <div className="admin-content-area">{children}</div>
      </div>
    </div>
  );
};

export default BaseDashboardLayout;
