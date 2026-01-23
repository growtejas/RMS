// rbm-rfm-frontend/src/components/admin/MasterDataManager.tsx
import React, { useState, useEffect } from "react";
import {
  Plus,
  Edit,
  Trash2,
  Search,
  Filter,
  Download,
  Upload,
} from "lucide-react";

interface MasterDataItem {
  id: number;
  name: string;
  type: "skill" | "location" | "department" | "technology";
  description: string;
  createdBy: string;
  createdAt: string;
  isActive: boolean;
}


// Mock data - replace with API call
const mockSkills: MasterDataItem[] = [
  {
    id: 1,
    name: "AI Practitioner",
    type: "skill",
    description: "Artificial Intelligence specialist",
    createdBy: "admin",
    createdAt: "2024-01-15",
    isActive: true,
  },
  {
    id: 2,
    name: "React Developer",
    type: "skill",
    description: "Frontend development with React",
    createdBy: "admin",
    createdAt: "2024-01-10",
    isActive: true,
  },
  {
    id: 3,
    name: "Python Engineer",
    type: "skill",
    description: "Backend development with Python",
    createdBy: "admin",
    createdAt: "2024-01-05",
    isActive: true,
  },
];

const mockLocations: MasterDataItem[] = [
  {
    id: 1,
    name: "New York Office",
    type: "location",
    description: "Main headquarters",
    createdBy: "admin",
    createdAt: "2024-01-12",
    isActive: true,
  },
  {
    id: 2,
    name: "Remote - US",
    type: "location",
    description: "Remote workers in US",
    createdBy: "admin",
    createdAt: "2024-01-08",
    isActive: true,
  },
];

const MasterDataManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    "skills" | "locations" | "departments"
  >("skills");
  const [items, setItems] = useState<MasterDataItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItem, setNewItem] = useState({
    name: "",
    description: "",
    type: "skill" as const,
  });

  // Mock data - replace with API call


  useEffect(() => {
    // Load data based on active tab - ensuring effects are clean
    const loadData = () => {
      if (activeTab === "skills") {
        setItems(mockSkills);
      } else if (activeTab === "locations") {
        setItems(mockLocations);
      } else {
        setItems([]);
      }
    };
    loadData();
  }, [activeTab]);

  const handleAddItem = () => {
    // API call to add new item
    console.log("Adding new item:", newItem);
    setShowAddModal(false);
    setNewItem({ name: "", description: "", type: "skill" });
  };

  const handleDeleteItem = (id: number) => {
    if (window.confirm("Are you sure you want to delete this item?")) {
      // API call to delete item
      console.log("Deleting item:", id);
    }
  };

  const filteredItems = items.filter(
    (item) =>
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="master-data-manager">
      <div className="data-manager-header">
        <div className="header-left">
          <h2>Master Data Management</h2>
          <p className="subtitle">
            Manage dropdown options for Skills, Locations, Departments
          </p>
        </div>
        <button className="add-button" onClick={() => setShowAddModal(true)}>
          <Plus size={16} />
          Add New
        </button>
      </div>

      {/* Tabs */}
      <div className="data-tabs">
        <button
          className={`tab-button ${activeTab === "skills" ? "active" : ""}`}
          onClick={() => setActiveTab("skills")}
        >
          Skills ({mockSkills.length})
        </button>
        <button
          className={`tab-button ${activeTab === "locations" ? "active" : ""}`}
          onClick={() => setActiveTab("locations")}
        >
          Locations ({mockLocations.length})
        </button>
        <button
          className={`tab-button ${activeTab === "departments" ? "active" : ""}`}
          onClick={() => setActiveTab("departments")}
        >
          Departments (0)
        </button>
      </div>

      {/* Search and Filters */}
      <div className="data-controls">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder={`Search ${activeTab}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="control-buttons">
          <button className="control-button">
            <Filter size={16} />
            Filter
          </button>
          <button className="control-button">
            <Download size={16} />
            Export
          </button>
          <button className="control-button">
            <Upload size={16} />
            Import
          </button>
        </div>
      </div>

      {/* Data Table */}
      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Created By</th>
              <th>Created At</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => (
              <tr key={item.id}>
                <td>
                  <div className="item-name">
                    <span className="type-badge">
                      {item.type.charAt(0).toUpperCase()}
                    </span>
                    {item.name}
                  </div>
                </td>
                <td>{item.description}</td>
                <td>{item.createdBy}</td>
                <td>{item.createdAt}</td>
                <td>
                  <span
                    className={`status-badge ${item.isActive ? "active" : "inactive"}`}
                  >
                    {item.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td>
                  <div className="action-buttons">
                    <button className="action-button edit" title="Edit">
                      <Edit size={14} />
                    </button>
                    <button
                      className="action-button delete"
                      title="Delete"
                      onClick={() => handleDeleteItem(item.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredItems.length === 0 && (
          <div className="empty-state">
            <p>No {activeTab} found. Add your first item!</p>
          </div>
        )}
      </div>

      {/* Add New Item Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Add New {activeTab.slice(0, -1)}</h3>
              <button
                className="close-button"
                onClick={() => setShowAddModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Name *</label>
                <input
                  type="text"
                  value={newItem.name}
                  onChange={(e) =>
                    setNewItem({ ...newItem, name: e.target.value })
                  }
                  placeholder={`Enter ${activeTab.slice(0, -1)} name`}
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={newItem.description}
                  onChange={(e) =>
                    setNewItem({ ...newItem, description: e.target.value })
                  }
                  placeholder={`Describe this ${activeTab.slice(0, -1)}`}
                  rows={3}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="cancel-button"
                onClick={() => setShowAddModal(false)}
              >
                Cancel
              </button>
              <button className="save-button" onClick={handleAddItem}>
                Save {activeTab.slice(0, -1)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MasterDataManager;
