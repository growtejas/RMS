import React, { useState } from "react";

const generateEmployeeId = () => {
  const random = Math.floor(100 + Math.random() * 900);
  return `RBM-${random}`;
};

const CreateEmployee: React.FC = () => {
  const [empId] = useState(generateEmployeeId());

  return (
    <>
      {/* Page Header */}
      <div className="manager-header">
        <h2>Create Employee</h2>
        <p className="subtitle">
          Start employee onboarding by creating the core profile.
        </p>
      </div>

      {/* Create Employee Form */}
      <div className="master-data-manager">
        <div className="form-field">
          <label>Employee ID</label>
          <input type="text" value={empId} disabled />
        </div>

        <div className="form-field">
          <label>Full Name</label>
          <input type="text" placeholder="Enter full name" />
        </div>

        <div className="form-field">
          <label>RBM Email</label>
          <input type="email" placeholder="name@rbm.com" />
        </div>

        <div className="form-field">
          <label>Date of Birth</label>
          <input type="date" />
        </div>

        <div className="form-field">
          <label>Gender</label>
          <select>
            <option value="">Select gender</option>
            <option>Male</option>
            <option>Female</option>
            <option>Other</option>
          </select>
        </div>

        <div className="form-field">
          <label>Date of Joining</label>
          <input type="date" />
        </div>

        <div
          className="form-field"
          style={{ fontSize: "12px", color: "#64748b" }}
        >
          Employee status will be set to <strong>Onboarding</strong>{" "}
          automatically.
        </div>

        {/* Actions */}
        <div
          style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}
        >
          <button className="action-button">Cancel</button>
          <button className="action-button primary">Create Employee</button>
        </div>
      </div>
    </>
  );
};

export default CreateEmployee;
