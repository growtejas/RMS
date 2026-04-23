"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Edit, Plus, Power, Search } from "lucide-react";

import {
  fetchUsers,
  updateUser,
  AdminUser,
  createUser,
  fetchAssignableRoles,
} from "@/lib/api/users";
import { fetchEmployees, EmployeeOption } from "@/lib/api/employees";
import { useAuth } from "@/contexts/useAuth";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Table, TBody, THead, TD, TH, TR } from "@/components/ui/Table";

/** Shown if catalog API fails; backend should seed these on successful catalog load. */
const FALLBACK_ROLE_OPTIONS = [
  "Admin",
  "Owner",
  "HR",
  "Manager",
  "TA",
  "Employee",
];

const UserManager: React.FC = () => {
  const { user: authUser, refreshSession } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [isActive, setIsActive] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<string>("Employee");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [roleOptions, setRoleOptions] = useState<string[]>([]);
  const [catalogHint, setCatalogHint] = useState<string | null>(null);

  const loadRoleCatalog = useCallback(async () => {
    setCatalogHint(null);
    try {
      const catalog = await fetchAssignableRoles();
      const list =
        catalog.length > 0 ? catalog : [...FALLBACK_ROLE_OPTIONS];
      setRoleOptions(list);
      setNewRole((prev) =>
        list.some((r) => r.toLowerCase() === prev.toLowerCase())
          ? list.find((r) => r.toLowerCase() === prev.toLowerCase()) ?? list[0]!
          : list[0] ?? "Employee",
      );
      if (catalog.length === 0) {
        setCatalogHint(
          "No roles returned from server; showing defaults. Save may fail until the API can seed the roles table.",
        );
      }
    } catch {
      setRoleOptions([...FALLBACK_ROLE_OPTIONS]);
      setCatalogHint(
        "Could not load role catalog (check login and /api/admin/users/roles/catalog). Using default role names.",
      );
    }
  }, []);

  useEffect(() => {
    void loadRoleCatalog();
  }, [loadRoleCatalog]);

  const roleOptionsMerged = useMemo(() => {
    const roleSet = new Set(roleOptions);
    users.forEach((user) => user.roles.forEach((role) => roleSet.add(role)));
    return Array.from(roleSet).sort((a, b) => a.localeCompare(b));
  }, [users, roleOptions]);

  const filteredEmployees = useMemo(() => {
    if (!employeeSearch.trim()) {
      return employees;
    }
    const term = employeeSearch.toLowerCase();
    return employees.filter(
      (emp) =>
        emp.emp_id.toLowerCase().includes(term) ||
        emp.full_name.toLowerCase().includes(term),
    );
  }, [employees, employeeSearch]);

  const loadUsers = async (search?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchUsers(search);
      setUsers(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load users";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadEmployees = async () => {
    try {
      const data = await fetchEmployees();
      setEmployees(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load employees";
      setError(message);
    }
  };

  useEffect(() => {
    loadUsers();
    loadEmployees();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadUsers(searchTerm.trim() || undefined);
    }, 400);

    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const handleEdit = (user: AdminUser) => {
    void loadRoleCatalog();
    setEditingUser(user);
    setSelectedRoles(user.roles.length ? user.roles : ["Employee"]);
    setSelectedEmployeeId(user.employee?.id ?? "");
    setIsActive(user.is_active);
    setShowEditModal(true);
  };

  const isDirty = useMemo(() => {
    if (!editingUser) {
      return false;
    }
    const initialRoles = editingUser.roles;
    const rolesChanged =
      initialRoles.length !== selectedRoles.length ||
      initialRoles.some((role) => !selectedRoles.includes(role));
    const employeeChanged =
      (editingUser.employee?.id ?? "") !== selectedEmployeeId;
    const statusChanged = editingUser.is_active !== isActive;
    return rolesChanged || employeeChanged || statusChanged;
  }, [editingUser, selectedRoles, selectedEmployeeId, isActive]);

  const resetCreateForm = () => {
    setNewUsername("");
    setNewPassword("");
    setNewRole("Employee");
    setCreateError(null);
  };

  const handleOpenCreate = () => {
    resetCreateForm();
    setShowCreateModal(true);
  };

  const handleCreateUser = async () => {
    if (!newUsername.trim()) {
      setCreateError("Username is required.");
      return;
    }
    if (!newPassword.trim()) {
      setCreateError("Password is required.");
      return;
    }
    if (!newRole) {
      setCreateError("Role is required.");
      return;
    }

    setIsCreating(true);
    setCreateError(null);
    try {
      await createUser({
        username: newUsername.trim(),
        password: newPassword,
        role: newRole,
      });
      await loadUsers();
      setShowCreateModal(false);
      resetCreateForm();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create user";
      setCreateError(message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleSave = async () => {
    if (!editingUser) {
      return;
    }

    if (selectedRoles.length === 0) {
      setError("At least one role must be selected.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await updateUser(editingUser.user_id, {
        roles: selectedRoles,
        employee_id: selectedEmployeeId || null,
        is_active: isActive,
      });
      if (authUser && editingUser.user_id === authUser.user_id) {
        await refreshSession();
      }
      await loadUsers();
      setShowEditModal(false);
      setEditingUser(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update user";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleStatus = async (user: AdminUser) => {
    setIsLoading(true);
    setError(null);
    try {
      await updateUser(user.user_id, {
        is_active: !user.is_active,
      });
      await loadUsers();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update status";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="user-management-container">
      <div className="viewer-header" style={{ gap: "16px", flexWrap: "wrap" }}>
        <div>
          <h2>User Management</h2>
          {error && <p style={{ color: "#ef4444" }}>{error}</p>}
          {catalogHint && (
            <p style={{ color: "#b45309", fontSize: "14px", marginTop: "8px" }}>
              {catalogHint}
            </p>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div className="search-box" style={{ minWidth: "240px" }}>
            <Search size={16} />
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={handleOpenCreate}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "#4f46e5",
              color: "white",
              border: "none",
              padding: "8px 16px",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            <Plus size={18} /> Create User
          </button>
        </div>
      </div>

      <div className="data-table-container">
        <Table>
          <THead>
            <TR>
              <TH>ID</TH>
              <TH>Username</TH>
              <TH>Employee</TH>
              <TH>Roles</TH>
              <TH>Status</TH>
              <TH>Actions</TH>
            </TR>
          </THead>
          <TBody>
            {isLoading ? (
              <TR>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-sm text-[--color-text-muted]"
                >
                  Loading users…
                </td>
              </TR>
            ) : (
              users.map((user) => (
                <TR key={user.user_id} hover>
                  <TD className="font-mono text-xs text-[--color-text-subtle]">
                    {user.user_id}
                  </TD>
                  <TD>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={user.username} size={32} />
                      <span className="font-medium text-[--color-text]">
                        {user.username}
                      </span>
                    </div>
                  </TD>
                  <TD className="text-[--color-text-muted]">
                    {user.employee ? (
                      <div className="leading-tight">
                        <div className="font-medium text-[--color-text]">
                          {user.employee.id}
                        </div>
                        <div className="text-xs text-[--color-text-subtle]">
                          {user.employee.name ?? "-"}
                        </div>
                      </div>
                    ) : (
                      "-"
                    )}
                  </TD>
                  <TD className="text-[--color-text-muted]">
                    {user.roles.join(", ") || "-"}
                  </TD>
                  <TD>
                    <Badge variant={user.is_active ? "success" : "neutral"}>
                      {user.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TD>
                  <TD>
                    <div className="action-buttons">
                      <button
                        className="action-button edit"
                        title="Edit User"
                        onClick={() => handleEdit(user)}
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        className="action-button"
                        title={
                          user.is_active ? "Deactivate User" : "Activate User"
                        }
                        onClick={() => handleToggleStatus(user)}
                      >
                        <Power size={16} />
                      </button>
                    </div>
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
        {!isLoading && users.length === 0 && (
          <div className="empty-state">
            <p>No users found.</p>
          </div>
        )}
      </div>

      {showEditModal && editingUser && (
        <div className="modal-overlay">
          <div className="modal-content edit-user-modal">
            <div className="modal-header">
              <div>
                <h3>Edit User</h3>
                <p className="modal-subtitle">
                  Update identity, employee link, roles, and account status
                </p>
              </div>
              <button
                className="close-button"
                onClick={() => {
                  setShowEditModal(false);
                  setEditingUser(null);
                }}
              >
                ×
              </button>
            </div>
            <div className="modal-body edit-user-body">
              <div className="edit-user-section">
                <div className="section-header">
                  <h4>Identity</h4>
                  <p>Read-only account identity</p>
                </div>
                <div className="form-group">
                  <label>Username</label>
                  <input type="text" value={editingUser.username} disabled />
                </div>
              </div>

              <div className="edit-user-section">
                <div className="section-header">
                  <h4>Employee Link</h4>
                  <p>Search and associate a single employee</p>
                </div>
                <div className="form-group">
                  <label>Search Employee</label>
                  <input
                    type="text"
                    placeholder="Search by name or ID"
                    value={employeeSearch}
                    onChange={(e) => setEmployeeSearch(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Select Employee</label>
                  <select
                    value={selectedEmployeeId}
                    onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  >
                    <option value="">Unlinked</option>
                    {filteredEmployees.map((emp) => (
                      <option
                        key={emp.emp_id}
                        value={emp.emp_id}
                        disabled={Boolean(
                          emp.user_id && emp.emp_id !== selectedEmployeeId,
                        )}
                      >
                        {emp.emp_id} - {emp.full_name}
                        {emp.user_id && emp.emp_id !== selectedEmployeeId
                          ? " (linked)"
                          : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="edit-user-section">
                <div className="section-header">
                  <h4>Roles & Permissions</h4>
                  <p>Select one or more roles for this account</p>
                </div>
                               <div className="role-grid">
                  {roleOptionsMerged.map((role) => (
                    <label key={role} className="role-option">
                      <input
                        type="checkbox"
                        checked={selectedRoles.includes(role)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedRoles((prev) => [...prev, role]);
                          } else {
                            setSelectedRoles((prev) =>
                              prev.filter((r) => r !== role),
                            );
                          }
                        }}
                      />
                      <span>{role}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="edit-user-section">
                <div className="section-header">
                  <h4>Account Status</h4>
                  <p>Control access without deleting the account</p>
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={isActive ? "active" : "inactive"}
                    onChange={(e) => setIsActive(e.target.value === "active")}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="cancel-button"
                onClick={() => {
                  setShowEditModal(false);
                  setEditingUser(null);
                }}
              >
                Cancel
              </button>
              <button
                className="save-button"
                onClick={handleSave}
                disabled={!isDirty || isLoading}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content edit-user-modal">
            <div className="modal-header">
              <div>
                <h3>Create User</h3>
                <p className="modal-subtitle">
                  Create a new login with an initial role
                </p>
              </div>
              <button
                className="close-button"
                onClick={() => {
                  setShowCreateModal(false);
                  resetCreateForm();
                }}
              >
                ×
              </button>
            </div>

            <div className="modal-body edit-user-body">
              <div className="edit-user-section">
                <div className="section-header">
                  <h4>Account Details</h4>
                  <p>Set username, password and primary role</p>
                </div>
                <div className="form-group">
                  <label>Username</label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="Enter username"
                  />
                </div>
                <div className="form-group">
                  <label>Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter temporary password"
                  />
                </div>
                <div className="form-group">
                  <label>Role</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                  >
                    <option value="">Select role</option>
                    {roleOptionsMerged.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>
                {createError && (
                  <p style={{ color: "#ef4444", marginTop: "8px" }}>
                    {createError}
                  </p>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="cancel-button"
                onClick={() => {
                  setShowCreateModal(false);
                  resetCreateForm();
                }}
              >
                Cancel
              </button>
              <button
                className="save-button"
                onClick={handleCreateUser}
                disabled={isCreating}
              >
                {isCreating ? "Creating..." : "Create User"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManager;
