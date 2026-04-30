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
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
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
  const [success, setSuccess] = useState<string | null>(null);
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
  const [createSubmitAttempted, setCreateSubmitAttempted] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;

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
  useEffect(() => {
    setPage(1);
  }, [searchTerm, users.length]);

  const totalPages = Math.max(1, Math.ceil(users.length / pageSize));
  const pagedUsers = useMemo(
    () => users.slice((page - 1) * pageSize, page * pageSize),
    [page, users],
  );

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
    setCreateSubmitAttempted(false);
  };

  const handleOpenCreate = () => {
    resetCreateForm();
    setShowCreateModal(true);
  };

  const canCreateUser = useMemo(
    () =>
      Boolean(
        newUsername.trim() &&
          newPassword.trim() &&
          newRole.trim(),
      ),
    [newUsername, newPassword, newRole],
  );

  const handleCreateUser = async () => {
    if (!canCreateUser) {
      setCreateSubmitAttempted(true);
      return;
    }

    setIsCreating(true);
    setCreateError(null);
    setSuccess(null);
    try {
      await createUser({
        username: newUsername.trim(),
        password: newPassword,
        role: newRole,
      });
      await loadUsers();
      setShowCreateModal(false);
      resetCreateForm();
      setSuccess("User created successfully.");
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
    setSuccess(null);
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
      setSuccess("User updated successfully.");
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
    setSuccess(null);
    try {
      await updateUser(user.user_id, {
        is_active: !user.is_active,
      });
      await loadUsers();
      setSuccess("User status updated successfully.");
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
      <div className="viewer-header">
        <div>
          <PageHeader title="User Management" />
          {error && <p style={{ color: "#ef4444" }}>{error}</p>}
          {success ? (
            <p style={{ color: "#047857", marginTop: "8px" }}>{success}</p>
          ) : null}
          {catalogHint && (
            <p style={{ color: "#b45309", fontSize: "14px", marginTop: "8px" }}>
              {catalogHint}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="search-box" style={{ minWidth: "240px" }}>
            <Search size={16} />
            <Input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button
            type="button"
            onClick={handleOpenCreate}
          >
            <Plus size={18} /> Create User
          </Button>
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
              pagedUsers.map((user) => (
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
                      <Button
                        variant="secondary"
                        size="sm"
                        title="Edit User"
                        onClick={() => handleEdit(user)}
                      >
                        <Edit size={16} />
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        title={
                          user.is_active ? "Deactivate User" : "Activate User"
                        }
                        onClick={() => handleToggleStatus(user)}
                      >
                        <Power size={16} />
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
        {!isLoading && users.length === 0 && (
          <EmptyState title="No users found" />
        )}
        {users.length > pageSize ? (
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <span className="text-sm text-[--color-text-subtle]">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page === totalPages}
            >
              Next
            </Button>
          </div>
        ) : null}
      </div>

      {showEditModal && editingUser && (
        <Modal
          open={showEditModal && Boolean(editingUser)}
          onClose={() => {
            setShowEditModal(false);
            setEditingUser(null);
          }}
          title="Edit User"
          subtitle="Update identity, employee link, roles, and account status"
          maxWidthClass="max-w-4xl"
          footer={
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowEditModal(false);
                  setEditingUser(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={!isDirty || isLoading}
              >
                Save Changes
              </Button>
            </div>
          }
        >
          <div className="modal-body edit-user-body">
              <div className="edit-user-section">
                <div className="section-header">
                  <h4>Identity</h4>
                  <p>Read-only account identity</p>
                </div>
                <div className="form-group">
                  <label>Username</label>
                  <Input type="text" value={editingUser.username} disabled />
                </div>
              </div>

              <div className="edit-user-section">
                <div className="section-header">
                  <h4>Employee Link</h4>
                  <p>Search and associate a single employee</p>
                </div>
                <div className="form-group">
                  <label>Search Employee</label>
                  <Input
                    type="text"
                    placeholder="Search by name or ID"
                    value={employeeSearch}
                    onChange={(e) => setEmployeeSearch(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Select Employee</label>
                  <Select
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
                  </Select>
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
                      <Checkbox
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
                  <Select
                    value={isActive ? "active" : "inactive"}
                    onChange={(e) => setIsActive(e.target.value === "active")}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </Select>
                </div>
              </div>
          </div>
        </Modal>
      )}

      {showCreateModal && (
        <Modal
          open={showCreateModal}
          onClose={() => {
            setShowCreateModal(false);
            resetCreateForm();
          }}
          title="Create User"
          subtitle="Create a new login with an initial role"
          maxWidthClass="max-w-3xl"
          footer={
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowCreateModal(false);
                  resetCreateForm();
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateUser}
                disabled={!canCreateUser || isCreating}
              >
                {isCreating ? "Creating..." : "Create User"}
              </Button>
            </div>
          }
        >
          <div className="modal-body edit-user-body">
              <div className="edit-user-section">
                <div className="section-header">
                  <h4>Account Details</h4>
                  <p>Set username, password and primary role</p>
                </div>
                <div className="form-group">
                  <label>Username</label>
                  <Input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="Enter username"
                    aria-invalid={createSubmitAttempted && !newUsername.trim()}
                  />
                  {createSubmitAttempted && !newUsername.trim() ? (
                    <p className="mt-1 text-sm text-red-600">Username is required.</p>
                  ) : null}
                </div>
                <div className="form-group">
                  <label>Password</label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter temporary password"
                    aria-invalid={createSubmitAttempted && !newPassword.trim()}
                  />
                  {createSubmitAttempted && !newPassword.trim() ? (
                    <p className="mt-1 text-sm text-red-600">Password is required.</p>
                  ) : null}
                </div>
                <div className="form-group">
                  <label>Role</label>
                  <Select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    aria-invalid={createSubmitAttempted && !newRole.trim()}
                  >
                    <option value="">Select role</option>
                    {roleOptionsMerged.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </Select>
                  {createSubmitAttempted && !newRole.trim() ? (
                    <p className="mt-1 text-sm text-red-600">Role is required.</p>
                  ) : null}
                </div>
                {createError && (
                  <p style={{ color: "#ef4444", marginTop: "8px" }}>
                    {createError}
                  </p>
                )}
              </div>
            </div>
        </Modal>
      )}
    </div>
  );
};

export default UserManager;
