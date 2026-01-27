import React, { useState } from "react";

/* ======================================================
   Types
   ====================================================== */

interface Resource {
  empId: string;
  name: string;
  skills: {
    name: string;
    level: "Junior" | "Mid" | "Senior";
    experience: number;
  }[];
  availabilityPct: number;
  benchDays: number;
}

/* ======================================================
   Mock Data (Replace with API later)
   ====================================================== */

const resources: Resource[] = [
  {
    empId: "RBM-021",
    name: "Neha Kulkarni",
    skills: [
      { name: "React", level: "Senior", experience: 5 },
      { name: "TypeScript", level: "Senior", experience: 4 },
    ],
    availabilityPct: 100,
    benchDays: 18,
  },
  {
    empId: "RBM-034",
    name: "Amit Deshpande",
    skills: [
      { name: "Java", level: "Mid", experience: 3 },
      { name: "Spring Boot", level: "Mid", experience: 3 },
    ],
    availabilityPct: 60,
    benchDays: 7,
  },
  {
    empId: "RBM-055",
    name: "Pooja Nair",
    skills: [{ name: "Python", level: "Senior", experience: 6 }],
    availabilityPct: 40,
    benchDays: 0,
  },
];

/* ======================================================
   Component
   ====================================================== */

const ResourcePool: React.FC = () => {
  const [skillFilter, setSkillFilter] = useState("");

  const filteredResources = resources.filter((res) =>
    skillFilter
      ? res.skills.some((s) =>
          s.name.toLowerCase().includes(skillFilter.toLowerCase()),
        )
      : true,
  );

  return (
    <>
      {/* Header */}
      <div className="manager-header">
        <h2>Internal Resource Pool</h2>
        <p className="subtitle">
          Read-only view of active & available employees
        </p>
      </div>

      {/* Filters */}
      <div className="log-filters">
        <div className="filter-grid">
          <div className="filter-item">
            <label>Skill</label>
            <input
              type="text"
              placeholder="Search by skill (e.g. React)"
              value={skillFilter}
              onChange={(e) => setSkillFilter(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Resource Table */}
      <div className="ticket-table-container">
        <table className="ticket-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Skills</th>
              <th>Availability</th>
              <th>Bench</th>
              <th>Match</th>
            </tr>
          </thead>

          <tbody>
            {filteredResources.map((res) => (
              <tr key={res.empId}>
                <td>
                  <strong>{res.name}</strong>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--text-tertiary)",
                    }}
                  >
                    {res.empId}
                  </div>
                </td>

                <td>
                  {res.skills.map((skill) => (
                    <div key={skill.name}>
                      <strong>{skill.name}</strong>{" "}
                      <span
                        style={{
                          fontSize: "11px",
                          color: "var(--text-tertiary)",
                        }}
                      >
                        ({skill.level}, {skill.experience}y)
                      </span>
                    </div>
                  ))}
                </td>

                <td>
                  <span
                    className={`status-badge ${
                      res.availabilityPct >= 80 ? "active" : "inactive"
                    }`}
                  >
                    {res.availabilityPct}%
                  </span>
                </td>

                <td>
                  {res.benchDays > 0 ? (
                    <span className="aging-indicator aging-8-30">
                      {res.benchDays} days
                    </span>
                  ) : (
                    <span className="status-badge inactive">Allocated</span>
                  )}
                </td>

                <td>
                  {res.availabilityPct >= 80 ? (
                    <div className="hr-indicator bench-available">
                      ✓
                      <span className="indicator-tooltip">
                        Good internal match
                      </span>
                    </div>
                  ) : (
                    <div className="hr-indicator skills-pending">
                      !
                      <span className="indicator-tooltip">
                        Partial availability
                      </span>
                    </div>
                  )}
                </td>
              </tr>
            ))}

            {filteredResources.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="tickets-empty-state">
                    No matching resources found
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
};

export default ResourcePool;
