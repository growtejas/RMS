"use client";

import React, { useMemo } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/contexts/useAuth";
import {
  getDefaultRole,
  getRoleHomePath,
  normalizeRoles,
  resolveActiveRole,
} from "@/lib/auth/role-routing";

function labelForRole(role: string): string {
  if (role === "ta") return "TA";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default function RoleSwitcherMenu() {
  const { user, activeRole, setActiveRole } = useAuth();
  const router = useRouter();
  const roles = useMemo(() => normalizeRoles(user?.roles), [user?.roles]);

  if (roles.length <= 1) return null;

  const current = resolveActiveRole(roles, activeRole) ?? getDefaultRole(roles);
  if (!current) return null;

  return (
    <div style={{ marginTop: 4 }}>
      <label
        htmlFor="role-switcher"
        style={{ fontSize: 11, color: "var(--text-tertiary, #6b7280)", marginRight: 6 }}
      >
        Switch role
      </label>
      <select
        id="role-switcher"
        value={current}
        onChange={(e) => {
          const nextRole = e.target.value;
          setActiveRole(nextRole);
          router.push(getRoleHomePath(nextRole));
        }}
        style={{
          border: "1px solid var(--border-subtle, #d1d5db)",
          borderRadius: 6,
          padding: "2px 6px",
          fontSize: 12,
          backgroundColor: "var(--bg-primary, #fff)",
          color: "var(--text-primary, #111827)",
          maxWidth: 150,
        }}
      >
        {roles.map((role) => (
          <option key={role} value={role}>
            {labelForRole(role)}
          </option>
        ))}
      </select>
    </div>
  );
}
