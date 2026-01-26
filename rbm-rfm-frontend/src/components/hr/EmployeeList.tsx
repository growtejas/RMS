import React from "react";

/**
 * Temporary mock data
 * Will be replaced by API later
 */
const employees = [
  {
    empId: "RBM-001",
    name: "Amit Sharma",
    status: "Onboarding",
    department: "Engineering",
    skillsCount: 2,
    profileComplete: 60,
  },
  {
    empId: "RBM-002",
    name: "Neha Verma",
    status: "Active",
    department: "QA",
    skillsCount: 5,
    profileComplete: 100,
  },
  {
    empId: "RBM-003",
    name: "Rohit Kulkarni",
    status: "Bench",
    department: "Engineering",
    skillsCount: 3,
    profileComplete: 85,
  },
];

const EmployeeList: React.FC = () => {
  return (
    <>
      {/* Page Header
      <div className="manager-header">
        <h2>Employees</h2>
        <p className="subtitle">
          View and manage all employees across their lifecycle.
        </p>
      </div> */}

      {/* Filters & Search */}
      <div className="log-filters">
        <div className="filter-group">
          <div className="search-box">
            <input type="text" placeholder="Search by name or employee ID..." />
          </div>
        </div>

        <div className="filter-grid">
          <div className="filter-item">
            <label>Status</label>
            <select>
              <option value="">All</option>
              <option>Onboarding</option>
              <option>Active</option>
              <option>Bench</option>
              <option>Exited</option>
            </select>
          </div>

          <div className="filter-item">
            <label>Department</label>
            <select>
              <option value="">All</option>
              <option>Engineering</option>
              <option>QA</option>
              <option>HR</option>
            </select>
          </div>
        </div>
      </div>

      {/* Employee Table */}
      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Department</th>
              <th>Skills</th>
              <th>Status</th>
              <th>Profile</th>
            </tr>
          </thead>

          <tbody>
            {employees.map((emp) => (
              <tr key={emp.empId}>
                <td>
                  <strong>{emp.name}</strong>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>
                    {emp.empId}
                  </div>
                </td>

                <td>{emp.department}</td>

                <td>{emp.skillsCount}</td>

                <td>
                  <span
                    className={`status-badge ${
                      emp.status === "Active" ? "active" : "inactive"
                    }`}
                  >
                    {emp.status}
                  </span>
                </td>

                <td>{emp.profileComplete}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

export default EmployeeList;
