import React from "react";
import { Bell, Search, User } from "lucide-react";

interface AdminHeaderProps {
    title: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    user: any;
    onLogout: () => void;
}

const AdminHeader: React.FC<AdminHeaderProps> = ({ title, user, onLogout }) => {
    return (
        <header className="admin-header">
            <div className="header-title">
                <h1>{title}</h1>
                <p>Manage and monitor your resource fulfillment system</p>
            </div>

            <div className="header-actions">
                {/* Search Bar - Hidden on mobile in some layouts */}
                <div className="search-bar" style={{ display: "none" }}>
                    <Search size={18} />
                    <input type="text" placeholder="Search..." />
                </div>

                <div className="header-user">
                    <button className="notification-btn" title="Notifications">
                        <Bell size={20} />
                        <span className="notification-badge">3</span>
                    </button>

                    <div className="user-info">
                        <div className="user-name">{user?.name || "Admin User"}</div>
                        <div className="user-role">{user?.role || "Administrator"}</div>
                    </div>

                    <div className="user-avatar" onClick={onLogout} title="Click to logout">
                        {user?.name ? user.name.charAt(0).toUpperCase() : <User size={20} />}
                    </div>
                </div>
            </div>
        </header>
    );
};

export default AdminHeader;
