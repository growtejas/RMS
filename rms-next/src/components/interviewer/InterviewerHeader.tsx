"use client";

import React from "react";
import { User } from "lucide-react";

interface InterviewerHeaderProps {
  title: string;
  user: { username?: string; roles?: string[] } | null;
  onLogout: () => void;
  showUser?: boolean;
}

export default function InterviewerHeader({
  title,
  user,
  onLogout,
  showUser = true,
}: InterviewerHeaderProps) {
  const displayName = user?.username || "Interviewer";
  const displayRole =
    user?.roles && user.roles.length > 0 ? user.roles.join(", ") : "Interviewer";

  return (
    <header className="admin-header">
      <div className="header-title">
        <h1>{title}</h1>
        <p>View assigned interviews and submit panel feedback</p>
      </div>

      {showUser && (
        <div className="header-actions">
          <div className="header-user">
            <div className="user-info">
              <div className="user-name">{displayName}</div>
              <div className="user-role">{displayRole}</div>
            </div>

            <button
              className="user-avatar"
              onClick={onLogout}
              title="Logout"
              type="button"
            >
              {displayName ? displayName.charAt(0).toUpperCase() : <User size={18} />}
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
