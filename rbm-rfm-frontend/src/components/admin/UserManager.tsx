import React from "react";
import { Users, Edit, Trash2, Plus } from "lucide-react";

const UserManager: React.FC = () => {
    // Mock user data
    const users = [
        { id: 1, name: "Admin User", email: "admin@example.com", role: "Admin", status: "Active" },
        { id: 2, name: "Manager User", email: "manager@example.com", role: "Manager", status: "Active" },
        { id: 3, name: "Regular User", email: "user@example.com", role: "User", status: "Inactive" },
    ];

    return (
        <div className="user-management-container" >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <h2>User Management</h2>
                <button style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    background: "#4f46e5",
                    color: "white",
                    border: "none",
                    padding: "8px 16px",
                    borderRadius: "6px",
                    cursor: "pointer"
                }}>
                    <Plus size={18} /> Add User
                </button>
            </div>

            <div className="data-table-container">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((user) => (
                            <tr key={user.id}>
                                <td>{user.id}</td>
                                <td>
                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                            <Users size={16} color="#6b7280" />
                                        </div>
                                        {user.name}
                                    </div>
                                </td>
                                <td>{user.email}</td>
                                <td>{user.role}</td>
                                <td>
                                    <span className={`status-badge ${user.status === 'Active' ? 'active' : 'inactive'}`}>
                                        {user.status}
                                    </span>
                                </td>
                                <td>
                                    <div className="action-buttons">
                                        <button className="action-button edit" title="Edit">
                                            <Edit size={16} />
                                        </button>
                                        <button className="action-button delete" title="Delete">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default UserManager;
