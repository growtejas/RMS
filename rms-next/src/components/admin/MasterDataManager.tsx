"use client";

// Migrated from legacy Vite SPA.
import React, { useEffect, useMemo, useState } from "react";
import { Plus, Edit, Trash2, Search } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  cachedApiGet,
  invalidateCachedApiGetByUrlSubstring,
} from "@/lib/api/cached-api-get";

type MasterDataType =
  | "skill"
  | "location"
  | "department"
  | "company_role"
  | "technology";

interface MasterDataItem {
  id: number;
  name: string;
  type: MasterDataType;
  description: string;
  createdBy: string;
  createdAt: string;
  isActive: boolean;
}

type SkillResponse = {
  skill_id: number;
  skill_name: string;
  created_by?: string | null;
  created_at?: string | null;
};

type DepartmentResponse = {
  department_id: number;
  department_name: string;
  created_by?: string | null;
  created_at?: string | null;
};

type LocationResponse = {
  location_id: number;
  city?: string | null;
  country?: string | null;
  created_by?: string | null;
  created_at?: string | null;
};

type CompanyRoleResponse = {
  role_id: number;
  role_name: string;
  role_description?: string | null;
  is_active: boolean;
  created_at?: string | null;
  created_by?: string | null;
};

type NewItemState = {
  name: string;
  description: string;
  type: Exclude<MasterDataType, "technology">;
};

const normalizeItem = (item: MasterDataItem): MasterDataItem => ({
  ...item,
  createdBy: item.createdBy || "System",
  createdAt: item.createdAt || "-",
  isActive: item.isActive ?? true,
});

const formatDate = (value?: string | null) => {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString();
};

/** Extract user-friendly message from API (axios) errors. */
const getApiErrorMessage = (err: unknown, fallback: string): string => {
  const ax = err as { response?: { data?: { detail?: string | string[] }; status?: number }; message?: string };
  if (ax.response?.data?.detail != null) {
    const d = ax.response.data.detail;
    return Array.isArray(d) ? d.map((x) => (x as { msg?: string }).msg ?? x).join(" ") : String(d);
  }
  if (ax.response?.status === 401) return "Please log in again.";
  if (ax.response?.status === 403) return "You don't have permission to do this.";
  if (ax.response?.status === 404) return "Resource not found.";
  return ax.message && typeof ax.message === "string" ? ax.message : fallback;
};

const MasterDataManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    "skills" | "locations" | "departments" | "company-roles"
  >("skills");
  const [skills, setSkills] = useState<MasterDataItem[]>([]);
  const [locations, setLocations] = useState<MasterDataItem[]>([]);
  const [departments, setDepartments] = useState<MasterDataItem[]>([]);
  const [companyRoles, setCompanyRoles] = useState<MasterDataItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MasterDataItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [newItem, setNewItem] = useState<NewItemState>({
    name: "",
    description: "",
    type: "skill",
  });
  const [addSaveAttempted, setAddSaveAttempted] = useState(false);
  const [editSaveAttempted, setEditSaveAttempted] = useState(false);
  const fetchSkills = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const rows = await cachedApiGet<SkillResponse[]>("/skills/");
      const mapped = rows.map((skill) =>
        normalizeItem({
          id: skill.skill_id,
          name: skill.skill_name,
          type: "skill",
          description: "",
          createdBy: skill.created_by ?? "System",
          createdAt: formatDate(skill.created_at),
          isActive: true,
        }),
      );
      setSkills(mapped);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load skills";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDepartments = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const rows = await cachedApiGet<DepartmentResponse[]>("/departments/");
      const mapped = rows.map((dept) =>
        normalizeItem({
          id: dept.department_id,
          name: dept.department_name,
          type: "department",
          description: "",
          createdBy: dept.created_by ?? "System",
          createdAt: formatDate(dept.created_at),
          isActive: true,
        }),
      );
      setDepartments(mapped);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load departments";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLocations = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const rows = await cachedApiGet<LocationResponse[]>("/locations/");
      const mapped = rows.map((loc) =>
        normalizeItem({
          id: loc.location_id,
          name: loc.city || "Unknown",
          type: "location",
          description: loc.country || "",
          createdBy: loc.created_by ?? "System",
          createdAt: formatDate(loc.created_at),
          isActive: true,
        }),
      );
      setLocations(mapped);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load locations";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCompanyRoles = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const rows = await cachedApiGet<CompanyRoleResponse[]>("/company-roles/");
      const mapped = rows.map((role) =>
        normalizeItem({
          id: role.role_id,
          name: role.role_name,
          type: "company_role",
          description: role.role_description ?? "",
          createdBy: role.created_by?.trim() ? role.created_by : "System",
          createdAt: formatDate(role.created_at),
          isActive: role.is_active ?? true,
        }),
      );
      setCompanyRoles(mapped);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load company roles";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "skills") {
      fetchSkills();
      setNewItem((prev) => ({ ...prev, type: "skill" }));
    } else if (activeTab === "locations") {
      fetchLocations();
      setNewItem((prev) => ({ ...prev, type: "location" }));
    } else if (activeTab === "departments") {
      fetchDepartments();
      setNewItem((prev) => ({ ...prev, type: "department" }));
    } else {
      fetchCompanyRoles();
      setNewItem((prev) => ({ ...prev, type: "company_role" }));
    }
  }, [activeTab]);
  useEffect(() => {
    setPage(1);
  }, [activeTab, searchTerm]);

  const handleAddItem = async () => {
    if (!newItem.name.trim()) {
      setAddSaveAttempted(true);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      if (activeTab === "skills") {
        await apiClient.post("/skills/", {
          skill_name: newItem.name.trim(),
        });
        invalidateCachedApiGetByUrlSubstring("/skills/");
        await fetchSkills();
      } else if (activeTab === "departments") {
        await apiClient.post("/departments/", {
          department_name: newItem.name.trim(),
        });
        invalidateCachedApiGetByUrlSubstring("/departments/");
        await fetchDepartments();
      } else if (activeTab === "company-roles") {
        await apiClient.post("/company-roles/", {
          role_name: newItem.name.trim(),
          role_description: newItem.description.trim() || null,
        });
        invalidateCachedApiGetByUrlSubstring("/company-roles");
        await fetchCompanyRoles();
      } else {
        await apiClient.post("/locations/", {
          city: newItem.name.trim(),
          country: newItem.description.trim() || null,
        });
        invalidateCachedApiGetByUrlSubstring("/locations/");
        await fetchLocations();
      }

      setShowAddModal(false);
      setNewItem({ name: "", description: "", type: "skill" });
      setSuccess(`${activeTab.slice(0, -1)} added successfully.`);
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to add item"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteItem = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this item?")) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      if (activeTab === "skills") {
        await apiClient.delete(`/skills/${id}`);
        invalidateCachedApiGetByUrlSubstring("/skills/");
        await fetchSkills();
      } else if (activeTab === "departments") {
        await apiClient.delete(`/departments/${id}`);
        invalidateCachedApiGetByUrlSubstring("/departments/");
        await fetchDepartments();
      } else if (activeTab === "company-roles") {
        await apiClient.delete(`/company-roles/${id}`);
        invalidateCachedApiGetByUrlSubstring("/company-roles");
        await fetchCompanyRoles();
      } else {
        await apiClient.delete(`/locations/${id}`);
        invalidateCachedApiGetByUrlSubstring("/locations/");
        await fetchLocations();
      }
      setSuccess("Item deleted successfully.");
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to delete"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditItem = (item: MasterDataItem) => {
    setError(null);
    setEditSaveAttempted(false);
    setEditingItem(item);
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editingItem || !editingItem.name.trim()) {
      setEditSaveAttempted(true);
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      if (editingItem.type === "skill") {
        await apiClient.patch(`/skills/${editingItem.id}`, {
          skill_name: editingItem.name.trim(),
        });
        invalidateCachedApiGetByUrlSubstring("/skills/");
        await fetchSkills();
      } else if (editingItem.type === "department") {
        await apiClient.patch(`/departments/${editingItem.id}`, {
          department_name: editingItem.name.trim(),
        });
        invalidateCachedApiGetByUrlSubstring("/departments/");
        await fetchDepartments();
      } else if (editingItem.type === "company_role") {
        await apiClient.patch(`/company-roles/${editingItem.id}`, {
          role_name: editingItem.name.trim(),
          role_description: editingItem.description.trim() || null,
        });
        invalidateCachedApiGetByUrlSubstring("/company-roles");
        await fetchCompanyRoles();
      } else {
        await apiClient.patch(`/locations/${editingItem.id}`, {
          city: editingItem.name.trim(),
          country: editingItem.description.trim() || null,
        });
        invalidateCachedApiGetByUrlSubstring("/locations/");
        await fetchLocations();
      }

      setShowEditModal(false);
      setEditingItem(null);
      setSuccess("Item updated successfully.");
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to update"));
    } finally {
      setIsLoading(false);
    }
  };

  const currentItems =
    activeTab === "skills"
      ? skills
      : activeTab === "locations"
        ? locations
        : activeTab === "company-roles"
          ? companyRoles
          : departments;

  const filteredItems = currentItems.filter((item) =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const pagedItems = filteredItems.slice((page - 1) * pageSize, page * pageSize);

  const canSaveNew = useMemo(
    () => Boolean(newItem.name.trim()),
    [newItem.name],
  );

  const canSaveEdit = useMemo(
    () => Boolean(editingItem?.name.trim()),
    [editingItem],
  );

  return (
    <div className="master-data-manager">
      <div className="data-manager-header">
        <PageHeader
          title="Master Data Management"
          subtitle="Manage skills, locations, departments, and company roles."
        />
        <Button
          className="add-button"
          onClick={() => {
            setError(null);
            setAddSaveAttempted(false);
            setShowAddModal(true);
          }}
        >
          <Plus size={16} />
          Add New
        </Button>
      </div>

      {/* Tabs */}
      <div className="data-tabs">
        <Button
          variant={activeTab === "skills" ? "primary" : "secondary"}
          size="sm"
          className={`tab-button ${activeTab === "skills" ? "active" : ""}`}
          onClick={() => setActiveTab("skills")}
        >
          <span>Skills </span>
          <span className="tab-count">{skills.length}</span>
        </Button>
        <Button
          variant={activeTab === "locations" ? "primary" : "secondary"}
          size="sm"
          className={`tab-button ${activeTab === "locations" ? "active" : ""}`}
          onClick={() => setActiveTab("locations")}
        >
          <span>Locations</span>
          <span className="tab-count">{locations.length}</span>
        </Button>
        <Button
          variant={activeTab === "departments" ? "primary" : "secondary"}
          size="sm"
          className={`tab-button ${activeTab === "departments" ? "active" : ""}`}
          onClick={() => setActiveTab("departments")}
        >
          <span>Departments</span>
          <span className="tab-count">{departments.length}</span>
        </Button>
        <Button
          variant={activeTab === "company-roles" ? "primary" : "secondary"}
          size="sm"
          className={`tab-button ${
            activeTab === "company-roles" ? "active" : ""
          }`}
          onClick={() => setActiveTab("company-roles")}
        >
          <span>Company Roles</span>
          <span className="tab-count">{companyRoles.length}</span>
        </Button>
      </div>

      {/* Search */}
      <div className="data-controls">
        <div className="search-box">
          <Search size={18} />
          <Input
            type="text"
            placeholder={`Search ${activeTab.replace("-", " ")}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Data Table */}
      {success ? (
        <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          {success}
        </div>
      ) : null}
      <div className="data-table-container">
        <Table className="border-0 shadow-none">
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Created By</TH>
              <TH>Created At</TH>
              <TH>Actions</TH>
            </TR>
          </THead>
          <TBody>
            {isLoading && (
              <TR>
                <TD colSpan={4}>
                  <Loader label={`Loading ${activeTab}...`} />
                </TD>
              </TR>
            )}
            {pagedItems.map((item) => (
              <TR key={item.id}>
                <TD>
                  <div className="item-name">{item.name}</div>
                </TD>
                <TD>{item.createdBy}</TD>
                <TD>{item.createdAt}</TD>
                <TD>
                  <div className="action-buttons">
                    <Button
                      variant="secondary"
                      size="sm"
                      title="Edit"
                      onClick={() => handleEditItem(item)}
                    >
                      <Edit size={14} />
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      title="Delete"
                      onClick={() => handleDeleteItem(item.id)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {!isLoading && filteredItems.length === 0 && (
          <EmptyState
            title={error ? "Could not load records" : `No ${activeTab} found`}
            description={error ?? "Add your first item to get started."}
          />
        )}
        {filteredItems.length > pageSize && (
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
        )}
      </div>

      {/* Add New Item Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content edit-user-modal">
            <div className="modal-header">
              <div>
                <h3>Add New {activeTab.slice(0, -1)}</h3>
                <p className="modal-subtitle">
                  Provide the details for the new {activeTab.slice(0, -1)}
                </p>
              </div>
              <Button
                className="close-button"
                onClick={() => setShowAddModal(false)}
              >
                ×
              </Button>
            </div>
            <div className="modal-body edit-user-body">
              {error && (
                <p style={{ color: "#ef4444", marginBottom: "12px" }}>{error}</p>
              )}
              <div className="edit-user-section">
                <div className="section-header">
                  <h4>Details</h4>
                  <p>Fill in the required information</p>
                </div>
                <div className="form-group">
                  <label>
                    {activeTab === "locations" ? "City *" : "Name *"}
                  </label>
                  <Input
                    type="text"
                    value={newItem.name}
                    onChange={(e) =>
                      setNewItem({ ...newItem, name: e.target.value })
                    }
                    placeholder={
                      activeTab === "locations"
                        ? "e.g. Bengaluru"
                        : `Enter ${activeTab.slice(0, -1)} name`
                    }
                    aria-invalid={addSaveAttempted && !newItem.name.trim()}
                  />
                  {addSaveAttempted && !newItem.name.trim() ? (
                    <p className="mt-1 text-sm text-red-600">
                      {activeTab === "locations" ? "City is required." : "Name is required."}
                    </p>
                  ) : null}
                </div>
                {activeTab === "locations" && (
                  <div className="form-group">
                    <label>Country</label>
                    <Input
                      type="text"
                      value={newItem.description}
                      onChange={(e) =>
                        setNewItem({
                          ...newItem,
                          description: e.target.value,
                        })
                      }
                      placeholder="Enter country"
                    />
                  </div>
                )}
                {activeTab === "company-roles" && (
                  <div className="form-group">
                    <label>Description</label>
                    <Input
                      type="text"
                      value={newItem.description}
                      onChange={(e) =>
                        setNewItem({
                          ...newItem,
                          description: e.target.value,
                        })
                      }
                      placeholder="Enter role description"
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <Button
                variant="secondary"
                onClick={() => setShowAddModal(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddItem}
                disabled={!canSaveNew || isLoading}
              >
                {isLoading ? "Saving…" : `Save ${activeTab.slice(0, -1)}`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {showEditModal && editingItem && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Edit {editingItem.type}</h3>
              <Button
                className="close-button"
                onClick={() => {
                  setShowEditModal(false);
                  setEditingItem(null);
                }}
              >
                ×
              </Button>
            </div>
            <div className="modal-body">
              {error && (
                <p style={{ color: "#ef4444", marginBottom: "12px" }}>{error}</p>
              )}
              <div className="form-group">
                <label>
                  {editingItem.type === "location" ? "City *" : "Name *"}
                </label>
                <Input
                  type="text"
                  value={editingItem.name}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      name: e.target.value,
                    })
                  }
                  placeholder={
                    editingItem.type === "location"
                      ? "e.g. Bengaluru"
                      : `Enter ${editingItem.type} name`
                  }
                  aria-invalid={editSaveAttempted && !editingItem.name.trim()}
                />
                {editSaveAttempted && !editingItem.name.trim() ? (
                  <p className="mt-1 text-sm text-red-600">
                    {editingItem.type === "location" ? "City is required." : "Name is required."}
                  </p>
                ) : null}
              </div>
              {editingItem.type === "location" && (
                <div className="form-group">
                  <label>Country</label>
                  <Input
                    type="text"
                    value={editingItem.description}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        description: e.target.value,
                      })
                    }
                    placeholder="Enter country"
                  />
                </div>
              )}
              {editingItem.type === "company_role" && (
                <div className="form-group">
                  <label>Description</label>
                  <Input
                    type="text"
                    value={editingItem.description}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        description: e.target.value,
                      })
                    }
                    placeholder="Enter role description"
                  />
                </div>
              )}
            </div>
            <div className="modal-footer">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowEditModal(false);
                  setEditingItem(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveEdit}
                disabled={!canSaveEdit || isLoading}
              >
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MasterDataManager;
